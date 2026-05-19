import React, { useState, useCallback } from 'react';
import { Upload, Loader2, AlertCircle, RefreshCw, FileText, CheckCircle } from 'lucide-react';
import { fileToPayload } from '../../utils/fileExtractors';
import { extractFromFile, ExtractionResult } from '../../services/openRouterClient';
import { ProcessingState } from '../../types';

interface AIInputPanelProps {
    reimbursementFormText: string;
    setReimbursementFormText: (text: string) => void;
    receiptDetailsText: string;
    setReceiptDetailsText: (text: string) => void;
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
}

type AIState = 'idle' | 'extracting' | 'ready' | 'error';

const AIInputPanel: React.FC<AIInputPanelProps> = ({
    reimbursementFormText,
    setReimbursementFormText,
    receiptDetailsText,
    setReceiptDetailsText,
    handleProcess,
    processingState,
    errorMessage,
    results,
    resetAll,
}) => {
    const [aiState, setAIState] = useState<AIState>('idle');
    const [aiError, setAIError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [lastFile, setLastFile] = useState<File | null>(null);

    const processFile = useCallback(async (file: File) => {
        setLastFile(file);
        setAIState('extracting');
        setAIError(null);
        try {
            const payload = await fileToPayload(file);
            const result: ExtractionResult = await extractFromFile(payload);
            setReimbursementFormText(result.reimbursementForm);
            setReceiptDetailsText(result.receiptDetails);
            setAIState('ready');
        } catch (err: any) {
            setAIError(err.message ?? 'Unknown error');
            setAIState('error');
        }
    }, [setReimbursementFormText, setReceiptDetailsText]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleRetry = () => {
        if (lastFile) processFile(lastFile);
    };

    const handleReset = () => {
        setAIState('idle');
        setAIError(null);
        setLastFile(null);
        resetAll();
    };

    return (
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />

            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-lg font-semibold tracking-tight text-purple-300">AI Mode</h2>
                {(aiState === 'ready' || aiState === 'error') && (
                    <button onClick={handleReset} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>

            <div className="p-6 space-y-6">
                {/* Drop zone — shown when idle or error */}
                {(aiState === 'idle' || aiState === 'error') && (
                    <>
                        <label
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={onDrop}
                            className={`flex flex-col items-center justify-center gap-4 w-full min-h-[200px] rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
                                ${isDragOver
                                    ? 'border-purple-400 bg-purple-500/10'
                                    : 'border-white/10 bg-white/[0.02] hover:border-purple-400/50 hover:bg-purple-500/5'
                                }`}
                        >
                            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls" onChange={onFileInput} />
                            <div className="flex flex-col items-center gap-3 pointer-events-none">
                                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-400/20 flex items-center justify-center">
                                    <Upload size={24} className="text-purple-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-slate-300">Drop file here or click to browse</p>
                                    <p className="text-xs text-slate-500 mt-1">PDF · JPG · PNG · DOCX · XLSX — max 10 MB</p>
                                </div>
                            </div>
                        </label>

                        {aiState === 'error' && aiError && (
                            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-red-300">{aiError}</p>
                                </div>
                                {lastFile && (
                                    <button onClick={handleRetry} className="text-xs text-red-400 hover:text-red-300 underline shrink-0">
                                        Retry
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Extracting spinner */}
                {aiState === 'extracting' && (
                    <div className="flex flex-col items-center justify-center gap-4 min-h-[200px]">
                        <Loader2 size={32} className="text-purple-400 animate-spin" />
                        <p className="text-sm text-slate-400">Extracting with AI…</p>
                        {lastFile && <p className="text-xs text-slate-600">{lastFile.name}</p>}
                    </div>
                )}

                {/* Ready state — editable panels + audit button */}
                {aiState === 'ready' && (
                    <>
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <CheckCircle size={16} />
                            <span>Extracted — review and confirm below</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Reimbursement Form</label>
                                <textarea
                                    value={reimbursementFormText}
                                    onChange={(e) => setReimbursementFormText(e.target.value)}
                                    className="w-full h-48 bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-400/40 transition-colors"
                                    placeholder="Reimbursement form data…"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Receipt Details</label>
                                <textarea
                                    value={receiptDetailsText}
                                    onChange={(e) => setReceiptDetailsText(e.target.value)}
                                    className="w-full h-48 bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-400/40 transition-colors"
                                    placeholder="Receipt details data…"
                                />
                            </div>
                        </div>

                        {errorMessage && (
                            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-red-300">{errorMessage}</p>
                            </div>
                        )}

                        {!results && (
                            <button
                                onClick={handleProcess}
                                disabled={processingState === ProcessingState.PROCESSING}
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all duration-200"
                            >
                                {processingState === ProcessingState.PROCESSING
                                    ? <><Loader2 size={18} className="animate-spin" /> Processing…</>
                                    : <><FileText size={18} /> Confirm & Start Audit</>
                                }
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default AIInputPanel;
