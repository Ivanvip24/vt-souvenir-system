/**
 * AI Shape Analyzer (Layer 5).
 * Analyzes the silhouette shape after PREPARACION to determine
 * optimal arrangement: rotation, flip strategy, and vertical nesting.
 * NOTE: Horizontal overlap is now measured by Pathfinder test_overlap.jsx,
 * so this analyzer only handles flip/rotation/vertical nesting recommendations.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';

const SYSTEM_PROMPT = `You are a 2D nesting expert analyzing a laser-cut silhouette shape for optimal arrangement on a 29.9x38.9cm print sheet.

CONTEXT:
- Each piece has a red cut line ("suaje") that follows the silhouette shape
- Pieces are arranged in a grid on the sheet
- Cut lines MUST NEVER overlap — this ruins the product
- The black background ("rebase") extends beyond the cut line and CAN overlap
- Horizontal overlap is measured separately by Pathfinder — you do NOT need to estimate it
- Goal: maximize piece size while fitting the required count

YOU RECEIVE:
- samplePoints: the actual cut line outline as [x,y] coordinates normalized to 0-100 (0,0=top-left, 100,100=bottom-right of bounding box)
- fillRatio: shape area / bounding box area
- widthCm, heightCm: bounding box size
- topBottomRatio, hSymmetry, vSymmetry: shape metrics

YOUR TASK:
Look at the samplePoints carefully. These show the ACTUAL shape outline. Analyze:

1. **flipRows**: Should alternating rows be flipped 180°? Helps when top and bottom profiles are different (one concave, one convex) so pieces interlock.

2. **verticalNestingCm**: When alternating rows are flipped 180°, how much can the vertical row spacing be reduced?
   - Look at the TOP edge profile (points near y=0) and BOTTOM edge profile (points near y=100).
   - If the top is narrow/pointy and bottom is wide/flat (or vice versa), the flipped piece's profile complements it, allowing rows to be closer.
   - Measure the gap between the shape edge and the bounding box at top/bottom. The nesting reduction = how much those profiles can interlock.
   - Example: if top profile only reaches y=5 at the narrowest part, that's ~5% of height = 0.37cm for a 7.5cm piece.
   - Be conservative. If profiles look similar top and bottom, use 0.
   - Max: 15% of piece height.

3. **rotation**: 0 or 90. Only suggest 90 if the rotated shape clearly packs better.

Respond ONLY with JSON:
{"flipRows":boolean,"rotation":0|90,"verticalNestingCm":number,"reasoning":"Describe what you see in the shape outline and why you chose these values"}`;

/**
 * Analyze the shape and return arrangement recommendations.
 * @param {Object} shapeData - From extract_shape.jsx
 * @returns {{ flipRows: boolean, rotation: number, verticalNestingCm: number, reasoning: string }}
 */
export async function analyzeShape(shapeData) {
  // Calculate fallback using formula
  const fillRatio = shapeData.fillRatio || 0.8;
  const widthCm = shapeData.widthCm || 7.0;
  const vSym = shapeData.vSymmetry || 0.9;
  const tbRatio = shapeData.topBottomRatio || 1.0;

  const shouldFlip = vSym < 0.85 || Math.abs(tbRatio - 1.0) > 0.15;
  const heightCm = shapeData.heightCm || 7.0;
  const tbDiff = Math.abs(tbRatio - 1.0);
  const formulaNesting = Math.min(heightCm * 0.15, heightCm * tbDiff * 0.3 * (1 - fillRatio));

  const fallback = {
    flipRows: shouldFlip,
    rotation: 0,
    verticalNestingCm: Math.round(formulaNesting * 100) / 100,
    reasoning: `Fallback: fillRatio=${fillRatio.toFixed(2)}, nesting=${formulaNesting.toFixed(2)}cm (AI unavailable).`,
  };

  if (!isAIAvailable()) {
    console.log(`[AI-SHAPE] Using formula fallback: flip=${fallback.flipRows}, nesting=${fallback.verticalNestingCm}cm`);
    return fallback;
  }

  const userMessage = `Shape analysis:
- Dimensions: ${shapeData.widthCm.toFixed(2)} × ${shapeData.heightCm.toFixed(2)} cm
- Fill ratio: ${fillRatio.toFixed(3)} (${fillRatio > 0.9 ? 'near-rectangular' : fillRatio > 0.7 ? 'organic' : 'very irregular'})
- Top/bottom width ratio: ${tbRatio.toFixed(2)} (${Math.abs(tbRatio - 1.0) < 0.1 ? 'symmetric' : tbRatio > 1 ? 'wider top' : 'narrower top'})
- Horizontal symmetry: ${shapeData.hSymmetry.toFixed(2)}
- Vertical symmetry: ${vSym.toFixed(2)}
- Point count: ${shapeData.pointCount}
- Sample outline: ${JSON.stringify(shapeData.samplePoints)}`;

  console.log('[AI-SHAPE] Analyzing shape...');
  const result = await askClaudeJSON(SYSTEM_PROMPT, userMessage);

  if (result && typeof result.flipRows === 'boolean') {
    // Validate and cap
    result.flipRows = !!result.flipRows;
    result.rotation = result.rotation === 90 ? 90 : 0;
    result.verticalNestingCm = Math.min(heightCm * 0.15, Math.max(0, result.verticalNestingCm || 0));
    result.verticalNestingCm = Math.round(result.verticalNestingCm * 100) / 100;

    console.log(`[AI-SHAPE] Recommendation: flip=${result.flipRows}, nesting=${result.verticalNestingCm}cm, rotation=${result.rotation}°`);
    console.log(`[AI-SHAPE] Reasoning: ${result.reasoning}`);
    return result;
  }

  console.log('[AI-SHAPE] AI returned unusable result. Using formula fallback.');
  return fallback;
}
