import React from 'react';
import { AlertCircle, Send, RefreshCw, ReceiptText } from 'lucide-react';
import { ProcessingState } from '../../types';

interface ReceiptModeProps {
    receiptDetailsText: string;
    setReceiptDetailsText: (text: string) => void;
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
}

const ReceiptMode: React.FC<ReceiptModeProps> = ({
    receiptDetailsText,
    setReceiptDetailsText,
    handleProcess,
    processingState,
    errorMessage,
    results,
    resetAll
}) => {
    return (
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-rose-500/5">
                <div className="flex items-center gap-3">
                    <ReceiptText className="text-rose-300" size={20} />
                    <h2 className="text-lg font-semibold tracking-tight text-rose-300">Receipt Mode</h2>
                </div>
                {results && (
                    <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>
            <div className="p-6 space-y-6">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-rose-400 mt-0.5 flex-shrink-0" size={18} />
                    <p className="text-xs text-rose-100/90">
                        Receipt Mode is for petty cash liquidation references only. These receipts are logged in Database, used for fraud history checks, and shown in EOD as Audit / Liquidation without going to NAB.
                    </p>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-400">Receipt Details</h3>
                    <textarea
                        value={receiptDetailsText}
                        onChange={(e) => setReceiptDetailsText(e.target.value)}
                        placeholder={`Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes
1 | PETTY-001 | Woolworths | 10/04/2026 09:15 | Bread | Groceries | $4.50 | $9.80 | Petty cash liquidation
1 | PETTY-001 | Woolworths | 10/04/2026 09:15 | Milk | Groceries | $5.30 | $9.80 | Same receipt

GRAND TOTAL: $9.80`}
                        className="w-full h-64 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-rose-500/50 resize-none transition-colors font-mono"
                    />
                </div>

                {errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                        <p className="text-sm text-red-200">{errorMessage}</p>
                    </div>
                )}

                <button
                    onClick={handleProcess}
                    disabled={processingState === ProcessingState.PROCESSING || !receiptDetailsText.trim()}
                    className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(244,63,94,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-500 hover:shadow-[0_0_30px_rgba(244,63,94,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                >
                    {processingState === ProcessingState.PROCESSING ? (
                        <>Checking Receipt History...</>
                    ) : (
                        <>
                            <Send size={18} strokeWidth={2.5} />
                            Start Receipt Audit
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ReceiptMode;
