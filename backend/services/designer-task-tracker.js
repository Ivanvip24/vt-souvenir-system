/**
 * Designer Task Tracker Service
 *
 * CRUD operations and AI-powered parsing for designer task management.
 * Handles armado (assembly) and diseño (design) tasks for Sarahi and Majo.
 */

import { query } from '../shared/database.js';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '../shared/logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// =====================================================
// AI PARSING
// =====================================================

/**
 * Parse a natural language assignment into structured data.
 * Examples:
 *   "Sarahi arm 50 imanes Cancún"
 *   "Majo diseño destapadores, llaveros — pedido Oaxaca"
 */
export async function parseAssignment(text, imageUrl = null) {
  try {
    const content = [
      {
        type: 'text',
        text: `Eres un parser de tareas para diseñadoras de souvenirs AXKAN.

Extrae la información de este mensaje y devuelve SOLO un JSON válido (sin markdown, sin backticks):

{
  "designerName": "nombre de la diseñadora",
  "taskType": "armado" o "diseño",
  "productType": "tipo de producto (imanes, destapadores, llaveros, etc.)",
  "quantity": número o null,
  "pieces": ["lista de piezas si es diseño"] o [],
  "destination": "destino/ciudad" o null,
  "orderReference": "referencia del pedido" o null
}

Reglas:
- "arm" o "armado" = taskType "armado"
- "dis" o "diseño" o "diseña" = taskType "diseño"
- Si hay varios productos separados por coma, ponlos en "pieces"
- quantity aplica principalmente para armados
- Si no encuentras algún campo, pon null o [] según corresponda

Mensaje: "${text}"`
      }
    ];

    if (imageUrl) {
      content.unshift({
        type: 'image',
        source: {
          type: 'url',
          url: imageUrl
        }
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content }]
    });

    let rawText = response.content[0].text.trim();
    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(rawText);
    return parsed;

  } catch (error) {
    logError('task_tracker.parse_error', error);
    throw new Error(`No pude interpretar la asignación: ${error.message}`);
  }
}

// =====================================================
// CRUD OPERATIONS
// =====================================================

/**
 * Create a task from parsed data.
 * Looks up designer by name, creates designer_tasks record,
 * and design_pieces rows if taskType is diseño.
 */
export async function createTask(parsedData, imageUrl = null) {
  try {
    // Look up designer by name (case-insensitive partial match)
    const designer = await getDesignerByName(parsedData.designerName);
    if (!designer) {
      throw new Error(`No encontré a la diseñadora "${parsedData.designerName}"`);
    }

    // Build description from pieces or product info
    let description = parsedData.description || null;
    if (!description && parsedData.pieces && parsedData.pieces.length > 0) {
      description = `Piezas: ${parsedData.pieces.join(', ')}`;
    }

    // Create the task
    const taskResult = await query(`
      INSERT INTO designer_tasks (
        designer_id, task_type, product_type, destination,
        quantity, description, source, assigned_image_url, order_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      designer.id,
      parsedData.taskType,
      parsedData.productType || null,
      parsedData.destination || null,
      parsedData.quantity || null,
      description,
      parsedData.source || 'direct',
      imageUrl || null,
      parsedData.orderReference || null
    ]);

    const task = taskResult.rows[0];

    // If diseño, create individual piece records
    if (parsedData.taskType === 'diseño' && parsedData.pieces && parsedData.pieces.length > 0) {
      for (const pieceName of parsedData.pieces) {
        await query(`
          INSERT INTO design_pieces (task_id, piece_name)
          VALUES ($1, $2)
        `, [task.id, pieceName.trim()]);
      }
    }

    // Return task with designer name
    return {
      ...task,
      designer_name: designer.name,
      pieces: parsedData.pieces || []
    };

  } catch (error) {
    logError('task_tracker.create_error', error);
    throw error;
  }
}

/**
 * Mark a task as completed.
 */
export async function completeTask(taskId) {
  try {
    const result = await query(`
      UPDATE designer_tasks
      SET status = 'done', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [taskId]);

    if (result.rows.length === 0) {
      throw new Error(`Tarea ${taskId} no encontrada`);
    }

    // Also mark all pieces as done if they exist
    await query(`
      UPDATE design_pieces
      SET status = 'done', updated_at = NOW()
      WHERE task_id = $1 AND status != 'delivered'
    `, [taskId]);

    return result.rows[0];

  } catch (error) {
    logError('task_tracker.complete_error', error);
    throw error;
  }
}

