import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Sparkles, AlertCircle, Check, Brain, Shield, DollarSign, BarChart3 } from 'lucide-react';
import type { AIProvider } from '../services/aiProviderConfig';
import { DEFAULT_PROVIDER_CONFIGS, getProviderStats, ProviderTier } from '../services/aiProviderConfig';
import { ProviderDashboard } from './ProviderDashboard';

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
  tier: ProviderTier;
  remaining: number;
  limit: number;
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  selectedProvider,
  onProviderChange
}) => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [stats, setStats] = useState({
    total: 11,
    available: 0,
    openaiUsed: 0
  });

  useEffect(() => {
    checkProviderStatus();
    const interval = setInterval(checkProviderStatus, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkProviderStatus = () => {
    const providerList: ProviderInfo[] = [
      {
        id: 'gemini',
        name: 'Gemini Flash 1.5',
        description: 'Google - Primary Vision',
        icon: <Zap size={18} />,
        color: 'text-blue-500',
        status: 'unavailable',
        tier: 1,
        remaining: 0,
        limit: 15
      },
      {
        id: 'groq',
        name: 'Groq Llama 3.2',
        description: 'Ultra-fast Vision fallback',
        icon: <Zap size={18} />,
        color: 'text-yellow-400',
        status: 'unavailable',
        tier: 2,
        remaining: 0,
        limit: 20
      },
      {
        id: 'openai',
        name: 'OpenAI GPT-4o Mini',
        description: 'PAID - Backup Only',
        icon: <DollarSign size={18} />,
        color: 'text-red-400',
        status: 'unavailable',
        tier: 3,
        remaining: 100,
        limit: 100
      }
    ];

    // Update status based on API keys and rate limits
    const updatedProviders = providerList.map(p => {
      const config = DEFAULT_PROVIDER_CONFIGS[p.id];
      const stats = getProviderStats(p.id);
      const hasKey = !!config.apiKey;

      return {
        ...p,
        status: !hasKey ? 'unavailable' : stats.isRateLimited ? 'rate-limited' : 'available',
        remaining: stats.remaining,
        limit: stats.limit
      };
    });

    const available = updatedProviders.filter(p => p.status === 'available').length;

    setProviders(updatedProviders);
    setStats(prev => ({
      ...prev,
      available,
      total: updatedProviders.length
    }));
  };

  const getTierBadge = (tier: ProviderTier) => {
    switch (tier) {
      case 1:
        return <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">T1</span>;
      case 2:
        return <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">T2</span>;
      case 3:
        return <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">T3</span>;
    }
  };

  const handleForceOpenAI = () => {
    onProviderChange('openai');
    setIsDashboardOpen(false);
  };

  return (
    <>
      <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-2xl border border-white/5 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="text-indigo-400" size={16} />
            <span className="text-sm font-medium text-white">AI Provider</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              {stats.available}/{stats.total} Available
            </span>
            <button
              onClick={() => setIsDashboardOpen(true)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title="View Provider Dashboard"
            >
              <BarChart3 size={14} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => provider.status === 'available' && onProviderChange(provider.id)}
              disabled={provider.status !== 'available'}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedProvider === provider.id
                  ? 'bg-indigo-500/20 border-indigo-500/50'
                  : provider.status === 'unavailable'
                    ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                    : provider.status === 'rate-limited'
                      ? 'bg-yellow-500/10 border-yellow-500/20 opacity-70 cursor-not-allowed'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`${provider.color}`}>
                  {provider.icon}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{provider.name}</p>
                    {getTierBadge(provider.tier)}
                  </div>
                  <p className="text-[10px] text-slate-400">{provider.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {provider.status === 'unavailable' && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle size={10} />
                    No Key
                  </span>
                )}
                {provider.status === 'rate-limited' && (
                  <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                    <AlertCircle size={10} />
                    Limited
                  </span>
                )}
                {provider.status === 'available' && provider.tier !== 3 && (
                  <span className="text-[10px] text-slate-500">
                    {provider.remaining}/{provider.limit}
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
            Auto-fallback: Tier 1 → Tier 2 → OpenAI (Last Resort)
          </p>
          <p className="text-[10px] text-slate-500">
            System automatically switches providers when rate limits are hit.
          </p>
        </div>
      </div>

      <ProviderDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onForceOpenAI={handleForceOpenAI}
        isProcessing={false}
      />
    </>
  );
};
