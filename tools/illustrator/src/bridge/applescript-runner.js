/**
 * AppleScript runner - executes JSX scripts in Adobe Illustrator via osascript.
 * Data exchange happens through JSON temp files.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const INPUT_FILE = '/tmp/armado_input.json';
const OUTPUT_FILE = '/tmp/armado_output.json';

/**
 * Check if Adobe Illustrator is running.
 */
export function isIllustratorRunning() {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to name of processes'`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.includes('Adobe Illustrator');
  } catch {
    return false;
  }
}

/**
 * Execute a JSX script in Illustrator.
 * @param {string} jsxPath - Absolute path to .jsx file
 * @param {Object|null} inputData - Data to pass via /tmp/armado_input.json
 * @returns {Object|null} - Output from /tmp/armado_output.json
 */
export function runJSX(jsxPath, inputData = null) {
  const scriptName = jsxPath.split('/').pop();
  console.log(`\n[BRIDGE] ▶ Running JSX: ${scriptName}`);

  // Clean old output
  if (existsSync(OUTPUT_FILE)) unlinkSync(OUTPUT_FILE);

  // Write input data
  if (inputData) {
    writeFileSync(INPUT_FILE, JSON.stringify(inputData, null, 2));
    console.log(`[BRIDGE]   Input data written to ${INPUT_FILE}`);
    console.log(`[BRIDGE]   Input: ${JSON.stringify(inputData).substring(0, 200)}`);
  }

  // Build AppleScript — use #includepath + #include so @include directives resolve
  const escapedPath = jsxPath.replace(/'/g, "'\\''");
  const jsxDir = jsxPath.substring(0, jsxPath.lastIndexOf('/')).replace(/'/g, "'\\''");
  const jsxFile = jsxPath.substring(jsxPath.lastIndexOf('/') + 1);

  // Method 1: #includepath + #include (resolves @include relative paths)
  const includeScript = `tell application "Adobe Illustrator"
  activate
  do javascript "#includepath '${jsxDir}'" & return & "#include '${jsxFile}'"
end tell`;

  // Method 2: read POSIX file (fallback)
  const readScript = [
    'tell application "Adobe Illustrator"',
    '  activate',
    `  do javascript (read POSIX file "${escapedPath}")`,
    'end tell',
  ].join('\n');

  try {
    console.log(`[BRIDGE]   Executing via osascript (#include)...`);
    const stdout = execSync(`osascript -e '${includeScript.replace(/'/g, "'\\''")}'`, {
      timeout: 300000,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (stdout && stdout.trim()) console.log(`[BRIDGE]   stdout: ${stdout.trim()}`);
    console.log(`[BRIDGE]   ✓ Success`);
  } catch (error) {
    console.log(`[BRIDGE]   ✗ #include failed: ${error.stderr?.substring(0, 150) || error.message.substring(0, 150)}`);
    // Fallback: read POSIX file
    try {
      console.log(`[BRIDGE]   Trying fallback (read POSIX file)...`);
      execSync(`osascript -e '${readScript.replace(/'/g, "'\\''")}'`, {
        timeout: 300000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      console.log(`[BRIDGE]   ✓ Fallback succeeded`);
    } catch (altError) {
      console.log(`[BRIDGE]   ✗ Both methods failed`);
      if (altError.stderr) console.log(`[BRIDGE]   stderr: ${altError.stderr.substring(0, 200)}`);
      throw new Error(`Illustrator bridge error: ${altError.message}`);
    }
  }

  // Read output
  if (existsSync(OUTPUT_FILE)) {
    try {
      const content = readFileSync(OUTPUT_FILE, 'utf8');
      const parsed = JSON.parse(content);
      console.log(`[BRIDGE]   Output: ${JSON.stringify(parsed).substring(0, 300)}`);
      return parsed;
    } catch (parseErr) {
      console.log(`[BRIDGE]   ✗ Failed to parse output JSON: ${parseErr.message}`);
      return null;
    }
  }

  console.log(`[BRIDGE]   ⚠ No output file found at ${OUTPUT_FILE}`);
  return null;
}

/**
 * Clean up temp files.
 */
export function cleanup() {
  for (const f of [INPUT_FILE, OUTPUT_FILE]) {
    if (existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }
}
