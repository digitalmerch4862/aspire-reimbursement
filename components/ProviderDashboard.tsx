import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cpu, 
  Zap, 
  Sparkles, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  BarChart3,
  RefreshCw,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Timer,
  X
} from 'lucide-react';
import { aiService } from '../services/multiProviderAIService';
import { 
  AIProvider, 
  DEFAULT_PROVIDER_CONFIGS, 
  getProviderStats, 
  getTierStats, 
  formatWaitTime,
  ProviderTier,
  TIER_PRIORITY
} from '../services/aiProviderConfig';

interface ProviderInfo {
  id: AIProvider;
  name: string;
  used: number;
  limit: number;
  remaining: number;
  isRateLimited: boolean;
  waitTimeSeconds: number;
  supportsImages: boolean;
}

interface DashboardStats {
  totalRequests: number;
  openaiUsed: number;
  estimatedCost: number;
  availableCount: number;
  totalCount: number;
  nextResetSeconds: number;
}

interface ProviderDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onForceOpenAI: () => void;
  isProcessing: boolean;
}

export const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  isOpen,
  onClose,
  onForceOpenAI,
  isProcessing
}) => {
  const [providers, setProviders] = useState<Record<ProviderTier, ProviderInfo[]>>({
    1: [],
    2: [],
    3: []
  });
  const [stats, setStats] = useState<DashboardStats>({
    totalRequests: 0,
    openaiUsed: 0,
    estimatedCost: 0,
    availableCount: 0,
    totalCount: 11,
    nextResetSeconds: 0
  });
  const [currentTime, setCurrentTime] = useState(Date.now());

  const updateStats = useCallback(() => {
    // Get usage stats from service
    const usageStats = aiService.getUsageStats();
    
    // Get provider stats for each tier
    const tier1Providers: ProviderInfo[] = [];
    const tier2Providers: ProviderInfo[] = [];
    const tier3Providers: ProviderInfo[] = [];
    
    let availableCount = 0;
    let shortestWait = Infinity;
    
    (Object.keys(DEFAULT_PROVIDER_CONFIGS) as AIProvider[]).forEach(provider => {
      const config = DEFAULT_PROVIDER_CONFIGS[provider];
      const stats = getProviderStats(provider);
      
      const info: ProviderInfo = {
        id: provider,
        name: config.name,
        used: stats.used,
        limit: stats.limit,
        remaining: stats.remaining,
        isRateLimited: stats.isRateLimited,
        waitTimeSeconds: stats.waitTimeSeconds,
        supportsImages: config.supportsImages
      };
      
      if (config.tier === 1) tier1Providers.push(info);
      else if (config.tier === 2) tier2Providers.push(info);
      else tier3Providers.push(info);
      
      if (!stats.isRateLimited) availableCount++;
      if (stats.isRateLimited && stats.waitTimeSeconds < shortestWait) {
        shortestWait = stats.waitTimeSeconds;
      }
    });
    
    setProviders({
      1: tier1Providers,
      2: tier2Providers,
      3: tier3Providers
    });
    
    setStats({
      totalRequests: usageStats.totalRequests,
      openaiUsed: usageStats.openaiUsed,
      estimatedCost: usageStats.estimatedCost,
      availableCount,
      totalCount: 11,
      nextResetSeconds: shortestWait === Infinity ? 0 : shortestWait
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    
    // Update immediately
    updateStats();
    
    // Update every second for live countdown
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      updateStats();
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isOpen, updateStats]);

  const handleResetStats = () => {
    aiService.resetUsageStats();
    updateStats();
  };

  const getStatusColor = (provider: ProviderInfo) => {
    if (provider.isRateLimited) return 'text-red-400';
    if (provider.remaining <= 3) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getStatusIcon = (provider: ProviderInfo) => {
    if (provider.isRateLimited) return <AlertCircle size={14} className="text-red-400" />;
    if (provider.remaining <= 3) return <AlertTriangle size={14} className="text-yellow-400" />;
    return <CheckCircle2 size={14} className="text-green-400" />;
  };

  const renderProviderRow = (provider: ProviderInfo) => (
    <div 
      key={provider.id}
      className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-2">
        {getStatusIcon(provider)}
        <span className="text-sm text-white font-medium">{provider.name}</span>
        {provider.supportsImages && (
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            Vision
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {provider.isRateLimited ? (
          <div className="flex items-center gap-1.5 text-red-400">
            <Timer size={12} />
            <span className="text-xs font-mono">
              {formatWaitTime(provider.waitTimeSeconds)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  provider.remaining <= 3 ? 'bg-yellow-400' : 'bg-green-400'
                }`}
                style={{ width: `${(provider.remaining / provider.limit) * 100}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${getStatusColor(provider)}`}>
              {provider.remaining}/{provider.limit}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const renderTier = (tier: ProviderTier, title: string, description: string, color: string) => {
    const tierStats = getTierStats(tier);
    const tierProviders = providers[tier];
    
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-sm font-semibold text-white">{title}</span>
            <span className="text-xs text-slate-400">({description})</span>
          </div>
          <span className="text-xs text-slate-400">
            {tierStats.available}/{tierStats.total} available
          </span>
        </div>
        <div className="space-y-1">
          {tierProviders.map(renderProviderRow)}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1c1e24] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Cpu className="text-indigo-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Provider Dashboard</h2>
              <p className="text-xs text-slate-400">
                {stats.availableCount} of {stats.totalCount} providers available
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b border-white/10 bg-white/5">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
              <BarChart3 size={14} />
              <span className="text-xs">Requests</span>
            </div>
            <p className="text-xl font-bold text-white">{stats.totalRequests}</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
              <Zap size={14} />
              <span className="text-xs">Available</span>
            </div>
            <p className="text-xl font-bold text-green-400">{stats.availableCount}</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
              <Shield size={14} />
              <span className="text-xs">OpenAI Used</span>
            </div>
            <p className={`text-xl font-bold ${stats.openaiUsed > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {stats.openaiUsed}
            </p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
              <DollarSign size={14} />
              <span className="text-xs">Est. Cost</span>
            </div>
            <p className={`text-xl font-bold ${stats.estimatedCost > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              ${stats.estimatedCost.toFixed(3)}
            </p>
          </div>
        </div>

        {/* Provider Lists */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderTier(1, 'TIER 1', 'Free High-Capacity', 'bg-green-400')}
          {renderTier(2, 'TIER 2', 'Free Limited', 'bg-yellow-400')}
          {renderTier(3, 'TIER 3', 'Paid - Last Resort', 'bg-red-400')}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/5 space-y-3">
          {stats.availableCount === 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <Clock size={16} className="text-red-400" />
              <span className="text-sm text-red-400">
                All providers rate-limited. Auto-retry in {formatWaitTime(stats.nextResetSeconds)}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <button
              onClick={handleResetStats}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw size={12} />
              Reset Session Stats
            </button>
            
            <div className="flex items-center gap-2">
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-indigo-400">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              )}
              
              <button
                onClick={onForceOpenAI}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <DollarSign size={14} />
                Force OpenAI
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
