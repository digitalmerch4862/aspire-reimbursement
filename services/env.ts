/**
 * Thin wrapper around Vite's import.meta.env.
 * Isolated here so Jest tests can mock this module without touching import.meta syntax.
 */
export function getViteEnv(key: string): string | undefined {
    return import.meta.env[key] as string | undefined;
}
