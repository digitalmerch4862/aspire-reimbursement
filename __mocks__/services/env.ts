/**
 * Jest manual mock for services/env.ts.
 * Returns undefined for all keys by default (no VITE_ vars in test env).
 * Tests can override via jest.mock('../services/env', ...) with a factory.
 */
export function getViteEnv(key: string): string | undefined {
    return undefined;
}
