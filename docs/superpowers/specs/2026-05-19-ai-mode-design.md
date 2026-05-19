# AI Mode — Design Spec
Date: 2026-05-19

## Overview

Add a 5th tab "AI Mode" to the existing Solo/Group/Manual/Receipt tab bar. Users drag-drop a file (PDF, image, DOCX, XLSX); AI extracts content and populates reimbursement form + receipt details fields (same format as Solo Mode). User reviews editable fields then clicks "Confirm & Audit" to run the existing audit pipeline.

## Supported File Types

| Type | Handling |
|------|----------|
| PDF | Base64 encode → OpenRouter vision API |
| JPG/PNG | Base64 encode → OpenRouter vision API |
| DOCX | mammoth.js client-side text extraction → text prompt |
| XLSX | SheetJS (xlsx) client-side extraction → text prompt |

## Architecture

### New Files
- `components/Dashboard/AIMode.tsx` — tab UI component
- `services/openRouterClient.ts` — API client with round-robin key rotation
- `utils/fileExtractors.ts` — DOCX/XLSX text extraction helpers

### Modified Files
- `components/Dashboard/ModeTabs.tsx` — add `ai` to `DashboardMode` union, add AI Mode tab
- `App.tsx` — wire AI Mode tab, pass props

### Key Rotation
- 10 keys stored as `VITE_OPENROUTER_KEY_1` … `VITE_OPENROUTER_KEY_10` in `.env`
- Module-level counter in `openRouterClient.ts`, increments mod 10 each request (round-robin)
- On error (any HTTP error or network fail): throw, let caller show error with retry

### Primary Model
`google/gemini-2.0-flash-exp:free` (free tier vision model). Fallback model if primary returns model-not-found: `meta-llama/llama-3.2-11b-vision-instruct:free`.

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  AI Mode                                         │
├─────────────────────────────────────────────────┤
│  [Drop zone — dashed border, centered icon]      │
│   "Drop PDF, image, or Word/Excel file here"     │
│   "or click to browse"                           │
│  [Supported: PDF · JPG · PNG · DOCX · XLSX]      │
├─────────────────────────────────────────────────┤
│  (after extraction)                              │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Reimbursement    │  │ Receipt Details      │  │
│  │ Form (editable)  │  │ (editable)           │  │
│  └──────────────────┘  └──────────────────────┘  │
│  [Confirm & Audit ▶]                             │
└─────────────────────────────────────────────────┘
```

States:
1. **idle** — drop zone visible, panels hidden
2. **extracting** — spinner overlay on drop zone, "Extracting with AI…"
3. **ready** — drop zone collapses, two-panel layout appears, Confirm button active
4. **error** — error banner with retry button, drop zone re-shown

## AI Prompt

```
You are a reimbursement data extractor. Given the file content, extract and return JSON only:
{
  "reimbursementForm": "<exact text matching format: Client's full name, Address, Staff member to reimburse, Approved by, then Particular|Date Purchased|Amount|On Charge Y/N rows, then Total Amount>",
  "receiptDetails": "<exact text matching format: Receipt #|Unique ID / Fallback|Store Name|Date & Time|Product (Per Item)|Category|Item Amount|Receipt Total|Notes rows, then GRAND TOTAL>"
}
If a section is not present in the file, return an empty string for that key.
Return JSON only. No markdown, no explanation.
```

## API Call Shape

```typescript
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <current_key>
{
  model: "google/gemini-2.0-flash-exp:free",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        // for vision files:
        { type: "image_url", image_url: { url: "data:<mime>;base64,<data>" } }
        // for text files (DOCX/XLSX):
        { type: "text", text: "<extracted text>" }
      ]
    }
  ]
}
```

## Data Flow

1. User drops file → `AIMode.tsx` reads file
2. If DOCX/XLSX → `fileExtractors.ts` extracts text → build text-only prompt
3. If PDF/image → base64 encode → build vision prompt
4. Call `openRouterClient.ts` with payload → round-robin key selection
5. Parse JSON response → set `reimbursementFormText` + `receiptDetailsText` state
6. Show two-panel editable UI
7. "Confirm & Audit" → call existing `handleProcess()` (same as Solo Mode)

## Error Handling

- Invalid file type → inline validation error, no API call
- File too large (>10MB) → warn user, reject
- API error → show error banner with retry (re-sends same file with next key in rotation)
- JSON parse fail → show raw AI response in textarea so user can manually correct

## Dependencies to Add

```
mammoth        # DOCX extraction
xlsx           # Excel extraction
```

Both are client-side, no server needed.

## Environment Variables

```
VITE_OPENROUTER_KEY_1=...
VITE_OPENROUTER_KEY_2=...
...
VITE_OPENROUTER_KEY_10=...
```

## Out of Scope

- Server-side file processing
- Storing uploaded files
- AI mode for Group/Manual/Receipt modes
- OCR post-processing or confidence scores
