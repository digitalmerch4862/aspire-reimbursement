import { getViteEnv } from './env';

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
Return JSON only — no markdown, no explanation.`;

const REIMBURSEMENT_ONLY_PROMPT = `You are a reimbursement form extractor. Read the upload and return JSON only:
{
  "reimbursementForm": "<text with format: Client's full name: X\\nAddress: X\\nStaff member to reimburse: X\\nApproved by: X\\n\\nParticular | Date Purchased | Amount | On Charge Y/N\\n...rows...\\n\\nTotal Amount: $X>",
  "receiptDetails": ""
}
Focus only on the reimbursement form section. If the reimbursement form is absent, return an empty string for reimbursementForm. Return JSON only — no markdown, no explanation.`;

const RECEIPTS_ONLY_PROMPT = `You are a receipt details extractor. Read the upload and return JSON only:
{
  "reimbursementForm": "",
  "receiptDetails": "<text with format: Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes\\n...rows...\\n\\nGRAND TOTAL: $X>"
}
Focus only on receipts, dockets, tax invoices, or proof-of-purchase sections.
Extract every receipt line item you can find, even when some fields need fallback values like "Unknown" or "Not visible".
If no receipt evidence exists, return an empty string for receiptDetails.
Return JSON only — no markdown, no explanation.`;

// Vision models (support image_url) — for PDF/image payloads
const VISION_MODELS = [
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
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

export async function extractFromFile(file: FilePayload): Promise<ExtractionResult> {
    const key = getNextKey();
    const models = getCandidateModels(file);
    const model = models[0];
    let payload = buildOpenRouterPayload(file, model);

    let result = await requestExtraction(payload, file, key, models);

    if (!result.reimbursementForm.trim()) {
        const reimbursementRetryPayload = buildOpenRouterPayload(file, model, REIMBURSEMENT_ONLY_PROMPT);
        const reimbursementRetry = await requestExtraction(reimbursementRetryPayload, file, key, models);
        result = {
            reimbursementForm: reimbursementRetry.reimbursementForm.trim() || result.reimbursementForm,
            receiptDetails: result.receiptDetails,
        };
    }

    if (!result.receiptDetails.trim()) {
        const receiptsRetryPayload = buildOpenRouterPayload(file, model, RECEIPTS_ONLY_PROMPT);
        const receiptsRetry = await requestExtraction(receiptsRetryPayload, file, key, models);
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
            return parseExtractionResponse(await response.json());
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

function parseExtractionResponse(data: any): ExtractionResult {
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        return {
            reimbursementForm: String(parsed.reimbursementForm ?? ''),
            receiptDetails: String(parsed.receiptDetails ?? ''),
        };
    } catch {
        return { reimbursementForm: raw, receiptDetails: '' };
    }
}
