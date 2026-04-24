/**
 * Sales Learning Engine — API calls removed to stop cost drain.
 *
 * Analysis now runs via Claude Code LaunchAgent (com.axkan.nightly-learning).
 * Script: node backend/scripts/nightly-learning-local.js [fetch-patterns|fetch-lost|store]
 *
 * Only buildDynamicPromptSection() is kept — it reads from DB, no API calls.
 */

import { query } from '../shared/database.js';
import { logError } from '../shared/logger.js';

// No-op stubs — analysis now runs via Claude Code LaunchAgent
export async function learnFromOrder() {}
export async function detectCorrection() {}
export async function nightlyPatternAnalysis() {}
export async function learnFromLostDeals() {}

export async function buildDynamicPromptSection() {
  try {
    const learnings = await query(`
      SELECT type, insight FROM sales_learnings
      WHERE applied = true
      ORDER BY times_validated DESC, confidence DESC, created_at DESC
      LIMIT 45
    `);

    let section = `\n\n## PATRONES DE IVAN QUE CIERRAN VENTAS (PROBADOS):
- Ivan cerró venta de $4,000 con mensajes de 1-2 líneas. Mensajes largos NO venden.
- Nunca preguntes "¿en qué te puedo ayudar?" — da precio directo si preguntan por producto.
- Cuando dicen cantidad + producto → precio total + liga. Sin más preguntas.
- "Son $8,800 con todo incluido" cierra mejor que desglosar precio unitario + envío + diseño por separado.
- Urgencia real: "Si confirmas hoy, te entregamos antes de Semana Santa" (usa la temporada actual).
- Nunca digas "Me avisas" o "Tómate tu tiempo" — asume que van a comprar.
- Cross-sell natural: "La mayoría pide imanes + llaveros, ¿te agrego unos llaveros también?"
`;

    const patterns = learnings.rows.filter(l => l.type === 'pattern_insight');
    const corrections = learnings.rows.filter(l => l.type === 'correction');
    const closings = learnings.rows.filter(l => l.type === 'closing_pattern');
    const lostDeals = learnings.rows.filter(l => l.type === 'lost_deal');

    if (lostDeals.length > 0) {
      section += '\n### ERRORES QUE PERDIERON VENTAS (NUNCA repetir):\n';
      lostDeals.slice(0, 15).forEach(l => { section += '- ' + l.insight + '\n'; });
    }

    if (patterns.length > 0) {
      section += '\n### Patrones aprendidos:\n';
      patterns.slice(0, 15).forEach(p => { section += '- ' + p.insight + '\n'; });
    }

    if (corrections.length > 0) {
      section += '\n### Correcciones de Ivan:\n';
      corrections.slice(0, 15).forEach(c => { section += '- ' + c.insight + '\n'; });
    }

    if (closings.length > 0) {
      section += '\n### Técnicas de cierre:\n';
      closings.slice(0, 15).forEach(c => { section += '- ' + c.insight + '\n'; });
    }

    return section;
  } catch (error) {
    logError('sales_learning.prompt_error', error);
    return '';
  }
}
