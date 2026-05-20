import { buildOpenRouterPayload, extractFromFile, extractTargetFromFile } from '../services/openRouterClient';

describe('buildOpenRouterPayload', () => {
    it('wraps image payload for api route', () => {
        const payload = buildOpenRouterPayload({ type: 'image', base64: 'abc123', mimeType: 'image/jpeg' });
        expect(payload).toEqual({
            file: { type: 'image', base64: 'abc123', mimeType: 'image/jpeg' },
        });
    });

    it('wraps text payload for api route', () => {
        const payload = buildOpenRouterPayload({ type: 'text', text: 'some receipt content' });
        expect(payload).toEqual({
            file: { type: 'text', text: 'some receipt content' },
        });
    });
});

describe('extract client wrapper', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('extractFromFile posts to the secure api route', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                reimbursementForm: 'Client\'s full name: Test',
                receiptDetails: 'Receipt table',
            }),
        } as any);

        const result = await extractFromFile({ type: 'text', text: 'content' });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/ai-extract',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        expect(result.reimbursementForm).toContain('Client');
        expect(result.receiptDetails).toContain('Receipt');
    });

    it('extractTargetFromFile returns reimbursement text only', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                reimbursementForm: 'Client\'s full name: Demo',
                receiptDetails: '',
            }),
        } as any);

        const result = await extractTargetFromFile({ type: 'text', text: 'form' }, 'reimbursementForm');
        expect(result).toContain('Client');
    });

    it('extractTargetFromFile throws api error text on failure', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Missing OPENAI_API_KEY server environment variable.',
        } as any);

        await expect(
            extractTargetFromFile({ type: 'text', text: 'receipt' }, 'receiptDetails'),
        ).rejects.toThrow('Missing OPENAI_API_KEY server environment variable.');
    });
});
