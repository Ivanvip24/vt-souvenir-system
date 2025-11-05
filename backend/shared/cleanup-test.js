import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function cleanup() {
  await query("DELETE FROM material_transactions WHERE notes = 'Test purchase for sync verification'");
  console.log('✅ Test transactions deleted');
  process.exit(0);
}

cleanup();
