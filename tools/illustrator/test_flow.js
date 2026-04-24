/**
 * Manual test of the full ARMADO flow — run each step and log results.
 * Usage: node test_flow.js
 */

import { parseCommand, validateCommand } from './src/cli/parser.js';
import { optimize } from './src/nesting/optimizer.js';
import * as bridge from './src/bridge/illustrator.js';

const TEST_FILE = '/Users/ivanvalenciaperez/Downloads/DELETE_TODAY/get-logo-whatsapp-png-pictures-1.png';
const TEST_COMMAND = 'llavero 35';

console.log('=== ARMADO AI - Manual Flow Test ===\n');

// Step 1: Parse command
console.log('STEP 1: Parsing command...');
try {
  const parsed = parseCommand(TEST_COMMAND);
  const validation = validateCommand(parsed);
  console.log('  Parsed:', JSON.stringify(parsed));
  console.log('  Valid:', validation.valid, validation.error || '');
  if (!validation.valid) {
    console.log('  STOPPED: Invalid command');
    process.exit(1);
  }
} catch (e) {
  console.log('  ERROR:', e.message);
  process.exit(1);
}

const parsed = parseCommand(TEST_COMMAND);

// Step 2: Check Illustrator
console.log('\nSTEP 2: Checking Illustrator...');
try {
  const aiCheck = bridge.checkIllustrator();
  console.log('  Ready:', aiCheck.ready);
  if (!aiCheck.ready) {
    console.log('  ERROR:', aiCheck.error);
    console.log('  STOPPED: Illustrator not running');
    process.exit(1);
  }
} catch (e) {
  console.log('  ERROR:', e.message);
  process.exit(1);
}

// Step 3: Open file and select
console.log('\nSTEP 3: Opening file in Illustrator...');
console.log('  File:', TEST_FILE);
try {
  const openResult = bridge.openAndSelect(TEST_FILE);
  console.log('  Result:', JSON.stringify(openResult));
} catch (e) {
  console.log('  ERROR:', e.message);
  console.log('  Stack:', e.stack?.substring(0, 300));
}

// Step 4: Extract design info
console.log('\nSTEP 4: Extracting design info...');
try {
  const designInfo = bridge.extractDesignInfo();
  console.log('  Result:', JSON.stringify(designInfo));

  if (!designInfo || designInfo.error) {
    console.log('  STOPPED:', designInfo?.error || 'null result');
    process.exit(1);
  }

  console.log(`  Design: ${designInfo.pieceWidth.toFixed(1)} x ${designInfo.pieceHeight.toFixed(1)} cm`);
  console.log(`  Has red lines: ${designInfo.hasRedLines}`);

  // Step 5: Optimize
  console.log('\nSTEP 5: Calculating optimal arrangement...');
  const result = optimize({
    pieceWidth: designInfo.pieceWidth,
    pieceHeight: designInfo.pieceHeight,
    productType: parsed.product,
    targetCount: parsed.count,
    sizeCategory: parsed.sizeCategory,
  });

  if (result.error) {
    console.log('  ERROR:', result.message);
    process.exit(1);
  }

  console.log(`  Total: ${result.summary.total} pieces`);
  console.log(`  Pattern: ${result.summary.pattern}`);
  console.log(`  Utilization: ${(result.summary.utilization * 100).toFixed(1)}%`);
  console.log(`  Placements: ${result.plan.placements?.length || 0}`);

} catch (e) {
  console.log('  ERROR:', e.message);
  console.log('  Stack:', e.stack?.substring(0, 500));
}

console.log('\n=== Test Complete ===');
bridge.cleanup();
