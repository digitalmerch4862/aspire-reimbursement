export type AIProvider = 'gemini' | 'groq' | 'openai';

export type ProviderTier = 1 | 2 | 3;

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  tier: ProviderTier;
  rateLimitType: 'per_minute' | 'per_day';
  limit: number;
  supportsImages: boolean;
}

export const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  gemini: {
    name: 'Google Gemini 1.5 Flash',
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-1.5-flash',
    temperature: 0.1,
    tier: 1,
    rateLimitType: 'per_minute',
    limit: 15,
    supportsImages: true
  },
  groq: {
    name: 'Groq Llama 3.2 Vision',
    apiKey: process.env.GROQ_API_KEY || '',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.2-11b-vision-preview',
    temperature: 0.1,
    tier: 2,
    rateLimitType: 'per_minute',
    limit: 20,
    supportsImages: true
  },
  openai: {
    name: 'OpenAI GPT-4o Mini (Backup)',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    temperature: 0.1,
    tier: 3,
    rateLimitType: 'per_minute',
    limit: 100,
    supportsImages: true
  }
};

export const TIER_PRIORITY: Record<ProviderTier, AIProvider[]> = {
  1: ['gemini'],
  2: ['groq'],
  3: ['openai']
};

export const PROVIDER_PRIORITY: AIProvider[] = ['gemini', 'groq', 'openai'];

// Rate limit tracking
export interface RateLimitInfo {
  count: number;
  resetTime: number;
  dailyCount?: number;
  dailyResetTime?: number;
}

export const rateLimitTracker: Record<AIProvider, RateLimitInfo> = {
  gemini: { count: 0, resetTime: Date.now() },
  groq: { count: 0, resetTime: Date.now() },
  openai: { count: 0, resetTime: Date.now() }
};

export function isRateLimited(provider: AIProvider): boolean {
  const config = DEFAULT_PROVIDER_CONFIGS[provider];
  const tracker = rateLimitTracker[provider];
  const now = Date.now();

  if (now - tracker.resetTime > 60000) {
    tracker.count = 0;
    tracker.resetTime = now;
  }

  return tracker.count >= config.limit;
}

export function incrementRequestCount(provider: AIProvider): void {
  const tracker = rateLimitTracker[provider];
  tracker.count++;
}

export function getProviderStats(provider: AIProvider) {
  const config = DEFAULT_PROVIDER_CONFIGS[provider];
  const tracker = rateLimitTracker[provider];
  const now = Date.now();

  if (now - tracker.resetTime > 60000) {
    tracker.count = 0;
    tracker.resetTime = now;
  }

  return {
    used: tracker.count,
    limit: config.limit,
    remaining: Math.max(0, config.limit - tracker.count),
    isRateLimited: tracker.count >= config.limit,
    waitTimeSeconds: Math.ceil((60000 - (now - tracker.resetTime)) / 1000)
  };
}

export function getTierStats(tier: ProviderTier) {
  const providers = TIER_PRIORITY[tier];
  const available = providers.filter(p => !isRateLimited(p) && DEFAULT_PROVIDER_CONFIGS[p].apiKey);
  return {
    available: available.length,
    total: providers.length
  };
}

export function formatWaitTime(seconds: number): string {
  if (seconds <= 0) return 'Now';
  return `${seconds}s`;
}
