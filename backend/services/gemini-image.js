/**
 * Gemini Image Generation Service
 * Uses Google Gemini to generate product mockups, design layouts, and marketing images.
 */

import { log, logError } from '../shared/logger.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT || `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Generate an image using Gemini API.
 * @param {string} prompt - Descriptive text prompt for image generation
 * @returns {{ success: boolean, imageBase64?: string, mimeType?: string, textResponse?: string, error?: string }}
 */
export async function generateProductImage(prompt) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'GEMINI_API_KEY no está configurada en el servidor' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for image gen

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      log('error', 'gemini.api_error', { error: errorMsg });
      return { success: false, error: `Error de Gemini: ${errorMsg}` };
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      return { success: false, error: 'Gemini no generó ningún resultado' };
    }

    const parts = data.candidates[0].content?.parts || [];

    // Find image part and text part
    let imageBase64 = null;
    let mimeType = null;
    let textResponse = null;

    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
      }
      if (part.text) {
        textResponse = part.text;
      }
    }

    if (!imageBase64) {
      return {
        success: false,
        error: 'Gemini respondió pero no incluyó imagen. Intenta con una descripción más específica.',
        textResponse
      };
    }

    return { success: true, imageBase64, mimeType, textResponse };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'La generación de imagen tardó demasiado (timeout 60s)' };
    }
    logError('gemini.generate_failed', err);
    return { success: false, error: `Error generando imagen: ${err.message}` };
  }
}

/**
 * Build an optimized prompt for product mockup generation.
 * @param {{ productType?: string, description: string, style?: string, dimensions?: string, design?: string }} spec
 * @returns {string} Optimized prompt
 */
export function buildProductMockupPrompt(spec) {
  const style = spec.style || 'product_mockup';

  const styleInstructions = {
    product_mockup: 'Professional product photography on a clean white background. Studio lighting, soft shadows. The product should be the main focus, shown at a slight angle for depth. High resolution, commercial quality.',
    design_layout: 'Flat lay design showing the product artwork/graphic design. Top-down view on a neutral surface with subtle props (pencils, color swatches). Clean, modern aesthetic.',
    marketing: 'Lifestyle marketing shot showing the product in use or in context. Warm, inviting lighting. Mexican cultural elements in the background. Instagram-ready composition.'
  };

  const baseContext = 'AXKAN is a Mexican souvenir brand specializing in personalized magnets, keychains, and bottle openers made from MDF with custom printing. Products feature Mexican destinations, cultural icons, and events.';

  let prompt = `${baseContext}\n\n`;
  prompt += `Create a ${styleInstructions[style] || styleInstructions.product_mockup}\n\n`;
  prompt += `Product: ${spec.productType || 'souvenir magnet'}\n`;
  prompt += `Description: ${spec.description}\n`;

  if (spec.dimensions) {
    prompt += `Size: ${spec.dimensions}\n`;
  }

  if (spec.design) {
    prompt += `Design details: ${spec.design}\n`;
  }

  prompt += '\nThe product should look premium, handcrafted, and distinctly Mexican. Show the MDF material edge in a warm golden-brown tone.';

  return prompt;
}