/**
 * Record a correction on a task/piece.
 */
export async function markCorrection(taskId, pieceId, notes, imageUrl = null) {
  try {
    // Create correction record
    await query(`
      INSERT INTO task_corrections (task_id, piece_id, correction_type, correction_notes, correction_image_url)
      VALUES ($1, $2, 'revision', $3, $4)
    `, [taskId, pieceId || null, notes || null, imageUrl || null]);

    // Update task status
    await query(`
      UPDATE designer_tasks
      SET status = 'correction', updated_at = NOW()
      WHERE id = $1
    `, [taskId]);

    // If piece specified, increment correction count and update status
    if (pieceId) {
      await query(`
        UPDATE design_pieces
        SET correction_count = correction_count + 1, status = 'correction', updated_at = NOW()
        WHERE id = $1
      `, [pieceId]);
    }

    return { success: true, taskId, pieceId };

  } catch (error) {
    logError('task_tracker.correction_error', error);
    throw error;
  }
}

/**
 * Deliver a specific design piece (fuzzy name match).
 */
export async function deliverDesignPiece(taskId, pieceName, imageUrl = null) {
  try {
    // Fuzzy match piece by name within the task
    const pieceResult = await query(`
      SELECT * FROM design_pieces
      WHERE task_id = $1 AND LOWER(piece_name) ILIKE $2
      ORDER BY id
      LIMIT 1
    `, [taskId, `%${pieceName.toLowerCase()}%`]);

    if (pieceResult.rows.length === 0) {
      throw new Error(`No encontré la pieza "${pieceName}" en la tarea ${taskId}`);
    }

    const piece = pieceResult.rows[0];

    await query(`
      UPDATE design_pieces
      SET status = 'delivered', delivered_image_url = $1, updated_at = NOW()
      WHERE id = $2
    `, [imageUrl || null, piece.id]);

    // Check if all pieces are delivered, if so complete the task
    const remaining = await query(`
      SELECT COUNT(*) AS cnt FROM design_pieces
      WHERE task_id = $1 AND status != 'delivered'
    `, [taskId]);

    if (parseInt(remaining.rows[0].cnt) === 0) {
      await completeTask(taskId);
    }

    return { ...piece, status: 'delivered', delivered_image_url: imageUrl };

  } catch (error) {
    logError('task_tracker.deliver_error', error);
    throw error;
  }
}

/**
 * Get pending tasks, optionally filtered by designer.
 */
export async function getPendingTasks(designerId = null) {
  try {
    let sql = `
      SELECT dt.*, d.name AS designer_name
      FROM designer_tasks dt
      JOIN designers d ON d.id = dt.designer_id
      WHERE dt.status IN ('pending', 'in_progress', 'correction')
    `;
    const params = [];

    if (designerId) {
      sql += ` AND dt.designer_id = $1`;
      params.push(designerId);
    }

    sql += ` ORDER BY dt.assigned_at DESC`;

    const result = await query(sql, params);

    // Attach pieces for each task
    for (const task of result.rows) {
      const pieces = await query(`
        SELECT * FROM design_pieces WHERE task_id = $1 ORDER BY id
      `, [task.id]);
      task.pieces = pieces.rows;
    }

    return result.rows;

  } catch (error) {
    logError('task_tracker.pending_error', error);
    throw error;
  }
}

// =====================================================
// DESIGNER LOOKUPS
// =====================================================

/**
 * Find designer by phone (last 10 digits match).
 */
export async function getDesignerByPhone(phone) {
  try {
    const last10 = phone.replace(/\D/g, '').slice(-10);
    const result = await query(`
      SELECT * FROM designers
      WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1
        AND is_active = true
    `, [last10]);

    return result.rows[0] || null;

  } catch (error) {
    logError('task_tracker.find_by_phone_error', error);
    throw error;
  }
}

