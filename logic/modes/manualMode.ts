import { TransactionRecord, ProcessingResult, ModeOptions } from './types';

export const processManualMode = (options: ModeOptions): ProcessingResult => {
    const phase1 = `<<<PHASE_1_START>>>\n## Manual Mode Active\nManual entry mode initialized for quick logging.\n<<<PHASE_1_END>>>`;
    const phase2 = `<<<PHASE_2_START>>>\n## Data Standardization\nManual entry standardization active.\n<<<PHASE_2_END>>>`;
    const phase3 = `<<<PHASE_3_START>>>\nManual Mode: Rules validation bypassed.\n<<<PHASE_3_END>>>`;
    
    const phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed and the amount has been na-transfer na today.

**Staff Member:** [Enter Staff Name]
**Amount Transferred:** $0.00
**NAB Reference:** Enter NAB Code

---

**Summary of Expenses**

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | MANUAL-ENTRY | Manual Entry | - | Manual Item | Other | $0.00 | $0.00 | Manual entry mode |

**TOTAL AMOUNT: $0.00**
`;

    const transactions: TransactionRecord[] = [{
        staffName: 'Unknown',
        formattedName: 'Unknown',
        amount: 0,
        ypName: '',
        location: '',
        expenseType: 'Manual Entry',
        receiptId: 'MANUAL-ENTRY',
        date: new Date().toLocaleDateString(),
        product: 'Manual Item'
    }];

    return { phase1, phase2, phase3, phase4, transactions };
};
