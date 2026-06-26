# Pending & EOD UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add icon-only pending actions (follow up / approve / delete), replace "Save as PAID" with two pending-reason buttons (Bindi / Julian), and make open pending recur at the bottom of the EOD table across daily resets.

**Architecture:** A new small pure module `utils/pendingReason.ts` owns the `<!-- PENDING_REASON: ... -->` tag read/write/strip (unit-tested with jest). `App.tsx` imports it: the Save modal writes the reason on PENDING save, the EOD builder reads it for the Status column of a recurring "Pending (Carried Over)" block, and the Pending list buttons become icon-only plus a soft-dismiss delete.

**Tech Stack:** React 19 + TypeScript, Vite, lucide-react icons, jest + ts-jest (jsdom), Supabase. No React Testing Library — UI tasks verified via `npm run typecheck` and `npm run build`.

---

## File Structure

- `utils/pendingReason.ts` — **NEW**. Pure tag helpers: `upsertPendingReason`, `extractPendingReason`, `stripPendingReasonTag`. Exported, testable.
- `__tests__/pendingReason.test.ts` — **NEW**. Jest unit tests for the helpers.
- `App.tsx` — **MODIFY**:
  - import the new helpers,
  - strip the new tag in `stripInternalAuditMeta`,
  - thread `pendingReason` through `confirmSave` / `confirmSaveWithContent`,
  - Save modal `nab` footer: two pending-reason buttons,
  - Pending list card: icon-only buttons + delete handler,
  - EOD: exclude pending from main flow, append recurring pending block.

---

## Task 1: Pending reason tag helpers (TDD)

**Files:**
- Create: `utils/pendingReason.ts`
- Test: `__tests__/pendingReason.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/pendingReason.test.ts`:

```ts
import { upsertPendingReason, extractPendingReason, stripPendingReasonTag } from '../utils/pendingReason';

describe('pendingReason tag helpers', () => {
  it('extract returns empty string when no tag present', () => {
    expect(extractPendingReason('Hello body')).toBe('');
  });

  it('upsert prepends a tag and extract reads it back', () => {
    const out = upsertPendingReason('Body text', 'For Julian\'s Approval');
    expect(out).toContain('<!-- PENDING_REASON: For Julian\'s Approval -->');
    expect(extractPendingReason(out)).toBe('For Julian\'s Approval');
  });

  it('upsert replaces an existing tag instead of duplicating', () => {
    const first = upsertPendingReason('Body', 'NAB details C/o Bindi');
    const second = upsertPendingReason(first, 'For Julian\'s Approval');
    const matches = second.match(/PENDING_REASON:/g) || [];
    expect(matches.length).toBe(1);
    expect(extractPendingReason(second)).toBe('For Julian\'s Approval');
  });

  it('strip removes the tag and leaves the body', () => {
    const out = upsertPendingReason('Body text', 'NAB details C/o Bindi');
    expect(stripPendingReasonTag(out).includes('PENDING_REASON')).toBe(false);
    expect(stripPendingReasonTag(out)).toContain('Body text');
  });

  it('helpers tolerate null/undefined input', () => {
    // @ts-expect-error testing runtime guard
    expect(extractPendingReason(undefined)).toBe('');
    // @ts-expect-error testing runtime guard
    expect(stripPendingReasonTag(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pendingReason`
Expected: FAIL — `Cannot find module '../utils/pendingReason'`.

- [ ] **Step 3: Write minimal implementation**

Create `utils/pendingReason.ts`:

```ts
// Persists the manual "why is this pending" reason inside a record's
// full_email_content as an HTML comment, mirroring the PENDING_FOLLOWED_UP_AT
// pattern in App.tsx. The reason recurs in the EOD Status column across days.

export const extractPendingReason = (content: string): string => {
  const match = String(content || '').match(/<!--\s*PENDING_REASON:\s*([\s\S]*?)\s*-->/i);
  return match?.[1]?.trim() || '';
};

export const upsertPendingReason = (content: string, reason: string): string => {
  const body = stripPendingReasonTag(content);
  const tag = `<!-- PENDING_REASON: ${reason} -->`;
  return `${tag}\n${body.trim()}`;
};

export const stripPendingReasonTag = (content: string): string => {
  return String(content || '').replace(/\n*<!--\s*PENDING_REASON:[\s\S]*?-->\s*/gi, '\n').trim();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pendingReason`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/pendingReason.ts __tests__/pendingReason.test.ts
