/**
 * FULL end-to-end test — all steps including PREPARACION + ARMADO.
 */

import { parseCommand, validateCommand } from './src/cli/parser.js';
import { optimize } from './src/nesting/optimizer.js';
import { PRODUCTS } from './src/nesting/constants.js';
import * as bridge from './src/bridge/illustrator.js';
import path from 'path';

const TEST_FILE = '/Users/ivanvalenciaperez/Downloads/DELETE_TODAY/get-logo-whatsapp-png-pictures-1.png';
const TEST_COMMAND = 'llavero';

console.log('=== ARMADO AI — FULL END-TO-END TEST ===');
console.log(`File: ${path.basename(TEST_FILE)}`);
console.log(`Command: "${TEST_COMMAND}"\n`);

try {
  // Step 1: Parse
  console.log('STEP 1: Parse command');
  const parsed = parseCommand(TEST_COMMAND);
  const validation = validateCommand(parsed);
  console.log(`  → Product: ${parsed.product} | Count: ${parsed.count || 'max'}`);
  if (!validation.valid) throw new Error(`Parse error: ${validation.error}`);
  console.log('  ✓ OK\n');

  // Step 2: Check Illustrator
  console.log('STEP 2: Check Illustrator');
  const aiCheck = bridge.checkIllustrator();
  if (!aiCheck.ready) throw new Error(aiCheck.error);
  console.log('  ✓ Illustrator running\n');

  // Step 3: Open file
  console.log('STEP 3: Open file in Illustrator');
  const openResult = bridge.openAndSelect(TEST_FILE);
  console.log(`  → ${openResult?.documentName} (${openResult?.itemCount} items)`);
  console.log('  ✓ File opened and selected\n');

  // Step 4: Extract design info (BEFORE preparation)
  console.log('STEP 4: Extract design info');
  let designInfo = bridge.extractDesignInfo();
  if (!designInfo || designInfo.error) throw new Error(designInfo?.error || 'null result');
  console.log(`  → Size: ${designInfo.pieceWidth.toFixed(1)} x ${designInfo.pieceHeight.toFixed(1)} cm`);
  console.log(`  → Has red lines: ${designInfo.hasRedLines}`);
  console.log('  ✓ Design info extracted\n');

  // Step 5: PREPARACION (if no red cut lines)
  if (!designInfo.hasRedLines) {
    console.log('STEP 5: PREPARACION (creating silhouette + cut lines)');
    console.log('  → No red lines found, running preparation...');
    const prepResult = bridge.runPreparacion();
    console.log(`  → Prep result: ${JSON.stringify(prepResult)}`);
    if (prepResult?.error) throw new Error(prepResult.error);
    console.log('  ✓ Preparation complete\n');

    // Re-extract design info after preparation
    console.log('STEP 5b: Re-extract design info (after preparation)');
    designInfo = bridge.extractDesignInfo();
    if (!designInfo || designInfo.error) throw new Error(designInfo?.error || 'null result after prep');
    console.log(`  → Size: ${designInfo.pieceWidth.toFixed(1)} x ${designInfo.pieceHeight.toFixed(1)} cm`);
    console.log(`  → Has red lines: ${designInfo.hasRedLines}`);
    console.log(`  → Selection count: ${designInfo.selectionCount}`);
    console.log('  ✓ Design re-extracted\n');
  } else {
    console.log('STEP 5: PREPARACION skipped (red lines already present)\n');
  }

  // Step 6: Calculate optimal arrangement
  console.log('STEP 6: Calculate optimal arrangement');
  const result = optimize({
    pieceWidth: designInfo.pieceWidth,
    pieceHeight: designInfo.pieceHeight,
    productType: parsed.product,
    targetCount: parsed.count,
    sizeCategory: parsed.sizeCategory,
  });
  if (result.error) throw new Error(result.message);
  console.log(`  → Total: ${result.summary.total} pieces`);
  console.log(`  → Pattern: ${result.summary.pattern}`);
  console.log(`  → Utilization: ${(result.summary.utilization * 100).toFixed(1)}%`);
  console.log('  ✓ Arrangement calculated\n');

  // Step 7: Execute ARMADO in Illustrator
  console.log('STEP 7: Execute ARMADO in Illustrator');
  if (parsed.product === 'LIBRETA') {
    const scaleW = PRODUCTS.LIBRETA.pieceWidth / designInfo.pieceWidth;
    const scaleH = PRODUCTS.LIBRETA.pieceHeight / designInfo.pieceHeight;
    result.plan.scaleFactor = Math.min(scaleW, scaleH);
  }
  const execResult = bridge.executeArmado(result.plan);
  console.log(`  → Result: ${JSON.stringify(execResult)?.substring(0, 200)}`);
  if (execResult?.error) throw new Error(execResult.error);
  console.log('  ✓ Arrangement executed\n');

  // Done
  console.log('========================================');
  console.log('✓ FULL WORKFLOW COMPLETE!');
  console.log(`  ${result.summary.total} ${parsed.product}`);
  console.log(`  ${designInfo.pieceWidth.toFixed(1)} x ${designInfo.pieceHeight.toFixed(1)} cm each`);
  console.log(`  Pattern: ${result.summary.pattern}`);
  console.log(`  Utilization: ${(result.summary.utilization * 100).toFixed(1)}%`);
  console.log('========================================');

} catch (e) {
  console.log(`\n✗ FAILED at: ${e.message}`);
  console.log(`  Stack: ${e.stack?.substring(0, 500)}`);
}

bridge.cleanup();
