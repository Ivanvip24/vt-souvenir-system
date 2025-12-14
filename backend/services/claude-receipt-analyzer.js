/**
 * Claude Receipt Analyzer Service
 * Uses Claude's Vision API to extract structured data from supplier receipts
 */

import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch';

let anthropicClient = null;

/**
 * Initialize the Anthropic client
 */
function initializeClient() {
  if (anthropicClient) {
    return anthropicClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  anthropicClient = new Anthropic({
    apiKey: apiKey
  });

  console.log('✅ Anthropic Claude client initialized');
  return anthropicClient;
}

/**
 * Download image from URL and convert to base64
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<{base64: string, mediaType: string}>}
 */
async function downloadImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Map content type to Claude's expected format
    let mediaType = 'image/jpeg';
    if (contentType.includes('png')) {
      mediaType = 'image/png';
    } else if (contentType.includes('gif')) {
      mediaType = 'image/gif';
    } else if (contentType.includes('webp')) {
      mediaType = 'image/webp';
    }

    return { base64, mediaType };
  } catch (error) {
    console.error('❌ Error downloading image:', error.message);
    throw error;
  }
}

/**
 * Analyze a supplier receipt image using Claude Vision
 * @param {string} imageUrl - Cloudinary URL of the receipt image
 * @param {Array<Object>} existingMaterials - List of existing materials to match against
 * @returns {Promise<Object>} - Extracted receipt data
 */
