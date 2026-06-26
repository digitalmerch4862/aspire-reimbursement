import mammoth from 'mammoth';
import readXlsxFile from 'read-excel-file';
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
]);

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
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

    // XLSX only. Legacy .xls is intentionally unsupported because common parsers
    // for it currently carry high-severity audit findings.
    if (mime.includes('spreadsheetml')) {
        const rows = await readXlsxFile(file);
        const text = rows
            .map((row) => row.map((cell) => String(cell ?? '')).join(','))
            .join('\n');
        return { type: 'text', text };
    }

    // PDF or image — send as base64 vision
    const buffer = await file.arrayBuffer();
    return { type: 'image', base64: toBase64(buffer), mimeType: mime };
}
