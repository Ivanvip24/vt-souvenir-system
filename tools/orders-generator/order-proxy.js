/**
 * AXKAN Order Generator Local Proxy
 * Runs on localhost:3002 — receives order data from design portal,
 * runs generate_axkan.py, opens the PDF automatically.
 *
 * Start:  node order-proxy.js
 * Keep running in background while using the design portal.
 */

import http from 'http';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

const PORT = 3002;
const PYTHON_PATH = '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3';
const SCRIPT_PATH = '/Users/ivanvalenciaperez/Desktop/CLAUDE/READY/ORDERS_GENERATOR/generate_axkan.py';
const SCRIPT_DIR = '/Users/ivanvalenciaperez/Desktop/CLAUDE/READY/ORDERS_GENERATOR';

const server = http.createServer(async (req, res) => {
  // CORS headers for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        console.log(`\n[Order] Generating: ${payload.order_number || payload.order_id}`);

        // Write temp JSON
        const tmpFile = path.join(os.tmpdir(), `axkan-order-${Date.now()}.json`);
        await writeFile(tmpFile, JSON.stringify(payload, null, 2));

        // Run Python script
        execFile(PYTHON_PATH, [SCRIPT_PATH, '--auto', tmpFile], {
          cwd: SCRIPT_DIR,
          timeout: 120000
        }, async (error, stdout, stderr) => {
          // Cleanup
          try { await unlink(tmpFile); } catch (e) {}

          if (error) {
            console.error('[Error]', stderr || error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Generation failed', details: stderr || error.message }));
            return;
          }

          // Extract PDF path from stdout
          const match = stdout.match(/PDF generated: (.+)/);
          const pdfPath = match ? match[1].trim() : '';

          console.log('[OK] PDF:', pdfPath);

          // Open the PDF
          if (pdfPath) {
            execFile('open', [pdfPath], () => {});
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, pdfPath, output: stdout }));
        });
      } catch (e) {
        console.error('[Error]', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'axkan-order-proxy' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('AXKAN Order Generator Proxy');
  console.log(`Running on http://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('Waiting for orders from design portal...\n');
});