git commit -m "feat: pending reason tag helpers"
```

---

## Task 2: Wire reason into Save modal + persistence

**Files:**
- Modify: `App.tsx` (imports ~line 10; `stripInternalAuditMeta` ~255; `confirmSaveWithContent`/`confirmSave` ~5322-5365; Save modal `nab` footer ~9111-9126)

- [ ] **Step 1: Import the helpers**

After the existing `import MarkdownRenderer ...` line (App.tsx:10), add:

```ts
import { upsertPendingReason, extractPendingReason, stripPendingReasonTag } from './utils/pendingReason';
```

- [ ] **Step 2: Strip the new tag in internal-audit cleanup**

In `stripInternalAuditMeta` (App.tsx ~255), add one `.replace` line alongside the other tag strips (after the `PENDING_FOLLOWED_UP_AT` line at ~260):

```ts
        .replace(/<!--\s*PENDING_REASON:[\s\S]*?-->\s*/gi, '')
```

- [ ] **Step 3: Thread `pendingReason` through confirmSave**

In `confirmSaveWithContent` (App.tsx ~5322), widen the options type and write the tag. Change the signature options to:

```ts
        options?: { duplicateSignal?: DuplicateTrafficLight; reviewerReason?: string; detail?: string; pendingReason?: string }
```

Then, immediately after the line `let withStatus = upsertStatusTag(baseContent, status);` (~5328), insert:

```ts
        if (status === 'PENDING' && options?.pendingReason) {
            withStatus = upsertPendingReason(withStatus, options.pendingReason);
        }
```

Also widen `confirmSave`'s options type (App.tsx ~5359-5361) to match:

```ts
        options?: { duplicateSignal?: DuplicateTrafficLight; reviewerReason?: string; detail?: string; pendingReason?: string }
```

- [ ] **Step 4: Replace the nab-mode footer buttons**

In the Save modal footer, the `else` branch currently renders "Save as PENDING" + "Save as PAID" (App.tsx ~9111-9126). Replace that entire `<> ... </>` block (the one beginning `) : (` after the red/yellow branch and containing both buttons) with two reason buttons:

```tsx
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => confirmSave('PENDING', {
                                                    duplicateSignal: 'green',
                                                    detail: 'Pending — NAB details C/o Bindi.',
                                                    pendingReason: 'NAB details C/o Bindi',
                                                })}
                                                className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                                            >
                                                Pending: NAB details C/o Bindi
                                            </button>
                                            <button
                                                onClick={() => confirmSave('PENDING', {
                                                    duplicateSignal: 'green',
                                                    detail: 'Pending — For Julian\'s Approval.',
                                                    pendingReason: 'For Julian\'s Approval',
                                                })}
                                                className="px-4 py-2 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-400 transition-colors"
                                            >
                                                Pending: For Julian's Approval
                                            </button>
                                        </>
                                    )}
