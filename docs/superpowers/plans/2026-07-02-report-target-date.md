# Report Target Date & Fixed Period Definitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Analytics report period math (Weekly = Monday-to-target, Monthly = previous full month, Quarterly = QTD unchanged, Yearly = previous full year) and add a target-date input so all four report buttons compute relative to a user-chosen date instead of today.

**Architecture:** Extract the period math into a pure function `getReportPeriod(type, targetDate)` in a new `logic/reportPeriods.ts` module (unit-testable, follows the existing `logic/` pattern). `App.tsx` gains a `reportTargetDate` state string (`YYYY-MM-DD`, defaults to today) bound to a native `<input type="date">` above the four report buttons; `handleGenerateReport` calls the new function and adds an upper-bound date filter.

**Tech Stack:** React 19 (single-file App.tsx), TypeScript, Jest + ts-jest for tests.

## Global Constraints

- Single-page app; all UI lives in `App.tsx`. New pure logic goes in `logic/` (existing pattern).
- Quarterly behavior must NOT change (quarter start through target date).
- Monthly title drops "(MTD)"; Yearly title drops "(YTD)" — they are no longer to-date reports.
- No persistence of the target date; component state only, defaults to today.
- Tests run with `npx jest __tests__/reportPeriods.test.ts`; typecheck with `npx tsc --noEmit`.
- Do NOT push to origin. Local commits only; the user confirms pushes separately.

---

### Task 1: `getReportPeriod` pure function

**Files:**
- Create: `logic/reportPeriods.ts`
- Test: `__tests__/reportPeriods.test.ts`

**Interfaces:**
- Produces: `getReportPeriod(type: ReportPeriodType, targetDate: Date): ReportPeriod` where `ReportPeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly'` and `ReportPeriod = { startDate: Date; endDate: Date; reportTitle: string }`. Task 2 consumes this exact signature.

- [ ] **Step 1: Write the failing test**

Create `__tests__/reportPeriods.test.ts`:

```ts
import { getReportPeriod } from '../logic/reportPeriods';

describe('getReportPeriod', () => {
    // Thu 2 Jul 2026. Month index 6 = July.
    const target = new Date(2026, 6, 2, 23, 59, 59);

    it('weekly: Monday of the target week through target date', () => {
        const p = getReportPeriod('weekly', target);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0)); // Mon 29 Jun
        expect(p.endDate).toEqual(target);
        expect(p.reportTitle).toBe('WEEKLY EXPENSE REPORT');
    });

    it('weekly: target on a Sunday goes back to previous Monday', () => {
        const sunday = new Date(2026, 6, 5, 23, 59, 59); // Sun 5 Jul 2026
        const p = getReportPeriod('weekly', sunday);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0)); // Mon 29 Jun
        expect(p.endDate).toEqual(sunday);
    });

    it('weekly: target on a Monday starts that same day', () => {
        const monday = new Date(2026, 5, 29, 23, 59, 59); // Mon 29 Jun 2026
        const p = getReportPeriod('weekly', monday);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0));
    });

    it('monthly: full previous calendar month', () => {
        const p = getReportPeriod('monthly', target);
        expect(p.startDate).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));       // 1 Jun
        expect(p.endDate).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));   // 30 Jun
        expect(p.reportTitle).toBe('MONTHLY EXPENSE REPORT');
    });

    it('monthly: January target covers December of previous year', () => {
        const jan = new Date(2026, 0, 15, 23, 59, 59);
        const p = getReportPeriod('monthly', jan);
        expect(p.startDate).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    });

    it('quarterly: quarter start through target date (QTD, unchanged)', () => {
        const p = getReportPeriod('quarterly', target); // Jul = Q3
        expect(p.startDate).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(target);
        expect(p.reportTitle).toBe('QUARTERLY EXPENSE REPORT (QTD)');
    });

    it('quarterly: March target covers Jan 1 through target', () => {
        const march = new Date(2026, 2, 10, 23, 59, 59);
        const p = getReportPeriod('quarterly', march);
        expect(p.startDate).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(march);
    });

    it('yearly: full previous calendar year', () => {
        const p = getReportPeriod('yearly', target);
        expect(p.startDate).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
        expect(p.reportTitle).toBe('ANNUAL EXPENSE REPORT');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/reportPeriods.test.ts`
