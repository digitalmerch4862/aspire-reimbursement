import { TransactionRecord, ProcessingResult, ModeOptions } from './types';
import { normalizeMoneyValue } from './helpers';

export const processManualMode = (options: ModeOptions): ProcessingResult => {
    const formText = String(options.formText || '');
    const requestedBy = formText.match(/Requested\s*By:\s*(.+)/i)?.[1]?.trim() || '[Enter Requestor]';
    const staffMember = formText.match(/Staff\s*Member:\s*(.+)/i)?.[1]?.trim() || '[Enter Staff Member]';
    const amountRaw = formText.match(/Amount:\s*\$?(.+)/i)?.[1]?.trim() || '0.00';
    const amountValue = normalizeMoneyValue(amountRaw, '0.00');
    const clientLocation = formText.match(/Client\s*\/\s*Location:\s*(.+)/i)?.[1]?.trim() || '[Optional Client / Location]';
    const reason = formText.match(/Reason\s*\/\s*Special\s*Instruction:\s*([\s\S]*?)(?:\nNotes:|\n*$)/i)?.[1]?.trim() || '[Enter Reason]';
    const notes = formText.match(/Notes:\s*([\s\S]*)/i)?.[1]?.trim() || '-';

    const phase1 = `<<<PHASE_1_START>>>\n## Manual Mode Active\nManual entry mode initialized for quick logging.\n<<<PHASE_1_END>>>`;
    const phase2 = `<<<PHASE_2_START>>>\n## Data Standardization\nManual entry standardization active.\n<<<PHASE_2_END>>>`;
    const phase3 = `<<<PHASE_3_START>>>\nManual Mode: Rules validation bypassed.\n<<<PHASE_3_END>>>`;
    
    const phase4 = `<!-- ENTRY TYPE: VIP_MANUAL -->
<!-- FLOW TYPE: SPECIAL INSTRUCTION -->
Hi,

I hope this message finds you well.

I am writing to confirm that this VIP / special instruction request has been recorded for processing and monitoring.

**Requested By:** ${requestedBy}
**Staff Member:** ${staffMember}
**Client / Location:** ${clientLocation}
**Reason / Special Instruction:** ${reason}
**Notes:** ${notes}
**Amount Transferred:** $${amountValue}
**NAB Reference:** Enter NAB Code

---

**Summary of Expenses**

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | MANUAL-ENTRY | VIP Manual | - | Special Instruction | VIP Manual | $${amountValue} | $${amountValue} | ${reason} |

**TOTAL AMOUNT: $${amountValue}**
`;

    const transactions: TransactionRecord[] = [{
        staffName: staffMember,
        formattedName: staffMember,
        amount: parseFloat(amountValue),
        ypName: requestedBy,
        location: clientLocation,
        expenseType: 'VIP Manual',
        receiptId: 'MANUAL-ENTRY',
        date: new Date().toLocaleDateString(),
        product: 'Special Instruction'
    }];

    return { phase1, phase2, phase3, phase4, transactions };
};
