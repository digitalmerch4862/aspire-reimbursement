import React from 'react';
import { AlertCircle, Send, RefreshCw } from 'lucide-react';
import { ProcessingState } from '../../types';

interface SoloModeProps {
    reimbursementFormText: string;
    setReimbursementFormText: (text: string) => void;
    receiptDetailsText: string;
    setReceiptDetailsText: (text: string) => void;
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
    reimbursementFormRef: React.RefObject<HTMLTextAreaElement>;
}

const SoloMode: React.FC<SoloModeProps> = ({
    reimbursementFormText,
    setReimbursementFormText,
    receiptDetailsText,
    setReceiptDetailsText,
    handleProcess,
    processingState,
    errorMessage,
    results,
    resetAll,
    reimbursementFormRef
}) => {
    return (
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-lg font-semibold tracking-tight text-emerald-300">Solo Mode</h2>
                {results && (
                    <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>
            <div className="p-6 space-y-6">
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-400">Reimbursement Form</h3>
                    <textarea
                        ref={reimbursementFormRef}
                        value={reimbursementFormText}
                        onChange={(e) => setReimbursementFormText(e.target.value)}
                        placeholder={`Client's full name: Dylan Crane\nAddress: 3A Acre Street, Oran Park\nStaff member to reimburse: Isaac Thompson\nApproved by: Isaac Thompson\n\nParticular | Date Purchased | Amount | On Charge Y/N\nPocket Money | 15.2.25 | $20 | N\nTakeout | 12.2.26 | $19.45 | N\n\nTotal Amount: $39.45`}
                        className="w-full h-48 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono"
                    />
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center">
                        <span className="bg-[#1c1e24] px-2 text-xs text-slate-500 uppercase tracking-widest">And/Or</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-400">Receipt Details</h3>
                    <textarea
                        value={receiptDetailsText}
                        onChange={(e) => setReceiptDetailsText(e.target.value)}
                        placeholder={`Receipt # | Unique ID / Fallback | Store Name | Date & Time | Product (Per Item) | Category | Item Amount | Receipt Total | Notes\n1 | Hills 1% Milk 3L + Bread Loaf 650g + $6.00 + 29/01/2026 16:52 | Priceline Pharmacy | 29/01/2026 16:52 | Hills 1% Milk 3L | Groceries | Included in total | $6.00 | Walang visible OR number\n1 | Hills 1% Milk 3L + Bread Loaf 650g + $6.00 + 29/01/2026 16:52 | Priceline Pharmacy | 29/01/2026 16:52 | Bread Loaf 650g | Groceries | Included in total | $6.00 | Same receipt as above\n2 | 126302897245 | (Handwritten - not clear) | 31/01/2026 | Cool & Creamy - Lolly | Takeaway | $90.00 | $90.00 | Matches Incentive entry\n\nGRAND TOTAL: $39.45`}
                        className="w-full h-48 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono"
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
                    disabled={processingState === ProcessingState.PROCESSING || (!reimbursementFormText.trim() && !receiptDetailsText.trim())}
                    className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                >
                    {processingState === ProcessingState.PROCESSING ? (
                        <>Processing...</>
                    ) : (
                        <>
                            <Send size={18} strokeWidth={2.5} />
                            Start Audit
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SoloMode;
