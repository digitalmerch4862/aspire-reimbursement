import { TransactionRecord, ProcessingResult, ModeOptions } from './types';
import { normalizeNameKey } from './helpers';

export const processGroupMode = (options: ModeOptions): ProcessingResult & { errorMessage?: string } => {
    const { formText, receiptText, outstandingLiquidations } = options;
    const rawText = formText + '\n' + receiptText;

    const extracted: any[] = [];

    const locationMatch = rawText.match(/(?:Client\s*\/\s*Location|Location)\s*:\s*(.+)/i);
    const commonLocation = locationMatch ? locationMatch[1].trim() : '';

    const normalizeStaffName = (value: string): string => {
        let staffName = String(value || '').replace(/\*\*/g, '').trim();
        if (staffName.includes(',')) {
            const p = staffName.split(',');
            if (p.length >= 2) staffName = `${p[1].trim()} ${p[0].trim()}`;
        }
        return staffName;
    };

    const normalizeAmount = (value: string): number => {
        const numeric = String(value || '').replace(/[^0-9.\-]/g, '');
        const parsed = Number(numeric);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const allLines = rawText.split(/\r?\n/).map((line) => line.trim());
    const headerIndex = allLines.findIndex((line) => {
        if (!line.includes('|')) return false;
        const normalized = line.replace(/^\|/, '').replace(/\|$/, '').trim();
        const cols = normalized.split('|').map((c) => c.trim());
        if (cols.length !== 3) return false;
        return /^staff\s*name$/i.test(cols[0])
            && /^(?:yp|yb)\s*name$/i.test(cols[1])
            && /^amount$/i.test(cols[2]);
    });

    if (headerIndex >= 0) {
        let startedRows = false;
        for (let i = headerIndex + 1; i < allLines.length; i += 1) {
            const line = allLines[i];
            if (!line) {
                if (startedRows) break;
                continue;
            }
            if (!line.includes('|')) {
                if (startedRows) break;
                continue;
            }
            const normalized = line.replace(/^\|/, '').replace(/\|$/, '').trim();
            if (!normalized || /^:?-{3,}/.test(normalized.replace(/\|/g, '').trim())) continue;

            const cols = normalized.split('|').map((c) => c.trim());
            if (cols.length < 3) continue;

            const staffName = normalizeStaffName(cols[0]);
            const ypName = String(cols[1] || '').trim();
            const amount = normalizeAmount(cols[2]);
            if (!staffName || amount <= 0) continue;

            startedRows = true;
            extracted.push({ staffName, amount, ypName, location: commonLocation });
        }
    }

    if (extracted.length === 0) {
        const blocks = rawText.split(/Staff\s*Member\s*:/gi);

        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const lines = block.trim().split('\n');
            const staffName = normalizeStaffName(lines[0] || '');

            const amountMatch = block.match(/Amount:\s*\$?([0-9,.]+(?:\.[0-9]{2})?)/i);
            const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

            const ypMatch = block.match(/(?:YP|YB)\s*Name:\s*(.+)/i);
            const ypName = ypMatch ? ypMatch[1].trim() : '';

            if (staffName) {
                extracted.push({ staffName, amount, ypName, location: commonLocation });
            }
        }
    }

    if (extracted.length === 0) {
        return {
            phase1: '', phase2: '', phase3: '', phase4: '',
            transactions: [],
            errorMessage: 'Group Mode could not detect any staff members. Use "Staff Member: [Name]" block format.'
        };
    }

    const delinquentStaff = extracted.find(entry => 
        outstandingLiquidations.some(ol => normalizeNameKey(ol.staffName) === normalizeNameKey(entry.staffName))
    );

    if (delinquentStaff) {
        return {
            phase1: '', phase2: '', phase3: '', phase4: '',
            transactions: [],
            errorMessage: `Blocked: ${delinquentStaff.staffName} has an outstanding liquidation. Please settle it first.`
        };
    }

    const totalAmount = extracted.reduce((sum, entry) => sum + entry.amount, 0);

    const tableHeader = [
        '| Staff Member | Client | Location | Type | Amount | NAB Reference |',
        '| :--- | :--- | :--- | :--- | :--- | :--- |'
    ].join('\n');

    const tableRows = extracted
        .map((entry) => `| ${entry.staffName} | ${entry.ypName || '-'} | ${entry.location || '-'} | Petty Cash | $${entry.amount.toFixed(2)} | Enter NAB Code |`)
        .join('\n');

    const phase1 = `<<<PHASE_1_START>>>\n## Group Mode Audit\nDetected ${extracted.length} staff member(s).\n<<<PHASE_1_END>>>`;
    const phase2 = `<<<PHASE_2_START>>>\n## Data Standardization\nGroup processing active.\n<<<PHASE_2_END>>>`;
    const phase3 = `<<<PHASE_3_START>>>\nGroup Mode: Rules validation bypassed for multi-staff entry.\n<<<PHASE_3_END>>>`;
    const phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your group reimbursement request has been prepared and processed today.

${tableHeader}
${tableRows}

**TOTAL AMOUNT: $${totalAmount.toFixed(2)}**

<!-- GROUP_TABLE_FORMAT -->
<!-- STATUS: PENDING -->`;

    const transactions: TransactionRecord[] = extracted.map(entry => ({
        staffName: entry.staffName,
        formattedName: entry.staffName,
        amount: entry.amount,
        ypName: entry.ypName,
        location: entry.location,
        expenseType: 'Petty Cash',
        receiptId: 'N/A',
        date: new Date().toLocaleDateString(),
        product: 'Group Petty Cash'
    }));

    return { phase1, phase2, phase3, phase4, transactions };
};