```

Note: this removes both the old generic "Save as PENDING" button and the "Save as PAID" button (per approved spec). `handleSaveAsPaid` stays defined (still referenced elsewhere, e.g. App.tsx ~5818) — do NOT delete it.

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual check**

Run `npm run dev`, trigger a Save with incomplete NAB so the modal shows mode `nab`. Confirm: no "Save as PAID" button; two buttons present ("Pending: NAB details C/o Bindi", "Pending: For Julian's Approval"); clicking either saves and the record lands in the Pending list.

- [ ] **Step 7: Commit**

```bash
git add App.tsx
git commit -m "feat: replace Save-as-PAID with Bindi/Julian pending reason buttons"
```

---

## Task 3: Pending list icon-only buttons + delete

**Files:**
- Modify: `App.tsx` (new handler near `handleMarkPendingGroupFollowedUp` ~5610; pending card buttons ~8059-8073)

- [ ] **Step 1: Add the delete (soft-dismiss) handler**

Immediately before `handleMarkPendingGroupFollowedUp` (App.tsx ~5610), add:

```ts
    const handleDeletePendingGroup = (group: PendingStaffGroup) => {
        if (!window.confirm(`Remove all ${group.count} pending entr${group.count === 1 ? 'y' : 'ies'} for ${group.staffName} from the Pending list? The records stay in the Daily Activity Tracker.`)) return;
        const idsToDismiss = group.records.map((r: any) => r.id).filter((id: any) => id != null);
        const newIds = [...dismissedIds, ...idsToDismiss];
        setDismissedIds(newIds);
        localStorage.setItem('aspire_dismissed_discrepancies', JSON.stringify(newIds));
    };
```

- [ ] **Step 2: Replace the two text buttons with three icon buttons**

Replace the actions `<div className="flex items-center gap-2"> ... </div>` block in the pending card (App.tsx ~8059-8073) with:

```tsx
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleMarkPendingGroupFollowedUp(group)}
                                                        disabled={followUpingGroupKey === group.key}
                                                        title="Follow up (reset aging)"
                                                        className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <RefreshCw size={16} className={followUpingGroupKey === group.key ? 'animate-spin' : ''} />
                                                    </button>
                                                    <button
                                                        onClick={() => openPendingApprovalModal(group)}
                                                        title="Approve"
                                                        className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePendingGroup(group)}
                                                        title="Delete (hide from pending)"
                                                        className="p-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
```

(`RefreshCw`, `Check`, `Trash2` are already imported at App.tsx:4-6.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Manual check**

`npm run dev` → Pending list shows three icon buttons per group. Hover shows tooltips. Delete asks confirm, then the group disappears from Pending; Settings "items hidden" count increases.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: icon-only pending actions with soft-delete"
```

---

## Task 4: EOD recurring pending block

**Files:**
- Modify: `App.tsx` (constants near `EOD_SPECIAL_ROW_ID` ~31; `generateEODSchedule` ~6548-6630; `eodData` call site ~6721; EOD render ~8235-8271)

- [ ] **Step 1: Add a header-row constant**

Next to `const EOD_SPECIAL_ROW_ID = 'idle-row';` (App.tsx:31), add:

```ts
const EOD_PENDING_HEADER_ROW_ID = 'pending-carryover-header';
```

- [ ] **Step 2: Exclude pending from the main flow and append the recurring block**

In `generateEODSchedule` (App.tsx ~6548), change the signature to accept the open pending records:

```ts
    const generateEODSchedule = (records: any[], openPendingRecords: any[] = []) => {
```

Inside, the `scheduled` array is built from `records.map(...)`. Wrap the source so pending-activity records are not scheduled into the timed flow. Replace the line `const scheduled = records.map(record => {` with:

```ts
        const isPendingActivity = (record: any) => {
            if (record.isReceiptLiquidation || record.isVipManual) return false;
            return !isValidNabReference(record.nabRef);
        };
        const scheduled = records.filter(record => !isPendingActivity(record)).map(record => {
```

Then, replace the final `return [...scheduled, idleRow];` (App.tsx ~6629) with:

```ts
        const pendingHeaderRow = {
            id: EOD_PENDING_HEADER_ROW_ID,
            eodTimeStart: '',
            eodTimeEnd: '',
            eodActivity: 'PENDING (CARRIED OVER)',
            clientName: '',
            staff_name: '',
            amount: '',
            date: '',
            eodStatus: ''
        };

        const pendingRows = openPendingRecords.map((record: any) => {
            const reason = extractPendingReason(record.full_email_content || '');
            return {
                ...record,
                isPendingCarryover: true,
                eodTimeStart: '',
                eodTimeEnd: '',
                eodActivity: 'Pending',
                eodStatus: reason || 'For Approval'
            };
        });

        if (pendingRows.length === 0) {
            return [...scheduled, idleRow];
        }
        return [...scheduled, idleRow, pendingHeaderRow, ...pendingRows];
```

