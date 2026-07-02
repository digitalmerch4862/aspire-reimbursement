import { getReportPeriod } from '../logic/reportPeriods';

describe('getReportPeriod', () => {
    // Thu 2 Jul 2026. Month index 6 = July.
    const target = new Date(2026, 6, 2, 23, 59, 59);

    it('weekly: Monday of the target week through target date', () => {
        const p = getReportPeriod('weekly', target);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0)); // Mon 29 Jun
        expect(p.endDate).toEqual(target);
        expect(p.reportTitle).toBe('WEEKLY EXPENSE REPORT');
    });

    it('weekly: target on a Sunday goes back to previous Monday', () => {
        const sunday = new Date(2026, 6, 5, 23, 59, 59); // Sun 5 Jul 2026
        const p = getReportPeriod('weekly', sunday);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0)); // Mon 29 Jun
        expect(p.endDate).toEqual(sunday);
    });

    it('weekly: target on a Monday starts that same day', () => {
        const monday = new Date(2026, 5, 29, 23, 59, 59); // Mon 29 Jun 2026
        const p = getReportPeriod('weekly', monday);
        expect(p.startDate).toEqual(new Date(2026, 5, 29, 0, 0, 0, 0));
    });

    it('monthly: full previous calendar month', () => {
        const p = getReportPeriod('monthly', target);
        expect(p.startDate).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));       // 1 Jun
        expect(p.endDate).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));   // 30 Jun
        expect(p.reportTitle).toBe('MONTHLY EXPENSE REPORT');
    });

    it('monthly: January target covers December of previous year', () => {
        const jan = new Date(2026, 0, 15, 23, 59, 59);
        const p = getReportPeriod('monthly', jan);
        expect(p.startDate).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    });

    it('quarterly: quarter start through target date (QTD, unchanged)', () => {
        const p = getReportPeriod('quarterly', target); // Jul = Q3
        expect(p.startDate).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(target);
        expect(p.reportTitle).toBe('QUARTERLY EXPENSE REPORT (QTD)');
    });

    it('quarterly: March target covers Jan 1 through target', () => {
        const march = new Date(2026, 2, 10, 23, 59, 59);
        const p = getReportPeriod('quarterly', march);
        expect(p.startDate).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(march);
    });

    it('yearly: full previous calendar year', () => {
        const p = getReportPeriod('yearly', target);
        expect(p.startDate).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
        expect(p.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
        expect(p.reportTitle).toBe('ANNUAL EXPENSE REPORT');
    });
});
