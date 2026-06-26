# Pending Qualification Buttons + EOD Why/Date/Aging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator one-click classify each pending record as "NAB details C/o Bindi" or "For Julian's Approval" from the Pending tab, and show why + when + how long each carried-over item has been pending inside the EOD Status cell.

**Architecture:** Pending reason already persists as a `<!-- PENDING_REASON: ... -->` tag in `full_email_content` (via `utils/pendingReason.ts`). We add a pure formatter for the EOD status line, wire it into `generateEODSchedule`, expand each Pending staff-group card to list its records with two reason toggle buttons, and add a single-record tag handler modeled on the existing `handleMarkPendingGroupFollowedUp`.

**Tech Stack:** React + TypeScript (Vite), Supabase (`audit_logs` table), Jest (`*.test.ts`), lucide-react icons.

---

## File Structure

- `utils/pendingReason.ts` — add pure `formatPendingEodStatus(reason, sinceDate, ageDays)`. Reason persistence helpers already here.
- `__tests__/pendingReason.test.ts` — add tests for the new formatter.
- `App.tsx`:
  - `generateEODSchedule` pending rows (~6626) — build the one-line status.
  - New `handleTagPendingReason(record, reason)` handler + `taggingRecordId` state.
  - Pending staff-group card render (~8053) — list records with Bindi/Julian buttons.

The two reason strings are fixed and reused everywhere:
- `NAB details C/o Bindi`
- `For Julian's Approval`

---

### Task 1: EOD status formatter (pure helper, TDD)

**Files:**
- Modify: `utils/pendingReason.ts`
- Test: `__tests__/pendingReason.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/pendingReason.test.ts`:

```ts
import { formatPendingEodStatus } from '../utils/pendingReason';

describe('formatPendingEodStatus', () => {
  test('packs reason, pending-since date, and aging on one line', () => {
    const since = new Date('2026-06-18T09:00:00.000Z');
    expect(formatPendingEodStatus('For Julian\'s Approval', since, 4))
      .toBe("For Julian's Approval · Pending since 18 Jun · 4d aging");
  });

  test('falls back to "For Approval" when reason empty', () => {
    const since = new Date('2026-06-18T09:00:00.000Z');
    expect(formatPendingEodStatus('', since, 0))
      .toBe('For Approval · Pending since 18 Jun · 0d aging');
  });

  test('omits the date segment when sinceDate is null or invalid', () => {
    expect(formatPendingEodStatus('NAB details C/o Bindi', null, 2))
      .toBe('NAB details C/o Bindi · 2d aging');
    expect(formatPendingEodStatus('NAB details C/o Bindi', new Date('not-a-date'), 2))
      .toBe('NAB details C/o Bindi · 2d aging');
  });

  test('clamps negative aging to 0', () => {
    expect(formatPendingEodStatus('For Approval', null, -3))
      .toBe('For Approval · 0d aging');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/pendingReason.test.ts -t formatPendingEodStatus`
Expected: FAIL — `formatPendingEodStatus is not a function` / import undefined.

- [ ] **Step 3: Write minimal implementation**

Append to `utils/pendingReason.ts`:

```ts
// Builds the EOD "PENDING (CARRIED OVER)" Status cell: why + when + how long,
// packed on one line with " · " separators so the Outlook table copy is unaffected.
export const formatPendingEodStatus = (
  reason: string,
  sinceDate: Date | null,
  ageDays: number,
): string => {
  const reasonText = reason?.trim() || 'For Approval';
  const parts = [reasonText];
  if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
    const dateText = sinceDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    parts.push(`Pending since ${dateText}`);
  }
  parts.push(`${Math.max(0, ageDays)}d aging`);
  return parts.join(' · ');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/pendingReason.test.ts -t formatPendingEodStatus`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/pendingReason.ts __tests__/pendingReason.test.ts
