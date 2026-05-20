import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Loader2, AlertCircle, RefreshCw, FileText, CheckCircle, ClipboardPaste, Plus, X } from 'lucide-react';
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
type AttachmentRole = 'reimbursementForm' | 'receiptDetails';

interface QueuedAttachment {
    id: string;
    file: File;
}

const MAX_RECEIPT_PREVIEW = 3;

const getAttachmentRole = (index: number): AttachmentRole => (index === 0 ? 'reimbursementForm' : 'receiptDetails');

const getRoleLabel = (index: number): string => (index === 0 ? 'Reimbursement Form' : 'Receipt');

const getAttachmentSubtitle = (file: File, index: number): string => {
    const role = getRoleLabel(index);
    const typeLabel = file.type.startsWith('image/')
        ? 'Image'
        : file.type.includes('pdf')
            ? 'PDF'
            : file.type.includes('word')
                ? 'Document'
                : file.type.includes('sheet') || file.type.includes('excel')
                    ? 'Spreadsheet'
                    : 'File';
    return `${role} · ${typeLabel}`;
};

const mergeReceiptOutputs = (values: string[]): string => {
    const cleaned = values.map((value) => value.trim()).filter(Boolean);
    if (cleaned.length === 0) return '';
    return cleaned.join('\n\n');
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
    const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isClipboardLoading, setIsClipboardLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState<string | null>(null);
    const dragDepth = useRef(0);

    const buildQueuedAttachments = useCallback((files: File[]) => {
        const startIndex = attachments.length;
        return files.map((file, offset) => ({
            id: `${Date.now()}-${startIndex + offset}-${file.name}`,
            file,
        }));
    }, [attachments.length]);

    const appendFiles = useCallback((files: File[]) => {
        if (files.length === 0) return;
        setAttachments((current) => ([
            ...current,
            ...files.map((file, offset) => ({
                id: `${Date.now()}-${current.length + offset}-${file.name}`,
                file,
            })),
        ]));
        setAIError(null);
        setAIState((current) => (current === 'ready' ? current : 'idle'));
    }, []);

    const scanQueuedFiles = useCallback(async (queuedFiles: QueuedAttachment[]) => {
        if (queuedFiles.length === 0) {
            setAIError('Attach at least one file before scanning.');
            setAIState('error');
            return;
        }

        setIsScanning(true);
        setAIState('extracting');
        setAIError(null);
        setScanProgress('Preparing files…');

        try {
            const [formAttachment, ...receiptAttachments] = queuedFiles;
            let extractedForm = '';
            let extractedReceipts: string[] = [];

            if (formAttachment) {
                setScanProgress(`Scanning reimbursement form: ${formAttachment.file.name}`);
                const formPayload = await fileToPayload(formAttachment.file);
                extractedForm = await extractTargetFromFile(formPayload, 'reimbursementForm');
                if (!extractedForm.trim()) {
                    throw new Error('No reimbursement form content was detected in the first attachment.');
                }
            }

            for (let index = 0; index < receiptAttachments.length; index += 1) {
                const attachment = receiptAttachments[index];
                setScanProgress(`Scanning receipt ${index + 1} of ${receiptAttachments.length}: ${attachment.file.name}`);
                const receiptPayload = await fileToPayload(attachment.file);
                const receiptText = await extractTargetFromFile(receiptPayload, 'receiptDetails');
                if (receiptText.trim()) {
                    extractedReceipts.push(receiptText.trim());
                }
            }

            if (receiptAttachments.length > 0 && extractedReceipts.length === 0) {
                throw new Error('No receipt details were detected in the attached receipt files.');
            }

            setReimbursementFormText(extractedForm);
            setReceiptDetailsText(mergeReceiptOutputs(extractedReceipts));
            setAIState('ready');
            setScanProgress(null);
        } catch (err: any) {
            setAIError(err.message ?? 'Unknown error');
            setAIState('error');
            setScanProgress(null);
        } finally {
            setIsScanning(false);
        }
    }, [setReceiptDetailsText, setReimbursementFormText]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current = 0;
        setIsDragOver(false);
        appendFiles(Array.from(e.dataTransfer.files || []));
    }, [appendFiles]);

    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        appendFiles(files);
    };

    const handleRetry = () => {
        void scanQueuedFiles(attachments);
    };

    const handlePasteFromClipboard = useCallback(async () => {
        if (!navigator.clipboard?.read) {
            setAIError('Clipboard paste is not supported in this browser. Use Ctrl+V instead.');
            setAIState('error');
            return;
        }

        setIsClipboardLoading(true);
        setAIError(null);

        try {
            const clipboardItems = await navigator.clipboard.read();
            const pastedFiles: File[] = [];

            for (const clipboardItem of clipboardItems) {
                const imageType = clipboardItem.types.find((type) => type.startsWith('image/'));
                if (!imageType) continue;

                const blob = await clipboardItem.getType(imageType);
                const extension = imageType.split('/')[1] || 'png';
                pastedFiles.push(new File([blob], `clipboard-image-${Date.now()}.${extension}`, { type: imageType }));
            }

            if (pastedFiles.length === 0) {
                setAIError('No image found in clipboard. Copy a screenshot first, then press Paste.');
                setAIState('error');
                return;
            }

            appendFiles(pastedFiles);
        } catch (err: any) {
            const message = err?.message || 'Clipboard access failed.';
            setAIError(`${message} Try Ctrl+V if the browser blocks clipboard access.`);
            setAIState('error');
        } finally {
            setIsClipboardLoading(false);
        }
    }, [appendFiles]);

    const handleReset = () => {
        dragDepth.current = 0;
        setAIState('idle');
        setAIError(null);
        setIsDragOver(false);
        setAttachments([]);
        setScanProgress(null);
        resetAll();
    };

    const removeAttachment = (id: string) => {
        setAttachments((current) => current.filter((attachment) => attachment.id !== id));
        setAIError(null);
    };

    useEffect(() => {
        if (isScanning) return;
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (const item of Array.from(items)) {
                if (!item.type.startsWith('image/')) continue;
                const file = item.getAsFile();
                if (file) files.push(file);
            }
            if (files.length > 0) {
                appendFiles(files);
            }
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [appendFiles, isScanning]);

    const receiptCount = Math.max(0, attachments.length - 1);

    return (
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />

            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-lg font-semibold tracking-tight text-purple-300">AI Mode</h2>
                {(attachments.length > 0 || aiState === 'ready' || aiState === 'error') && (
                    <button onClick={handleReset} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                    </button>
                )}
            </div>

            <div className="p-6 space-y-6">
                <div
                    onDragEnter={() => { dragDepth.current += 1; setIsDragOver(true); }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDragLeave={() => {
                        dragDepth.current -= 1;
                        if (dragDepth.current <= 0) {
                            dragDepth.current = 0;
                            setIsDragOver(false);
                        }
                    }}
                    onDrop={onDrop}
                    className={`rounded-[28px] border transition-all duration-200 ${
                        isDragOver ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.02]'
                    }`}
                >
                    <div className="flex flex-wrap items-start gap-3 p-4">
                        {attachments.map((attachment, index) => {
                            const isForm = index === 0;
                            const receiptPreviewIndex = Math.max(0, index - 1);
                            const showReceiptDetails = isForm || receiptPreviewIndex < MAX_RECEIPT_PREVIEW;

                            return (
                                <div
                                    key={attachment.id}
                                    className={`relative overflow-hidden rounded-2xl border ${
                                        isForm
                                            ? 'min-w-[240px] max-w-[280px] border-slate-300/20 bg-white/95 text-slate-900'
                                            : 'h-[72px] w-[72px] border-white/10 bg-white/10'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(attachment.id)}
                                        className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white hover:bg-black"
                                        title="Remove file"
                                    >
                                        <X size={12} />
                                    </button>

                                    {isForm ? (
                                        <div className="flex items-center gap-3 p-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white">
                                                <FileText size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                                                    Reimbursement Form
                                                </p>
                                                <p className="truncate text-base font-semibold text-slate-900">
                                                    {attachment.file.name}
                                                </p>
                                                <p className="truncate text-sm text-slate-500">
                                                    {getAttachmentSubtitle(attachment.file, index)}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full w-full">
                                            {attachment.file.type.startsWith('image/') ? (
                                                <img
                                                    src={URL.createObjectURL(attachment.file)}
                                                    alt={attachment.file.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center bg-white/5">
                                                    <FileText size={22} className="text-slate-300" />
                                                </div>
                                            )}
                                            {showReceiptDetails && (
                                                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                                    R{receiptPreviewIndex + 1}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <label className="flex min-h-[72px] min-w-[72px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-slate-400 transition-colors hover:border-purple-400/40 hover:text-slate-200">
                            <input
                                type="file"
                                className="hidden"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls"
                                onChange={onFileInput}
                            />
                            <Plus size={18} />
                            <span className="mt-2 text-xs font-medium">Add Files</span>
                        </label>
                    </div>

                    <div className="border-t border-white/5 px-4 py-4">
                        <p className="text-2xl text-slate-300">Attach files first</p>
                        <p className="mt-1 text-sm text-slate-500">
                            The first attachment is treated as the reimbursement form. All remaining attachments are scanned as receipts in one run.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => void handlePasteFromClipboard()}
                                disabled={isClipboardLoading || isScanning}
                                className="inline-flex items-center gap-2 rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-2 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isClipboardLoading ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
                                <span>{isClipboardLoading ? 'Reading Clipboard…' : 'Paste Screenshot'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => void scanQueuedFiles(attachments)}
                                disabled={attachments.length === 0 || isScanning}
                                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                <span>{isScanning ? 'Scanning…' : 'Scan Attachments'}</span>
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                Form: {attachments.length > 0 ? '1 attached' : 'waiting'}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                Receipts: {receiptCount}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                Supported: PDF, JPG, PNG, DOCX, XLSX
                            </span>
                        </div>
                    </div>
                </div>

                {scanProgress && (
                    <div className="flex items-center gap-2 rounded-2xl border border-purple-400/20 bg-purple-500/10 px-4 py-3 text-sm text-purple-200">
                        <Loader2 size={15} className="animate-spin" />
                        <span>{scanProgress}</span>
                    </div>
                )}

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
                        {attachments.length > 0 && (
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
                            placeholder="Reimbursement form data…"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="ai-receipt-details" className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Receipt Details</label>
                        <textarea
                            id="ai-receipt-details"
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
            </div>
        </div>
    );
};

export default AIInputPanel;
