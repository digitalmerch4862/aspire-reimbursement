import { fileToPayload } from '../utils/fileExtractors';

describe('fileToPayload', () => {
    it('rejects unsupported file type', async () => {
        const file = new File(['hello'], 'test.csv', { type: 'text/csv' });
        await expect(fileToPayload(file)).rejects.toThrow('Unsupported file type');
    });

    it('rejects files over 10MB', async () => {
        const bigData = new Uint8Array(11 * 1024 * 1024);
        const file = new File([bigData], 'big.pdf', { type: 'application/pdf' });
        await expect(fileToPayload(file)).rejects.toThrow('File too large');
    });

    it('returns image payload for JPEG', async () => {
        const file = new File([new Uint8Array([0xff, 0xd8])], 'receipt.jpg', { type: 'image/jpeg' });
        const payload = await fileToPayload(file);
        expect(payload.type).toBe('image');
        if (payload.type === 'image') {
            expect(payload.mimeType).toBe('image/jpeg');
            expect(payload.base64).toBeTruthy();
        }
    });

    it('returns image payload for PNG', async () => {
        const file = new File([new Uint8Array([0x89, 0x50])], 'receipt.png', { type: 'image/png' });
        const payload = await fileToPayload(file);
        expect(payload.type).toBe('image');
        if (payload.type === 'image') {
            expect(payload.mimeType).toBe('image/png');
        }
    });

    it('returns image payload for PDF', async () => {
        const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });
        const payload = await fileToPayload(file);
        expect(payload.type).toBe('image');
        if (payload.type === 'image') {
            expect(payload.mimeType).toBe('application/pdf');
        }
    });
});
