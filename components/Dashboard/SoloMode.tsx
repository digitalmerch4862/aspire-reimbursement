import React from 'react';
import { AlertCircle, Send, RefreshCw, ClipboardPaste } from 'lucide-react';
import { ProcessingState } from '../../types';

interface FormVsReceiptTotals {
    formTotal: number | null;
    receiptTotal: number | null;
    difference: number | null;
    isFormHigherMismatch: boolean;
}

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
    formVsReceiptTotals: FormVsReceiptTotals;
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
    reimbursementFormRef,
    formVsReceiptTotals,
}) => {
    const pasteInto = async (setter: (text: string) => void) => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setter(text);
        } catch {
            // clipboard read blocked (permissions / insecure context) — user can paste manually
        }
    };
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch relative">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 h-7">
                            <h3 className="text-xs font-medium text-slate-400 whitespace-nowrap truncate">Reimbursement Form</h3>
                            <button
                                type="button"
                                onClick={() => pasteInto(setReimbursementFormText)}
                                className="flex-shrink-0 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                                title="Paste from clipboard"
                            >
                                <ClipboardPaste size={14} />
                            </button>
                        </div>
                        <textarea
                            ref={reimbursementFormRef}
                            value={reimbursementFormText}
                            onChange={(e) => setReimbursementFormText(e.target.value)}
                            placeholder="Paste Reimbursement Form here…"
                            className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono whitespace-nowrap overflow-x-auto"
                        />
                    </div>

                    {/* Divider: horizontal on mobile, vertical between columns on desktop */}
                    <div className="flex lg:hidden items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">And/Or</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="hidden lg:flex absolute inset-y-0 left-1/2 -translate-x-1/2 flex-col items-center pointer-events-none">
                        <div className="w-px flex-1 bg-white/10" />
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest py-2 bg-[#1c1e24] -mx-2 px-2">And/Or</span>
                        <div className="w-px flex-1 bg-white/10" />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 h-7">
                            <h3 className="text-xs font-medium text-slate-400 whitespace-nowrap truncate">Receipt Details</h3>
                            <button
                                type="button"
                                onClick={() => pasteInto(setReceiptDetailsText)}
                                className="flex-shrink-0 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                                title="Paste from clipboard"
                            >
                                <ClipboardPaste size={14} />
                            </button>
                        </div>
                        <textarea
                            value={receiptDetailsText}
                            onChange={(e) => setReceiptDetailsText(e.target.value)}
                            placeholder="Paste Receipt Details here…"
                            className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors font-mono whitespace-nowrap overflow-x-auto"
                        />
                    </div>
                </div>
                {/* Totals Mismatch Banner */}
                {(() => {
                    const { formTotal, receiptTotal, difference } = formVsReceiptTotals;
                    const hasBoth = formTotal !== null && receiptTotal !== null;
                    if (!hasBoth) return null;
                    const match = difference !== null && difference <= 0.01;
                    return (
                        <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 border ${
                            match
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${match ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}></div>
                                <span className="text-xs font-bold uppercase tracking-widest">
                                    {match ? 'Totals Match' : 'Totals Mismatch'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono">
                                <span>Form: <strong>${(formTotal as number).toFixed(2)}</strong></span>
                                <span>Receipts: <strong>${(receiptTotal as number).toFixed(2)}</strong></span>
                                {!match && difference !== null && (
                                    <span className="text-red-200 font-bold">Δ ${difference.toFixed(2)}</span>
                                )}
                            </div>
                        </div>
                    );
                })()}
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
