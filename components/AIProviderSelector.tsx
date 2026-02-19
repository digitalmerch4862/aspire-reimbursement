import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Sparkles, AlertCircle, Check, Brain } from 'lucide-react';
import type { AIProvider } from '../services/aiProviderConfig';

interface AIProviderSelectorProps {
  selectedProvider: AIProvider;
  onProviderChange: (provider: AIProvider) => void;
}

interface ProviderInfo {
  id: AIProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  status: 'available' | 'rate-limited' | 'unavailable';
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  selectedProvider,
  onProviderChange
}) => {
  const [providers, setProviders] = useState<ProviderInfo[]>([
    {
      id: 'gemini',
      name: 'Gemini Flash',
      description: 'Google - Fast & Reliable',
      icon: <Zap size={18} />,
      color: 'text-blue-400',
      status: 'available'
    },
    {
      id: 'kimi',
      name: 'Kimi K2.5',
      description: 'Moonshot - Free Tier',
      icon: <Sparkles size={18} />,
      color: 'text-purple-400',
      status: 'available'
    },
    {
      id: 'minimax',
      name: 'MiniMax',
      description: 'Alternative Provider',
      icon: <Cpu size={18} />,
      color: 'text-emerald-400',
      status: 'available'
    },
    {
      id: 'glm',
      name: 'ChatGLM',
      description: 'Zhipu AI - Fast & Free',
      icon: <Brain size={18} />,
      color: 'text-orange-400',
      status: 'available'
    }
  ]);

  useEffect(() => {
    // Check provider availability on mount
    checkProviderStatus();
  }, []);

  const checkProviderStatus = () => {
    // Check which API keys are configured
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    const minimaxKey = process.env.MINIMAX_API_KEY;
    const glmKey = process.env.GLM_API_KEY;

    setProviders(prev => prev.map(p => {
      let hasKey = false;
      switch (p.id) {
        case 'gemini':
          hasKey = !!geminiKey;
          break;
        case 'kimi':
          hasKey = !!kimiKey;
          break;
        case 'minimax':
          hasKey = !!minimaxKey;
          break;
        case 'glm':
          hasKey = !!glmKey;
          break;
      }
      return {
        ...p,
        status: hasKey ? 'available' : 'unavailable'
      };
    }));
  };

  return (
    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-2xl border border-white/5 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="text-indigo-400" size={16} />
          <span className="text-sm font-medium text-white">AI Provider</span>
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Cloud API Only
        </span>
      </div>
      
      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            onClick={() => provider.status === 'available' && onProviderChange(provider.id)}
            disabled={provider.status === 'unavailable'}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
              selectedProvider === provider.id
                ? 'bg-indigo-500/20 border-indigo-500/50'
                : provider.status === 'unavailable'
                ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`${provider.color}`}>
                {provider.icon}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{provider.name}</p>
                <p className="text-[10px] text-slate-400">{provider.description}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {provider.status === 'unavailable' && (
                <span className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertCircle size={10} />
                  No API Key
                </span>
              )}
              {selectedProvider === provider.id && (
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      
      <div className="mt-3 space-y-1">
        <p className="text-[10px] text-blue-400 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          All processing done via Cloud APIs. Ensure you have valid API keys configured.
        </p>
        <p className="text-[10px] text-slate-500">
          If selected provider is rate-limited, system automatically switches to next available provider.
        </p>
      </div>
    </div>
  );
};
