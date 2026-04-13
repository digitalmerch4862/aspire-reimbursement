import { ProcessingResult, ModeOptions, ManualAuditIssue } from './types';
import { normalizeMoneyValue } from './helpers';
import { processSoloMode } from './soloMode';

export const processReceiptMode = (options: ModeOptions): ProcessingResult & { errorMessage?: string; issues?: ManualAuditIssue[] } => {
    const soloResult = processSoloMode({
        ...options,
        formText: '',
        receiptText: options.receiptText
    });

    const parsedItems = soloResult.parsedItems || [];
    const derivedTotal = Number(soloResult.receiptGrandTotal ?? soloResult.formTotal ?? 0);
    const totalAmount = Number.isFinite(derivedTotal) ? derivedTotal : 0;
    const issues = (soloResult.issues || []).filter((issue) => {
        const message = issue.message.toLowerCase();
        return !message.includes("missing 'client name'")
            && !message.includes("missing 'address'")
            && !message.includes("missing 'staff member'");
    });

    const phase1 = `<<<PHASE_1_START>>>\n## Receipt Mode Audit\nProcessing petty cash liquidation receipts for reference logging.\n<<<PHASE_1_END>>>`;
    const phase2 = `<<<PHASE_2_START>>>\n## Receipt Standardization\nReceipt-only liquidation data prepared for database history, fraud reference, and EOD logging.\n<<<PHASE_2_END>>>`;
    const phase3 = `<<<PHASE_3_START>>>\n${issues.length > 0 ? issues.map((iss, i) => `${i + 1}. [${iss.level.toUpperCase()}] ${iss.message}`).join('\n') : 'Receipt liquidation log is ready to save.'}\n<<<PHASE_3_END>>>`;

    const phase4 = `<!-- ENTRY TYPE: RECEIPT_LIQUIDATION -->
<!-- FLOW TYPE: PETTY CASH LIQUIDATION -->
Liquidation reference log for petty cash receipt history.

Staff Member: Petty Cash
Client / Location: Petty Cash Liquidation
Activity: Audit
Description: Liquidation
Amount: $${totalAmount.toFixed(2)}
NAB Code:
<!-- UID_FALLBACKS:${parsedItems.map((item, i) => item.uniqueId || item.receiptNum || String(i + 1)).join('||')} -->

Summary of Expenses:

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${parsedItems.map((item, i) => `| ${item.receiptNum || (i + 1)} | ${item.uniqueId || '-'} | ${item.storeName || '-'} | ${item.dateTime || '-'} | ${item.product || '-'} | ${item.category || 'Other'} | ${item.itemAmount === 'Included in total' ? 'Included in total' : `$${normalizeMoneyValue(item.itemAmount, item.amount)}`} | $${normalizeMoneyValue(item.receiptTotal, item.amount)} | ${item.notes || '-'} |`).join('\n')}

TOTAL AMOUNT: $${totalAmount.toFixed(2)}
`;

    const transactions = parsedItems.length > 0
        ? parsedItems.map((item) => ({
            staffName: 'Petty Cash',
            formattedName: 'Petty Cash',
            amount: parseFloat(normalizeMoneyValue(item.amount || item.receiptTotal || '0', '0')),
            ypName: 'Petty Cash Liquidation',
            location: 'Reference Only',
            expenseType: 'Liquidation',
            receiptId: item.uniqueId || 'N/A',
            date: item.dateTime || new Date().toLocaleDateString(),
            product: item.product || 'Liquidation Receipt'
        }))
        : [{
            staffName: 'Petty Cash',
            formattedName: 'Petty Cash',
            amount: totalAmount,
            ypName: 'Petty Cash Liquidation',
            location: 'Reference Only',
            expenseType: 'Liquidation',
            receiptId: 'N/A',
            date: new Date().toLocaleDateString(),
            product: 'Liquidation Receipt'
        }];

    return {
        phase1,
        phase2,
        phase3,
        phase4,
        transactions,
        issues,
        parsedItems,
        formTotal: totalAmount,
        receiptGrandTotal: totalAmount
    };
};
