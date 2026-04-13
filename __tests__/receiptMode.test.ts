import { processReceiptMode } from '../logic/modes/receiptMode';

describe('processReceiptMode liquidation reference output', () => {
  test('builds receipt-only liquidation summary for petty cash history', () => {
    const receiptText = `Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes
1 | PETTY-001 | Woolworths | 10/04/2026 09:15 | Bread | Groceries | $4.50 | $9.80 | Petty cash liquidation
1 | PETTY-001 | Woolworths | 10/04/2026 09:15 | Milk | Groceries | $5.30 | $9.80 | Same receipt

GRAND TOTAL: $9.80`;

    const res = processReceiptMode({ formText: '', receiptText, historyData: [], outstandingLiquidations: [] });

    expect(res.phase4).toContain('<!-- ENTRY TYPE: RECEIPT_LIQUIDATION -->');
    expect(res.phase4).toContain('Activity: Audit');
    expect(res.phase4).toContain('Description: Liquidation');
    expect(res.phase4).toContain('Staff Member: Petty Cash');
    expect(res.phase4).toContain('Client / Location: Petty Cash Liquidation');
    expect(res.phase4).toContain('TOTAL AMOUNT: $9.80');
    expect(res.transactions[0].expenseType).toBe('Liquidation');
    expect(res.transactions[0].staffName).toBe('Petty Cash');
  });
});
