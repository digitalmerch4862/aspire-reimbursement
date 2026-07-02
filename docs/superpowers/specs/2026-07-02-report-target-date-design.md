# Report Target Date & Fixed Period Definitions — Design

## Problem

The Analytics tab's "Executive Reporting Suite" generates Weekly/Monthly/Quarterly/Yearly
reports (`handleGenerateReport` in `App.tsx`). Two issues:

1. **Wrong period math.** Weekly and Monthly and Yearly all compute a *rolling* window
   ending at `now` (e.g. Monthly = month-to-date, Yearly = year-to-date). The business
   wants fixed calendar periods instead:
   - **Weekly** = current work week: Monday of this week through the target date (not a
     rolling 7-day window).
   - **Monthly** = the full *previous* calendar month (if target date is in July, report
     covers all of June).
   - **Quarterly** = unchanged — quarter start through target date (QTD). Already correct.
   - **Yearly** = the full *previous* calendar year (if target date is in 2026, report
     covers all of 2025).
2. **No way to generate a report as of a past date.** Everything is hardcoded to
   `new Date()`. The user wants to pick a target date and have all four report buttons
   compute relative to it.

## Design

### 1. Target date state

Add a new state variable near the other Analytics/report state:

```ts
const [reportTargetDate, setReportTargetDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD, defaults to today
);
```

Plain string in `YYYY-MM-DD` form (native `<input type="date">` format). No persistence
beyond component state — resets to today on page reload, matching existing session-only
state patterns elsewhere in the file.

### 2. UI placement

A single `<input type="date">` bound to `reportTargetDate`, placed directly above the
existing 4 report buttons inside the "Executive Reporting Suite" card, labeled
"Report Target Date". No separate "Reset to Today" control — user edits the field
directly to change it back.

### 3. `handleGenerateReport` changes

Replace `const now = new Date();` with a `now` derived from `reportTargetDate`:

```ts
const now = new Date(`${reportTargetDate}T23:59:59`);
```

(End-of-day so the target date itself is fully included in range comparisons.)

Period start-date logic per type:

- **weekly**: find Monday of the week containing `now`.
  ```ts
  const dayOfWeek = now.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startDate = new Date(now);
  startDate.setDate(now.getDate() - diffToMonday);
  startDate.setHours(0, 0, 0, 0);
  reportTitle = "WEEKLY EXPENSE REPORT";
  ```
- **monthly**: full previous calendar month.
  ```ts
  startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  now = endOfPrevMonth; // report end also becomes end of previous month
  reportTitle = "MONTHLY EXPENSE REPORT";
  ```
  (Drop the "(MTD)" suffix since it's no longer month-to-date.)
- **quarterly**: unchanged — quarter start (based on `now`'s month) through `now`.
- **yearly**: full previous calendar year.
  ```ts
  startDate = new Date(now.getFullYear() - 1, 0, 1);
  const endOfPrevYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  now = endOfPrevYear;
  reportTitle = "ANNUAL EXPENSE REPORT";
  ```
  (Drop "(YTD)" suffix.)

For monthly/yearly, `now` is reassigned to the period's actual end (end of previous
month / end of previous year) since the report's "Reporting Period" and "Report Date"
fields, and the prior-period-comparison math, all key off `now` as the period end.
Weekly and quarterly keep `now` as the target date itself (their end is "today", by
definition of a to-date period).

### 4. Prior Period Comparison

No structural change — it already computes
`previousStartDate = startDate - periodLengthMs` and
`previousEndDate = startDate`, which continues to work correctly once `startDate`/`now`
reflect the corrected period boundaries.

### 5. Report Details table

`Report Date` field already uses `formatReportDate(now)` — since `now` is now the actual
period end (not necessarily today), this correctly reflects the report's as-of date.

## Out of scope

- No custom start/end range picker (rejected in favor of the single target-date input
  driving all 4 preset buttons).
- No change to Quarterly's QTD behavior.
- No persistence of the chosen target date across reloads.
