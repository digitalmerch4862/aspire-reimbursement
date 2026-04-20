# Solo Mode Two-Source Truth Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make soloMode.ts always compute form total and receipt total independently from per-item row data, and surface a clear discrepancy line in the email only when there is an actual difference.

**Architecture:** Two independent sums are computed — `itemsFormSum` (sum of each row's `itemAmount`) and `itemsReceiptSum` (sum of each row's `receiptTotal`). Explicit header totals ("Total Amount:" from form, GRAND TOTAL from receipt) override the sums when present and valid. The email template uses these two values and only prints the discrepancy line when `difference > $0.00`.

**Tech Stack:** TypeScript, existing `normalizeMoneyValue` helper from `logic/modes/helpers.ts`

---

## Files

- Modify: `logic/modes/soloMode.ts` — all total computation and email template logic lives here

---

### Task 1: Lock in `safeNum` helper and verify per-item sums

**Files:**
- Modify: `logic/modes/soloMode.ts:164-182`

- [ ] **Step 1: Confirm `safeNum` is defined and correct**

Open `logic/modes/soloMode.ts`. Around line 164 you will see:

```typescript
const safeNum = (v: any) => {
    const n = parseFloat(normalizeMoneyValue(String(v ?? ''), '0.00'));
    return Number.isFinite(n) ? n : 0;
};
```

This is correct — leave it exactly as-is.

- [ ] **Step 2: Confirm `itemsFormSum` uses `itemAmount` as primary**

Around line 168, confirm this reads:

```typescript
const itemsFormSum = items.reduce((sum, item) => sum + safeNum(item.itemAmount || item.amount), 0);
```

`itemAmount` = column 6 of the receipt table (per-item cost).

- [ ] **Step 3: Confirm `itemsReceiptSum` uses `receiptTotal` as primary**

Around line 169, confirm this reads:

```typescript
const itemsReceiptSum = items.reduce((sum, item) => sum + safeNum(item.receiptTotal || item.amount), 0);
```

`receiptTotal` = column 7 of the receipt table (total for that receipt slip).

- [ ] **Step 4: Confirm the override logic for `formTotalValue`**

Lines 171-174 should read exactly:

```typescript
const parsedFormTotal = formTotalMatch ? parseFloat(formTotalMatch[1].replace(/,/g, '')) : NaN;
const formTotalValue = Number.isFinite(parsedFormTotal) && parsedFormTotal > 0
    ? parsedFormTotal
    : itemsFormSum;
```

Rule: use the "Total Amount:" header value only when it is a valid positive number; otherwise use the per-item sum.

- [ ] **Step 5: Confirm the override logic for `receiptTotalValue`**

Lines 175-177 should read exactly:

```typescript
const receiptTotalValue = receiptGrandTotal !== null && Number.isFinite(receiptGrandTotal) && receiptGrandTotal > 0
    ? receiptGrandTotal
    : itemsReceiptSum;
```

Rule: use the GRAND TOTAL line only when it is a valid positive number; otherwise use the per-item receipt sum.

- [ ] **Step 6: Confirm `totalAmount` fallback is using computed sums**

Lines 180-182 should read:

```typescript
if ((!formTotalMatch && !receiptTotalMatch && items.length > 0) || totalAmount <= 0) {
    totalAmount = itemsReceiptSum > 0 ? itemsReceiptSum : itemsFormSum;
}
```

- [ ] **Step 7: Commit current state**

```bash
git add logic/modes/soloMode.ts
git commit -m "fix: solo mode per-item sum fallback for form and receipt totals"
```

---

### Task 2: Fix the `differenceAmount` computation and email display

**Files:**
- Modify: `logic/modes/soloMode.ts:178` (differenceAmount) and `logic/modes/soloMode.ts:218-220` (email template)

- [ ] **Step 1: Confirm `differenceAmount` uses the two independent values**

Line 178 should read:

```typescript
const differenceAmount = Math.abs(formTotalValue - receiptTotalValue);
```

Remove the `|| 0` fallback wrappers — both values are already guaranteed numeric by the logic above.

If the current line has `|| 0` guards, update it to:

```typescript
const differenceAmount = Math.abs(formTotalValue - receiptTotalValue);
```

- [ ] **Step 2: Update the email template to show discrepancy only when nonzero**

