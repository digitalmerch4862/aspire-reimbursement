export type AIProvider = 'gemini' | 'minimax' | 'kimi';

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderStatus {
  provider: AIProvider;
  isActive: boolean;
  lastError?: string;
  requestCount: number;
}

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'],
  minimax: ['MiniMax-Text-01', 'abab6.5s-chat'],
  kimi: ['kimi-k2.5-free', 'moonshot-v1-8k', 'moonshot-v1-32k']
};

// Default configurations - these will be overridden by environment variables
export const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  gemini: {
    name: 'Google Gemini',
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: 'gemini-3-flash-preview',
    temperature: 0.1
  },
  minimax: {
    name: 'MiniMax',
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: 'https://api.minimaxi.chat/v1/text/chatcompletion_v2',
    model: 'MiniMax-Text-01',
    maxTokens: 8192,
    temperature: 0.1
  },
  kimi: {
    name: 'Moonshot Kimi',
    apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || '',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'kimi-k2.5-free',
    maxTokens: 8192,
    temperature: 0.1
  }
};

// Priority order for fallback
export const PROVIDER_PRIORITY: AIProvider[] = ['gemini', 'kimi', 'minimax'];

// Rate limit tracking
export const rateLimitTracker = {
  gemini: { count: 0, resetTime: Date.now() },
  minimax: { count: 0, resetTime: Date.now() },
  kimi: { count: 0, resetTime: Date.now() }
};

export function isRateLimited(provider: AIProvider): boolean {
  const tracker = rateLimitTracker[provider];
  const oneMinute = 60 * 1000;
  
  // Reset count after 1 minute
  if (Date.now() - tracker.resetTime > oneMinute) {
    tracker.count = 0;
    tracker.resetTime = Date.now();
    return false;
  }
  
  // Check limits
  const limits: Record<AIProvider, number> = {
    gemini: 15,    // Gemini free tier: ~15 requests per minute
    minimax: 20,   // MiniMax typical limit
    kimi: 3        // Kimi free tier: ~3 requests per minute
  };
  
  return tracker.count >= limits[provider];
}

export function incrementRequestCount(provider: AIProvider): void {
  rateLimitTracker[provider].count++;
}

export function getNextAvailableProvider(): AIProvider | null {
  for (const provider of PROVIDER_PRIORITY) {
    if (!isRateLimited(provider)) {
      return provider;
    }
  }
  return null;
}
