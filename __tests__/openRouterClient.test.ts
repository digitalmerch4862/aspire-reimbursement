// Mock services/env so import.meta.env is never evaluated in Jest
// By default the mock returns undefined for all keys (no keys configured).
jest.mock('../services/env', () => ({
    getViteEnv: jest.fn(() => undefined),
}));

import { getNextKey, buildOpenRouterPayload, _getKeysFromEnv, _resetKeyIndex } from '../services/openRouterClient';
import { getViteEnv } from '../services/env';

const mockGetViteEnv = getViteEnv as jest.MockedFunction<typeof getViteEnv>;

describe('_getKeysFromEnv', () => {
    afterEach(() => {
        mockGetViteEnv.mockReset();
    });

    it('returns empty array when no keys configured', () => {
        mockGetViteEnv.mockReturnValue(undefined);
        const keys = _getKeysFromEnv();
        expect(Array.isArray(keys)).toBe(true);
        expect(keys).toHaveLength(0);
    });

    it('returns array of keys when env has keys', () => {
        // Simulate VITE_OPENROUTER_KEY_1='key-a', VITE_OPENROUTER_KEY_2='key-b'
        mockGetViteEnv.mockImplementation((k) => {
            if (k === 'VITE_OPENROUTER_KEY_1') return 'key-a';
            if (k === 'VITE_OPENROUTER_KEY_2') return 'key-b';
            return undefined;
        });
        const keys = _getKeysFromEnv();
        expect(keys).toEqual(['key-a', 'key-b']);
    });
});

describe('getNextKey', () => {
    afterEach(() => {
        mockGetViteEnv.mockReset();
    });

    it('throws with descriptive message when no keys configured', () => {
        mockGetViteEnv.mockReturnValue(undefined);
        expect(() => getNextKey()).toThrow('No OpenRouter API keys configured');
    });

    it('returns a key when one key is configured', () => {
        mockGetViteEnv.mockImplementation((k) =>
            k === 'VITE_OPENROUTER_KEY_1' ? 'sk-test-key' : undefined
        );
        const key = getNextKey();
        expect(typeof key).toBe('string');
        expect(key).toBe('sk-test-key');
    });
});

describe('getNextKey rotation', () => {
    beforeEach(() => { _resetKeyIndex(); });

    afterEach(() => {
        mockGetViteEnv.mockReset();
    });

    it('rotates round-robin through multiple keys', () => {
        mockGetViteEnv.mockImplementation((k) => {
            if (k === 'VITE_OPENROUTER_KEY_1') return 'key-one';
            if (k === 'VITE_OPENROUTER_KEY_2') return 'key-two';
            return undefined;
        });

        // Collect 4 consecutive calls — must alternate between key-one and key-two
        const results: string[] = [];
        for (let i = 0; i < 4; i++) {
            results.push(getNextKey());
        }

        // Each result must be one of the two keys
        results.forEach(k => expect(['key-one', 'key-two']).toContain(k));
        // Consecutive calls must differ (rotation)
        expect(results[0]).not.toBe(results[1]);
        // After 2 calls the pattern repeats
        expect(results[0]).toBe(results[2]);
        expect(results[1]).toBe(results[3]);
    });
});

describe('buildOpenRouterPayload', () => {
    it('builds vision payload for image type', () => {
        const payload = buildOpenRouterPayload({ type: 'image', base64: 'abc123', mimeType: 'image/jpeg' });
        expect(payload.messages[0].content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'image_url' }),
                expect.objectContaining({ type: 'text' }),
            ])
        );
        const imageBlock = (payload.messages[0].content as any[]).find((c: any) => c.type === 'image_url');
        expect(imageBlock.image_url.url).toContain('data:image/jpeg;base64,abc123');
    });

    it('uses correct default model', () => {
        const payload = buildOpenRouterPayload({ type: 'image', base64: 'x', mimeType: 'image/png' });
        expect(payload.model).toBe('openai/gpt-oss-20b:free');
    });

    it('builds text payload for extracted text type', () => {
        const payload = buildOpenRouterPayload({ type: 'text', text: 'some receipt content' });
        const textParts = (payload.messages[0].content as any[]).filter((c: any) => c.type === 'text');
        const hasContent = textParts.some((p: any) => p.text.includes('some receipt content'));
        expect(hasContent).toBe(true);
    });

    it('accepts model override', () => {
        const payload = buildOpenRouterPayload(
            { type: 'text', text: 'x' },
            'meta-llama/llama-3.2-11b-vision-instruct:free'
        );
        expect(payload.model).toBe('meta-llama/llama-3.2-11b-vision-instruct:free');
    });
});
