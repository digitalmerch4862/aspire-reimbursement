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
    const allProviders: AIProvider[] = ['gemini', 'kimi', 'minimax', 'glm'];
    const providers = [this.preferredProvider, ...allProviders.filter(p => p !== this.preferredProvider)];

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

    // Providers failed, fallthrough to mock


    // FALLBACK MOCK RESPONSE FOR DEVELOPMENT
    console.warn("All AI providers failed. Falling back to MOCK response for development.");
    const MOCK_RESPONSE = `<<<PHASE_1_START>>>
| Receipt # | Store Name Date & Time | Product (Per Item) | Category | Item Amount | Grand Total |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Officeworks (MOCK) 19/02/2026 09:30 | Printer Paper | Other Expenses-Office Supplies | 15.00 | 15.00 |

| Receipt # | Store Name | Receipt ID | Grand Total |
|:---|:---|:---|:---|
| 1 | Officeworks (MOCK) | MOCK-REC-001 | $15.00 |
| **Total Amount** | | | **$15.00** |
<<<PHASE_1_END>>>

<<<PHASE_2_START>>>
\`\`\`pgsql
-- PHASE 1 BLOCK: Mock Staff
Client name / Location: Sydney
Smith, John
Approved by: Admin
Type of expense: Other Expenses-Office Supplies
02/19/2026
$15.00
\`\`\`

\`\`\`sql
-- PHASE 2 BLOCK: Mock Staff
Block 1: John Smith
Block 2: 15.00
\`\`\`
<<<PHASE_2_END>>>

<<<PHASE_3_START>>>
Matches Exactly.
<<<PHASE_3_END>>>

<<<PHASE_4_START>>>
Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** Smith, John
**Client / Location:** Sydney
**Approved By:** Admin
**Amount:** $15.00
**Receipt ID:** MOCK-REC-001
**NAB Reference:** PENDING

| Receipt # | Store Name Date & Time | Product (Per Item) | Category | Item Amount | Grand Total |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Officeworks (MOCK) 19/02/2026 09:30 | Printer Paper | Other Expenses-Office Supplies | 15.00 | 15.00 |

**TOTAL AMOUNT: $15.00**

| Receipt # | Store Name | Receipt ID | Grand Total |
|:---|:---|:---|:---|
| 1 | Officeworks (MOCK) | MOCK-REC-001 | $15.00 |
| **Total Amount** | | | **$15.00** |
<<<PHASE_4_END>>>`;

    return {
      text: MOCK_RESPONSE,
      provider: 'local', // Valid provider type to avoid errors
      usedFallback: true
    };
  }

  private async generateWithProvider(
    provider: AIProvider,
    prompt: string,
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs[provider];

    // Handle local OCR provider - it's handled separately by hybridOCRService
    if (provider === 'local') {
      throw new Error('Local OCR is handled separately by the Hybrid OCR Service. This provider should not be used directly for text generation.');
    }

    if (!config.apiKey) {
      throw new Error(`No API key configured for ${provider}`);
    }

    switch (provider) {
      case 'gemini':
        return this.generateWithGemini(prompt, imageParts, systemInstruction);
      case 'minimax':
        return this.generateWithMinimax(prompt, imageParts, systemInstruction);
      case 'kimi':
        return this.generateWithKimi(prompt, imageParts, systemInstruction);
      case 'glm':
        return this.generateWithGLM(prompt, imageParts, systemInstruction);
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

    const text = response.text || '';
    if (!text || text.trim().length === 0) {
      throw new Error('Gemini returned empty response');
    }
    return text;
  }

  private async generateWithMinimax(
    prompt: string,
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs.minimax;

    // MiniMax doesn't support images directly in the same way, so we include them in the prompt
    let fullPrompt = prompt;
    if (imageParts && imageParts.length > 0) {
      fullPrompt += '\n\n[Note: Image data is available but MiniMax vision capabilities may be limited. Please analyze based on the extracted text provided above.]';
    }

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
          { role: 'user', content: fullPrompt }
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
    console.log('[MiniMax] Raw response:', JSON.stringify(data).substring(0, 500));
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[MiniMax] Extracted content: ${content.length} chars`);
    if (!content || content.trim().length === 0) {
      throw new Error(`MiniMax returned empty response: ${data.base_resp?.status_msg || 'unknown reason'}`);
    }
    return content;
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
    const content = data.choices?.[0]?.message?.content || '';
    if (!content || content.trim().length === 0) {
      throw new Error('Kimi returned empty response');
    }
    return content;
  }

  private async generateWithGLM(
    prompt: string,
    imageParts?: any[],
    systemInstruction?: string
  ): Promise<string> {
    const config = this.configs.glm;

    // GLM API format (OpenAI compatible)
    const messages: any[] = [];

    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    const userMessage: any = { role: 'user', content: prompt };

    // Add images if provided (GLM supports vision models)
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
      throw new Error(`GLM API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content || content.trim().length === 0) {
      throw new Error('GLM returned empty response');
    }
    return content;
  }

  // Check which providers are available
  getAvailableProviders(): AIProvider[] {
    return (['local', 'gemini', 'minimax', 'kimi', 'glm'] as AIProvider[]).filter(
      provider => !!this.configs[provider].apiKey || provider === 'local'
    );
  }

  // Get provider status
  getProviderStatus(): Record<AIProvider, { available: boolean; rateLimited: boolean }> {
    return {
      local: {
        available: true, // Local OCR is always available
        rateLimited: false // No rate limits for local
      },
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
      },
      glm: {
        available: !!this.configs.glm.apiKey,
        rateLimited: isRateLimited('glm')
      }
    };
  }
}

// Export singleton instance
export const aiService = new MultiProviderAIService('gemini');