Expected: FAIL — `Cannot find module '../logic/reportPeriods'`

- [ ] **Step 3: Write minimal implementation**

Create `logic/reportPeriods.ts`:

```ts
export type ReportPeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface ReportPeriod {
    startDate: Date;
    endDate: Date;
    reportTitle: string;
}

// Weekly  = Monday of the target week through the target date.
// Monthly = the full previous calendar month.
// Quarterly = quarter start through the target date (QTD).
// Yearly  = the full previous calendar year.
export function getReportPeriod(type: ReportPeriodType, targetDate: Date): ReportPeriod {
    switch (type) {
        case 'weekly': {
            const dayOfWeek = targetDate.getDay(); // 0=Sun..6=Sat
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const startDate = new Date(targetDate);
            startDate.setDate(targetDate.getDate() - diffToMonday);
            startDate.setHours(0, 0, 0, 0);
            return { startDate, endDate: new Date(targetDate), reportTitle: 'WEEKLY EXPENSE REPORT' };
        }
        case 'monthly': {
            const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
            const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0, 23, 59, 59, 999);
            return { startDate, endDate, reportTitle: 'MONTHLY EXPENSE REPORT' };
        }
        case 'quarterly': {
            const quarterMonth = Math.floor(targetDate.getMonth() / 3) * 3;
            const startDate = new Date(targetDate.getFullYear(), quarterMonth, 1);
            return { startDate, endDate: new Date(targetDate), reportTitle: 'QUARTERLY EXPENSE REPORT (QTD)' };
        }
        case 'yearly': {
            const startDate = new Date(targetDate.getFullYear() - 1, 0, 1);
            const endDate = new Date(targetDate.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            return { startDate, endDate, reportTitle: 'ANNUAL EXPENSE REPORT' };
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/reportPeriods.test.ts`
Expected: PASS — 8 tests green

- [ ] **Step 5: Commit**

```bash
git add logic/reportPeriods.ts __tests__/reportPeriods.test.ts
git commit -m "feat: add getReportPeriod with fixed business period definitions"
```

---

### Task 2: Wire target date + new periods into App.tsx

**Files:**
- Modify: `App.tsx` — three spots: (a) import block at top, (b) `handleGenerateReport` (currently ~line 4857), (c) Executive Reporting Suite UI (the `grid grid-cols-2 md:grid-cols-4` div holding the four report buttons, ~line 8895)

**Interfaces:**
- Consumes: `getReportPeriod(type, targetDate)` from Task 1 (exact signature above).
- Produces: nothing downstream; UI-facing only.

- [ ] **Step 1: Add import**

In `App.tsx`, next to the existing `logic/` imports near the top of the file (search for `from './logic/`), add:

```ts
import { getReportPeriod } from './logic/reportPeriods';
```

- [ ] **Step 2: Add `reportTargetDate` state**

Next to the existing report state (search for `const [generatedReport, setGeneratedReport] = useState<string | null>(null);`, ~line 1563) add:

```ts
const [reportTargetDate, setReportTargetDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
```

(Local-timezone date string; do NOT use `toISOString()` which can roll the day over UTC.)

- [ ] **Step 3: Replace period math in `handleGenerateReport`**

Replace this block (start of `handleGenerateReport`, ~lines 4857–4881):

```ts
    const handleGenerateReport = (type: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => {
        const now = new Date();
        let startDate = new Date();
        let reportTitle = "";

        switch (type) {
            case 'weekly':
                startDate.setDate(now.getDate() - 7);
                reportTitle = "WEEKLY EXPENSE REPORT";
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                reportTitle = "MONTHLY EXPENSE REPORT (MTD)";
                break;
            case 'quarterly': {
                const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                startDate = new Date(now.getFullYear(), quarterMonth, 1);
                reportTitle = "QUARTERLY EXPENSE REPORT (QTD)";
                break;
            }
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                reportTitle = "ANNUAL EXPENSE REPORT (YTD)";
                break;
        }
```

with:

```ts
    const handleGenerateReport = (type: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => {
        const targetDate = new Date(`${reportTargetDate}T23:59:59`);
        const { startDate, endDate, reportTitle } = getReportPeriod(type, targetDate);
        const now = endDate; // period end drives Reporting Period, Report Date, and prior-period math
```

