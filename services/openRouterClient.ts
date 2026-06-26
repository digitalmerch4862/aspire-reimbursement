import { getViteEnv } from './env';

export type FilePayload =
    | { type: 'image'; base64: string; mimeType: string }
    | { type: 'text'; text: string };

export interface ExtractionResult {
    reimbursementForm: string;
    receiptDetails: string;
}

export type ExtractionTarget = 'reimbursementForm' | 'receiptDetails';

interface ExtractionRequestBody {
    file: FilePayload;
    target?: ExtractionTarget;
}

const AI_EXTRACT_CLIENT_KEY = getViteEnv('VITE_AI_EXTRACT_CLIENT_KEY');

export function buildOpenRouterPayload(file: FilePayload): ExtractionRequestBody {
    return { file };
}

export async function extractFromFile(file: FilePayload): Promise<ExtractionResult> {
    return requestExtraction({ file });
}

export async function extractTargetFromFile(file: FilePayload, target: ExtractionTarget): Promise<string> {
    const result = await requestExtraction({ file, target });
    return target === 'reimbursementForm' ? result.reimbursementForm : result.receiptDetails;
}

async function requestExtraction(body: ExtractionRequestBody): Promise<ExtractionResult> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (AI_EXTRACT_CLIENT_KEY) {
        headers['x-api-key'] = AI_EXTRACT_CLIENT_KEY;
    }

    const response = await fetch('/api/ai-extract', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `AI extraction failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
        reimbursementForm: String(data?.reimbursementForm ?? ''),
        receiptDetails: String(data?.receiptDetails ?? ''),
    };
}
