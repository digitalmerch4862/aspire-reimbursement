import Tesseract from 'tesseract.js';

export interface LocalOCRResult {
  text: string;
  confidence: number;
  isValid: boolean;
  reason?: string;
}

const RECEIPT_KEYWORDS = ['Total', 'Date', 'Amount', 'Receipt', 'Invoice', 'Subtotal', 'Tax', 'GST'];
const CURRENCY_PATTERNS = /[₱$€£¥]|PHP|USD|EUR|GBP|JPY/i;
const MIN_TEXT_LENGTH = 50;
const MIN_CONFIDENCE = 60;

function validateReceiptText(text: string, confidence: number): { isValid: boolean; reason?: string } {
  const trimmedText = text.trim();
  
  // Check minimum text length
  if (trimmedText.length < MIN_TEXT_LENGTH) {
    return { 
      isValid: false, 
      reason: `Text too short (${trimmedText.length} chars, need ${MIN_TEXT_LENGTH}+)` 
    };
  }

  // Check confidence score
  if (confidence < MIN_CONFIDENCE) {
    return { 
      isValid: false, 
      reason: `Low confidence score (${confidence.toFixed(1)}%, need ${MIN_CONFIDENCE}%+)` 
    };
  }

  // Check for receipt keywords
  const hasKeywords = RECEIPT_KEYWORDS.some(keyword => 
    trimmedText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasKeywords) {
    return { 
      isValid: false, 
      reason: 'No receipt keywords found (Total, Date, Amount, etc.)' 
    };
  }

  // Check for currency symbols/patterns
  const hasCurrency = CURRENCY_PATTERNS.test(trimmedText);
  
  if (!hasCurrency) {
    return { 
      isValid: false, 
      reason: 'No currency symbols found (P, PHP, $, etc.)' 
    };
  }

  return { isValid: true };
}

export async function performLocalOCR(imageFile: File): Promise<LocalOCRResult> {
  console.log(`[Local OCR] Starting OCR for: ${imageFile.name}`);
  
  try {
    // Create object URL for the image
    const imageUrl = URL.createObjectURL(imageFile);
    
    try {
      // Use LSTM engine (best quality) with English language
      const result = await Tesseract.recognize(
        imageUrl,
        'eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`[Local OCR] Progress: ${(m.progress * 100).toFixed(1)}%`);
            }
          },
          // Use best/LSTM model for high quality OCR
          // This leverages your Ryzen 9 7900X CPU for better accuracy
          errorHandler: (err) => console.error('[Local OCR] Tesseract error:', err)
        }
      );

      const text = result.data.text;
      const confidence = result.data.confidence;
      
      console.log(`[Local OCR] Completed - Confidence: ${confidence.toFixed(1)}%, Length: ${text.length} chars`);
      
      // Validate the extracted text
      const validation = validateReceiptText(text, confidence);
      
      return {
        text,
        confidence,
        isValid: validation.isValid,
        reason: validation.reason
      };
    } finally {
      // Clean up object URL
      URL.revokeObjectURL(imageUrl);
    }
  } catch (error) {
    console.error('[Local OCR] Failed:', error);
    return {
      text: '',
      confidence: 0,
      isValid: false,
      reason: error instanceof Error ? error.message : 'Unknown error during OCR'
    };
  }
}

export async function performLocalOCRMultiple(files: File[]): Promise<LocalOCRResult[]> {
  console.log(`[Local OCR] Processing ${files.length} files in parallel`);
  
  // Process files in parallel for better performance on high-end CPU
  const results = await Promise.all(
    files.map(file => performLocalOCR(file))
  );
  
  return results;
}
