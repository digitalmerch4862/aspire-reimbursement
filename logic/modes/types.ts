export interface TransactionRecord {
    staffName: string;
    formattedName: string;
    amount: number;
    ypName: string;
    location: string;
    expenseType: string;
    receiptId: string;
    date: string;
    product: string;
}

export interface ProcessingResult {
    phase1: string;
    phase2: string;
    phase3: string;
    phase4: string;
    transactions: TransactionRecord[];
    parsedItems?: Array<{
        receiptNum: string;
        uniqueId: string;
        storeName: string;
        dateTime: string;
        product: string;
        category: string;
        itemAmount: string;
        receiptTotal: string;
        notes: string;
        amount: string;
    }>;
    formTotal?: number;
    receiptGrandTotal?: number | null;
}

export interface ModeOptions {
    formText: string;
    receiptText: string;
    historyData: any[];
    outstandingLiquidations: any[];
}

export interface ManualAuditIssue {
    level: 'warning' | 'error';
    message: string;
}
