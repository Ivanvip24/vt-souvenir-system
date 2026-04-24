/**
 * AI Optimization Strategist (Layer 2).
 * Analyzes design parameters and recommends which patterns to prioritize.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';

const ALL_PATTERNS = ['grid', 'brick-wall', 'alternating-columns', 'mixed-zones', 'long-piece', 'tete-beche'];

const SYSTEM_PROMPT = `You are an optimization strategist for a 2D nesting system that arranges product pieces on 29.9×38.9cm print sheets.

Available nesting patterns:
1. "grid" — Exhaustive grid search (all col×row combos, 0° and 90°). Best general-purpose.
2. "brick-wall" — Offset every other row by half piece width. Good for wide pieces.
3. "alternating-columns" — Columns alternate 0°/90° rotation. Good for near-square pieces (AR 0.8-1.3).
4. "mixed-zones" — Split sheet into horizontal/vertical zones. Good for moderate aspect ratios (1.2-2.0).
5. "long-piece" — Normal columns + rotated overflow. ONLY useful when aspect ratio >= 1.3.
6. "tete-beche" — Alternating row flips (180°). Rows nest closer together when top/bottom profiles differ. Good for organic shapes. Always include alongside grid.

Rules:
- "grid" is always safe and should almost always be included.
- "long-piece" is ONLY for aspect ratio >= 1.3. Never for square pieces.
- For near-square (AR 0.8-1.2): grid + brick-wall are best. Skip long-piece.
- For elongated (AR > 2.0): long-piece + mixed-zones + grid.
- For moderate (AR 1.2-2.0): grid + mixed-zones + alternating-columns.
- Small pieces relative to sheet: grid alone usually suffices.
- Recommend 2-3 patterns, never just 1 (always include grid as safety).

Respond ONLY with JSON:
{"rankedPatterns":["pattern",...], "reasoning":"1 sentence why", "expectedUtilization":0.0-1.0}`;

/**
 * Get AI strategy recommendation for which patterns to try.
 */
export async function getStrategy({ pieceWidth, pieceHeight, productType, targetCount, sizeCategory }) {
  const aspectRatio = pieceWidth / pieceHeight;
  const fallback = { rankedPatterns: ALL_PATTERNS, reasoning: 'All patterns (AI unavailable).', expectedUtilization: null };

  // Fixed-layout products don't need pattern search
  if (productType === 'LIBRETA' || productType === 'PORTALLAVES') {
    return { rankedPatterns: [], reasoning: `${productType} uses fixed layout.`, expectedUtilization: null };
  }

  if (!isAIAvailable()) return fallback;

  const userMessage = `Piece: ${pieceWidth.toFixed(2)}×${pieceHeight.toFixed(2)}cm | AR: ${aspectRatio.toFixed(2)} | Product: ${productType} | Size: ${sizeCategory || 'N/A'} | Target: ${targetCount || 'maximize'}`;

  console.log('[AI-STRATEGIST] Requesting strategy...');
  const result = await askClaudeJSON(SYSTEM_PROMPT, userMessage);

  if (result?.rankedPatterns?.length > 0) {
    const valid = result.rankedPatterns.filter(p => ALL_PATTERNS.includes(p));
    if (valid.length > 0) {
      console.log(`[AI-STRATEGIST] Strategy: ${valid.join(' > ')} | ${result.reasoning}`);
      return { rankedPatterns: valid, reasoning: result.reasoning || '', expectedUtilization: result.expectedUtilization || null };
    }
  }

  console.log('[AI-STRATEGIST] No usable strategy. Using all patterns.');
  return fallback;
}
