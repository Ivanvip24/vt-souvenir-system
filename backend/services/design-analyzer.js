/**
 * Design Analyzer Service
 * Uses Claude API to analyze souvenir designs and extract metadata
 */

import Anthropic from '@anthropic-ai/sdk';
import { log, logError } from '../shared/logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Analyze a design image using Claude's vision capabilities
 * @param {string} imageUrl - URL of the image to analyze
 * @param {Buffer} imageBuffer - Optional image buffer (for direct upload)
 * @param {string} mimeType - MIME type of the image
 * @returns {Object} - Extracted metadata (title, tags, description)
 */
export async function analyzeDesign(imageUrl, imageBuffer = null, mimeType = 'image/jpeg') {
  try {
    log('info', 'design_analyzer.start');

    let imageContent;

    if (imageBuffer) {
      // Use base64 encoded image
      const base64Image = imageBuffer.toString('base64');
      imageContent = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Image
        }
      };
    } else if (imageUrl) {
      // Use URL
      imageContent = {
        type: 'image',
        source: {
          type: 'url',
          url: imageUrl
        }
      };
    } else {
      throw new Error('Se requiere imageUrl o imageBuffer');
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: `Analiza esta imagen de un diseño de souvenir/recuerdo turístico mexicano.

Extrae la siguiente información en formato JSON:

1. **title**: El texto principal visible en el diseño (nombre del lugar/destino). Si no hay texto, sugiere un nombre descriptivo corto.

2. **tags**: Lista de etiquetas (máximo 8) que describan:
   - Animales presentes (Tortuga, Mapache, Delfin, Loro, Jaguar, Pelicano, Iguana, etc.)
   - Elementos naturales (Hojas, Palmeras, Flores, Playa, Mar, Sol, Cactus, etc.)
   - Temas/estilo (Tropical, Mexicano, Maya, Caribe, Naturaleza, Colorido, etc.)
   - Tipo de souvenir (Letras, Paisaje, Silueta, etc.)

3. **description**: Una breve descripción del diseño (1-2 oraciones en español)

Responde SOLO con el JSON válido, sin explicaciones adicionales ni markdown:
{
  "title": "...",
  "tags": ["...", "..."],
  "description": "..."
}`
            }
          ]
        }
      ]
    });

    // Parse the response
    const content = response.content[0].text;

    // Try to extract JSON from the response
    let result;
    try {
      // First try direct parse
      result = JSON.parse(content);
    } catch (e) {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se pudo extraer JSON de la respuesta');
      }
    }

    // Validate and sanitize the result
    const sanitizedResult = {
      title: typeof result.title === 'string' ? result.title.trim() : 'Diseño sin título',
      tags: Array.isArray(result.tags)
        ? result.tags.filter(t => typeof t === 'string').map(t => t.trim()).slice(0, 8)
        : [],
      description: typeof result.description === 'string' ? result.description.trim() : ''
    };

    log('info', 'design_analyzer.success', { title: sanitizedResult.title, tagCount: sanitizedResult.tags.length });

    return {
      success: true,
      ...sanitizedResult
    };

  } catch (error) {
    logError('design_analyzer.error', error);

    // Return a fallback response
    return {
      success: false,
      error: error.message,
      title: '',
      tags: [],
      description: ''
    };
  }
}

/**
 * Analyze multiple designs in batch
 * @param {Array} images - Array of {url, buffer, mimeType} objects
 * @returns {Array} - Array of analysis results
 */
export async function analyzeDesignsBatch(images) {
  const results = [];

  for (const image of images) {
    try {
      const result = await analyzeDesign(image.url, image.buffer, image.mimeType);
      results.push(result);

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        title: '',
        tags: [],
        description: ''
      });
    }
  }

  return results;
}

export default {
  analyzeDesign,
  analyzeDesignsBatch
};