git commit -m "feat: formatPendingEodStatus helper for EOD pending line"
```

---

### Task 2: Wire formatter into EOD carryover rows

**Files:**
- Modify: `App.tsx` (import ~line 11; `generateEODSchedule` pending rows ~6626-6636)

- [ ] **Step 1: Extend the import**

`App.tsx:11` currently:

```ts
import { upsertPendingReason, extractPendingReason } from './utils/pendingReason';
```

Change to:

```ts
import { upsertPendingReason, extractPendingReason, formatPendingEodStatus } from './utils/pendingReason';
```

- [ ] **Step 2: Build the one-line status in the pending rows map**

`App.tsx` ~6626-6636 currently:

```ts
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
```

Replace with:

```ts
        const pendingRows = openPendingRecords.map((record: any) => {
            const reason = extractPendingReason(record.full_email_content || '');
            const followedUpAt = extractPendingFollowedUpAt(record.full_email_content || '');
            const baseline = followedUpAt || record.created_at;
            const sinceDate = baseline ? new Date(baseline) : null;
            const ageDays = typeof record.pendingAgeDays === 'number'
                ? record.pendingAgeDays
                : getPendingAgeDays(record);
            return {
                ...record,
                isPendingCarryover: true,
                eodTimeStart: '',
                eodTimeEnd: '',
                eodActivity: 'Pending',
                eodStatus: formatPendingEodStatus(reason, sinceDate, ageDays)
            };
        });
```

Note: `extractPendingFollowedUpAt` (App.tsx:1133) and `getPendingAgeDays` (App.tsx:1146) are module-scope and already in scope here. `record.pendingAgeDays` is present because `generateEODSchedule` receives `pendingApprovalRecords` (App.tsx:6733), which sets it.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the EOD tab with at least one open pending record.
Expected: each row under "PENDING (CARRIED OVER)" shows e.g. `For Julian's Approval · Pending since 18 Jun · 4d aging`; Amount column stays blank for these rows.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: EOD pending rows show reason, pending-since date, aging"
```

---

### Task 3: Single-record reason tag handler + state

**Files:**
- Modify: `App.tsx` (state near other pending state ~line 1631+; handler near `handleMarkPendingGroupFollowedUp` ~5591)

- [ ] **Step 1: Add the tagging state**

Near the existing `followUpingGroupKey` state declaration (search `followUpingGroupKey` — it sits with the other pending UI state), add:

```ts
    const [taggingRecordId, setTaggingRecordId] = useState<any>(null);
```

- [ ] **Step 2: Add the handler**

Immediately after `handleMarkPendingGroupFollowedUp` (ends `App.tsx:5629`), add:

```ts
    const handleTagPendingReason = async (record: any, reason: string) => {
        if (!record?.id) return;
        setTaggingRecordId(record.id);
        try {
            const nextContent = upsertPendingReason(String(record.full_email_content || ''), reason);
            const { error } = await supabase
                .from('audit_logs')
                .update({ full_email_content: nextContent })
                .eq('id', record.id);
            if (error) throw error;
            setHistoryData(prev => prev.map(item =>
                item.id === record.id ? { ...item, full_email_content: nextContent } : item
            ));
        } catch (error) {
            console.error('Failed to tag pending reason:', error);
            showWarningToast('Failed to set pending reason. Please try again.');
        } finally {
            setTaggingRecordId(null);
        }
    };
```

This mirrors `handleMarkPendingGroupFollowedUp` (per-record `audit_logs` update + optimistic `setHistoryData`) but writes the reason tag via `upsertPendingReason` and touches only one record. It does NOT change `nab_code` and does NOT reset the follow-up/aging baseline.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: handleTagPendingReason single-record reason setter"
```

---

### Task 4: Per-record Bindi/Julian buttons in the Pending card

**Files:**
- Modify: `App.tsx` (Pending staff-group card render ~8054-8095)

- [ ] **Step 1: Add the per-record reason list inside the group card**

In the group card (`App.tsx:8054`), the left column `<div className="space-y-1">` ends at `App.tsx:8070`. Directly after that left column's closing `</div>` (line 8070) and BEFORE the action-button column `<div className="flex items-center gap-2">` (line 8071), insert a records list. To keep the row layout, change the card so the records list sits below the header row: wrap the existing header `<div className="space-y-1">…</div>` and the new list in a single flex-col container.

Replace lines `App.tsx:8055-8070` (the `<div className="space-y-1"> … </div>` block) with:

