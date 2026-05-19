import React from 'react';
import { Bot, ClipboardPaste } from 'lucide-react';

export type InputMethod = 'ai' | 'manual';

interface InputMethodToggleProps {
    current: InputMethod;
    onChange: (method: InputMethod) => void;
}

const InputMethodToggle: React.FC<InputMethodToggleProps> = ({ current, onChange }) => {
    return (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/25 border border-white/10 p-1.5 mb-4">
            <button
                type="button"
                onClick={() => onChange('ai')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    current === 'ai'
                        ? 'text-purple-100 bg-purple-500/25 border border-purple-400/40 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                        : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-white/5'
                }`}
            >
                <Bot size={16} className={current === 'ai' ? '' : 'opacity-50'} />
                AI Mode
            </button>
            <button
                type="button"
                onClick={() => onChange('manual')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    current === 'manual'
                        ? 'text-emerald-100 bg-emerald-500/25 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                        : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-white/5'
                }`}
            >
                <ClipboardPaste size={16} className={current === 'manual' ? '' : 'opacity-50'} />
                Manual
            </button>
        </div>
    );
};

export default InputMethodToggle;
