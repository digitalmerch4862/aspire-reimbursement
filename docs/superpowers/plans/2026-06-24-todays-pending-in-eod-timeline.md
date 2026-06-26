# Today's Pending in EOD Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today's pending records show as timed rows in the main EOD timeline (Status = their pending reason); prior-day pending stays in the carryover block — no record appears twice.

**Architecture:** Two surgical edits in `App.tsx`. (1) `generateEODSchedule` stops excluding pending records, so today's pending flows into the scheduled timeline with a time slot and a `Pending — <reason>` status. (2) `eodPendingRows` (carryover block) filters its source to prior-day records only, using the same `isWithinWeekdayResetWindow` boundary already used for `todaysProcessedRecords`. The split is self-maintaining: a still-open today-pending falls out of the window the next day and surfaces in carryover automatically.

**Tech Stack:** React 19 + TypeScript, Vite. No React Testing Library in this repo — UI changes are verified via `npm run typecheck` and `npm run build` plus a manual dev check, matching the existing EOD/pending plans. The pure reason-tag layer (`utils/pendingReason.ts`) is reused as-is and already unit-tested.

---

## File Structure

- `App.tsx` — **MODIFY** only:
  - `generateEODSchedule` (~6558): remove the pending-exclusion filter (6566) and set the Pending-row status from `extractPendingReason` with the existing `discrepancyReason` text as fallback (6598–6606).
  - `eodPendingRows` (~6736): filter source to prior-day pending; add `nowTick` to deps.
  - Carryover empty-state copy (~8414–8416): reword to "prior-day".

No new files. No schema change. `extractPendingReason` and `isWithinWeekdayResetWindow` already exist and are imported/defined.

---

## Task 1: Timeline includes today's pending

**Files:**
- Modify: `App.tsx:6566` (exclusion filter) and `App.tsx:6598-6606` (Pending status text)

- [ ] **Step 1: Remove the pending-exclusion filter**

In `generateEODSchedule`, the `scheduled` array currently drops pending records. Change `App.tsx:6566` from:

```ts
        const scheduled = records.filter(record => !isPendingActivity(record)).map(record => {
```

to:

```ts
        const scheduled = records.map(record => {
```

- [ ] **Step 2: Remove the now-unused `isPendingActivity` helper**

Delete the helper block at `App.tsx:6562-6565` (no longer referenced after Step 1):

```ts
        const isPendingActivity = (record: any) => {
            if (record.isReceiptLiquidation || record.isVipManual) return false;
            return !isValidNabReference(record.nabRef);
        };
```

- [ ] **Step 3: Set Pending-row status from the pending reason, with discrepancy fallback**

In the status-building `else if (activity === 'Pending')` branch (`App.tsx:6598-6606`), replace the whole branch body so it prefers the saved Bindi/Julian reason and falls back to the existing discrepancy text. Replace these lines:

```ts
            } else if (activity === 'Pending') {
                const reason = String(record.discrepancyReason || '').trim();
                if (/for revision mismatch reimbursement form total is higher than receipt total/i.test(reason)) {
                    status = 'For revision mismatch reimbursement form total is higher than receipt total';
                } else if (reason && reason !== 'Discrepancy / Pending') {
                    status = `Rematch (${reason.replace('Mismatch: ', '')})`;
                } else {
                    status = 'For Approval';
                }
            } else {
```

with:

```ts
            } else if (activity === 'Pending') {
                const taggedReason = extractPendingReason(record.full_email_content || '').trim();
                let reasonText: string;
                if (taggedReason) {
                    reasonText = taggedReason;
                } else {
                    const dReason = String(record.discrepancyReason || '').trim();
                    if (/for revision mismatch reimbursement form total is higher than receipt total/i.test(dReason)) {
                        reasonText = 'For revision mismatch reimbursement form total is higher than receipt total';
                    } else if (dReason && dReason !== 'Discrepancy / Pending') {
                        reasonText = `Rematch (${dReason.replace('Mismatch: ', '')})`;
                    } else {
                        reasonText = 'For Approval';
                    }
                }
                status = `Pending — ${reasonText}`;
            } else {
```

(`extractPendingReason` is already imported at `App.tsx:11`.)

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (Confirms `isPendingActivity` removal left no dangling reference and `extractPendingReason` is in scope.)

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual check — today's pending now in timeline**

Run `npm run dev`. Create/save a record today as PENDING (e.g. via the Bindi or Julian button). Open the EOD tab. Confirm: the record appears as a timed row in the **main** EOD table with Activity = `Pending` and Status = `Pending — NAB details C/o Bindi` (or `Pending — For Julian's Approval`). A reimbursement with a valid NAB ref still shows as before.