```tsx
                                                <div className="flex-1 space-y-2">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-white uppercase">{group.staffName}</p>
                                                            <span className="text-sm font-bold text-emerald-400">(${group.totalAmount.toFixed(2)})</span>
                                                        </div>
                                                        <p className="text-xs text-slate-400">Pending entries: {group.count}</p>
                                                        <p className="text-xs text-slate-400">Latest date: {group.latestDate}</p>
                                                        <span className={`inline-flex text-[11px] px-2 py-1 rounded-full border ${group.oldestAgeDays >= 8
                                                            ? 'bg-red-500/15 text-red-200 border-red-400/25'
                                                            : group.oldestAgeDays >= 3
                                                                ? 'bg-amber-500/15 text-amber-200 border-amber-400/25'
                                                                : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
                                                            }`}>
                                                            Oldest pending: {group.oldestAgeDays} day{group.oldestAgeDays === 1 ? '' : 's'}
                                                        </span>
                                                    </div>
                                                    <div className="space-y-1.5 pt-1 border-t border-white/5">
                                                        {group.records.map((record: any) => {
                                                            const activeReason = extractPendingReason(record.full_email_content || '');
                                                            const isBindi = activeReason === 'NAB details C/o Bindi';
                                                            const isJulian = activeReason === 'For Julian\'s Approval';
                                                            const busy = taggingRecordId === record.id;
                                                            return (
                                                                <div key={record.id} className="flex items-center justify-between gap-2">
                                                                    <span className="text-xs text-slate-300 truncate">
                                                                        {String(record.clientFullName || record.client_name || record.date || record.id)}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <button
                                                                            onClick={() => void handleTagPendingReason(record, 'NAB details C/o Bindi')}
                                                                            disabled={busy}
                                                                            title="Mark: NAB details C/o Bindi"
                                                                            className={`px-2 py-1 rounded-md text-[11px] border transition-colors disabled:opacity-50 ${isBindi
                                                                                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                                                                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                                                                        >
                                                                            C/o Bindi
                                                                        </button>
                                                                        <button
                                                                            onClick={() => void handleTagPendingReason(record, 'For Julian\'s Approval')}
                                                                            disabled={busy}
                                                                            title="Mark: For Julian's Approval"
                                                                            className={`px-2 py-1 rounded-md text-[11px] border transition-colors disabled:opacity-50 ${isJulian
                                                                                ? 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40'
                                                                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                                                                        >
                                                                            Julian
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
```

Leave the action-button column (`App.tsx:8071-8094`, the Follow up / Approve / Delete buttons) unchanged.

Note on the field used for the record label: `record.clientFullName`/`record.client_name` may be undefined depending on processing; the `||` chain falls back to `date` then `id` so the row always shows something. If neither name field exists in this codebase's processed record, the date is an acceptable label.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the Pending tab.
Expected: each staff card lists its records; clicking `C/o Bindi` or `Julian` highlights that button (green / indigo). Reopen/refresh — highlight persists. The EOD tab then shows that reason in the carried-over row's Status line.

- [ ] **Step 4: Full test + build**

Run: `npx jest && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: per-record Bindi/Julian reason buttons in Pending card"
```

---

## Self-Review

- **Spec coverage:**
  - Spec §1 quick Bindi/Julian buttons per row → Tasks 3 + 4. ✔
  - Spec §2 EOD one-line why + date + aging → Tasks 1 + 2. ✔
  - Exact reason strings reused → Tasks 1-4 all use `NAB details C/o Bindi` / `For Julian's Approval`. ✔
  - Aging not reset on tag → Task 3 handler writes only the reason tag. ✔
  - Outlook copy unaffected → plain-text `·` line, no new columns (Task 1/2). ✔
- **Placeholder scan:** none — all steps carry full code/commands.
- **Type consistency:** `formatPendingEodStatus(reason, sinceDate, ageDays)` signature identical in Task 1 (def) and Task 2 (call); `handleTagPendingReason(record, reason)` identical in Task 3 (def) and Task 4 (calls); `taggingRecordId` defined Task 3, used Task 4. ✔
