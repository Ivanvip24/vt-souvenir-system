/**
 * Import Clients to Production API
 * Reads a CSV file and sends clients to the production API
 *
 * Usage: node backend/scripts/import-clients-to-api.js /path/to/file.csv
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';

const API_BASE = 'https://vt-souvenir-backend.onrender.com';

// You need to get a valid admin token first by logging in
// This token should be passed as an environment variable
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function importClients(csvPath) {
  if (!ADMIN_TOKEN) {
    console.error('❌ ADMIN_TOKEN not set.');
    console.log('\nTo get a token:');
    console.log('1. Login to admin dashboard');
    console.log('2. Open browser DevTools > Application > Local Storage');
    console.log('3. Copy the admin_token value');
    console.log('4. Run: ADMIN_TOKEN="your-token" node backend/scripts/import-clients-to-api.js /path/to/file.csv');
    process.exit(1);
  }

  console.log('📦 Reading CSV file...');

  // Read and parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true
  });

  console.log(`📋 Found ${records.length} records in CSV\n`);

  // Transform CSV records to API format
  const clients = records.map(record => ({
    name: record['Nombre Completo'],
    street: record['Calle'],
    colonia: record['Colonia '] || record['Colonia'],
    email: record['Correo electrónico / Mail'],
    postalCode: record['Código Postal'],
    destination: record['Nombre del destino '] || record['Nombre del destino'],
    streetNumber: record['Número exterior '] || record['Número exterior'],
    references: record['Referencias'],
    phone: record['Teléfono '] || record['Teléfono']
  }));

  console.log(`🚀 Sending ${clients.length} clients to API...`);

  // Send to API in batches of 50
  const batchSize = 50;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    console.log(`\n📤 Sending batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(clients.length/batchSize)} (${batch.length} clients)...`);

    try {
      const response = await fetch(`${API_BASE}/api/admin/import-clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({ clients: batch })
      });

      const result = await response.json();

      if (result.success) {
        totalImported += result.imported;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        console.log(`   ✅ Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
      } else {
        console.error(`   ❌ Batch failed: ${result.error}`);
        totalErrors += batch.length;
      }
    } catch (error) {
      console.error(`   ❌ Request failed: ${error.message}`);
      totalErrors += batch.length;
    }

    // Small delay between batches
    if (i + batchSize < clients.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Final Import Summary:`);
  console.log(`   ✅ Imported: ${totalImported}`);
  console.log(`   ⏭️  Skipped:  ${totalSkipped}`);
  console.log(`   ❌ Errors:   ${totalErrors}`);
  console.log('='.repeat(50));

  return { totalImported, totalSkipped, totalErrors };
}

// Get CSV path from command line
const csvPath = process.argv[2] || '/Users/ivanvalencia/Downloads/Delivery Form 17181b8c4429802e8ce7e30bd2ec3cba_all.csv';

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

importClients(csvPath)
  .then(result => {
    console.log('\n✅ Import completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
