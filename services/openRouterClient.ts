import { getViteEnv } from './env';

const REIMBURSEMENT_FORMAT_RULES = `For reimbursementForm, normalize the output to exactly this plain-text structure:
Client's full name: <value>
Address: <value>
Staff member to reimburse: <value>
Approved by: <value>

Particular | Date Purchased | Amount | On Charge Y/N
<particular> | <date> | <amount> | <Y/N>
<particular> | <date> | <amount> | <Y/N>

Total Amount: <value>

Formatting rules for reimbursementForm:
- Return plain text only inside the JSON string, not markdown.
- Keep the header labels exactly as written above.
- Keep exactly one blank line before the table header and one blank line before Total Amount.
- Convert messy OCR, email sentences, spreadsheet cells, or wrapped text into this clean structure.
- Ignore greeting text, email prose, notes, signatures, and receipt-only content.
- If a header field is missing, still keep the label and use "not found".
- For table rows, include only reimbursement line items. Do not copy the column header as a data row.
- Normalize each line item into 4 columns only: Particular, Date Purchased, Amount, On Charge Y/N.
- If Date Purchased or On Charge Y/N is missing for a row, use "not found".
- Keep money exactly as visible when possible. If a currency symbol is visible, preserve it.
- If no reimbursement form is present, return an empty string for reimbursementForm.`;

const EXTRACTION_PROMPT = `You are a reimbursement data extractor. Given the file content, extract and return JSON only:
{
  "reimbursementForm": "<text with format: Client's full name: X\\nAddress: X\\nStaff member to reimburse: X\\nApproved by: X\\n\\nParticular | Date Purchased | Amount | On Charge Y/N\\n...rows...\\n\\nTotal Amount: $X>",
  "receiptDetails": "<text with format: Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes\\n...rows...\\n\\nGRAND TOTAL: $X>"
}
Rules:
- Extract BOTH sections whenever the upload contains both a reimbursement form and one or more receipts.
- Do not stop after finding the reimbursement form. Keep scanning the rest of the upload for receipt or invoice evidence.
- Put every receipt line item you can find into receiptDetails, even if some columns need a reasonable fallback like "Unknown" or "Not visible".
- Only return an empty string for a section when that section is truly absent from the upload.
- ${REIMBURSEMENT_FORMAT_RULES}
Return JSON only — no markdown, no explanation.`;

const REIMBURSEMENT_ONLY_PROMPT = `You are a reimbursement form extractor. Read the upload and return JSON only:
{
  "reimbursementForm": "<text with format: Client's full name: X\\nAddress: X\\nStaff member to reimburse: X\\nApproved by: X\\n\\nParticular | Date Purchased | Amount | On Charge Y/N\\n...rows...\\n\\nTotal Amount: $X>",
  "receiptDetails": ""
}
Rules:
- Focus only on the reimbursement form section.
- Do not copy email body text, greeting lines, receipt tables, bank codes, discrepancy notes, or receipt identifiers into reimbursementForm.
- ${REIMBURSEMENT_FORMAT_RULES}
Return JSON only — no markdown, no explanation.`;

