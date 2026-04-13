import React from 'react';
import { AlertCircle, Send, RefreshCw, Edit3 } from 'lucide-react';
import { ProcessingState } from '../../types';

interface ManualModeProps {
    reimbursementFormText: string;
    setReimbursementFormText: (text: string) => void;
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
}

const FIELD_PATTERNS = {
    requestedBy: /Requested\s*By:\s*(.+)/i,
    staffMember: /Staff\s*Member:\s*(.+)/i,
    amount: /Amount:\s*\$?(.+)/i,
    clientLocation: /Client\s*\/\s*Location:\s*(.+)/i,
    reason: /Reason\s*\/\s*Special\s*Instruction:\s*([\s\S]*?)(?:\nNotes:|\n*$)/i,
    notes: /Notes:\s*([\s\S]*)/i
};

const parseManualForm = (text: string) => ({
    requestedBy: text.match(FIELD_PATTERNS.requestedBy)?.[1]?.trim() || '',
    staffMember: text.match(FIELD_PATTERNS.staffMember)?.[1]?.trim() || '',
    amount: text.match(FIELD_PATTERNS.amount)?.[1]?.trim() || '',
    clientLocation: text.match(FIELD_PATTERNS.clientLocation)?.[1]?.trim() || '',
    reason: text.match(FIELD_PATTERNS.reason)?.[1]?.trim() || '',
    notes: text.match(FIELD_PATTERNS.notes)?.[1]?.trim() || ''
});

const buildManualFormText = (fields: ReturnType<typeof parseManualForm>) => {
    return [
        `Requested By: ${fields.requestedBy}`,
        `Staff Member: ${fields.staffMember}`,
        `Amount: ${fields.amount}`,
        `Client / Location: ${fields.clientLocation}`,
        `Reason / Special Instruction: ${fields.reason}`,
        `Notes: ${fields.notes}`
    ].join('\n');
};

const ManualMode: React.FC<ManualModeProps> = ({
    reimbursementFormText,
    setReimbursementFormText,
    handleProcess,
    processingState,
    errorMessage,
    results,
    resetAll
}) => {
    const fields = parseManualForm(reimbursementFormText);

    const updateField = (key: keyof typeof fields, value: string) => {
        setReimbursementFormText(buildManualFormText({
            ...fields,
            [key]: value
        }));
    };

    return (
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-cyan-500/5">
                <div className="flex items-center gap-3">
                    <Edit3 className="text-cyan-300" size={20} />
                    <h2 className="text-lg font-semibold tracking-tight text-cyan-300">Manual Mode</h2>
                </div>
                {results && (
                    <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>
            <div className="p-6 space-y-6">
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="text-cyan-400 mt-0.5 flex-shrink-0" size={18} />
                    <p className="text-xs text-cyan-100/90">
                        Manual Mode is for VIP or boss special instructions that do not follow the usual process. Required details are still captured so the payment path stays visible in Database, NAB, and EOD.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Requested By</label>
                        <input
                            type="text"
                            value={fields.requestedBy}
                            onChange={(e) => updateField('requestedBy', e.target.value)}
                            placeholder="Boss / approver name"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Staff Member</label>
                        <input
                            type="text"
                            value={fields.staffMember}
                            onChange={(e) => updateField('staffMember', e.target.value)}
                            placeholder="Who will receive the money"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</label>
                        <input
                            type="text"
                            value={fields.amount}
                            onChange={(e) => updateField('amount', e.target.value)}
                            placeholder="$0.00"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Client / Location</label>
                        <input
                            type="text"
                            value={fields.clientLocation}
                            onChange={(e) => updateField('clientLocation', e.target.value)}
                            placeholder="Optional reference"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reason / Special Instruction</label>
                    <textarea
                        value={fields.reason}
                        onChange={(e) => updateField('reason', e.target.value)}
                        placeholder="Why this VIP/manual payment is being processed outside the normal workflow"
                        className="w-full h-28 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 resize-none transition-colors"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</label>
                    <textarea
                        value={fields.notes}
                        onChange={(e) => updateField('notes', e.target.value)}
                        placeholder="Optional monitoring notes"
                        className="w-full h-24 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 resize-none transition-colors"
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
                    disabled={processingState === ProcessingState.PROCESSING || !fields.requestedBy.trim() || !fields.staffMember.trim() || !fields.amount.trim() || !fields.reason.trim()}
                    className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-cyan-600 hover:bg-cyan-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                >
                    {processingState === ProcessingState.PROCESSING ? (
                        <>Preparing Special Instruction...</>
                    ) : (
                        <>
                            <Send size={18} strokeWidth={2.5} />
                            Start Manual Audit
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ManualMode;
