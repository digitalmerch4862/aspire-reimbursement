# Pre-flight Already-Paid Gate — Design Spec

**Date:** 2026-04-22  
**Status:** Approved  
**Context:** A double payment occurred for Rebecca Hawkes ($38.20) because the coordinator had already paid the expense offline (cash/card), but the reimbursement form was still submitted and processed through the app. The app's duplicate detection only checks its own database — it cannot detect payments made outside the system.

---

## Problem

The duplicate check in `App.tsx` compares incoming transactions against `databaseRows`. If the first payment was made outside the app (coordinator cash advance, petty cash, card), it never entered the database, so the app returns GREEN and processes the payment anyway — causing a double payment.

---

## Solution

A pre-flight confirmation modal that intercepts the **Start Audit** button click in **Solo mode only**, before any processing begins. The user must explicitly confirm the expense has not already been paid by other means before the audit runs.

---

## Scope

- **Applies to:** Solo mode only (`requestMode === 'solo'`)
- **Does not apply to:** Group, Receipt, Manual modes
- **Trigger point:** First guard inside `handleProcess()`, before all other validation

---

## User Flow

1. User pastes reimbursement form and clicks **Start Audit** (Solo mode)
2. Modal appears immediately — zero processing has occurred
3. Modal title: **"Already Paid Check"**
4. Modal body: **"Was this expense already paid by another means (cash, card advance, petty cash)?"**
5. Two buttons: **Yes, already paid** | **No, proceed**
6. **Yes** path:
   - Modal closes
   - Processing stays blocked (`ProcessingState.IDLE`)
   - Red error message shown: `"⛔ Processing blocked: This expense was marked as already paid. Do not process to avoid double payment."`
7. **No** path:
   - Modal closes
   - `handleProcess()` continues normally from where it left off

---

## Implementation

### State
No new state variable needed. Reuse the existing `showSaveModal` / `saveModalDecision` system.

Add `'already-paid'` to the `SaveModalDecision` mode union:
```ts
interface SaveModalDecision {
    mode: 'nab' | 'red' | 'yellow' | 'already-paid';
    detail: string;
}
```

### Guard in `handleProcess()`
Insert as the first check inside `handleProcess()`, before the existing blank-input guards:

```ts
if (requestMode === 'solo') {
    setSaveModalDecision({
        mode: 'already-paid',
        detail: 'Was this expense already paid by another means (cash, card advance, petty cash)?'
    });
    setShowSaveModal(true);
    return; // halt — modal handlers resume processing
}
```

### Modal rendering
In the existing save modal render block, handle `'already-paid'` mode:
- Show **Yes, already paid** button → calls `handleAlreadyPaidBlock()`
- Show **No, proceed** button → calls `handleAlreadyPaidContinue()`

### New handlers
```ts
const handleAlreadyPaidBlock = () => {
    setShowSaveModal(false);
    setSaveModalDecision(null);
    setProcessingState(ProcessingState.IDLE);
    setErrorMessage('⛔ Processing blocked: This expense was marked as already paid. Do not process to avoid double payment.');
};

const handleAlreadyPaidContinue = () => {
    setShowSaveModal(false);
    setSaveModalDecision(null);
    // continue processing — re-enter handleProcess() past the solo guard
    handleProcessCore();
};
```

The existing `handleProcess()` solo guard is extracted into a `handleProcessCore()` function (everything after the guard), so `handleAlreadyPaidContinue` can call it without re-triggering the modal.

---

## What Does Not Change

- Duplicate DB detection logic — untouched
- Group, Receipt, Manual mode flows — untouched
- Save flow after the gate passes — untouched
- All existing modal modes (`nab`, `red`, `yellow`) — untouched

---

## Success Criteria

- Clicking Start Audit in Solo mode always shows the already-paid modal first
- Clicking "Yes" blocks processing and shows a clear red error
- Clicking "No" proceeds exactly as before with no behavior change
- Group / Receipt / Manual modes are completely unaffected
