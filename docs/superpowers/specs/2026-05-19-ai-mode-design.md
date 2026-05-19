# AI Mode — Design Spec
Date: 2026-05-19  
Updated: Layout A confirmed

## Overview

Add an input-method toggle **above** the existing 4 tabs (Solo/Group/Manual/Receipt).  
Toggle: **[AI MODE] [MANUAL]**  
- **MANUAL** = current Solo Mode behavior (copy-paste text into two panels)  
- **AI MODE** = drag-drop file → OpenRouter extracts → auto-populates same two panels → Start Audit

Existing 4 tabs remain **unchanged** below.

## Layout

```
┌─────────────────────────────────────┐
│  [AI MODE]        [MANUAL]          │  ← top toggle (new)
├─────────────────────────────────────┤
│  AI: Drop zone                      │
│  OR                                 │
│  MANUAL: Form textarea | Receipt    │
│          textarea                   │
│  [Start Audit]                      │
├─────────────────────────────────────┤
│  SOLO | GROUP | MANUAL | RECEIPT    │  ← existing 4 tabs, unchanged
└─────────────────────────────────────┘
```

The top toggle replaces the old Solo Mode input area. Solo Mode tab below becomes read-only results view or is hidden — TBD during implementation (simplest: keep as-is, top section feeds Solo Mode pipeline).

## Supported File Types

| Type | Handling |
|------|----------|
| PDF | Base64 → OpenRouter vision API |
| JPG / PNG | Base64 → OpenRouter vision API |
| DOCX | mammoth.js client-side text extraction → text prompt |
| XLSX | SheetJS client-side extraction → text prompt |

## Architecture

### New Files
- `services/openRouterClient.ts` — API client, round-robin key rotation
- `utils/fileExtractors.ts` — DOCX/XLSX text extraction (mammoth + SheetJS)

### Modified Files
- `App.tsx` — add input-method toggle state (`ai` | `manual`), render top section
- `components/Dashboard/SoloMode.tsx` — accept optional `inputMode` prop; when `ai`, show drop zone instead of textareas; when `manual`, existing behavior

### Key Rotation
- Keys: `VITE_OPENROUTER_KEY_1` … `VITE_OPENROUTER_KEY_N` (supports any count, reads until missing)
- Module counter increments mod N each request (round-robin)
- On error: throw with message, caller shows retry banner

### Primary Model
`google/gemini-2.0-flash-exp:free`  
Fallback: `meta-llama/llama-3.2-11b-vision-instruct:free`

**Volume:** Free tier ~200 req/key/day. 10 keys ≈ 2000/day. For 5000/day target: ~25 keys needed, or mix with paid keys. Architecture supports any number of keys.

## AI Prompt

```
You are a reimbursement data extractor. Given the file content, extract and return JSON only:
{
  "reimbursementForm": "<text with format: Client's full name, Address, Staff member to reimburse, Approved by, then Particular|Date Purchased|Amount|On Charge Y/N rows, then Total Amount>",
  "receiptDetails": "<text with format: Receipt #|Unique ID / Fallback|Store Name|Date & Time|Product (Per Item)|Category|Item Amount|Receipt Total|Notes rows, then GRAND TOTAL>"
}
If a section is absent, return empty string for that key. Return JSON only — no markdown, no explanation.
```

## API Call Shape

```typescript
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <current_key>
{
  model: "google/gemini-2.0-flash-exp:free",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: PROMPT },
      // vision files:
      { type: "image_url", image_url: { url: "data:<mime>;base64,<data>" } }
      // text files (DOCX/XLSX):
      { type: "text", text: "<extracted text>" }
    ]
  }]
}
```

## Data Flow

1. User drops file → detect type
2. DOCX/XLSX → `fileExtractors.ts` → plain text
3. PDF/image → base64 encode
4. `openRouterClient.ts` → round-robin key → POST to OpenRouter
5. Parse JSON response → set `reimbursementFormText` + `receiptDetailsText`
6. Two panels appear (editable textareas, pre-filled)
7. User reviews/edits → clicks Start Audit → existing pipeline runs

## Error States

| Error | Behavior |
|-------|----------|
| Wrong file type | Inline validation, no API call |
| File > 10MB | Warn + reject |
| API error / rate limit | Error banner + Retry button (next key in rotation) |
| JSON parse fail | Show raw AI text in textarea, user corrects manually |

## Dependencies to Add

```
mammoth   # DOCX → text
xlsx      # Excel → text
```

## Environment Variables

```
VITE_OPENROUTER_KEY_1=...
VITE_OPENROUTER_KEY_2=...
...
VITE_OPENROUTER_KEY_N=...
```

## Out of Scope

- Server-side processing
- Storing uploaded files
- AI input for Group/Manual/Receipt modes
- OCR confidence scores