export async function analyzeReceipt(imageUrl, existingMaterials = []) {
  try {
    console.log('📸 Analyzing receipt with Claude Vision:', imageUrl);

    const client = initializeClient();

    // Download and convert image to base64
    const { base64, mediaType } = await downloadImageAsBase64(imageUrl);

    // Build context about existing materials for matching
    const materialsContext = existingMaterials.length > 0
      ? `\n\nEXISTING MATERIALS IN SYSTEM (try to match items to these):\n${existingMaterials.map(m =>
          `- ID: ${m.id}, Name: "${m.name}", SKU: ${m.sku || 'N/A'}, Supplier: ${m.supplier_name || 'N/A'}`
        ).join('\n')}`
      : '';

    const systemPrompt = `You are an expert at extracting structured data from supplier receipts and invoices.
You analyze images of receipts and extract all relevant information in a structured JSON format.

Your task is to extract:
1. Supplier information (name, address, phone, folio/receipt number)
2. Date of the receipt
3. Line items (quantity, description, unit price, total)
4. Grand total and any discounts

IMPORTANT RULES:
- All prices should be numbers (not strings)
- Quantities should be numbers
- Dates should be in ISO format (YYYY-MM-DD)
- If you can't read something clearly, use null
- For each line item, try to identify what type of material it is (e.g., "cellophane bag", "ribbon", "box", etc.)
- Extract exact dimensions if visible (e.g., "9x12" means 9cm x 12cm)
${materialsContext}

Respond ONLY with valid JSON in this exact format:
{
  "supplier": {
    "name": "string or null",
    "address": "string or null",
    "phone": "string or null",
    "folio": "string or null"
  },
  "date": "YYYY-MM-DD or null",
  "items": [
    {
      "quantity": number,
      "description": "exact text from receipt",
      "dimensions": "string like '9x12' or null",
      "unit_price": number,
      "total": number,
      "material_type": "inferred type like 'cellophane_bag', 'ribbon', 'box', etc.",
      "matched_material_id": number or null (ID from existing materials if matched)
    }
  ],
  "subtotal": number or null,
  "discount": number or null,
  "grand_total": number,
  "notes": "any additional observations",
  "confidence": "high", "medium", or "low"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64
              }
            },
            {
              type: 'text',
              text: 'Please analyze this supplier receipt and extract all the information in the JSON format specified. Be thorough and accurate.'
            }
          ]
        }
      ],
      system: systemPrompt
    });

    // Extract the JSON from Claude's response
    const responseText = response.content[0].text;

    // Try to parse JSON from the response
    let extractedData;
    try {
      // Handle case where Claude might wrap JSON in markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/```\s*([\s\S]*?)\s*```/);

      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        extractedData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response as JSON:', parseError);
      console.log('Raw response:', responseText);
      return {
        success: false,
        error: 'Failed to parse receipt data',
        rawResponse: responseText
      };
    }

    console.log('✅ Receipt analyzed successfully');
    console.log(`📋 Found ${extractedData.items?.length || 0} line items`);
    console.log(`💰 Grand total: $${extractedData.grand_total}`);

    return {
      success: true,
      data: extractedData,
      imageUrl: imageUrl,
      analyzedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error analyzing receipt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Match extracted items to existing materials using fuzzy matching
 * @param {Array<Object>} extractedItems - Items from receipt analysis
 * @param {Array<Object>} existingMaterials - Materials from database
 * @returns {Array<Object>} - Items with match suggestions
 */
export function matchItemsToMaterials(extractedItems, existingMaterials) {
  return extractedItems.map(item => {
    const matches = [];

    for (const material of existingMaterials) {
      let score = 0;

      // Check if dimensions match
      if (item.dimensions && material.name) {
        const itemDims = item.dimensions.toLowerCase();
        const materialName = material.name.toLowerCase();

        if (materialName.includes(itemDims)) {
          score += 50;
        }
      }

      // Check description keywords
      if (item.description && material.name) {
        const descWords = item.description.toLowerCase().split(/\s+/);
        const materialWords = material.name.toLowerCase().split(/\s+/);

        for (const word of descWords) {
          if (word.length > 2 && materialWords.some(mw => mw.includes(word) || word.includes(mw))) {
            score += 10;
          }
        }
      }

      // Check supplier match
      if (material.supplier_name && item.description) {
        // If we know this material comes from the same supplier
        score += 5;
      }

      if (score > 0) {
        matches.push({
          material_id: material.id,
          material_name: material.name,
          score: score,
          current_cost: material.cost_per_unit
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return {
      ...item,
      suggested_matches: matches.slice(0, 3) // Top 3 matches
    };
  });
}

/**
 * Analyze a receipt from a base64 string (for direct upload without Cloudinary)
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} mediaType - MIME type of the image
 * @param {Array<Object>} existingMaterials - List of existing materials
 * @returns {Promise<Object>} - Extracted receipt data
 */
export async function analyzeReceiptFromBase64(base64Data, mediaType, existingMaterials = []) {
  try {
    console.log('📸 Analyzing receipt from base64 with Claude Vision');

    const client = initializeClient();

    const materialsContext = existingMaterials.length > 0
      ? `\n\nEXISTING MATERIALS IN SYSTEM (try to match items to these):\n${existingMaterials.map(m =>
          `- ID: ${m.id}, Name: "${m.name}", SKU: ${m.sku || 'N/A'}, Supplier: ${m.supplier_name || 'N/A'}`
        ).join('\n')}`
      : '';

    const systemPrompt = `You are an expert at extracting structured data from supplier receipts and invoices.
You analyze images of receipts and extract all relevant information in a structured JSON format.

Your task is to extract:
1. Supplier information (name, address, phone, folio/receipt number)
2. Date of the receipt
3. Line items (quantity, description, unit price, total)
4. Grand total and any discounts

IMPORTANT RULES:
- All prices should be numbers (not strings)
- Quantities should be numbers
- Dates should be in ISO format (YYYY-MM-DD)
- If you can't read something clearly, use null
- For each line item, try to identify what type of material it is (e.g., "cellophane bag", "ribbon", "box", etc.)
- Extract exact dimensions if visible (e.g., "9x12" means 9cm x 12cm)
${materialsContext}

Respond ONLY with valid JSON in this exact format:
{
  "supplier": {
    "name": "string or null",
    "address": "string or null",
    "phone": "string or null",
    "folio": "string or null"
  },
  "date": "YYYY-MM-DD or null",
  "items": [
    {
      "quantity": number,
      "description": "exact text from receipt",
      "dimensions": "string like '9x12' or null",
      "unit_price": number,
      "total": number,
      "material_type": "inferred type like 'cellophane_bag', 'ribbon', 'box', etc.",
      "matched_material_id": number or null (ID from existing materials if matched)
    }
  ],
  "subtotal": number or null,
  "discount": number or null,
  "grand_total": number,
  "notes": "any additional observations",
  "confidence": "high", "medium", or "low"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: 'Please analyze this supplier receipt and extract all the information in the JSON format specified. Be thorough and accurate.'
            }
          ]
        }
      ],
      system: systemPrompt
    });

    const responseText = response.content[0].text;

    let extractedData;
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/```\s*([\s\S]*?)\s*```/);

      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        extractedData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response as JSON:', parseError);
      return {
        success: false,
        error: 'Failed to parse receipt data',
        rawResponse: responseText
      };
    }

    console.log('✅ Receipt analyzed successfully');

    return {
      success: true,
      data: extractedData,
      analyzedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error analyzing receipt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  analyzeReceipt,
  analyzeReceiptFromBase64,
  matchItemsToMaterials
};
