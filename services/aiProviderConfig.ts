export type AIProvider = 'local' | 'gemini' | 'minimax' | 'kimi' | 'glm';

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
  local: ['tesseract-lstm'], // Local OCR using Tesseract.js LSTM model
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'],
  minimax: ['MiniMax-Text-01', 'abab6.5s-chat'],
  kimi: ['kimi-k2.5-free', 'moonshot-v1-8k', 'moonshot-v1-32k'],
  glm: ['glm-4-flash', 'glm-4-plus', 'glm-4']
};

// Default configurations - these will be overridden by environment variables
export const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  local: {
    name: 'Local OCR (Tesseract.js)',
    apiKey: 'local', // No API key needed for local OCR
    model: 'tesseract-lstm',
    temperature: 0
  },
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
  },
  glm: {
    name: 'ChatGLM',
    apiKey: process.env.GLM_API_KEY || '',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    maxTokens: 8192,
    temperature: 0.1
  }
};

// Priority order for fallback
// 'local' is always tried first for OCR tasks to save API costs
export const PROVIDER_PRIORITY: AIProvider[] = ['local', 'gemini', 'kimi', 'minimax', 'glm'];

// Rate limit tracking
export const rateLimitTracker = {
  local: { count: 0, resetTime: Date.now() }, // Local OCR has no rate limits
  gemini: { count: 0, resetTime: Date.now() },
  minimax: { count: 0, resetTime: Date.now() },
  kimi: { count: 0, resetTime: Date.now() },
  glm: { count: 0, resetTime: Date.now() }
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
    local: 999999, // Local OCR has no rate limits (effectively unlimited)
    gemini: 15,    // Gemini free tier: ~15 requests per minute
    minimax: 20,   // MiniMax typical limit
    kimi: 3,       // Kimi free tier: ~3 requests per minute
    glm: 10        // GLM free tier: ~10 requests per minute
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
