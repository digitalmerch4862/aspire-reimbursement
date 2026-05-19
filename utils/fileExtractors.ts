import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { FilePayload } from '../services/openRouterClient';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const SUPPORTED_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
]);

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
}

export async function fileToPayload(file: File): Promise<FilePayload> {
    if (file.size > MAX_BYTES) {
        throw new Error(`File too large (max 10 MB). This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
    }

    const mime = file.type || '';
    if (!SUPPORTED_TYPES.has(mime)) {
        throw new Error(`Unsupported file type: ${mime || file.name}. Supported: PDF, JPG, PNG, DOCX, XLSX.`);
    }

    // DOCX / DOC
    if (mime.includes('wordprocessingml') || mime === 'application/msword') {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        return { type: 'text', text: result.value };
    }

    // XLSX / XLS
    if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const lines: string[] = [];
        workbook.SheetNames.forEach((name) => {
            const sheet = workbook.Sheets[name];
            lines.push(XLSX.utils.sheet_to_csv(sheet));
        });
        return { type: 'text', text: lines.join('\n\n') };
    }

    // PDF or image — send as base64 vision
    const buffer = await file.arrayBuffer();
    return { type: 'image', base64: toBase64(buffer), mimeType: mime };
}
