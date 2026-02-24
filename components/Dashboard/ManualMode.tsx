import React from 'react';
import { AlertCircle, Send, RefreshCw, Edit3 } from 'lucide-react';
import { ProcessingState } from '../../types';

interface ManualModeProps {
    handleProcess: () => void;
    processingState: ProcessingState;
    errorMessage: string | null;
    results: any;
    resetAll: () => void;
}

const ManualMode: React.FC<ManualModeProps> = ({
    handleProcess,
    processingState,
    errorMessage,
    results,
    resetAll
}) => {
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
                        Manual Mode skips all rules. You can enter transaction details directly in the banking boxes.
                    </p>
                </div>

                <div className="h-48 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl bg-black/10">
                    <Edit3 size={48} className="text-slate-600 mb-4 opacity-20" />
                    <p className="text-slate-500 text-sm">Direct entry enabled</p>
                </div>

                {errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                        <p className="text-sm text-red-200">{errorMessage}</p>
                    </div>
                )}

                <button
                    onClick={handleProcess}
                    disabled={processingState === ProcessingState.PROCESSING}
                    className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)]
                        ${processingState === ProcessingState.PROCESSING
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-cyan-600 hover:bg-cyan-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                >
                    {processingState === ProcessingState.PROCESSING ? (
                        <>Initializing Manual Entry...</>
                    ) : (
                        <>
                            <Send size={18} strokeWidth={2.5} />
                            Start Manual Entry
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ManualMode;
