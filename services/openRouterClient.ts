const EXTRACTION_PROMPT = `You are a reimbursement data extractor. Given the file content, extract and return JSON only:
{
  "reimbursementForm": "<text with format: Client's full name: X\\nAddress: X\\nStaff member to reimburse: X\\nApproved by: X\\n\\nParticular | Date Purchased | Amount | On Charge Y/N\\n...rows...\\n\\nTotal Amount: $X>",
  "receiptDetails": "<text with format: Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes\\n...rows...\\n\\nGRAND TOTAL: $X>"
}
If a section is absent, return empty string for that key. Return JSON only — no markdown, no explanation.`;

const PRIMARY_MODEL = 'google/gemini-2.0-flash-exp:free';
const FALLBACK_MODEL = 'meta-llama/llama-3.2-11b-vision-instruct:free';

let keyIndex = 0;

export function getNextKey(): string {
    const keys: string[] = [];
    let n = 1;
    while (true) {
        const key = (process.env as any)[`VITE_OPENROUTER_KEY_${n}`];
        if (!key) break;
        keys.push(key);
        n++;
    }
    if (keys.length === 0) throw new Error('No OpenRouter API keys configured. Add VITE_OPENROUTER_KEY_1 to .env');
    const key = keys[keyIndex % keys.length];
    keyIndex = (keyIndex + 1) % keys.length;
    return key;
}

export type FilePayload =
    | { type: 'image'; base64: string; mimeType: string }
    | { type: 'text'; text: string };

export function buildOpenRouterPayload(file: FilePayload, model = PRIMARY_MODEL) {
    const content: any[] = [{ type: 'text', text: EXTRACTION_PROMPT }];

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

export async function extractFromFile(file: FilePayload): Promise<ExtractionResult> {
    const key = getNextKey();
    let payload = buildOpenRouterPayload(file, PRIMARY_MODEL);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
            payload = buildOpenRouterPayload(file, FALLBACK_MODEL);
            const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                },
                body: JSON.stringify(payload),
            });
            if (!fallbackResponse.ok) {
                const errText = await fallbackResponse.text();
                throw new Error(`OpenRouter error ${fallbackResponse.status}: ${errText}`);
            }
            return parseExtractionResponse(await fallbackResponse.json());
        }
        const errText = await response.text();
        throw new Error(`OpenRouter error ${response.status}: ${errText}`);
    }

    return parseExtractionResponse(await response.json());
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
