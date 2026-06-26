# Aspire Reimbursement

Manual-first reimbursement auditing app with database-backed validation.

## Run Locally

Prerequisite: Node.js

1. Install dependencies:
   `npm install`
2. Configure Supabase keys in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `AI_EXTRACT_API_KEY`
   - `VITE_AI_EXTRACT_CLIENT_KEY` (same value as `AI_EXTRACT_API_KEY`)
3. Start the app:
   `npm run dev`

## Security Notes

- Rotate any mailbox credentials/tokens that were ever stored in this workspace.
- Do not commit local mailbox exports, token JSON, browser profiles, or reimbursement CSV artifacts.
- Enable Supabase RLS for every exposed table and restrict write/delete policies to approved users only.

## Build

`npm run build`
