import { processGroupMode } from '../logic/modes/groupMode';

const sample = `Client / Location: Illawarra

Staff Member: RASITTI, DAN
Amount: $60
YP Name: Hendrix Pritzkow

Staff Member: BORELLA-WADE, CHLOE
Amount: $60
YP Name: Jason Swain

Staff Member: MICHAEL, JOSHUA
Amount: $120
YP Name: Chaze Webb & Byson Dillon

Staff Member: SA'U, TYRONE
Amount: $60
YP Name: Harley Pieren

Staff Member: MALIET, ATHIEI
Amount: $180
YP Name: Harmony Thomas-Ardler, Leah Thomas-Ardler & Ricky Thomas-Ardler

Staff Member: KABIA, PHILICIA
Amount: $120
YP Name: Cooper Morley & Junior Lenehan

Staff Member: LAM, FLORENCE
Amount: $60
YP Name: Akelia Howland

Staff Member: ROSEBOTTOM, JARROD
Amount: $120
YP Name: TJ Miller & Noah Miller

Staff Member: Mia Valvano
Amount: $60
YP Name: Nadia Perry`;

test('processGroupMode parses and returns transactions for sample input', () => {
  const res = processGroupMode({ formText: sample, receiptText: '', historyData: [], outstandingLiquidations: [] });
  expect(res.errorMessage).toBeUndefined();
  expect(res.transactions).toBeDefined();
  expect(res.transactions.length).toBe(9);
  // all expense types should be Petty Cash and amounts should sum to 840
  const total = res.transactions.reduce((s, t) => s + t.amount, 0);
  expect(total).toBeCloseTo(840);
  expect(res.phase4).toContain('| Staff Member | Client | Location | Type | Amount | NAB Reference |');
  expect(res.transactions.every(t => t.expenseType === 'Petty Cash')).toBe(true);
});