- [ ] **Step 3: Pass pending records at the call site**

Change the `eodData` line (App.tsx ~6721) from:

```ts
    const eodData = generateEODSchedule(todaysProcessedRecords);
```

to:

```ts
    const eodData = generateEODSchedule(todaysProcessedRecords, pendingApprovalRecords);
```

(`pendingApprovalRecords` is already defined above at ~6643 and excludes `dismissedIds`.)

- [ ] **Step 4: Render the header + carryover rows without per-row actions**

In the EOD `tbody` map (App.tsx ~8236), the Activity cell bold check and the Amount/Actions cells currently special-case `EOD_SPECIAL_ROW_ID`. Extend them to also cover the new header and carryover rows.

Replace the Activity `<td>` (App.tsx ~8239) bold condition:

```tsx
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top', fontWeight: (row.id === EOD_SPECIAL_ROW_ID || row.id === EOD_PENDING_HEADER_ROW_ID) ? 'bold' : 'normal', whiteSpace: 'pre-line' }}>{row.eodActivity}</td>
```

Replace the Amount `<td>` (App.tsx ~8241-8243):

```tsx
                                                    <td style={{ padding: '12px 16px', color: '#ffffff', verticalAlign: 'top' }}>
                                                        {(row.id === EOD_SPECIAL_ROW_ID || row.id === EOD_PENDING_HEADER_ROW_ID || !row.amount) ? '' : `$${parseFloat(String(row.amount).replace(/[^0-9.-]+/g, "")).toFixed(2)}`}
                                                    </td>
```

Replace the Actions `<td>` opening condition (App.tsx ~8245-8246) so special, header, and carryover rows all show a dash instead of buttons:

```tsx
                                                    <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                                                        {(row.id === EOD_SPECIAL_ROW_ID || row.id === EOD_PENDING_HEADER_ROW_ID || row.isPendingCarryover) ? (
                                                            <span style={{ color: '#64748b', fontSize: '11px' }}>-</span>
                                                        ) : (
```

(Leave the rest of the Actions cell — the edit/delete buttons in the `else` — unchanged.)

- [ ] **Step 5: Keep the empty-state correct**

The empty-state row (App.tsx ~8269) currently shows when `todaysProcessedRecords.length === 0`. Change its condition so it does not show when there are carried-over pending rows to display:

```tsx
                                            {todaysProcessedRecords.length === 0 && pendingApprovalRecords.length === 0 && (
                                                <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No activity recorded in the current cycle.</td></tr>
                                            )}
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 7: Manual check**

`npm run dev` → EOD tab. Confirm: today's non-pending rows appear timed, then the idle/reconciliation row, then a bold "PENDING (CARRIED OVER)" separator, then one row per open pending record with Status = its saved reason ("NAB details C/o Bindi" / "For Julian's Approval"). Confirm a pending record created on a prior day still appears here. Click "Copy for Outlook" and confirm the pending rows are included in the pasted table. Approve or delete a pending entry and confirm it drops off the EOD block.

- [ ] **Step 8: Commit**

```bash
git add App.tsx
git commit -m "feat: recurring pending block at bottom of EOD"
```

---

## Self-Review

- **Spec coverage:**
  - Spec §1 (icon buttons + delete) → Task 3. ✅
  - Spec §2 (remove Save as PAID, two reason buttons) → Task 2 Step 4. ✅
  - Spec §3 (reason persistence + strip from email body) → Task 1 + Task 2 Steps 1-3. ✅
  - Spec §4 (EOD recurring pending, excluded from main flow, in Outlook copy) → Task 4. ✅
- **Placeholder scan:** none — all steps carry concrete code/commands.
- **Type/name consistency:** `upsertPendingReason` / `extractPendingReason` / `stripPendingReasonTag` defined in Task 1 and used identically in Tasks 2 & 4. `handleDeletePendingGroup`, `EOD_PENDING_HEADER_ROW_ID`, `isPendingCarryover` referenced consistently. `generateEODSchedule(records, openPendingRecords)` signature matches its call site.
