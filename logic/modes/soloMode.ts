import { TransactionRecord, ProcessingResult, ModeOptions, ManualAuditIssue } from './types';
import { normalizeMoneyValue } from './helpers';

export const processSoloMode = (options: ModeOptions): ProcessingResult & { errorMessage?: string, issues?: ManualAuditIssue[] } => {
    const { formText, receiptText } = options;

    // Header parsing
    const clientMatch = formText.match(/^(?:Client(?:'|’)?s?\s*full\s*name|Name)\s*:\s*(.+)$/im);
    const addressMatch = formText.match(/Address:\s*(.+)/i);
    const staffMatch = formText.match(/Staff\s*member\s*to\s*reimburse:\s*(.+)/i);
    const approvedMatch = formText.match(/Approved\s*by:\s*(.+)/i);

    const clientName = clientMatch ? clientMatch[1].trim() : '';
    const address = addressMatch ? addressMatch[1].trim() : '';
    const staffMember = staffMatch ? staffMatch[1].trim() : '';
    const approvedBy = approvedMatch ? approvedMatch[1].trim() : '';

    const formTotalMatch = formText.match(/Total\s*Amount:\s*\$?([\d,]+\.?\d*)/i);
    const receiptTotalMatch = receiptText.match(/GRAND\s*TOTAL.*?\$\s*([\d,]+\.?\d*)/i);
    let totalAmount = formTotalMatch ? parseFloat(formTotalMatch[1].replace(/,/g, '')) :
        receiptTotalMatch ? parseFloat(receiptTotalMatch[1].replace(/,/g, '')) : 0;
    let receiptGrandTotal = receiptTotalMatch ? parseFloat(receiptTotalMatch[1].replace(/,/g, '')) : null;
    const allText = formText + '\n' + receiptText;
    const lines = allText.split('\n');
    const items: any[] = [];

    const parseReceiptTable = (text: string) => {
        const tableLines = text.split('\n');
        const tableItems: any[] = [];
        let inTable = false;
        let headerFound = false;
        let grandTotal: number | null = null;

        for (const line of tableLines) {
            const trimmed = line.trim();
            if (!trimmed.includes('|')) {
                if (inTable) break;
                continue;
            }

            const cols = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(col => col.trim());
            const headerCheck = cols.map(col => col.toLowerCase());

            if (!headerFound) {
                const isHeader = headerCheck[0] === 'receipt #' && headerCheck[1]?.includes('unique id') && headerCheck[2]?.includes('store name');
                if (isHeader) {
                    headerFound = true;
                    inTable = true;
                }
                continue;
            }

            if (cols.every(col => col === '' || col.startsWith(':---') || col.startsWith('---'))) {
                continue;
            }

            const firstCell = String(cols[0] || '').toLowerCase();
            if (firstCell.includes('grand total')) {
                const totalCell = [...cols].reverse().find(col => /[0-9]/.test(col));
                if (totalCell) {
                    grandTotal = parseFloat(normalizeMoneyValue(totalCell, '0.00'));
                }
                continue;
            }

            if (!cols[0]) continue;

            tableItems.push({
                receiptNum: cols[0],
                uniqueId: cols[1] || '-',
                storeName: cols[2] || '-',
                dateTime: cols[3] || '-',
                product: cols[4] || '-',
                category: cols[5] || 'Other',
                itemAmount: cols[6] || '0.00',
                receiptTotal: cols[7] || '0.00',
                notes: cols[8] || '',
                amount: cols[7] || cols[6] || '0.00'
            });
        }

        return { items: tableItems, grandTotal, hasTable: headerFound };
    };

    const tableParse = parseReceiptTable(receiptText || allText);
    if (tableParse.items.length > 0) {
        items.push(...tableParse.items);
        if (tableParse.grandTotal !== null) {
            receiptGrandTotal = tableParse.grandTotal;
        }
    } else {
        // Block-based parsing
        const blockMatches = Array.from(formText.matchAll(/Particular:\s*(.*?)(?:\n|$)/gi));
        if (blockMatches.length > 0) {
            blockMatches.forEach((match, idx) => {
                const blockStart = (match as any).index || 0;
                const blockEnd = formText.indexOf('Particular:', blockStart + 1);
                const blockText = formText.substring(blockStart, blockEnd === -1 ? formText.length : blockEnd);

                const pMatch = blockText.match(/Particular:\s*(.*?)(?:\n|$)/i);
                const dMatch = blockText.match(/Date\s*Purchased:\s*(.*?)(?:\n|$)/i);
                const aMatch = blockText.match(/Amount:\s*\$?([0-9,.]+(?:\.[0-9]{2})?)/i);
                const ocMatch = blockText.match(/On\s*Charge\s*Y\/N:\s*(.*?)(?:\n|$)/i);

                if (pMatch || aMatch) {
                    items.push({
                        receiptNum: String(idx + 1),
                        uniqueId: `particular-${idx + 1}`,
                        storeName: pMatch ? pMatch[1].trim() : 'reimbursement',
                        dateTime: dMatch ? dMatch[1].trim() : '',
                        product: pMatch ? pMatch[1].trim() : '',
                        category: 'Other',
                        itemAmount: aMatch ? aMatch[1].replace(',', '') : '0',
                        receiptTotal: aMatch ? aMatch[1].replace(',', '') : '0',
                        notes: '',
                        amount: aMatch ? aMatch[1].replace(',', '') : '0',
                        onCharge: ocMatch ? ocMatch[1].trim() : 'N'
                    });
                }
            });
        }
    }

    if (items.length === 0) {
        // Table parsing fallback
        for (const line of lines) {
            if (line.trim().includes('|') && !line.includes('---') &&
                !line.includes('Receipt #') && !line.includes('GRAND TOTAL')) {
                const trimmedLine = line.trim().replace(/^\|/, '').replace(/\|$/, '');
                const parts = trimmedLine.split('|').map(p => p.trim()).filter(p => p);
                if (parts.length >= 5) {
                    items.push({
                        receiptNum: parts[0],
                        uniqueId: parts[1],
                        storeName: parts[2],
                        dateTime: parts[3],
                        product: parts[4],
                        category: parts[5] || 'Other',
                        itemAmount: parts[6] || '0.00',
                        receiptTotal: parts[7] || '0.00',
                        notes: parts[8] || '',
                        amount: parts[7] || '0.00'
                    });
                }
            }
        }
    }

    if (!formTotalMatch && receiptGrandTotal !== null) {
        totalAmount = receiptGrandTotal;
    }

    const formTotalValue = formTotalMatch ? parseFloat(formTotalMatch[1].replace(/,/g, '')) : totalAmount;
    const receiptTotalValue = receiptGrandTotal !== null ? receiptGrandTotal : totalAmount;
    const differenceAmount = Math.abs((formTotalValue || 0) - (receiptTotalValue || 0));

    if (!formTotalMatch && !receiptTotalMatch && items.length > 0) {
        totalAmount = items.reduce((sum, item) => {
            const val = parseFloat(normalizeMoneyValue(item.receiptTotal || item.amount, '0.00'));
            return sum + (isNaN(val) ? 0 : val);
        }, 0);
    }

    // Rules Blocking / Issues
    const issues: ManualAuditIssue[] = [];
    if (!clientName) issues.push({ level: 'warning', message: "Missing 'Client Name' in Reimbursement Form." });
    if (!address) issues.push({ level: 'warning', message: "Missing 'Address' in Reimbursement Form." });
    if (!staffMember) issues.push({ level: 'warning', message: "Missing 'Staff Member' in Reimbursement Form." });

    if (items.length === 0) {
        issues.push({ level: 'error', message: 'No valid receipt rows found. Check table format.' });
    } else {
        // Amount Mismatch Rule
        if (receiptGrandTotal !== null && totalAmount > 0) {
            if (Math.abs(totalAmount - receiptGrandTotal) > 0.01) {
                issues.push({ level: 'warning', message: `Total mismatch: Form $${totalAmount.toFixed(2)} vs Receipt $${receiptGrandTotal.toFixed(2)}.` });
            }
        }
    }

    // Compose Result
    const phase1 = `<<<PHASE_1_START>>>\n## Solo Mode Audit\nProcessing individual reimbursement request.\n<<<PHASE_1_END>>>`;
    const phase2 = `<<<PHASE_2_START>>>\n## Data Standardization\nForm and receipt data synced.\n<<<PHASE_2_END>>>`;
    const phase3 = `<<<PHASE_3_START>>>\n${issues.length > 0 ? issues.map((iss, i) => `${i + 1}. [${iss.level.toUpperCase()}] ${iss.message}`).join('\n') : 'All rules passed.'}\n<<<PHASE_3_END>>>`;

    const phase4 = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

Staff Member: ${staffMember || '[Enter Staff Name]'}
Client's Full Name: ${clientName || '[Enter Client Name]'}
Address: ${address || '[Enter Address]'}
Approved By: ${approvedBy || '[Enter Approver]'}
Amount: $${totalAmount.toFixed(2)}

Reimbursement form total is ${formTotalValue.toFixed(2)}
Receipt total is ${receiptTotalValue.toFixed(2)}
Difference amount is ${differenceAmount.toFixed(2)}

NAB Code: Enter NAB Code
<!-- UID_FALLBACKS:${items.map((item, i) => item.uniqueId || item.receiptNum || String(i + 1)).join('||')} -->

Summary of Expenses:

| Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${items.map((item, i) => `| ${item.receiptNum || (i + 1)} | ${item.uniqueId || '-'} | ${item.storeName || '-'} | ${item.dateTime || '-'} | ${item.product || '-'} | ${item.category || 'Other'} | ${item.itemAmount === 'Included in total' ? 'Included in total' : `$${normalizeMoneyValue(item.itemAmount, item.amount)}`} | $${normalizeMoneyValue(item.receiptTotal, item.amount)} | ${item.notes || '-'} |`).join('\n')}

TOTAL AMOUNT: $${totalAmount.toFixed(2)}
`;

    const transactions: TransactionRecord[] = items.length > 0 ? items.map(item => ({
        staffName: staffMember || 'Unknown',
        formattedName: staffMember || 'Unknown',
        amount: parseFloat(normalizeMoneyValue(item.amount || '0', '0')),
        ypName: clientName,
        location: address,
        expenseType: 'Reimbursement',
        receiptId: item.uniqueId || 'N/A',
        date: item.dateTime || new Date().toLocaleDateString(),
        product: item.product || 'Reimbursement'
    })) : [{
        staffName: staffMember || 'Unknown',
        formattedName: staffMember || 'Unknown',
        amount: totalAmount,
        ypName: clientName,
        location: address,
        expenseType: 'Reimbursement',
        receiptId: 'N/A',
        date: new Date().toLocaleDateString(),
        product: 'Reimbursement'
    }];

    return { phase1, phase2, phase3, phase4, transactions, issues };
};