const RECEIPTS_ONLY_PROMPT = `You are a receipt extraction assistant.

Your only job here is image-to-text extraction for receipts, dockets, tax invoices, or proof-of-purchase files. Do not do email drafting, decision prompts, workflow advice, or any post-processing outside extraction.

Return JSON only:
{
  "reimbursementForm": "",
  "receiptDetails": "<markdown table with format: | Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Grand Total of All Receipts | Notes |\\n| --------- | ------------------------ | ---------- | ----------- | -------------------- | -------- | ----------- | ------------- | --------------------------- | ----- |\\n| 1 | POS REF N019052026164613 | TERRY WHITE CHEMMART | 19 May 2026 16:46 | CONCERTA-ER TAB 36MG 30 | Other Expenses-Medication | $25.00 | $109.80 | $109.80 | - |\\n| 1 | POS REF N019052026164613 | TERRY WHITE CHEMMART | 19 May 2026 16:46 | RISPERIDONE-SANDOZ TAB 1 | Other Expenses-Medication | $15.95 | $0.00 | $0.00 | - |>"
}

Rules:
1. Extract only what is visible in the receipt file.
2. If a field is unclear, use "unclear".
3. If a field is not present, use "not found".
4. Preserve original spelling, capitalization, numbers, and punctuation as much as possible.
5. Focus on exact merchant, receipt, transaction, and item text from the receipt.
6. Prioritize fraud-review identifiers such as RRN, ARN, STAN, approval code, transaction ID, terminal ID, merchant ID, invoice number, receipt number, card type, masked card number, date/time, and total amount.
7. If multiple possible unique codes appear, choose the most transaction-specific one for "Unique ID / Fallback".
8. Extract every visible line item you can find.
9. Do not stop after reading the header; continue scanning the whole receipt.
10. If the receipt contains enough text to identify merchant, amount, or transaction details, do not return an empty receiptDetails block.
11. Prefer a complete itemized table over a short summary. If the receipt shows 4 purchased items, return 4 item rows.
12. Include quantity markers, size, flavor, or variant text inside Product (Per Item) when visible, for example "2 x Cool Ridge Bottled Water 600mL".
13. Do not collapse distinct purchased items into one combined row unless the receipt itself shows only a grouped bundle line.
14. Ignore subtotal, tax, EFTPOS lines, card lines, change, loyalty points, and approval lines as product rows unless they are the only visible content.
15. If the receipt has both a merchant section and an item section, prioritize the item section for Product (Per Item) rows and keep merchant/payment metadata in the other columns.

For the table output inside receiptDetails, use exactly this format:
| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Grand Total of All Receipts | Notes |
| --------- | ------------------------ | ---------- | ----------- | -------------------- | -------- | ----------- | ------------- | --------------------------- | ----- |

Strict extraction mapping:
- Receipt # = always use numeric receipt order like 1, 2, 3. Never use "not found" for Receipt #.
- Unique ID / Fallback = choose the best visible transaction-specific identifier in this priority order: RRN, ARN, STAN, approval code + terminal ID, POS reference, transaction/reference number, receipt/invoice number. If the receipt clearly shows a POS REF / POS reference / reference number, prefer that exact visible value. Only use "not found" when no transaction-specific identifier is visible at all.
- Store Name = merchant/store name exactly as shown.
- Date & Time = use visible receipt date/time exactly as shown when possible, but normalize the date to DD MMM YYYY when the date is clear. If there is no visible time, keep the date only.
- Product (Per Item) = each visible purchased item or service line, not merchant text and not payment metadata.
- Category = best-fit reimbursement category based on the visible item text. Medication and pharmacy products should map to Other Expenses-Medication. Use one of: Activities/incentive, Groceries, Other Expenses-Activity, Other Expenses-Appliances, Other Expenses-Clothing, Other Expenses-Family Contact, Other Expenses-Food, Other Expenses-Haircut, Other Expenses-Home Improvement, Other Expenses-Medication, Other Expenses-Mobile, Other Expenses-Parking, Other Expenses-Phone, Other Expenses-School Supplies, Other Expenses-Shopping, Other Expenses-Sports, Other Expenses-Toy, Other Expenses-Transportation, Pocket Money, Takeaway, Other Expenses-Office Supplies, Other Expenses-School Holiday, Other Expenses-Approved by DCJ, Other Expenses-Petty Cash, Other Expenses-School Activity.
- Item Amount = line item price when visible, otherwise "unclear".
- Receipt Total = the full receipt total on the first row for that receipt, then $0.00 for remaining rows of the same receipt.
- Grand Total of All Receipts = the combined total amount of all receipts, shown only on the first row of the whole table, then $0.00 on all remaining rows.
- Notes = briefly note unclear text, missing identifiers, or grouped item assumptions; otherwise use "-".

Quality checks before you answer:
- Make sure every row has exactly 10 columns in the order shown above.
- Make sure the result is a markdown table using pipe separators, not plain paragraphs or loose lines.
- Make sure the header row and separator row are included.
- Make sure Store Name stays the merchant name on every row, not the product name.
- Make sure Product (Per Item) stays the purchased item on every row, not the merchant name or transaction code.
- Make sure Receipt # is numeric on every row.
- Make sure Unique ID / Fallback is never copied from the Receipt # column.
- Make sure Receipt Total appears only on the first item row for that receipt, then $0.00 on the remaining rows.
- Make sure Grand Total of All Receipts appears only on the first row of the whole table, then $0.00 on the remaining rows.
- If a visible item section exists, do not return only one generic summary row.

If the file is truly not a receipt or contains no usable receipt evidence, return an empty string for receiptDetails.
Return JSON only — no markdown, no explanation.`;

// Vision models (support image_url) — for PDF/image payloads
const VISION_MODELS = [
    'qwen/qwen2.5-vl-72b-instruct:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'nvidia/nemotron-nano-12b-v2-vl:free',
];
const PRIMARY_VISION_MODEL = VISION_MODELS[0];
// Text models — for DOCX/XLSX extracted text payloads
const TEXT_MODELS = [
    'openai/gpt-oss-20b:free',
    'deepseek/deepseek-v4-flash:free',
    'google/gemma-4-31b-it:free',
];
const PRIMARY_TEXT_MODEL = TEXT_MODELS[0];
// Legacy constant kept for buildOpenRouterPayload default param
const PRIMARY_MODEL = PRIMARY_TEXT_MODEL;

const REFERER = typeof window !== 'undefined' ? window.location.origin : 'https://app.local';

let keyIndex = 0;

export function _resetKeyIndex(): void { keyIndex = 0; }

export function _getKeysFromEnv(): string[] {
    const keys: string[] = [];
    let n = 1;
    while (true) {
        const key = getViteEnv(`VITE_OPENROUTER_KEY_${n}`);
        if (!key) break;
        keys.push(key);
        n++;
    }
    return keys;
}

