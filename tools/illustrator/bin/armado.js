#!/usr/bin/env node

/**
 * ARMADO AI - CLI entry point.
 * Usage: armado llavero 35
 *        armado imanes mega 12
 *        armado libreta 8
 */

import { parseCommand, validateCommand } from '../src/cli/parser.js';
import { optimize } from '../src/nesting/optimizer.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('ARMADO AI - Smart Arrangement System');
  console.log('');
  console.log('Usage: armado <product> [size] [count]');
  console.log('');
  console.log('Examples:');
  console.log('  armado llavero 35      # 35 keychains');
  console.log('  armado imanes mega 12  # 12 mega magnets');
  console.log('  armado libreta 8       # 8 notebooks');
  console.log('  armado destapador      # max bottle openers');
  console.log('  armado portallaves     # 4 key holders + bars');
  console.log('');
  console.log('Or run: npm start   (to open the desktop app)');
  process.exit(0);
}

const command = args.join(' ');
const parsed = parseCommand(command);
const validation = validateCommand(parsed);

if (!validation.valid) {
  console.error('Error:', validation.error);
  process.exit(1);
}

console.log(`Product: ${parsed.product}`);
if (parsed.sizeCategory) console.log(`Size: ${parsed.sizeCategory}`);
if (parsed.count) console.log(`Target: ${parsed.count} pieces`);

// For CLI mode, we'd need a design width/height.
// This requires Illustrator bridge which is in the Electron app.
console.log('');
console.log('Note: For full execution, use the desktop app (npm start).');
console.log('The CLI shows the parsed command. The Electron app handles Illustrator communication.');
