// Hybrid OCR Service - Now disabled, using cloud APIs directly
// Local OCR has been removed

import type { AIProvider } from './aiProviderConfig';

export type OCRMethod = 'cloud';

export interface HybridOCRResult {
  text: string;
  method: OCRMethod;
  provider?: AIProvider;
  confidence?: number;
}

export interface HybridOCROptions {
  preferredProvider?: AIProvider;
  onStatusChange?: (status: string) => void;
}

/**
 * OCR is now disabled - Cloud APIs handle image processing directly
 * This function returns empty text and lets cloud AI process images
 */
export async function performHybridOCR(
  files: File[],
  options: HybridOCROptions = {}
): Promise<HybridOCRResult> {
  const { onStatusChange } = options;

  onStatusChange?.('Preparing images for cloud AI...');
  console.log('[OCR] Skipping local OCR - using cloud AI for image analysis');

  // Return empty text - cloud AI will process images directly
  return {
    text: '',
    method: 'cloud',
    confidence: 100
  };
}

/**
 * Quick check - always returns suitable since we're using cloud
 */
export async function estimateLocalOCRQuality(file: File): Promise<{
  suitable: boolean;
  reason?: string;
}> {
  return { suitable: true };
}
