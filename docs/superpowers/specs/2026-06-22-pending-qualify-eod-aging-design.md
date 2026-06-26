# Pending Qualification Buttons + EOD Why/Date/Aging — Design

Date: 2026-06-22
App: DMerch Aspire Reimbursement
Scope: `App.tsx`, reuses `utils/pendingReason.ts`

## Problem

- Pending list rows show a generic `For Approval` status. There is no one-click way to
  classify an existing pending row as **NAB details C/o Bindi** vs **For Julian's Approval**.
  Classification today only happens at save time via the Save Status modal, so older rows
  stay untagged.
- The EOD `PENDING (CARRIED OVER)` rows show only the reason (or `For Approval`). They do
  not show **when** the item became pending or **how long** it has been pending (aging),
  so a reader cannot see urgency at a glance from EOD.

## Changes

### 1. Quick Bindi / Julian buttons on each pending row

Location: pending list row actions (`App.tsx`, the staff-group pending rows near the
icon-only action buttons added in commit `7dc0a37`).

Add two small toggle buttons to every pending row:

| Button label | Reason string written |
|--------------|-----------------------|
| `C/o Bindi`  | `NAB details C/o Bindi` |
| `Julian`     | `For Julian's Approval` |

Behaviour:

- Click writes the reason via existing `upsertPendingReason(content, reason)`, which sets
  the `<!-- PENDING_REASON: ... -->` tag in `full_email_content`, then persists the record
  through the same save path used elsewhere.
- The currently-active reason button is visually highlighted (read back via
  `extractPendingReason`).
- Clicking the other button switches the reason. Reason strings reuse the EXACT existing
  values so EOD and the Save modal stay consistent.
- These buttons set reason ONLY. They do **not** reset aging — only the existing Follow Up
  action resets the aging baseline (`PENDING_FOLLOWED_UP_AT`).

### 2. EOD carryover Status cell — pack why + date + aging on one line

Location: `generateEODSchedule` pending rows (`App.tsx` ~6626–6636), where
`eodStatus = reason || 'For Approval'`.

Change `eodStatus` to a single line:

```
<reason> · Pending since <DD Mon> · <N>d aging
```

Example: `For Julian's Approval · Pending since 18 Jun · 4d aging`

Field sources:

- `<reason>` — `extractPendingReason(record.full_email_content)`, fallback `For Approval`.
- `<DD Mon>` — the **aging baseline date**: the `PENDING_FOLLOWED_UP_AT` value if present,
  otherwise `record.created_at`. Same baseline `getPendingAgeDays` counts from, so the
  displayed date and the aging number always agree. Formatted `DD Mon` (e.g. `18 Jun`)
  via `toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })`.
- `<N>d` — `getPendingAgeDays(record)` (already computed on `pendingApprovalRecords`).

Rendering notes:

- Plain text with `·` separators → survives the existing "Copy for Outlook" export with
  no layout change. No new EOD columns.
- Amount stays suppressed for carryover rows (already done in commit `ef6f9a6`).

## Out of scope

- New EOD columns (Date / Aging as separate columns).
- Any Supabase schema change (reason already lives in `full_email_content`).
- Resetting aging when a reason button is clicked (Follow Up remains the only reset).
- Hard deletion of pending records (soft-dismiss unchanged).

## Files touched

- `App.tsx` — pending row buttons + EOD `eodStatus` formatting.
- `utils/pendingReason.ts` — reused as-is (no change expected).