- [ ] **Step 4: Add upper bound to the rows filter**

Immediately below, change:

```ts
        const relevantRows = claimAnalyticsRows.filter((row: any) => !row.isReceiptLiquidation && row.rawDate >= startDate);
```

to:

```ts
        const relevantRows = claimAnalyticsRows.filter((row: any) => !row.isReceiptLiquidation && row.rawDate >= startDate && row.rawDate <= endDate);
```

(Without the upper bound, a previous-month report would also count current-month claims. The prior-period comparison block below it — `periodLengthMs` / `previousStartDate` / `previousEndDate` — needs no change: `now` is already the period end.)

- [ ] **Step 5: Add the date input above the four report buttons**

Find the Executive Reporting Suite card (~line 8890): the header div ending with `<span ...>Outlook Optimized</span>` followed by `<div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">`. Insert BETWEEN them:

```tsx
                                <div className="px-6 pt-5 flex items-center gap-3">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Report Target Date</label>
                                    <input
                                        type="date"
                                        value={reportTargetDate}
                                        onChange={(e) => setReportTargetDate(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-400 [color-scheme:dark]"
                                    />
                                </div>
```

- [ ] **Step 6: Typecheck and full test run**

Run: `npx tsc --noEmit && npx jest --runInBand`
Expected: typecheck clean; all suites PASS

- [ ] **Step 7: Commit**

```bash
git add App.tsx
git commit -m "feat: report target-date picker and fixed period definitions in Analytics"
```

---

### Task 3: Processing Summary section in generated reports

(Spec: `docs/superpowers/specs/2026-07-02-processing-summary-design.md`)

**Files:**
- Modify: `App.tsx` — report assembly inside `handleGenerateReport` (the `professionalReport +=` block, currently ~lines 4965–4990)

**Interfaces:**
- Consumes: locals already computed in `handleGenerateReport`: `totalClaims`, `totalSpend`, `paidCount`, `pendingCount`, `formatReportCurrency`.
- Produces: nothing downstream; report text only.

- [ ] **Step 1: Insert Processing Summary before Executive Summary**

Find (after Task 2's changes the Report Details block ends with the `| Scope | ... |` line):

```ts
        professionalReport += `| Scope | Unique reimbursement claims recorded within the selected period |\n\n`;

        professionalReport += `## Executive Summary\n`;
```

Replace with:

```ts
        professionalReport += `| Scope | Unique reimbursement claims recorded within the selected period |\n\n`;

        professionalReport += `## Processing Summary\n`;
        professionalReport += `| Metric | Value |\n`;
        professionalReport += `| :--- | :--- |\n`;
        professionalReport += `| Claims Processed | **${totalClaims}** |\n`;
        professionalReport += `| Total Value Processed | **${formatReportCurrency(totalSpend)}** |\n`;
        professionalReport += `| Completed / Paid | ${paidCount} |\n`;
        if (pendingCount > 0) professionalReport += `| Pending Follow-up | ${pendingCount} |\n`;
        professionalReport += `\n`;

        professionalReport += `## Executive Summary\n`;
```

- [ ] **Step 2: Remove the now-duplicated rows from Executive Summary**

In the Executive Summary block, delete these two lines:

```ts
        professionalReport += `| Paid / Completed | ${paidCount} |\n`;
        if (pendingCount > 0) professionalReport += `| Pending | ${pendingCount} |\n`;
```

(The conditional `For Revision` / `Manual Encode` / `Data Quality Follow-Up` rows and everything else in Executive Summary stay.)

- [ ] **Step 3: Typecheck and test run**

Run: `npx tsc --noEmit && npx jest --runInBand`
Expected: clean / all PASS

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: lead Analytics reports with Processing Summary section"
```

---

## Verification notes

- Manual check (needs Supabase data, so on deployed app): set target date to a mid-June date, click Monthly → Reporting Period should read "May 1, 2026 to May 31, 2026"; click Weekly → Monday-of-that-week to the chosen date; Yearly → "Jan 1, 2025 to Dec 31, 2025"; Quarterly → quarter start to the chosen date.
- Empty-period case already handled by the existing `showWarningToast('No records found for this period.')` guard.