- [ ] **Step 7: Commit**

```bash
git add App.tsx
git commit -m "feat: today's pending shows as timed row in EOD timeline"
```

---

## Task 2: Carryover block shows prior-day pending only

**Files:**
- Modify: `App.tsx:6736-6755` (`eodPendingRows` source filter + deps)

- [ ] **Step 1: Filter the carryover source to prior-day records**

In the `eodPendingRows` useMemo (`App.tsx:6736-6737`), the body starts:

```ts
    const eodPendingRows = useMemo(() => {
        return pendingApprovalRecords.map((record: any) => {
```

Change it to compute `now` from `nowTick` and exclude records inside today's reset window:

```ts
    const eodPendingRows = useMemo(() => {
        const now = new Date(nowTick);
        return pendingApprovalRecords
            .filter((record: any) => !isWithinWeekdayResetWindow(record.created_at, now))
            .map((record: any) => {
```

(Leave the rest of the `.map(...)` body — `taggedDate`, `agingDays`, `status`, `amount`, the returned object — exactly as-is.)

- [ ] **Step 2: Add `nowTick` to the dependency array**

The memo's deps at `App.tsx:6755` are currently:

```ts
    }, [pendingApprovalRecords]);
```

Change to:

```ts
    }, [pendingApprovalRecords, nowTick]);
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual check — no duplication**

Run `npm run dev`, EOD tab. With a pending record created **today**: confirm it appears in the main timeline (from Task 1) and is **absent** from the "Pending Reimbursements" carryover table. With a pending record dated a **prior** day (or temporarily adjust system date / use an older record): confirm it appears **only** in the carryover table, not the timeline.

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: EOD carryover block lists prior-day pending only"
```

---

## Task 3: Carryover empty-state wording

**Files:**
- Modify: `App.tsx:8414-8416` (carryover empty-state row)

- [ ] **Step 1: Reword the carryover empty state**

The empty-state row now triggers whenever there is no *prior-day* pending (today's may be in the timeline). Update the copy at `App.tsx:8414-8416`. Replace:

```tsx
                                            {eodPendingRows.length === 0 && (
                                                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No carried-over pending records.</td></tr>
                                            )}
```

with:

```tsx
                                            {eodPendingRows.length === 0 && (
                                                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No prior-day pending records. Today's pending appears in the timeline above.</td></tr>
                                            )}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual check — Outlook copy includes both**

Run `npm run dev`, EOD tab. Use "Copy for Outlook". Paste into a scratch doc. Confirm the pasted output contains both the timeline (today's pending row with `Pending — <reason>`) and the carryover table (prior-day pending). Confirm the empty-state text reads "No prior-day pending records..." when there is no older pending.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: clarify EOD carryover empty-state wording"
```

---

## Self-Review

- **Spec coverage:**
  - Spec Change 1 (timeline includes today's pending, status = `Pending — <reason>`, discrepancy fallback) → Task 1 Steps 1-3. ✅
  - Spec Change 2 (carryover excludes today via `isWithinWeekdayResetWindow`, `nowTick` dep) → Task 2 Steps 1-2. ✅
  - Spec Change 3 (carryover empty-state wording) → Task 3 Step 1. ✅
  - Spec "self-maintaining across reset" → consequence of the window split in Task 1 + Task 2; verified in Task 2 Step 5 manual check. ✅
  - Spec Outlook-copy edge case → Task 3 Step 4 manual check. ✅
  - Spec "no `pendingReason.ts` change / no schema change" → honored; no task touches them. ✅
- **Placeholder scan:** none — every code step carries concrete code; every run step carries an exact command + expected result.
- **Type/name consistency:** `extractPendingReason(content: string)` used in Task 1 matches its existing export/signature (`App.tsx:11`, `utils/pendingReason.ts`). `isWithinWeekdayResetWindow(createdAt, now)` used in Task 2 matches its definition (`App.tsx:906`). `nowTick` referenced in Task 2 matches the same variable already used by `todaysProcessedRecords` (`App.tsx:6651`). `eodPendingRows` shape (`taggedDate`/`agingDays`/`staffName`/`amount`/`status`) is unchanged, so the render at `App.tsx:8405-8412` stays valid.
- **Convention note:** No new automated test, consistent with the repo's existing EOD/pending plans ("No React Testing Library — UI verified via typecheck + build"). The pure helper layer it depends on is already unit-tested.
