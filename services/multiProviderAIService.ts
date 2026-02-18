import type { AIProvider, ProviderConfig } from './aiProviderConfig';
import { 
  DEFAULT_PROVIDER_CONFIGS, 
  isRateLimited, 
  incrementRequestCount,
  getNextAvailableProvider 
} from './aiProviderConfig';
import { GoogleGenAI } from "@google/genai";

export interface GenerationResult {
  text: string;
  provider: AIProvider;
  usedFallback: boolean;
}

export class MultiProviderAIService {
  private configs: Record<AIProvider, ProviderConfig>;
  private preferredProvider: AIProvider;

  constructor(preferredProvider: AIProvider = 'gemini') {
    this.configs = { ...DEFAULT_PROVIDER_CONFIGS };
    this.preferredProvider = preferredProvider;
  }

  setPreferredProvider(provider: AIProvider): void {
    this.preferredProvider = provider;
  }

  async generateContent(
    prompt: string, 
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<GenerationResult> {
    // Try preferred provider first
    const providers = [this.preferredProvider, ...(['gemini', 'kimi', 'minimax'] as AIProvider[]).filter(p => p !== this.preferredProvider)];
    
    let lastError: Error | null = null;
    
    for (const provider of providers) {
      if (isRateLimited(provider)) {
        console.log(`${provider} is rate limited, trying next...`);
        continue;
      }

      try {
        const result = await this.generateWithProvider(provider, prompt, imageParts, systemInstruction);
        incrementRequestCount(provider);
        return {
          text: result,
          provider,
          usedFallback: provider !== this.preferredProvider
        };
      } catch (error) {
        console.error(`${provider} failed:`, error);
        lastError = error as Error;
        continue;
      }
    }

    throw lastError || new Error('All AI providers failed or are rate limited');
  }

  private async generateWithProvider(
    provider: AIProvider, 
    prompt: string, 
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs[provider];
    
    if (!config.apiKey) {
      throw new Error(`No API key configured for ${provider}`);
    }

    switch (provider) {
      case 'gemini':
        return this.generateWithGemini(prompt, imageParts, systemInstruction);
      case 'minimax':
        return this.generateWithMinimax(prompt, systemInstruction);
      case 'kimi':
        return this.generateWithKimi(prompt, imageParts, systemInstruction);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async generateWithGemini(
    prompt: string, 
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs.gemini;
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    
    const parts: any[] = [{ text: prompt }];
    if (imageParts) {
      parts.push(...imageParts);
    }

    const response = await ai.models.generateContent({
      model: config.model,
      config: {
        systemInstruction: systemInstruction,
        temperature: config.temperature,
      },
      contents: [{
        role: "user",
        parts: parts,
      }],
    });

    return response.text || '';
  }

  private async generateWithMinimax(
    prompt: string,
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs.minimax;
    
    const response = await fetch(config.baseUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async generateWithKimi(
    prompt: string, 
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs.kimi;
    
    // Kimi/Moonshot API format
    const messages: any[] = [];
    
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    
    const userMessage: any = { role: 'user', content: prompt };
    
    // Add images if provided (Kimi supports base64 images)
    if (imageParts && imageParts.length > 0) {
      userMessage.content = [
        { type: 'text', text: prompt },
        ...imageParts.map((part: any) => ({
          type: 'image_url',
          image_url: {
            url: part.inlineData?.data 
              ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
              : part.fileData?.fileUri
          }
        }))
      ];
    }
    
    messages.push(userMessage);

    const response = await fetch(config.baseUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Check which providers are available
  getAvailableProviders(): AIProvider[] {
    return (['gemini', 'minimax', 'kimi'] as AIProvider[]).filter(
      provider => !!this.configs[provider].apiKey
    );
  }

  // Get provider status
  getProviderStatus(): Record<AIProvider, { available: boolean; rateLimited: boolean }> {
    return {
      gemini: { 
        available: !!this.configs.gemini.apiKey, 
        rateLimited: isRateLimited('gemini') 
      },
      minimax: { 
        available: !!this.configs.minimax.apiKey, 
        rateLimited: isRateLimited('minimax') 
      },
      kimi: { 
        available: !!this.configs.kimi.apiKey, 
        rateLimited: isRateLimited('kimi') 
      }
    };
  }
}

// Export singleton instance
export const aiService = new MultiProviderAIService('gemini');
