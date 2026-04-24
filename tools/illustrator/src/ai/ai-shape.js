/**
 * AI-powered shape analysis for safe overlap calculation.
 * Sends the cut line contour to Claude to determine how much
 * adjacent pieces can overlap without cut paths colliding.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';

const SHAPE_SYSTEM_PROMPT = `You are an expert in print production nesting optimization.

You receive the outline of a cut line (suaje) as normalized sample points [x, y] where:
- x: 0 = left edge, 100 = right edge of the bounding box
- y: 0 = top edge, 100 = bottom edge of the bounding box
- The points trace the cut line contour clockwise

You also receive shape metrics:
- fillRatio: shape area / bounding box area (1.0 = perfect rectangle, 0.785 = circle)
- topBottomRatio: width at top / width at bottom (>1 = wider top, <1 = wider bottom)
- widthCm, heightCm: actual dimensions

Your task: determine the MAXIMUM SAFE HORIZONTAL OVERLAP in centimeters.

Horizontal overlap means sliding two identical pieces closer together horizontally.
The overlap is safe if the actual cut line PATHS do not collide — only the BOUNDING BOXES overlap.

Key principles:
- Round shapes (circles, ovals) have significant empty corners — safe overlap can be 5-10% of width
- Shapes with concave sides allow even more overlap
- Rectangular shapes have almost no safe overlap (0-1%)
- Shapes wider at top and narrow at bottom (or vice versa) allow overlap when alternated (tête-bêche)
- The overlap must be conservative — if cut lines touch, the product is ruined
- Use 80% of the theoretical max as safety margin

Respond ONLY with JSON:
{"safeOverlapCm": number, "reasoning": "brief explanation"}`;

/**
 * Use AI to analyze cut line shape and determine safe horizontal overlap.
 * @param {Object} shapeInfo - Output from extract_shape.jsx
 * @returns {Object|null} { safeOverlapCm, reasoning } or null if AI unavailable
 */
export async function aiAnalyzeShape(shapeInfo) {
  if (!isAIAvailable() || !shapeInfo) return null;

  const userMessage = `Cut line shape analysis:
- Dimensions: ${shapeInfo.widthCm.toFixed(1)}cm × ${shapeInfo.heightCm.toFixed(1)}cm
- Fill ratio: ${shapeInfo.fillRatio.toFixed(3)} (${shapeInfo.fillRatio > 0.9 ? 'rectangular' : shapeInfo.fillRatio > 0.8 ? 'rounded' : 'circular/irregular'})
- Top/bottom width ratio: ${shapeInfo.topBottomRatio.toFixed(2)}
- Horizontal symmetry: ${shapeInfo.hSymmetry.toFixed(2)}
- Vertical symmetry: ${shapeInfo.vSymmetry.toFixed(2)}
- Anchor points: ${shapeInfo.pointCount}
- Sample outline points (x,y normalized 0-100): ${JSON.stringify(shapeInfo.samplePoints)}

What is the maximum safe horizontal overlap in centimeters?`;

  console.log('[AI-SHAPE] Sending shape data to Claude...');
  const result = await askClaudeJSON(SHAPE_SYSTEM_PROMPT, userMessage, 8000);

  if (result && typeof result.safeOverlapCm === 'number') {
    console.log(`[AI-SHAPE] AI overlap: ${result.safeOverlapCm.toFixed(2)}cm — ${result.reasoning}`);
    return result;
  }

  console.log('[AI-SHAPE] AI returned unusable result.');
  return null;
}
