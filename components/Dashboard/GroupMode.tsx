import React from 'react';
import { AlertCircle, Send, RefreshCw, Users } from 'lucide-react';
import { ProcessingState } from '../../types';

interface GroupModeProps {
    reimbursementFormText: string;
    setReimbursementFormText: (text: string) => void;
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
    reimbursementFormRef: React.RefObject<HTMLTextAreaElement>;
}

const GroupMode: React.FC<GroupModeProps> = ({
    reimbursementFormText,
    setReimbursementFormText,
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
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-amber-500/5">
                <div className="flex items-center gap-3">
                    <Users className="text-amber-300" size={20} />
                    <h2 className="text-lg font-semibold tracking-tight text-amber-300">Group Mode</h2>
                </div>
                {results && (
                    <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>
            <div className="p-6 space-y-6">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-amber-400 mt-0.5 flex-shrink-0" size={18} />
                    <p className="text-xs text-amber-200/90">
                        Group Mode skips standard rules. It will automatically detect staff members from the form and generate separate banking boxes for each.
                    </p>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-400">Reimbursement Form (Multi-Staff)</h3>
                    <textarea
                        ref={reimbursementFormRef}
                        value={reimbursementFormText}
                        onChange={(e) => setReimbursementFormText(e.target.value)}
                        placeholder={`Staff member to reimburse: Isaac Thompson\nAmount: $20\n\nStaff member to reimburse: Dylan Crane\nAmount: $19.45`}
                        className="w-full h-64 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500/50 resize-none transition-colors font-mono"
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
                    disabled={processingState === ProcessingState.PROCESSING || !reimbursementFormText.trim()}
                    className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(245,158,11,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-amber-600 hover:bg-amber-500 hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                >
                    {processingState === ProcessingState.PROCESSING ? (
                        <>Preparing Group Audit...</>
                    ) : (
                        <>
                            <Send size={18} strokeWidth={2.5} />
                            Generate Group Audit
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default GroupMode;
