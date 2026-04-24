/**
 * Import Clients from CSV
 * Imports clients from a Notion delivery form export
 *
 * Usage:
 *   Local (with .env):  node backend/migrations/import-clients-csv.js /path/to/file.csv
 *   Remote API:         POST /api/admin/import-clients with CSV data
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

// Direct connection for migration script
let pool;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.error('❌ DATABASE_URL not set. Please set it in your environment.');
  console.log('\nTo run this migration:');
  console.log('1. Get your DATABASE_URL from Render dashboard');
  console.log('2. Run: DATABASE_URL="your-url-here" node backend/migrations/import-clients-csv.js');
  process.exit(1);
}

async function query(text, params) {
  return pool.query(text, params);
}

// Mexican states for matching
const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Coahuila', 'Colima', 'CDMX', 'Ciudad de México', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'Estado de México', 'México', 'Michoacán', 'Morelos',
  'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

/**
 * Parse destination to extract city and state
 */
function parseDestination(destination) {
  if (!destination) return { city: null, state: null };

  // Clean up the string
  const clean = destination.trim();

  // Try to find state match
  let foundState = null;
  for (const state of MEXICAN_STATES) {
    if (clean.toLowerCase().includes(state.toLowerCase())) {
      foundState = state;
      break;
    }
  }

  // Extract city (usually the first part before comma or state)
  let city = null;
  const parts = clean.split(/[,\/\-]/);
  if (parts.length > 0) {
    city = parts[0].trim();
    // If city contains state name, try next part
    if (foundState && city.toLowerCase().includes(foundState.toLowerCase()) && parts.length > 1) {
      city = parts[1].trim();
    }
  }

  // Clean up city name
  if (city) {
    city = city.replace(/\s+/g, ' ').trim();
    // Remove common prefixes
    city = city.replace(/^(Ciudad de|Cd\.|CD\.?)\s*/i, '');
  }

  return { city, state: foundState };
}

/**
 * Normalize phone number
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  // If starts with 52, remove it (Mexico country code)
  if (digits.startsWith('52') && digits.length > 10) {
    digits = digits.slice(2);
  }
  // Return last 10 digits
  return digits.slice(-10) || null;
}

/**
 * Main import function
 */
async function importClients(csvPath) {
  console.log('📦 Starting client import from CSV...\n');

  // Read and parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true
  });

  console.log(`📋 Found ${records.length} records in CSV\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of records) {
    try {
      // Extract data from CSV columns
      const name = record['Nombre Completo']?.trim();
      const street = record['Calle']?.trim();
      const colonia = record['Colonia ']?.trim() || record['Colonia']?.trim();
      const email = record['Correo electrónico / Mail']?.trim();
      const postalCode = record['Código Postal']?.trim();
      const destination = record['Nombre del destino ']?.trim() || record['Nombre del destino']?.trim();
      const streetNumber = record['Número exterior ']?.trim() || record['Número exterior']?.trim();
      const references = record['Referencias']?.trim();
      const phone = normalizePhone(record['Teléfono '] || record['Teléfono']);

      // Skip if no name
      if (!name) {
        console.log(`⚠️  Skipping row - no name`);
        skipped++;
        continue;
      }

      // Parse destination for city/state
      const { city, state } = parseDestination(destination);

      // Build full address for legacy field
      const addressParts = [];
      if (street) addressParts.push(street);
      if (streetNumber && streetNumber !== '0') addressParts.push(`#${streetNumber}`);
      if (colonia) addressParts.push(`Col. ${colonia}`);
      const fullAddress = addressParts.join(', ') || null;

      // Check if client already exists by phone
      if (phone) {
        const existing = await query(
          'SELECT id, name FROM clients WHERE phone = $1',
          [phone]
        );

        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipping "${name}" - phone ${phone} already exists (${existing.rows[0].name})`);
          skipped++;
          continue;
        }
      }

      // Check if client exists by exact name and postal code
      const existingByName = await query(
        'SELECT id FROM clients WHERE LOWER(name) = LOWER($1) AND postal = $2',
        [name, postalCode]
      );

      if (existingByName.rows.length > 0) {
        console.log(`⏭️  Skipping "${name}" - already exists with same postal code`);
        skipped++;
        continue;
      }

      // Insert new client
      await query(
        `INSERT INTO clients (name, phone, email, address, street, street_number, colonia, city, state, postal, reference_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          name,
          phone,
          email || null,
          fullAddress,
          street || null,
          (streetNumber && streetNumber !== '0') ? streetNumber : null,
          colonia || null,
          city || null,
          state || null,
          postalCode || null,
          references || null
        ]
      );

      console.log(`✅ Imported: ${name} (${city || 'N/A'}, ${state || 'N/A'})`);
      imported++;

    } catch (error) {
      console.error(`❌ Error importing row:`, error.message);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Import Summary:`);
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped:  ${skipped}`);
  console.log(`   ❌ Errors:   ${errors}`);
  console.log('='.repeat(50));

  return { imported, skipped, errors };
}

// Run the import
const csvPath = process.argv[2] || '/Users/ivanvalencia/Downloads/Delivery Form 17181b8c4429802e8ce7e30bd2ec3cba_all.csv';

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

importClients(csvPath)
  .then(async result => {
    console.log('\n✅ Import completed!');
    await pool.end();
    process.exit(0);
  })
  .catch(async error => {
    console.error('\n❌ Import failed:', error);
    await pool.end();
    process.exit(1);
  });
