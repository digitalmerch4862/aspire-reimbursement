# Pending & EOD UX Improvements — Design

Date: 2026-06-22
App: DMerch Aspire Reimbursement
Scope: `App.tsx` only

## Problem

- Pending list action buttons are text-heavy; no way to remove a stale pending group.
- The Save Status modal offers "Save as PAID", but missing NAB code is the main reason entries land in Pending — so a paid path here is misleading.
- EOD resets daily (`todaysProcessedRecords`), so pending items disappear and are not tracked day to day.

## Changes

### 1. Pending list — icon-only buttons

Location: `App.tsx` lines ~8059–8073 (Pending staff group card actions).

Replace the two text buttons with three icon-only buttons (tooltip via `title`):

| Action | Icon | Handler |
|--------|------|---------|
| Follow up | `RefreshCw` | existing `handleMarkPendingGroupFollowedUp(group)` (keeps spinner state when `followUpingGroupKey === group.key`) |
| Approve | `Check` | existing `openPendingApprovalModal(group)` |
| Delete | `Trash2` | **NEW** `handleDeletePendingGroup(group)` |

`handleDeletePendingGroup`: confirm dialog, then soft-dismiss every record in the group by appending each `record.id` to `dismissedIds` and persisting to `localStorage` key `aspire_dismissed_discrepancies` — same mechanism as `handleDismissDiscrepancy`. Record stays in the Daily Activity Tracker; only hidden from the Pending list. Reversible from Settings ("X items hidden" → clear).

### 2. Save Status modal — replace "Save as PAID"

Location: `App.tsx` lines ~9111–9126 (`saveModalDecision.mode === 'nab'` footer branch).

Remove the "Save as PAID" button AND the generic "Save as PENDING" button. Replace with two reason buttons:

- `Pending: NAB details C/o Bindi`
- `Pending: For Julian's Approval`

Cancel button stays. Each new button calls:

```
confirmSave('PENDING', {
  duplicateSignal: 'green',
  detail: <reason text>,
  pendingReason: <reason text>,
})
```

where `<reason text>` is `"NAB details C/o Bindi"` or `"For Julian's Approval"`.

The manual NAB input field above stays visible (optional) but is no longer required to proceed.

### 3. Pending reason — persistence

The chosen reason must survive reload so it can recur in EOD across days.

- Add tag helpers (mirroring `upsertStatusTag` / `extractPendingFollowedUpAt`):
  - `upsertPendingReason(content, reason)` → writes `<!-- PENDING_REASON: <reason> -->` into `full_email_content`.
  - `extractPendingReason(content)` → reads it back.
- `confirmSave` writes the reason tag when `pendingReason` is supplied.
- The `<!-- PENDING_REASON: ... -->` tag is stripped from any user-facing email body rendering, consistent with how `<!-- STATUS: ... -->` is stripped.

### 4. EOD — recurring pending block at bottom

Location: `generateEODSchedule` (~6548) and the EOD table render (~8222–8266); pending source `pendingApprovalRecords` (~6643).

- Exclude pending-activity records from the main daily schedule rows (so they don't appear twice).
- After the existing idle/reconciliation row, append a **"Pending (Carried Over)"** group: one row per record in `pendingApprovalRecords` (all open pending, all days, already excludes `dismissedIds`).
  - Activity column: `Pending`.
  - Status column: stored pending reason via `extractPendingReason`; fallback to existing derived status logic when no reason tag is present (older records).
  - Amount/date columns populated from the record.
- These rows render in the same `eod-table` so they are included in the "Copy for Outlook" export.
- Result: pending recurs at the bottom of EOD every day until the entry is approved or deleted.

## Out of scope

- Hard deletion of pending records (delete = reversible soft-dismiss).
- Group mode / manual / receipt modes of the Save modal (only `nab` mode footer changes).
- Any Supabase schema change (reason lives inside existing `full_email_content`).

## Files touched

- `App.tsx` — all of the above.