export function getNextKey(): string {
    const keys = _getKeysFromEnv();
    if (keys.length === 0) throw new Error('No OpenRouter API keys configured. Add VITE_OPENROUTER_KEY_1 to .env');
    const key = keys[keyIndex % keys.length];
    keyIndex = (keyIndex + 1) % keys.length;
    return key;
}

export type FilePayload =
    | { type: 'image'; base64: string; mimeType: string }
    | { type: 'text'; text: string };

export function buildOpenRouterPayload(file: FilePayload, model = PRIMARY_MODEL, prompt = EXTRACTION_PROMPT) {
    const content: any[] = [{ type: 'text', text: prompt }];

    if (file.type === 'image') {
        content.push({
            type: 'image_url',
            image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
        });
    } else {
        content.push({ type: 'text', text: file.text });
    }

    return {
        model,
        messages: [{ role: 'user', content }],
    };
}

export interface ExtractionResult {
    reimbursementForm: string;
    receiptDetails: string;
}

export type ExtractionTarget = 'reimbursementForm' | 'receiptDetails';
type ParseMode = 'combined' | ExtractionTarget;

export async function extractFromFile(file: FilePayload): Promise<ExtractionResult> {
    const key = getNextKey();
    const models = getCandidateModels(file);
    const model = models[0];
    let payload = buildOpenRouterPayload(file, model);

    let result = await requestExtraction(payload, file, key, models, 'combined');

    if (!result.reimbursementForm.trim()) {
        const reimbursementRetryPayload = buildOpenRouterPayload(file, model, REIMBURSEMENT_ONLY_PROMPT);
        const reimbursementRetry = await requestExtraction(reimbursementRetryPayload, file, key, models, 'reimbursementForm');
        result = {
            reimbursementForm: reimbursementRetry.reimbursementForm.trim() || result.reimbursementForm,
            receiptDetails: result.receiptDetails,
        };
    }

    if (!result.receiptDetails.trim()) {
        const receiptsRetryPayload = buildOpenRouterPayload(file, model, RECEIPTS_ONLY_PROMPT);
        const receiptsRetry = await requestExtraction(receiptsRetryPayload, file, key, models, 'receiptDetails');
        result = {
            reimbursementForm: result.reimbursementForm,
            receiptDetails: receiptsRetry.receiptDetails.trim() || result.receiptDetails,
        };
    }

    return result;
}

export async function extractTargetFromFile(file: FilePayload, target: ExtractionTarget): Promise<string> {
    const key = getNextKey();
    const models = getCandidateModels(file);
    const prompt = target === 'reimbursementForm' ? REIMBURSEMENT_ONLY_PROMPT : RECEIPTS_ONLY_PROMPT;
    const result = await requestExtraction(
        buildOpenRouterPayload(file, models[0], prompt),
        file,
        key,
        models,
        target,
    );
    return target === 'reimbursementForm' ? result.reimbursementForm : result.receiptDetails;
}

function getCandidateModels(file: FilePayload): string[] {
    return file.type === 'image' ? VISION_MODELS : TEXT_MODELS;
}

async function requestExtraction(
    payload: ReturnType<typeof buildOpenRouterPayload>,
    file: FilePayload,
    initialKey: string,
    models: string[],
    parseMode: ParseMode,
): Promise<ExtractionResult> {
    let lastErrorMessage = 'OpenRouter request failed.';
    let currentKey = initialKey;
    const prompt = payload.messages[0].content[0].text;
    const startingModelIndex = Math.max(0, models.indexOf(payload.model));

    for (let index = startingModelIndex; index < models.length; index += 1) {
        const model = models[index];
        const attemptPayload = buildOpenRouterPayload(file, model, prompt);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': REFERER,
            },
            body: JSON.stringify(attemptPayload),
        });

        if (response.ok) {
            return parseExtractionResponse(await response.json(), parseMode);
        }

        const errText = await response.text();
        lastErrorMessage = `OpenRouter error ${response.status}: ${errText}`;

        if (response.status === 429) {
            currentKey = getNextKey();
            continue;
        }

        if (response.status === 400 || response.status === 404) {
            continue;
        }

        throw new Error(lastErrorMessage);
    }

    throw new Error(lastErrorMessage);
}

function parseExtractionResponse(data: any, parseMode: ParseMode = 'combined'): ExtractionResult {
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonCandidate = extractJsonObject(cleaned);
    try {
        const parsed = JSON.parse(jsonCandidate || cleaned);
        return {
            reimbursementForm: String(parsed.reimbursementForm ?? ''),
            receiptDetails: String(parsed.receiptDetails ?? ''),
        };
    } catch {
        const fallbackText = cleaned.trim();
        if (parseMode === 'reimbursementForm') {
            return { reimbursementForm: fallbackText, receiptDetails: '' };
        }
        if (parseMode === 'receiptDetails') {
            return { reimbursementForm: '', receiptDetails: fallbackText };
        }
        return { reimbursementForm: fallbackText, receiptDetails: '' };
    }
}

function extractJsonObject(value: string): string | null {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return value.slice(start, end + 1);
}
