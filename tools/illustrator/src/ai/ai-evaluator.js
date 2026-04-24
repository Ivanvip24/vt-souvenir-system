/**
 * AI Result Evaluator (Layer 3).
 * Evaluates nesting candidates and picks the best one with a Spanish explanation.
 * Falls back to highest-utilization algorithmic pick.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';

const SYSTEM_PROMPT = `You are a print production quality evaluator for AXKAN, a Mexican souvenir company.
You evaluate nesting arrangements that place product pieces on 29.9x38.9cm print sheets.

You will receive the top candidates (arrangements) with their metrics.
Pick the BEST arrangement considering:
1. Utilization (higher = less waste)
2. Pattern quality (grid is most reliable, brick-wall is compact)
3. Whether it meets the target count exactly
4. Visual balance (fewer zones/rotations = cleaner cuts)

Respond ONLY with JSON:
{"selectedIndex":0,"explanation":"1-2 sentences in Spanish explaining why this arrangement is best for the operator","qualityRating":"excelente"|"bueno"|"aceptable"}

Rules for explanation:
- Write in natural Spanish, as if talking to a print operator
- Mention the key advantage (e.g., "mejor aprovechamiento", "corte más limpio")
- Keep it under 2 sentences
- Use AXKAN brand voice: confident, professional, not overly formal`;

/**
 * Evaluate candidates and pick the best one.
 * @param {Array} candidates - Top arrangement candidates from optimizer
 * @param {number} targetCount - Desired piece count
 * @param {string} productType - Product type
 * @returns {Object} { selectedIndex, explanation, qualityRating }
 */
export async function evaluateResults(candidates, targetCount, productType) {
  const fallback = pickBestAlgorithmic(candidates, targetCount);

  if (!candidates || candidates.length === 0) {
    return fallback;
  }

  if (candidates.length === 1) {
    return {
      selectedIndex: 0,
      explanation: fallback.explanation,
      qualityRating: fallback.qualityRating,
    };
  }

  if (!isAIAvailable()) return fallback;

  const candidateSummaries = candidates.slice(0, 5).map((c, i) => ({
    index: i,
    total: c.total,
    pattern: c.description,
    utilization: c.utilization ? `${(c.utilization * 100).toFixed(1)}%` : 'N/A',
    rotations: c.placements?.filter(p => p.rotation !== 0).length || 0,
    zones: c.zones || 1,
  }));

  const userMessage = `Product: ${productType} | Target: ${targetCount || 'maximize'}
Candidates:
${JSON.stringify(candidateSummaries, null, 2)}`;

  console.log('[AI-EVALUATOR] Evaluating candidates...');
  const result = await askClaudeJSON(SYSTEM_PROMPT, userMessage);

  if (result && typeof result.selectedIndex === 'number' && result.selectedIndex < candidates.length) {
    console.log(`[AI-EVALUATOR] Selected #${result.selectedIndex}: ${result.explanation}`);
    return {
      selectedIndex: result.selectedIndex,
      explanation: result.explanation || fallback.explanation,
      qualityRating: result.qualityRating || fallback.qualityRating,
    };
  }

  console.log('[AI-EVALUATOR] No usable evaluation. Using algorithmic pick.');
  return fallback;
}

function pickBestAlgorithmic(candidates, targetCount) {
  if (!candidates || candidates.length === 0) {
    return { selectedIndex: 0, explanation: 'Arreglo calculado algoritmicamente.', qualityRating: 'bueno' };
  }

  // Pick candidate with highest utilization that meets target
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let score = (c.utilization || 0) * 100;

    // Bonus for meeting exact target
    if (targetCount && c.total === targetCount) score += 10;

    // Slight penalty for many rotations (less clean cuts)
    const rotations = c.placements?.filter(p => p.rotation !== 0).length || 0;
    if (rotations > 0) score -= 1;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const best = candidates[bestIdx];
  const util = best.utilization ? `${(best.utilization * 100).toFixed(0)}%` : '';
  const qualityRating = (best.utilization || 0) > 0.8 ? 'excelente' : (best.utilization || 0) > 0.6 ? 'bueno' : 'aceptable';

  return {
    selectedIndex: bestIdx,
    explanation: `Se selecciono ${best.description || 'el mejor arreglo'} con ${best.total} piezas${util ? ` y ${util} de aprovechamiento` : ''}.`,
    qualityRating,
  };
}
