import { query } from '../shared/database.js';

export async function addProductionTrackingLogs() {
  console.log('🔄 Creating production_workers + production_daily_logs tables...');

  await query(`
    CREATE TABLE IF NOT EXISTS production_workers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      nickname VARCHAR(50),
      phone VARCHAR(20),
      weekly_pay NUMERIC(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS production_daily_logs (
      id SERIAL PRIMARY KEY,
      worker_id INTEGER NOT NULL REFERENCES production_workers(id),
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      imanes_medianos INTEGER NOT NULL DEFAULT 0,
      llaveros INTEGER NOT NULL DEFAULT 0,
      destapadores INTEGER NOT NULL DEFAULT 0,
      imanes_3d INTEGER NOT NULL DEFAULT 0,
      portallaves INTEGER NOT NULL DEFAULT 0,
      portaretratos INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(worker_id, log_date)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_prod_logs_worker_date
    ON production_daily_logs(worker_id, log_date DESC)
  `);

  // Seed production workers
  const workers = [
    ['Alicia', 'ALICE', 2800],
    ['Luz', 'LUZ', 2300],
    ['Bony', 'BONY', null],
    ['Ale', 'ALE', null],
    ['Maribel', 'MARIBEL', null]
  ];

  for (const [name, nickname, pay] of workers) {
    await query(`
      INSERT INTO production_workers (name, nickname, weekly_pay)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [name, nickname, pay]);
  }

  // Seed historical data from the Apr 6-10 CSV analysis
  const historicalData = [
    ['2026-04-06', 'ALICE', 635, 0, 17, 0, 0, 0],
    ['2026-04-06', 'LUZ', 608, 0, 44, 0, 0, 0],
    ['2026-04-06', 'BONY', 685, 0, 25, 0, 0, 0],
    ['2026-04-06', 'ALE', 0, 0, 0, 0, 0, 0],
    ['2026-04-06', 'MARIBEL', 172, 0, 0, 0, 0, 0],
    ['2026-04-07', 'ALICE', 307, 100, 212, 154, 0, 0],
    ['2026-04-07', 'LUZ', 397, 0, 94, 93, 0, 0],
    ['2026-04-07', 'BONY', 0, 0, 199, 146, 0, 0],
    ['2026-04-07', 'ALE', 0, 0, 0, 0, 0, 0],
    ['2026-04-07', 'MARIBEL', 360, 0, 0, 0, 0, 0],
    ['2026-04-08', 'ALICE', 901, 87, 0, 22, 0, 0],
    ['2026-04-08', 'LUZ', 453, 237, 0, 93, 0, 0],
    ['2026-04-08', 'BONY', 499, 200, 0, 13, 0, 0],
    ['2026-04-08', 'ALE', 541, 346, 0, 0, 0, 0],
    ['2026-04-08', 'MARIBEL', 317, 0, 0, 0, 0, 0],
    ['2026-04-09', 'ALICE', 695, 0, 0, 0, 0, 0],
    ['2026-04-09', 'LUZ', 405, 0, 0, 0, 0, 0],
    ['2026-04-09', 'BONY', 256, 100, 231, 0, 0, 0],
    ['2026-04-09', 'ALE', 279, 54, 96, 0, 0, 0],
    ['2026-04-09', 'MARIBEL', 190, 0, 0, 0, 0, 0],
  ];

  for (const [date, nick, im, ll, dest, i3d, port, ret] of historicalData) {
    await query(`
      INSERT INTO production_daily_logs (worker_id, log_date, imanes_medianos, llaveros, destapadores, imanes_3d, portallaves, portaretratos)
      SELECT pw.id, $1::date, $3, $4, $5, $6, $7, $8
      FROM production_workers pw WHERE pw.nickname = $2
      ON CONFLICT (worker_id, log_date) DO NOTHING
    `, [date, nick, im, ll, dest, i3d, port, ret]);
  }

  console.log('✅ production_workers + production_daily_logs created and seeded');
}
