/**
 * Lead Routes
 * Handles cuestionario form submissions (leads/clients)
 */

import express from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// ========================================
// AUTO-CREATE LEADS TABLE
// ========================================
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        whatsapp VARCHAR(50),
        email VARCHAR(255),
        products TEXT,
        company VARCHAR(255),
        quantity VARCHAR(100),
        timeline VARCHAR(100),
        source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Leads table ready');
  } catch (err) {
    console.error('Error creating leads table:', err.message);
  }
})();

// ========================================
// PUBLIC: Create a lead (from cuestionario form)
// ========================================
router.post('/', async (req, res) => {
  try {
    const { name, whatsapp, email, products, company, quantity, timeline, source } = req.body;

    const result = await query(
      `INSERT INTO leads (name, whatsapp, email, products, company, quantity, timeline, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name || '', whatsapp || '', email || '', products || '', company || '', quantity || '', timeline || '', source || '']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error creating lead:', err.message);
    res.status(500).json({ success: false, error: 'Error saving lead' });
  }
});

// ========================================
// PROTECTED: Get all leads
// ========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching leads:', err.message);
    res.status(500).json({ success: false, error: 'Error fetching leads' });
  }
});

// ========================================
// PROTECTED: Delete a lead
// ========================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM leads WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting lead:', err.message);
    res.status(500).json({ success: false, error: 'Error deleting lead' });
  }
});

export default router;
