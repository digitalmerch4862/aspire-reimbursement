// Polyfill import.meta.env for Jest (ts-jest CommonJS mode)
// import.meta is normally a syntax-level construct; ts-jest with module:commonjs
// transforms it to a property access on globalThis.__importMeta__ (via its transformer).
// This file is referenced by jest.config.cjs setupFiles.
//
// When ts-jest compiles TS with module:commonjs it replaces import.meta references
// with the actual env values if diagnostics are off, OR with the global below.
// We define it here as a safety net for any remaining import.meta.env access.

if (typeof globalThis.__importMeta__ === 'undefined') {
    globalThis.__importMeta__ = { env: process.env };
}
