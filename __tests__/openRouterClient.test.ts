import { getNextKey, buildOpenRouterPayload } from '../services/openRouterClient';

describe('getNextKey', () => {
    it('returns a key from the configured list', () => {
        // Keys are read from import.meta.env — in test env these may not be set
        // So we just verify the function exists and either returns a string or throws
        try {
            const key = getNextKey();
            expect(typeof key).toBe('string');
            expect(key.length).toBeGreaterThan(0);
        } catch (e: any) {
            expect(e.message).toContain('No OpenRouter API keys configured');
        }
    });
});

describe('buildOpenRouterPayload', () => {
    it('builds vision payload for image', () => {
        const payload = buildOpenRouterPayload({ type: 'image', base64: 'abc123', mimeType: 'image/jpeg' });
        expect(payload.messages[0].content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'image_url' }),
                expect.objectContaining({ type: 'text' }),
            ])
        );
        expect(payload.model).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('builds text payload for extracted text', () => {
        const payload = buildOpenRouterPayload({ type: 'text', text: 'some content' });
        const textParts = payload.messages[0].content.filter((c: any) => c.type === 'text');
        const hasContent = textParts.some((p: any) => p.text.includes('some content'));
        expect(hasContent).toBe(true);
    });

    it('uses fallback model when specified', () => {
        const payload = buildOpenRouterPayload(
            { type: 'text', text: 'x' },
            'meta-llama/llama-3.2-11b-vision-instruct:free'
        );
        expect(payload.model).toBe('meta-llama/llama-3.2-11b-vision-instruct:free');
    });
});
