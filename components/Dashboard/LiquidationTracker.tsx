import React from 'react';
import { AlertCircle, CheckCircle2, User, DollarSign, Calendar } from 'lucide-react';

interface OutstandingLiquidation {
    id: string;
    staffName: string;
    amount: string;
    date: string;
}

interface LiquidationTrackerProps {
    items: OutstandingLiquidation[];
    onSettle: (id: string) => void;
    isSettling: string | null;
}

const LiquidationTracker: React.FC<LiquidationTrackerProps> = ({ items, onSettle, isSettling }) => {
    if (items.length === 0) {
        return (
            <div className="bg-emerald-500/5 backdrop-blur-md rounded-[32px] border border-emerald-500/20 p-8 text-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="text-emerald-400" size={32} />
                </div>
                <h3 className="text-white font-bold text-lg mb-1">All Clear</h3>
                <p className="text-slate-400 text-sm">No outstanding liquidations found.</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-white/5 bg-amber-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <AlertCircle className="text-amber-400" size={20} />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">Outstanding Liquidations</h3>
                </div>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                    {items.length} Pending
                </span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {items.map((item) => (
                    <div key={item.id} className="bg-black/20 border border-white/5 rounded-2xl p-4 hover:border-amber-500/30 transition-all group">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                        <User size={14} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white uppercase truncate max-w-[150px]">{item.staffName}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                            <Calendar size={10} />
                                            <span>Issued: {item.date}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-2 py-1.5 w-fit">
                                    <DollarSign size={12} className="text-emerald-400" />
                                    <span className="text-xs font-bold text-emerald-300">{item.amount}</span>
                                </div>
                            </div>
                            
                            <button
                                onClick={() => onSettle(item.id)}
                                disabled={isSettling === item.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all
                                    ${isSettling === item.id 
                                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                                        : 'bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20'
                                    }`}
                            >
                                {isSettling === item.id ? 'Settling...' : 'Settle'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="p-4 bg-amber-500/5 border-t border-white/5">
                <p className="text-[10px] text-amber-200/60 leading-relaxed italic text-center px-4">
                    Staff members listed above are blocked from new requests until liquidation is settled.
                </p>
            </div>
        </div>
    );
};

export default LiquidationTracker;
