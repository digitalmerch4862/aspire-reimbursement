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
    const response = await fetch('/api/ai-extract', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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
