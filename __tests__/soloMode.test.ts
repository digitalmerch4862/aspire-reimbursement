import { processSoloMode } from '../logic/modes/soloMode';
import { ModeOptions } from '../logic/modes/types';

describe('processSoloMode Lenient Validation', () => {
    const baseOptions: Omit<ModeOptions, 'formText' | 'receiptText'> = {
        historyData: [],
        outstandingLiquidations: []
    };

    const formText = `Client's full name: Dylan Crane
Address: 3A Acre Street, Oran Park
Staff member to reimburse: Isaac Thompson
Approved by: Julian Thompson

Total Amount: $39.45`;

    test('parses table without headers (Lenient Table Recognition)', () => {
        const receiptText = `1 | Hills 1% Milk 3L | 29/01/2026 | $6.00
2 | Bread Loaf 650g | 31/01/2026 | $33.45`;

        const res = processSoloMode({ ...baseOptions, formText, receiptText });

        expect(res.issues?.some(i => i.level === 'error')).toBe(false);
        expect(res.transactions.length).toBe(2);
        expect(res.transactions[0].amount).toBe(6);
        expect(res.transactions[1].amount).toBe(33.45);
    });

    test('parses sparse table with only 2 columns', () => {
        const receiptText = `Grocery Item | 20.00
Pharmacy Item | 19.45`;

        const res = processSoloMode({ ...baseOptions, formText, receiptText });

        expect(res.issues?.some(i => i.level === 'error')).toBe(false);
        expect(res.transactions.length).toBe(2);
        expect(res.transactions[0].amount).toBe(20);
        expect(res.transactions[1].amount).toBe(19.45);
    });

    test('handles fallback when only Total Amount is in results (Total Amount line)', () => {
        // In this case, items.length will be 0 in soloMode.ts, but it returns a fallback transaction
        const res = processSoloMode({ ...baseOptions, formText, receiptText: '' });

        // soloMode.ts returns an 'error' issue if items.length === 0
        // But App.tsx's handleSmartSave now filters this out if it is a fallback transaction.
        // Let's verify the transaction content.
        expect(res.transactions.length).toBe(1);
        expect(res.transactions[0].amount).toBe(39.45);
        expect(res.transactions[0].staffName).toBe('Isaac Thompson');
    });

    test('parses table with mixed pipe anywhere (Flexible Parsing)', () => {
        const receiptText = `  1  |  My Store | 20/02/2026 | Appletree  |  39.45  `;

        const res = processSoloMode({ ...baseOptions, formText, receiptText });

        expect(res.issues?.some(i => i.level === 'error')).toBe(false);
        expect(res.transactions.length).toBe(1);
        expect(res.transactions[0].amount).toBe(39.45);
        expect(res.transactions[0].product).toBe('Appletree');
    });
});
