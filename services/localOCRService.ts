// Local OCR Service - DISABLED
// Using cloud APIs instead of local Tesseract.js

export interface LocalOCRResult {
  text: string;
  confidence: number;
  isValid: boolean;
  reason?: string;
}

/**
 * Local OCR is disabled - using cloud APIs instead
 */
export async function performLocalOCR(imageFile: File): Promise<LocalOCRResult> {
  console.log('[Local OCR] DISABLED - Using cloud APIs');
  return {
    text: '',
    confidence: 0,
    isValid: false,
    reason: 'Local OCR disabled - using cloud APIs'
  };
}

export async function performLocalOCRMultiple(files: File[]): Promise<LocalOCRResult[]> {
  console.log('[Local OCR] DISABLED - Using cloud APIs');
  return files.map(() => ({
    text: '',
    confidence: 0,
    isValid: false,
    reason: 'Local OCR disabled - using cloud APIs'
  }));
}
