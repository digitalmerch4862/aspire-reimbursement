# Processing Summary Section — Design

## Problem

The Analytics reports (Weekly/Monthly/Quarterly/Yearly, `handleGenerateReport` in
`App.tsx`) read as pure expense analysis. The auditor sends these to management and
wants the report to lead with their own work output — how many claims they processed
and their total value — before the expense breakdown. Top staff and top YP/client
already exist as ranking sections; the missing piece is a productivity summary.

## Design

### New section: Processing Summary

Placed as the FIRST section after the report intro, before Executive Summary:

```
## Processing Summary
| Metric | Value |
| :--- | :--- |
| Claims Processed | **76** |
| Total Value Processed | **$6299.85** |
| Completed / Paid | 72 |
| Pending Follow-up | 4 |
```

Rules:
- `Claims Processed` = `totalClaims`, `Total Value Processed` = `totalSpend`,
  `Completed / Paid` = `paidCount`, `Pending Follow-up` = `pendingCount` — all already
  computed inside `handleGenerateReport`; no new computation.
- `Pending Follow-up` row is hidden when `pendingCount === 0` (consistent with the
  earlier zero-row cleanup).
- Applies to all four report types.

### Executive Summary cleanup

Remove the `Paid / Completed` and `Pending` rows from the Executive Summary table —
they now live in Processing Summary. Executive Summary keeps: Total Spend, Total
Claims, Average Claim Value, (conditional For Revision / Manual Encode / Data Quality
Follow-Up rows), Highest Single Claim, Highest Staff Spend, Highest Client Spend,
Highest Location Spend.

## Out of scope

- No separate productivity report button.
- No per-working-day average or prior-period productivity delta rows (rejected;
  Prior Period Comparison section already covers movement).
- Staff/YP rankings unchanged — they already satisfy "sino malaki mag-reimburse /
  sinong YP".
