/**
 * Seed biweekly employee bonus reminders
 *
 * Creates two recurring reminders starting Feb 20, 2026:
 * - $250 MXN for Punctuality (Puntualidad)
 * - $250 MXN for Productivity (Productividad)
 * Both repeat every 2 weeks (biweekly)
 */

// Force SSL for Render.com hosted database
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import { query, testConnection, closePool } from '../shared/database.js';

async function seedBonusReminders() {
  console.log('Seeding biweekly bonus reminders...\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database.');
    process.exit(1);
  }

  try {
    // Create the calendar_reminders table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS calendar_reminders (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        amount DECIMAL(10, 2),
        color VARCHAR(20) DEFAULT '#e72a88',
        icon VARCHAR(10) DEFAULT '🔔',
        recurrence_type VARCHAR(20) NOT NULL DEFAULT 'once',
        start_date DATE NOT NULL,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reminder_completions (
        id SERIAL PRIMARY KEY,
        reminder_id INTEGER REFERENCES calendar_reminders(id) ON DELETE CASCADE,
        occurrence_date DATE NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        UNIQUE(reminder_id, occurrence_date)
      );
    `);

    console.log('Tables created/verified.\n');

    // Check if bonus reminders already exist
    const existing = await query(`
      SELECT id FROM calendar_reminders WHERE category = 'bonus' AND is_active = true
    `);

    if (existing.rows.length > 0) {
      console.log(`Found ${existing.rows.length} existing bonus reminder(s). Skipping seed.`);
      console.log('To re-seed, first delete existing reminders:');
      console.log('  DELETE FROM calendar_reminders WHERE category = \'bonus\';');
    } else {
      // Insert punctuality bonus reminder
      const r1 = await query(`
        INSERT INTO calendar_reminders (title, description, category, amount, color, icon, recurrence_type, start_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, title
      `, [
        'Bono de Puntualidad',
        'Bono quincenal de puntualidad para empleados - $250 MXN por persona',
        'bonus',
        250.00,
        '#22c55e',
        '⏰',
        'biweekly',
        '2026-02-20'
      ]);

      // Insert productivity bonus reminder
      const r2 = await query(`
        INSERT INTO calendar_reminders (title, description, category, amount, color, icon, recurrence_type, start_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, title
      `, [
        'Bono de Productividad',
        'Bono quincenal de productividad para empleados - $250 MXN por persona',
        'bonus',
        250.00,
        '#e72a88',
        '🎯',
        'biweekly',
        '2026-02-20'
      ]);

      console.log(`Created: [${r1.rows[0].id}] ${r1.rows[0].title}`);
      console.log(`Created: [${r2.rows[0].id}] ${r2.rows[0].title}`);
      console.log('\nBiweekly bonus reminders will appear on:');
      console.log('  Feb 20, Mar 6, Mar 20, Apr 3, Apr 17, May 1, ...');
      console.log('  (Every 14 days from Feb 20, 2026)');
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Error seeding reminders:', error);
    throw error;
  } finally {
    await closePool();
  }
}

seedBonusReminders().catch(console.error);
