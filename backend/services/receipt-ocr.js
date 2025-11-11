import vision from '@google-cloud/vision';
import fetch from 'node-fetch';

/**
 * Receipt OCR Service
 * Uses Google Cloud Vision API to extract text from receipt images
 */

let visionClient = null;

/**
 * Initialize the Google Cloud Vision client with credentials from environment
 */
function initializeVisionClient() {
  if (visionClient) {
    return visionClient;
  }

  try {
    // Parse credentials from environment variable (JSON string)
    const credentialsEnv = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;

    if (!credentialsEnv) {
      throw new Error('GOOGLE_CLOUD_VISION_CREDENTIALS environment variable not set');
    }

    console.log('🔍 Credentials env var length:', credentialsEnv.length);
    console.log('🔍 First 100 chars:', credentialsEnv.substring(0, 100));

    const credentials = JSON.parse(credentialsEnv);

    visionClient = new vision.ImageAnnotatorClient({
      credentials: credentials
    });

    console.log('✅ Google Cloud Vision client initialized');
    return visionClient;
  } catch (error) {
    console.error('❌ Failed to initialize Vision client:', error.message);
    console.error('❌ Error details:', error);
    throw new Error('Vision API credentials not configured properly');
  }
}

/**
 * Download image from Cloudinary URL and convert to buffer
 * @param {string} imageUrl - Cloudinary URL
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImage(imageUrl) {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('❌ Error downloading image:', error.message);
    throw error;
  }
}

/**
 * Extract text from receipt image using Google Cloud Vision API
 * @param {string} imageUrl - Cloudinary URL of the receipt
 * @returns {Promise<Object>} - Extracted text and metadata
 */
export async function extractTextFromReceipt(imageUrl) {
  try {
    console.log('📸 Processing receipt image:', imageUrl);

    // Initialize Vision client
    const client = initializeVisionClient();

    // Download image from Cloudinary
    const imageBuffer = await downloadImage(imageUrl);

    // Perform text detection
    const [result] = await client.textDetection(imageBuffer);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return {
        success: false,
        fullText: '',
        lines: [],
        error: 'No text detected in image'
      };
    }

    // First annotation is the full text
    const fullText = detections[0].description;

    // Remaining annotations are individual words/blocks
    const lines = detections.slice(1).map(text => ({
      text: text.description,
      confidence: text.confidence || 0
    }));

    console.log('✅ Text extracted successfully');
    console.log('📄 Full text length:', fullText.length, 'characters');

    return {
      success: true,
      fullText,
      lines,
      rawResult: result
    };
  } catch (error) {
    console.error('❌ Error extracting text from receipt:', error);
    return {
      success: false,
      fullText: '',
      lines: [],
      error: error.message
    };
  }
}

/**
 * Parse payment amount from extracted text
 * Looks for common patterns like:
 * - "Total: $500.00"
 * - "Monto: 500"
 * - "Amount: 500.00"
 * - "$ 500"
 * @param {string} text - Extracted text from receipt
 * @returns {Object} - Parsed amounts with confidence
 */
export function parseAmountFromText(text) {
  const amounts = [];

  // Common Spanish/English amount patterns
  const patterns = [
    // "Total: $500.00" or "Total: 500"
    /total[:\s]+\$?(\d+[.,]\d{2})/gi,
    // "Monto: $500" or "Monto: 500.00"
    /monto[:\s]+\$?(\d+[.,]?\d*)/gi,
    // "Amount: 500.00"
    /amount[:\s]+\$?(\d+[.,]\d{2})/gi,
    // "Importe: 500"
    /importe[:\s]+\$?(\d+[.,]?\d*)/gi,
    // Standalone currency amounts: "$500.00" or "$ 500"
    /\$\s*(\d+[.,]?\d*)/g,
    // Numbers with decimal points (likely amounts)
    /(\d+\.\d{2})/g
  ];

  patterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      // Extract the numeric part and normalize (replace comma with period)
      const amountStr = match[1].replace(',', '.');
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && amount > 0) {
        amounts.push({
          amount,
          confidence: pattern.toString().includes('total|monto|amount') ? 'high' : 'medium',
          context: match[0]
        });
      }
    });
  });

  // Sort by confidence (high first) and amount (descending)
  amounts.sort((a, b) => {
    if (a.confidence === 'high' && b.confidence !== 'high') return -1;
    if (a.confidence !== 'high' && b.confidence === 'high') return 1;
    return b.amount - a.amount;
  });

  // Return the most likely amount
  if (amounts.length > 0) {
    return {
      success: true,
      amount: amounts[0].amount,
      confidence: amounts[0].confidence,
      allAmounts: amounts,
      context: amounts[0].context
    };
  }

  return {
    success: false,
    amount: null,
    confidence: 'none',
    allAmounts: [],
    error: 'No amount found in text'
  };
}

/**
 * Validate if extracted amount matches expected deposit
 * @param {number} extractedAmount - Amount from OCR
 * @param {number} expectedAmount - Expected deposit amount
 * @param {number} tolerance - Percentage tolerance (default 2%)
 * @returns {Object} - Validation result
 */
export function validateAmount(extractedAmount, expectedAmount, tolerance = 0.02) {
  const difference = Math.abs(extractedAmount - expectedAmount);
  const percentageDiff = difference / expectedAmount;

  const isValid = percentageDiff <= tolerance;

  return {
    isValid,
    extractedAmount,
    expectedAmount,
    difference,
    percentageDiff: (percentageDiff * 100).toFixed(2),
    tolerance: (tolerance * 100).toFixed(0)
  };
}

/**
 * Process receipt and validate amount
 * @param {string} imageUrl - Cloudinary URL of receipt
 * @param {number} expectedDeposit - Expected deposit amount
 * @returns {Promise<Object>} - Processing result with validation
 */
export async function processReceipt(imageUrl, expectedDeposit) {
  console.log('\n🔍 Processing receipt...');
  console.log('📸 Image URL:', imageUrl);
  console.log('💰 Expected deposit:', expectedDeposit);

  // Step 1: Extract text from image
  const ocrResult = await extractTextFromReceipt(imageUrl);

  if (!ocrResult.success) {
    return {
      success: false,
      stage: 'ocr',
      error: ocrResult.error
    };
  }

  // Step 2: Parse amount from text
  const amountResult = parseAmountFromText(ocrResult.fullText);

  if (!amountResult.success) {
    return {
      success: false,
      stage: 'parsing',
      error: amountResult.error,
      extractedText: ocrResult.fullText
    };
  }

  // Step 3: Validate amount
  const validation = validateAmount(amountResult.amount, expectedDeposit);

  console.log('\n📊 Results:');
  console.log('✓ Extracted text length:', ocrResult.fullText.length, 'characters');
  console.log('✓ Found amount:', amountResult.amount);
  console.log('✓ Expected amount:', expectedDeposit);
  console.log('✓ Match:', validation.isValid ? '✅ YES' : '❌ NO');
  console.log('✓ Difference:', validation.difference, `(${validation.percentageDiff}%)`);

  return {
    success: true,
    ocrText: ocrResult.fullText,
    extractedAmount: amountResult.amount,
    expectedAmount: expectedDeposit,
    validation,
    confidence: amountResult.confidence,
    shouldAutoApprove: validation.isValid
  };
}
