export type ReportPeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface ReportPeriod {
    startDate: Date;
    endDate: Date;
    reportTitle: string;
}

// Weekly  = Monday of the target week through the target date.
// Monthly = the full previous calendar month.
// Quarterly = quarter start through the target date (QTD).
// Yearly  = the full previous calendar year.
export function getReportPeriod(type: ReportPeriodType, targetDate: Date): ReportPeriod {
    switch (type) {
        case 'weekly': {
            const dayOfWeek = targetDate.getDay(); // 0=Sun..6=Sat
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const startDate = new Date(targetDate);
            startDate.setDate(targetDate.getDate() - diffToMonday);
            startDate.setHours(0, 0, 0, 0);
            return { startDate, endDate: new Date(targetDate), reportTitle: 'WEEKLY EXPENSE REPORT' };
        }
        case 'monthly': {
            const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
            const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0, 23, 59, 59, 999);
            return { startDate, endDate, reportTitle: 'MONTHLY EXPENSE REPORT' };
        }
        case 'quarterly': {
            const quarterMonth = Math.floor(targetDate.getMonth() / 3) * 3;
            const startDate = new Date(targetDate.getFullYear(), quarterMonth, 1);
            return { startDate, endDate: new Date(targetDate), reportTitle: 'QUARTERLY EXPENSE REPORT (QTD)' };
        }
        case 'yearly': {
            const startDate = new Date(targetDate.getFullYear() - 1, 0, 1);
            const endDate = new Date(targetDate.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            return { startDate, endDate, reportTitle: 'ANNUAL EXPENSE REPORT' };
        }
    }
}