Locate lines 218-220 in the phase4 template. Replace:

```typescript
Reimbursement form total is $${formTotalValue.toFixed(2)}
Receipt total is $${receiptTotalValue.toFixed(2)}
Difference amount is $${differenceAmount.toFixed(2)}
```

With:

```typescript
Reimbursement Form Total: $${formTotalValue.toFixed(2)}
Receipt Total:            $${receiptTotalValue.toFixed(2)}${differenceAmount > 0.01 ? `\n⚠ Discrepancy:           $${differenceAmount.toFixed(2)}` : ''}
```

This renders clean when totals match, and shows the discrepancy line with a warning symbol only when there is an actual difference above $0.01 (to avoid floating-point noise).

- [ ] **Step 3: Verify the email Amount line also uses the correct total**

Line 216 should read:

```typescript
Amount: $${totalAmount.toFixed(2)}
```

`totalAmount` is set from the fallback logic in Task 1 Step 6, so this is consistent.

- [ ] **Step 4: Commit**

```bash
git add logic/modes/soloMode.ts
git commit -m "feat: show discrepancy line in solo email only when amounts differ"
```

---

### Task 3: Verify the mismatch audit rule is consistent with the new totals

**Files:**
- Modify: `logic/modes/soloMode.ts:194-198` (mismatch issues rule)

- [ ] **Step 1: Update the mismatch rule to use `formTotalValue` vs `receiptTotalValue`**

Currently lines 194-198 compare `totalAmount` vs `receiptGrandTotal`. This can miss mismatches when GRAND TOTAL is absent. Replace with:

```typescript
if (formTotalValue > 0 && receiptTotalValue > 0) {
    if (Math.abs(formTotalValue - receiptTotalValue) > 0.01) {
        issues.push({
            level: 'warning',
            message: `Total mismatch: Form $${formTotalValue.toFixed(2)} vs Receipt $${receiptTotalValue.toFixed(2)} (difference: $${differenceAmount.toFixed(2)}).`
        });
    }
}
```

Note: move this block to **after** the `differenceAmount` declaration (currently line 178), since it depends on both values and `differenceAmount`. In the current file structure, lines 184-199 are the issues block — the `differenceAmount` is declared at line 178, so the order is correct.

- [ ] **Step 2: Run TypeScript check**

```bash
cd "C:/Users/Admin/Desktop/App/Aspire Reimbursement"
npx tsc --noEmit
```

Expected: no errors related to `soloMode.ts`.

- [ ] **Step 3: Commit**

```bash
git add logic/modes/soloMode.ts
git commit -m "fix: mismatch audit rule now compares two-source totals consistently"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Test with a table that has GRAND TOTAL**

Paste a receipt with a markdown table ending in `| GRAND TOTAL | | | ... | $150.00 |` and a form with `Total Amount: $150.00`. Expected email output:

```
Reimbursement Form Total: $150.00
Receipt Total:            $150.00
```

No discrepancy line.

- [ ] **Step 2: Test with a table that has NO GRAND TOTAL row**

Remove the GRAND TOTAL row from the receipt table. Expected: both totals are computed from per-item sums. If all per-item `receiptTotal` values sum to `$150.00`, output should be identical to Step 1.

- [ ] **Step 3: Test with a mismatch**

Set form `Total Amount: $160.00` and receipt items summing to `$150.00`. Expected email:

```
Reimbursement Form Total: $160.00
Receipt Total:            $150.00
⚠ Discrepancy:           $10.00
```

And Phase 3 audit issues should include a WARNING about the mismatch.

- [ ] **Step 4: Test with no explicit totals anywhere**

Remove both `Total Amount:` from form and `GRAND TOTAL` from receipt. Expected: both totals computed purely from per-item sums, no 0.00 shown.

- [ ] **Step 5: Final commit if any last-minute fixes were needed**

```bash
git add logic/modes/soloMode.ts
git commit -m "fix: smoke test corrections for two-source truth totals"
```

---

### Task 5: Push and create PR

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat: solo mode two-source truth totals with discrepancy line" \
  --body "Computes form total and receipt total independently from per-item row data. Explicit header values override sums when present. Discrepancy line shown in email only when difference > \$0.01."
```

- [ ] **Step 3: Report PR URL to user**
