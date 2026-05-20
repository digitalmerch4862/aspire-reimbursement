import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Loader2, AlertCircle, RefreshCw, FileText, CheckCircle, ClipboardPaste } from 'lucide-react';
import { fileToPayload } from '../../utils/fileExtractors';
import { extractTargetFromFile } from '../../services/openRouterClient';
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
type UploadTarget = 'reimbursementForm' | 'receiptDetails';

const TARGET_CONFIG: Record<UploadTarget, {
    title: string;
    description: string;
    acceptHint: string;
    placeholder: string;
}> = {
    reimbursementForm: {
        title: 'Reimbursement Form',
        description: 'Drop the reimbursement form here',
        acceptHint: 'Form PDF, screenshot, DOCX, or spreadsheet',
        placeholder: 'Reimbursement form data…',
    },
    receiptDetails: {
        title: 'Receipt Details',
        description: 'Drop the receipt file here',
        acceptHint: 'Receipt PDF, screenshot, DOCX, or spreadsheet',
        placeholder: 'Receipt details data…',
    },
};

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
    const [activeTarget, setActiveTarget] = useState<UploadTarget | null>(null);
    const [lastUploadedTarget, setLastUploadedTarget] = useState<UploadTarget | null>(null);
    const [isClipboardLoading, setIsClipboardLoading] = useState<UploadTarget | null>(null);
    const [dragTarget, setDragTarget] = useState<UploadTarget | null>(null);
    const [lastFiles, setLastFiles] = useState<Record<UploadTarget, File | null>>({
        reimbursementForm: null,
        receiptDetails: null,
    });
    const dragDepth = useRef<Record<UploadTarget, number>>({
        reimbursementForm: 0,
        receiptDetails: 0,
    });

    const processFile = useCallback(async (target: UploadTarget, file: File) => {
        setLastFiles((current) => ({ ...current, [target]: file }));
        setActiveTarget(target);
        setLastUploadedTarget(target);
        setAIState('extracting');
        setAIError(null);
        try {
            const payload = await fileToPayload(file);
            const extractedText = await extractTargetFromFile(payload, target);
            if (!extractedText.trim()) {
                throw new Error(
                    target === 'reimbursementForm'
                        ? 'No reimbursement form content was detected in that file.'
                        : 'No receipt details were detected in that file.',
                );
            }

            if (target === 'reimbursementForm') {
                setReimbursementFormText(extractedText);
            } else {
                setReceiptDetailsText(extractedText);
            }
            setAIState('ready');
        } catch (err: any) {
            setAIError(err.message ?? 'Unknown error');
            setAIState('error');
        }
    }, [setReceiptDetailsText, setReimbursementFormText]);

    const onDrop = useCallback((target: UploadTarget, e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[target] = 0;
        setDragTarget((current) => (current === target ? null : current));
        const file = e.dataTransfer.files[0];
        if (file) processFile(target, file);
    }, [processFile]);

    const onFileInput = (target: UploadTarget, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) processFile(target, file);
    };

    const handleRetry = () => {
        if (!lastUploadedTarget) return;
        const file = lastFiles[lastUploadedTarget];
        if (file) processFile(lastUploadedTarget, file);
    };

    const handlePasteFromClipboard = useCallback(async (target: UploadTarget) => {
        if (!navigator.clipboard?.read) {
            setAIError('Clipboard paste button is not supported in this browser. Use Ctrl+V instead.');
            setAIState('error');
            return;
        }

        setIsClipboardLoading(target);
        setAIError(null);
        setActiveTarget(target);

        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const clipboardItem of clipboardItems) {
                const imageType = clipboardItem.types.find((type) => type.startsWith('image/'));
                if (!imageType) continue;

                const blob = await clipboardItem.getType(imageType);
                const extension = imageType.split('/')[1] || 'png';
                const file = new File([blob], `clipboard-image.${extension}`, { type: imageType });
                await processFile(target, file);
                return;
            }

            setAIError('No image found in clipboard. Copy a screenshot first, then press Paste.');
            setAIState('error');
        } catch (err: any) {
            const message = err?.message || 'Clipboard access failed.';
            setAIError(`${message} Try Ctrl+V if the browser blocks clipboard access.`);
            setAIState('error');
        } finally {
            setIsClipboardLoading(null);
        }
    }, [processFile]);

    const handleReset = () => {
        dragDepth.current = {
            reimbursementForm: 0,
            receiptDetails: 0,
        };
        setAIState('idle');
        setAIError(null);
        setActiveTarget(null);
        setLastUploadedTarget(null);
        setDragTarget(null);
        setLastFiles({
            reimbursementForm: null,
            receiptDetails: null,
        });
        resetAll();
    };

    const getPreferredPasteTarget = useCallback((): UploadTarget => {
        if (activeTarget) return activeTarget;
        if (!reimbursementFormText.trim()) return 'reimbursementForm';
        if (!receiptDetailsText.trim()) return 'receiptDetails';
        return 'reimbursementForm';
    }, [activeTarget, receiptDetailsText, reimbursementFormText]);

    // Global paste handler — routes Ctrl+V to the most likely target box
    useEffect(() => {
        if (aiState !== 'idle' && aiState !== 'error') return;
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    const target = getPreferredPasteTarget();
                    if (file) processFile(target, file);
                    break;
                }
            }
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [aiState, getPreferredPasteTarget, processFile]);

    const renderUploadBox = (target: UploadTarget) => {
        const config = TARGET_CONFIG[target];
        const isDragging = dragTarget === target;
        const isLoadingTarget = activeTarget === target && aiState === 'extracting';
        const hasContent = target === 'reimbursementForm'
            ? reimbursementFormText.trim().length > 0
            : receiptDetailsText.trim().length > 0;

        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{config.title}</label>
                        <p className="mt-1 text-xs text-slate-600">{config.acceptHint}</p>
                    </div>
                    {hasContent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                            <CheckCircle size={12} />
                            Ready
                        </span>
                    )}
                </div>

                <label
                    onDragEnter={() => {
                        dragDepth.current[target] += 1;
                        setDragTarget(target);
                        setActiveTarget(target);
                    }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDragLeave={() => {
                        dragDepth.current[target] -= 1;
                        if (dragDepth.current[target] <= 0) {
                            dragDepth.current[target] = 0;
                            setDragTarget((current) => (current === target ? null : current));
                        }
                    }}
                    onDrop={(e) => onDrop(target, e)}
                    className={`flex min-h-[170px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-5 transition-all duration-200 cursor-pointer
                        ${isDragging
                            ? 'border-purple-400 bg-purple-500/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-purple-400/40 hover:bg-purple-500/5'
                        }`}
                >
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls"
                        onChange={(e) => onFileInput(target, e)}
                    />
                    <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10">
                            {isLoadingTarget ? (
                                <Loader2 size={24} className="animate-spin text-purple-400" />
                            ) : (
                                <Upload size={24} className="text-purple-400" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-300">
                                {isLoadingTarget ? 'Extracting with AI…' : config.description}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {isLoadingTarget ? 'Please wait while we read this file' : 'Drop file here or click to browse'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handlePasteFromClipboard(target);
                            }}
                            disabled={isClipboardLoading !== null}
                            className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-2 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isClipboardLoading === target ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <ClipboardPaste size={14} />
                            )}
                            <span>{isClipboardLoading === target ? 'Reading Clipboard…' : 'Paste Screenshot'}</span>
                        </button>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
                            <ClipboardPaste size={12} />
                            <span>or paste screenshot with Ctrl+V</span>
                        </div>
                    </div>
                </label>
            </div>
        );
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {renderUploadBox('reimbursementForm')}
                    {renderUploadBox('receiptDetails')}
                </div>

                {(reimbursementFormText.trim() || receiptDetailsText.trim()) && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle size={16} />
                        <span>Extracted — review and confirm below</span>
                    </div>
                )}

                {aiError && (
                    <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-red-300">{aiError}</p>
                        </div>
                        {lastUploadedTarget && lastFiles[lastUploadedTarget] && (
                            <button onClick={handleRetry} className="text-xs text-red-400 hover:text-red-300 underline shrink-0">
                                Retry
                            </button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label htmlFor="ai-reimb-form" className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Reimbursement Form</label>
                        <textarea
                            id="ai-reimb-form"
                            value={reimbursementFormText}
                            onChange={(e) => setReimbursementFormText(e.target.value)}
                            className="w-full h-48 bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-400/40 transition-colors"
                            placeholder={TARGET_CONFIG.reimbursementForm.placeholder}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="ai-receipt-details" className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Receipt Details</label>
                        <textarea
                            id="ai-receipt-details"
                            value={receiptDetailsText}
                            onChange={(e) => setReceiptDetailsText(e.target.value)}
                            className="w-full h-48 bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-400/40 transition-colors"
                            placeholder={TARGET_CONFIG.receiptDetails.placeholder}
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
            </div>
        </div>
    );
};

export default AIInputPanel;