/**
 * Find designer by name (case-insensitive partial match).
 */
export async function getDesignerByName(name) {
  try {
    const result = await query(`
      SELECT * FROM designers
      WHERE LOWER(name) ILIKE $1 AND is_active = true
      ORDER BY id
      LIMIT 1
    `, [`%${name.toLowerCase()}%`]);

    return result.rows[0] || null;

  } catch (error) {
    logError('task_tracker.find_by_name_error', error);
    throw error;
  }
}

// =====================================================
// SUMMARIES & ANALYTICS
// =====================================================

/**
 * Get daily summary from the designer_daily_summary view.
 */
export async function getDailySummary(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await query(`
      SELECT * FROM designer_daily_summary
      WHERE task_date = $1
      ORDER BY designer_name, task_type
    `, [targetDate]);

    return result.rows;

  } catch (error) {
    logError('task_tracker.daily_summary_error', error);
    throw error;
  }
}

/**
 * Aggregate last 7 days per designer: total tasks, completed, avg turnaround, correction rate.
 */
export async function getWeeklySummary(endDate = null) {
  try {
    const end = endDate || new Date().toISOString().split('T')[0];

    const result = await query(`
      SELECT
        d.id AS designer_id,
        d.name AS designer_name,
        COUNT(dt.id) AS total_tasks,
        COUNT(dt.id) FILTER (WHERE dt.status = 'done') AS completed,
        COUNT(dt.id) FILTER (WHERE dt.status IN ('pending', 'in_progress')) AS pending,
        COUNT(dt.id) FILTER (WHERE dt.status = 'correction') AS in_correction,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (dt.completed_at - dt.assigned_at)) / 3600.0
        ) FILTER (WHERE dt.completed_at IS NOT NULL)::numeric, 2) AS avg_turnaround_hours,
        COALESCE(SUM(
          (SELECT SUM(dp.correction_count) FROM design_pieces dp WHERE dp.task_id = dt.id)
        ), 0) AS total_corrections,
        CASE
          WHEN COUNT(dt.id) FILTER (WHERE dt.status = 'done') > 0
          THEN ROUND(
            COALESCE(SUM(
              (SELECT SUM(dp.correction_count) FROM design_pieces dp WHERE dp.task_id = dt.id)
            ), 0)::numeric / COUNT(dt.id) FILTER (WHERE dt.status = 'done'), 2
          )
          ELSE 0
        END AS correction_rate
      FROM designers d
      LEFT JOIN designer_tasks dt ON dt.designer_id = d.id
        AND dt.assigned_at >= ($1::date - INTERVAL '6 days')
        AND dt.assigned_at < ($1::date + INTERVAL '1 day')
      WHERE d.is_active = true
      GROUP BY d.id, d.name
      ORDER BY d.name
    `, [end]);

    return result.rows;

  } catch (error) {
    logError('task_tracker.weekly_summary_error', error);
    throw error;
  }
}

/**
 * Send weekly data to Claude for actionable insights in Spanish.
 */
export async function generateAIInsights(weekData) {
  try {
    if (!weekData || weekData.length === 0) {
      return ['No hay datos suficientes para generar insights esta semana.'];
    }

    const dataStr = JSON.stringify(weekData, null, 2);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Eres analista de producción para AXKAN, marca de souvenirs mexicanos.

Analiza estos datos semanales de las diseñadoras y da 3-5 insights accionables en español.
Sé directo, concreto y útil. No uses formato markdown, solo texto plano con guiones.

Datos:
${dataStr}

Responde SOLO con un JSON array de strings, cada string es un insight:
["insight 1", "insight 2", ...]`
      }]
    });

    const rawText = response.content[0].text.trim();
    const insights = JSON.parse(rawText);
    return insights;

  } catch (error) {
    logError('task_tracker.ai_insights_error', error);
    return ['Error al generar insights: ' + error.message];
  }
}
