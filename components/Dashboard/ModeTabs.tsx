import React from 'react';
import { User, Users, Edit3 } from 'lucide-react';

export type DashboardMode = 'solo' | 'group' | 'manual';

interface ModeTabsProps {
    currentMode: DashboardMode;
    onModeChange: (mode: DashboardMode) => void;
}

const ModeTabs: React.FC<ModeTabsProps> = ({ currentMode, onModeChange }) => {
    const tabs: { id: DashboardMode; label: string; icon: any; color: string }[] = [
        { id: 'solo', label: 'Solo Mode', icon: User, color: 'emerald' },
        { id: 'group', label: 'Group Mode', icon: Users, color: 'amber' },
        { id: 'manual', label: 'Manual Mode', icon: Edit3, color: 'cyan' },
    ];

    return (
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-black/25 border border-white/10 p-1.5 mb-6">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = currentMode === tab.id;
                
                let activeStyles = '';
                if (tab.id === 'solo') activeStyles = 'text-emerald-100 bg-emerald-500/25 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]';
                if (tab.id === 'group') activeStyles = 'text-amber-100 bg-amber-500/25 border border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.3)]';
                if (tab.id === 'manual') activeStyles = 'text-cyan-100 bg-cyan-500/25 border border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.3)]';

                return (
                    <button
                        key={tab.id}
                        onClick={() => onModeChange(tab.id)}
                        className={`relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 transition-all duration-300 ${
                            isActive
                                ? activeStyles
                                : 'text-slate-500 bg-transparent border border-transparent hover:text-slate-300 hover:bg-white/5'
                        }`}
                    >
                        <Icon size={18} className={isActive ? '' : 'opacity-50'} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
                        {isActive && (
                            <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current shadow-[0_0_10px_currentColor]`}></span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default ModeTabs;
