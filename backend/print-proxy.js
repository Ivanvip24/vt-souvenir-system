/**
 * AXKAN Local Print Proxy
 *
 * Tiny server that runs on your Mac to send PDFs to the local printer.
 * The admin dashboard detects this and uses it for the "Imprimir" button.
 *
 * Usage:
 *   node print-proxy.js
 *
 * Listens on http://localhost:3001
 */

import express from 'express';
import cors from 'cors';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * GET /printers — list available system printers
 */
app.get('/printers', (req, res) => {
  try {
    const output = execFileSync('lpstat', ['-p'], { encoding: 'utf8', timeout: 5000 });
    let defaultPrinter = null;
    try {
      const defaultOutput = execFileSync('lpstat', ['-d'], { encoding: 'utf8', timeout: 5000 });
      const match = defaultOutput.match(/destination:\s*(.+)/);
      defaultPrinter = match ? match[1].trim() : null;
    } catch (_) {}

    const printers = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^printer\s+(\S+)\s+is\s+(.+)/);
      if (match) {
        printers.push({ name: match[1], status: match[2].trim(), isDefault: match[1] === defaultPrinter });
      }
    }

    res.json({ success: true, printers, defaultPrinter });
  } catch (error) {
    res.json({ success: true, printers: [], defaultPrinter: null, error: 'No printers found' });
  }
});

/**
 * POST /print — download PDFs from URLs and send to printer
 * Body: { urls: ["https://...pdf", ...], printer?: "PRINTER_NAME" }
 */
app.post('/print', async (req, res) => {
  try {
    const { urls, printer } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'urls array required' });
    }

    if (urls.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 per print job' });
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'axkan-print-'));
    let printed = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const filePath = join(tmpDir, `label-${i}.pdf`);
        writeFileSync(filePath, buffer);

        const args = [];
        if (printer) { args.push('-d', printer); }
        args.push(filePath);
        execFileSync('lp', args, { timeout: 10000 });

        printed++;
        try { unlinkSync(filePath); } catch (_) {}
      } catch (err) {
        failed++;
        errors.push({ url, error: err.message });
      }
    }

    try { rmdirSync(tmpDir); } catch (_) {}

    res.json({ success: true, printed, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /generate-pdf — download design images, run Python script, return PDF path
 * Body: { order_number, client_name, designs: [{ slot, image_url }] }
 */
app.post('/generate-pdf', async (req, res) => {
  try {
    const { order_number, client_name, designs } = req.body;

    if (!designs || !Array.isArray(designs) || designs.length === 0) {
      return res.status(400).json({ success: false, error: 'designs array required' });
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'axkan-order-'));

    // Download all design images from Cloudinary URLs
    const jsonData = {
      order_name: `${client_name || 'Order'} - ${order_number || 'Unknown'}`,
      instructions: '',
      designs: []
    };

    for (const design of designs) {
      if (!design.image_url) continue;

      try {
        const response = await fetch(design.image_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const ext = design.image_url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
        const filePath = join(tmpDir, `${design.slot}.${ext}`);
        writeFileSync(filePath, buffer);

        jsonData.designs.push({
          slot: design.slot,
          image_path: filePath
        });
      } catch (err) {
        console.error(`Failed to download ${design.slot}: ${err.message}`);
        jsonData.designs.push({ slot: design.slot });
      }
    }

    // Write JSON file for the Python script
    const jsonPath = join(tmpDir, 'order.json');
    writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

    // Find the Python script
    const scriptPaths = [
      '/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR/generate_axkan.py',
      '/Users/ivanvalenciaperez/Desktop/CLAUDE/READY/ORDERS_GENERATOR/generate_axkan.py'
    ];

    let scriptPath = null;
    for (const p of scriptPaths) {
      try {
        const { statSync } = await import('fs');
        statSync(p);
        scriptPath = p;
        break;
      } catch (_) {}
    }

    if (!scriptPath) {
      return res.status(500).json({ success: false, error: 'generate_axkan.py not found' });
    }

    // Run the Python script
    const { execFile } = await import('child_process');
    const result = await new Promise((resolve, reject) => {
      execFile('python3', [scriptPath, '--auto', jsonPath], {
        timeout: 60000,
        cwd: join(scriptPath, '..')
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('Python stderr:', stderr);
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });

    // Extract PDF path from stdout
    const pdfMatch = result.match(/PDF generated:\s*(.+)/);
    const pdfPath = pdfMatch ? pdfMatch[1].trim() : null;

    // Cleanup temp dir
    try {
      const { readdirSync } = await import('fs');
      for (const f of readdirSync(tmpDir)) {
        try { unlinkSync(join(tmpDir, f)); } catch (_) {}
      }
      rmdirSync(tmpDir);
    } catch (_) {}

    if (pdfPath) {
      res.json({ success: true, pdfPath });
    } else {
      res.json({ success: true, output: result, message: 'PDF generated but path not detected' });
    }

  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /health — check if proxy is alive
 */
app.get('/health', (req, res) => {
  res.json({ success: true, service: 'axkan-print-proxy' });
});

app.listen(PORT, () => {
  console.log(`\n🖨️  AXKAN Print Proxy running on http://localhost:${PORT}`);
  try {
    const output = execFileSync('lpstat', ['-d'], { encoding: 'utf8', timeout: 5000 });
    const match = output.match(/destination:\s*(.+)/);
    if (match) console.log(`📠 Default printer: ${match[1].trim()}`);
  } catch (_) {
    console.log('⚠️  No default printer found');
  }
  console.log('\nEndpoints:');
  console.log('  GET  /health   — check proxy status');
  console.log('  GET  /printers — list system printers');
  console.log('  POST /print    — send PDFs to printer');
  console.log('\nKeep this running while using the admin dashboard.\n');
});
