import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, DEFAULT_PROVIDER_CONFIGS, incrementRequestCount, isRateLimited } from './aiProviderConfig';

/**
 * 1. STANDARDIZED OUTPUT SCHEMA (Zod)
 * Force all AI providers to return this exact structure
 */
export const ReceiptSchema = z.object({
  merchantName: z.string(),
  totalAmount: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  items: z.array(z.object({
    name: z.string(),
    price: z.number()
  }))
});

export type ReceiptData = z.infer<typeof ReceiptSchema>;

/**
 * UTILITY: Strip Markdown and Clean JSON
 */
const cleanAIResponse = (text: string): string => {
  return text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
};

export class MultiProviderAIService {
  private configs = DEFAULT_PROVIDER_CONFIGS;
  private usageStats = {
    totalRequests: 0,
    openaiUsed: 0,
    estimatedCost: 0
  };

  private preferredProvider: AIProvider | null = null;

  /**
   * Set the preferred provider for the service.
   */
  setPreferredProvider(provider: AIProvider | null) {
    this.preferredProvider = provider;
  }

  /**
   * 2. UNIFIED RECEIPT PARSER FUNCTION
   * Implements robust Gemini -> Groq fallback
   */
  async ReceiptParser(
    prompt: string,
    imageParts?: any[]
  ): Promise<ReceiptData> {
    // Determine provider order: Primary (Preferred if set) -> Others
    const baseProviders: AIProvider[] = ['gemini', 'groq', 'openai'];
    const providers = this.preferredProvider
      ? [this.preferredProvider, ...baseProviders.filter(p => p !== this.preferredProvider)]
      : baseProviders;

    let lastError: any = null;

    const systemInstruction = `
      You are a specialized vision assistant for receipt auditing.
      Extract data exactly according to the schema.
      Return ONLY valid JSON. No markdown blocks, no explanations.
      Schema:
      {
        "merchantName": "string",
        "totalAmount": number,
        "date": "YYYY-MM-DD",
        "items": [{"name": "string", "price": number}]
      }
    `;

    for (const provider of providers) {
      if (isRateLimited(provider)) continue;

      try {
        console.log(`[ReceiptParser] Attempting with ${provider}...`);

        const rawResponse = await this.generateWithProvider(provider, prompt, imageParts, systemInstruction);
        const cleaned = cleanAIResponse(rawResponse);
        const jsonData = JSON.parse(cleaned);

        // Final Zod validation
        const validated = ReceiptSchema.parse(jsonData);

        // Success: Track stats
        this.usageStats.totalRequests++;
        if (provider === 'openai') {
          this.usageStats.openaiUsed++;
          this.usageStats.estimatedCost += 0.002;
        }
        incrementRequestCount(provider);

        return validated;
      } catch (error) {
        console.warn(`[ReceiptParser] ${provider} failed or returned invalid JSON:`, error);
        lastError = error;
        continue;
      }
    }

    throw new Error(`Service Busy: All AI providers failed. Last error: ${lastError?.message}`);
  }

  private async generateWithProvider(
    provider: AIProvider,
    prompt: string,
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs[provider];
    if (!config || !config.apiKey) throw new Error(`Provider ${provider} not configured or API key missing`);

    if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({ model: config.model, systemInstruction });
      const parts = [{ text: prompt }, ...(imageParts || [])];
      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      return result.response.text();
    }

    if (provider === 'groq' || provider === 'openai') {
      const messages = [
        { role: 'system', content: systemInstruction },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...(imageParts?.map(p => ({
              type: 'image_url',
              image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }
            })) || [])
          ]
        }
      ];

      const response = await fetch(config.baseUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: config.temperature
        })
      });

      if (!response.ok) throw new Error(`${provider} API Error: ${response.statusText}`);
      const data = await response.json();
      return data.choices[0].message.content;
    }

    throw new Error(`Provider ${provider} not implemented`);
  }

  // Dashboard Helpers
  getUsageStats() {
    return this.usageStats;
  }

  resetUsageStats() {
    this.usageStats = { totalRequests: 0, openaiUsed: 0, estimatedCost: 0 };
  }

  // Legacy compatibility
  async generateContent(prompt: string, imageParts?: any[], systemInstruction?: string): Promise<{ text: string, provider: AIProvider, usedFallback: boolean }> {
    try {
      const data = await this.ReceiptParser(prompt, imageParts);
      return {
        text: JSON.stringify(data, null, 2),
        provider: 'gemini',
        usedFallback: false
      };
    } catch (e) {
      throw e;
    }
  }
}

export const aiService = new MultiProviderAIService();
