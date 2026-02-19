import { performLocalOCR, performLocalOCRMultiple, LocalOCRResult } from './localOCRService';
import type { AIProvider } from './aiProviderConfig';

export type OCRMethod = 'local' | 'cloud' | 'hybrid';

export interface HybridOCRResult {
  text: string;
  method: OCRMethod;
  provider?: AIProvider;
  localResults?: LocalOCRResult[];
  confidence?: number;
}

export interface HybridOCROptions {
  preferredProvider?: AIProvider;
  skipLocal?: boolean;
  onStatusChange?: (status: string) => void;
}

/**
 * Performs OCR using Tesseract.js locally
 * 
 * Strategy:
 * 1. Use Tesseract.js (LSTM model) to extract text from images
 * 2. Return the extracted text for AI analysis
 * 3. No Cloud API fallback for OCR - save API costs!
 */
export async function performHybridOCR(
  files: File[],
  options: HybridOCROptions = {}
): Promise<HybridOCRResult> {
  const { onStatusChange } = options;

  // Step 1: Use Local OCR with Tesseract.js ONLY
  onStatusChange?.('Scanning locally with Tesseract.js...');
  console.log('[OCR] Using Tesseract.js for text extraction');

  try {
    const localResults = await performLocalOCRMultiple(files);
    
    // Combine all results (even if some failed validation, we still use the text)
    const combinedText = localResults
      .map((result, index) => 
        `--- Receipt ${index + 1} (${files[index].name}) ---\n${result.text}`
      )
      .join('\n\n');
    
    const avgConfidence = localResults.reduce((sum, r) => sum + r.confidence, 0) / localResults.length;
    const validCount = localResults.filter(result => result.isValid).length;
    
    console.log(`[OCR] Tesseract.js complete - ${validCount}/${localResults.length} files valid, avg confidence: ${avgConfidence.toFixed(1)}%`);
    
    // Log any validation failures but still use the text
    localResults.forEach((result, index) => {
      if (!result.isValid) {
        console.log(`[OCR] File ${index + 1} (${files[index].name}) note: ${result.reason}`);
      }
    });
    
    onStatusChange?.('Local OCR successful! Processing with AI...');
    
    return {
      text: combinedText,
      method: 'local',
      localResults,
      confidence: avgConfidence
    };
    
  } catch (error) {
    console.error('[OCR] Tesseract.js failed:', error);
    throw new Error('Local OCR failed. Please try again with clearer images.');
  }
}

/**
 * Quick check to estimate if local OCR will work well for a file
 * Useful for UI previews or pre-validation
 */
export async function estimateLocalOCRQuality(file: File): Promise<{
  suitable: boolean;
  reason?: string;
}> {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { suitable: false, reason: 'Not an image file' };
  }

  // Check file size (too large might be slow)
  if (file.size > 10 * 1024 * 1024) {
    return { suitable: true, reason: 'Large file - may take longer to process' };
  }

  return { suitable: true };
}
