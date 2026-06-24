# Today's Pending in EOD Timeline — Design

Date: 2026-06-24
App: DMerch Aspire Reimbursement
Scope: `App.tsx` (reuses `utils/pendingReason.ts`, `isWithinWeekdayResetWindow`)

## Problem

When a record is tagged/saved as PENDING, it is removed from the main EOD timeline
(`generateEODSchedule` filters it out at `App.tsx:6566`). It only appears in the separate
"PENDING (CARRIED OVER)" block (`eodPendingRows`, `App.tsx:6736`), which lists **all**
pending records — today's and prior days' mixed together.

Result: the activity actually done today loses its timed line in the EOD log, and the
operator re-enters / re-explains it, which costs time.

## Goal

- Today's pending appears as a **timed row in the main EOD flow** — the work counts, with a
  time slot, Status = its pending reason.
- Prior-day pending stays in the **carryover block**.
- No record appears twice in the same EOD.
- Self-maintaining across the daily reset: today's pending auto-moves to carryover tomorrow.

## Boundary definition

"Today" = `isWithinWeekdayResetWindow(record.created_at, now)` — the same window already used
to build `todaysProcessedRecords` (`App.tsx:6650-6655`). No new date logic introduced.

## Changes

### Change 1 — Timeline includes today's pending

Location: `generateEODSchedule` (`App.tsx:6558-6644`).

- Remove the exclusion filter `records.filter(record => !isPendingActivity(record))` at
  `App.tsx:6566` so pending records flow into the `scheduled` map. The map already classifies
  `activity = 'Pending'` (`App.tsx:6572`) and assigns each row a time slot — that path is kept.
- `isPendingActivity` is no longer needed for exclusion; remove it (or leave unused — prefer
  removing to avoid dead code).
- Status for pending timeline rows (`App.tsx:6598-6606`): set
  `status = `Pending — ${reason}`` where
  `reason = extractPendingReason(record.full_email_content || '')`.
  - Fallback chain when no Bindi/Julian tag is present: reuse the existing
    `discrepancyReason` logic that is there today (revision-mismatch text / `Rematch (...)` /
    `For Approval`) as the reason, so no information is lost for records without a tag.
  - Reason source matches the carryover block (both read `extractPendingReason`), so the
    same record reads consistently in timeline and (later) carryover.

Status text on the timeline row uses the **reason only** (Approach A / Q4 option 1) — no
"pending since / Nd aging" suffix, because a today row is 0d. Example: `Pending — For Julian's Approval`.

### Change 2 — Carryover block excludes today's pending

Location: `eodPendingRows` (`App.tsx:6736-6755`).

- Filter the source to prior-day records only:
  `pendingApprovalRecords.filter(r => !isWithinWeekdayResetWindow(r.created_at, now))`
  where `now = new Date(nowTick)`.
- Add `nowTick` to the `useMemo` dependency array.
- The rest of the row build (tagged date, aging via `getOriginalPendingAgeDays`, status via
  `extractPendingReason`, amount) is unchanged.

### Change 3 — Carryover empty-state wording

If the carryover block currently renders an empty-state row, guard/relabel it so it reads as
"no prior-day pending" rather than implying there is no pending at all (today's may now be in
the timeline instead). Cosmetic; no behavioural impact on the timeline.

## Data flow

```
pendingApprovalRecords
  ├─ isWithinWeekdayResetWindow(created_at, now) == true  → EOD timeline row
  │                                                         (Change 1: timed, "Pending — <reason>")
  └─ else (older)                                         → carryover block
                                                            (Change 2: tagged date + aging line)
```

Next day, a still-open today-pending falls out of the window and surfaces in carryover
automatically. No manual move.

## Edge cases

- **Approve / delete** a today-pending: it leaves `pendingApprovalRecords`, so it drops from
  the timeline. Same behaviour as today's carryover delete.
- **Outlook copy**: both the timeline and the carryover table are already part of the copied
  EOD output, so both pending locations are included. No export-format change.
- **No pending at all**: timeline shows only real activity + idle row; carryover shows its
  (relabelled) empty-state.
- **Pending with a valid NAB ref**: unaffected — it was never treated as pending-activity.

## Out of scope

- Merging timeline and carryover into one table (Approach C — rejected).
- Mirroring a read-only duplicate row (Approach B — rejected).
- Any change to `utils/pendingReason.ts` (reused as-is).
- Any Supabase schema change.
- Resetting aging — `Follow Up` remains the only aging reset.

## Files touched

- `App.tsx` — `generateEODSchedule` (timeline include + status), `eodPendingRows` (prior-day
  filter), carryover empty-state wording.

## Verification

- `npm run typecheck` → no errors.
- `npm run build` → succeeds.
- Manual: create a pending record today → appears in EOD timeline as `Pending — <reason>`,
  NOT in carryover. A pending record dated before today → appears in carryover only. Copy for
  Outlook includes both. Approve/delete a today-pending → it drops from the timeline.
