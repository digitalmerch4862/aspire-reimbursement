import { processManualMode } from '../logic/modes/manualMode';

describe('processManualMode VIP Manual Metadata', () => {
  test('builds structured special-instruction output from required fields', () => {
    const formText = `Requested By: Julian Thompson
Staff Member: Isaac Thompson
Amount: $125.50
Client / Location: Tamworth
Reason / Special Instruction: VIP payment approved by boss
Notes: Process today`;

    const res = processManualMode({ formText, receiptText: '', historyData: [], outstandingLiquidations: [] });

    expect(res.phase4).toContain('<!-- ENTRY TYPE: VIP_MANUAL -->');
    expect(res.phase4).toContain('**Requested By:** Julian Thompson');
    expect(res.phase4).toContain('**Staff Member:** Isaac Thompson');
    expect(res.phase4).toContain('**Client / Location:** Tamworth');
    expect(res.phase4).toContain('**Reason / Special Instruction:** VIP payment approved by boss');
    expect(res.phase4).toContain('**Amount Transferred:** $125.50');
    expect(res.transactions[0].staffName).toBe('Isaac Thompson');
    expect(res.transactions[0].amount).toBe(125.5);
    expect(res.transactions[0].expenseType).toBe('VIP Manual');
  });
});
