/**
 * Design Portal Routes
 * Endpoints for the designer portal: assignments, chat, status updates
 */

import express from 'express';
import multer from 'multer';
import { query } from '../shared/database.js';
import { uploadImage } from '../shared/cloudinary-config.js';
import {
  employeeAuth,
  requireManager,
  logActivity
} from './middleware/employee-auth.js';

const router = express.Router();

// File upload config — accept all file types up to 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ========================================
// 1. GET /my-designs — designer's assigned designs
// ========================================
router.get('/my-designs', employeeAuth, async (req, res) => {
  try {
    const designerId = req.employee.id;
    const isManager = req.employee.role === 'manager' || req.employee.role === 'admin';

    const whereClause = isManager ? '' : 'WHERE da.assigned_to = $1';
    const params = isManager ? [] : [designerId];

    const result = await query(`
      SELECT da.*,
             o.order_number,
             oi.product_name,
             da.specs->>'destination' as destination,
             oi.quantity,
             e.name as designer_name,
             (SELECT COUNT(*) FROM design_messages dm
              WHERE dm.order_id = da.order_id
                AND dm.sender_type = 'client'
                AND dm.created_at > COALESCE(
                  (SELECT MAX(dm2.created_at) FROM design_messages dm2
                   WHERE dm2.order_id = da.order_id AND dm2.sender_type = 'designer'),
                  da.created_at
                )
             ) as unread_count
      FROM design_assignments da
      LEFT JOIN orders o ON da.order_id = o.id
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      LEFT JOIN employees e ON da.assigned_to = e.id
      ${whereClause}
      ORDER BY
        CASE da.status
          WHEN 'cambios' THEN 1
          WHEN 'en_progreso' THEN 2
          WHEN 'pendiente' THEN 3
          WHEN 'en_revision' THEN 4
          WHEN 'aprobado' THEN 5
        END,
        da.due_date ASC NULLS LAST,
        da.created_at DESC
    `, params);

    res.json({ success: true, designs: result.rows });
  } catch (error) {
    console.error('Error fetching my designs:', error);
    res.status(500).json({ success: false, error: 'Error al obtener diseños' });
  }
});

// ========================================
// 2. GET /order/:orderId/designs — all designs for an order
// ========================================
router.get('/order/:orderId/designs', employeeAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await query(`
      SELECT da.*,
             e.name as assigned_to_name,
             oi.product_name,
             da.specs->>'destination' as destination
      FROM design_assignments da
      LEFT JOIN employees e ON da.assigned_to = e.id
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      WHERE da.order_id = $1
      ORDER BY da.design_number ASC
    `, [parseInt(orderId)]);

    res.json({ success: true, designs: result.rows });
  } catch (error) {
    console.error('Error fetching order designs:', error);
    res.status(500).json({ success: false, error: 'Error al obtener diseños del pedido' });
  }
});

// ========================================
// 3. GET /designs/:id — single design detail (NO prices)
// ========================================
router.get('/designs/:id', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT da.*,
             o.order_number,
             o.status as order_status,
             o.created_at as order_created_at,
             oi.product_name,
             da.specs->>'destination' as destination,
             oi.quantity,
             oi.custom_text,
             oi.notes as item_notes,
             c.name as client_name_from_order,
             c.phone as client_phone_from_order,
             e.name as assigned_to_name,
             eb.name as assigned_by_name
      FROM design_assignments da
      LEFT JOIN orders o ON da.order_id = o.id
      LEFT JOIN order_items oi ON da.order_item_id = oi.id
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN employees e ON da.assigned_to = e.id
      LEFT JOIN employees eb ON da.assigned_by = eb.id
      WHERE da.id = $1
    `, [parseInt(id)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Diseño no encontrado' });
    }

    res.json({ success: true, design: result.rows[0] });
  } catch (error) {
    console.error('Error fetching design detail:', error);
    res.status(500).json({ success: false, error: 'Error al obtener detalle del diseño' });
  }
});

// ========================================
// 4. GET /messages/:orderId — chat messages for an order
// ========================================
router.get('/messages/:orderId', employeeAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { after } = req.query;

    let sql = `
      SELECT dm.*
      FROM design_messages dm
      WHERE dm.order_id = $1
    `;
    const values = [parseInt(orderId)];

    if (after) {
      sql += ` AND dm.created_at > $2`;
      values.push(after);
    }

    sql += ` ORDER BY dm.created_at ASC`;

    const result = await query(sql, values);

    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Error al obtener mensajes' });
  }
});

// ========================================
// 4b. POST /messages/upload — upload file + send as message
// ========================================
router.post('/messages/upload', employeeAuth, upload.single('file'), async (req, res) => {
  try {
    const { orderId, designAssignmentId, caption } = req.body;
    if (!orderId || !req.file) {
      return res.status(400).json({ success: false, error: 'orderId and file required' });
    }

    // Upload to Cloudinary — convert buffer to data URI
    const b64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;
    const folder = `design-portal/order-${orderId}`;
    const uploadResult = await uploadImage(dataUri, folder, `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    const fileUrl = uploadResult.secure_url;

    const designerName = req.employee.name;
    const designerId = req.employee.id;
    const isImage = req.file.mimetype.startsWith('image/');
    const messageType = isImage ? 'image' : 'file';

    // Save message to DB
    const msgResult = await query(`
      INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_id, sender_name, message_type, content)
      VALUES ($1, $2, 'designer', $3, $4, $5, $6)
      RETURNING *
    `, [
      designAssignmentId ? parseInt(designAssignmentId) : null,
      parseInt(orderId),
      designerId,
      designerName,
      messageType,
      fileUrl
    ]);

    const savedMessage = msgResult.rows[0];

    // Find client phone
    let clientPhone;
    if (designAssignmentId) {
      const r = await query(`SELECT client_phone FROM design_assignments WHERE id = $1`, [parseInt(designAssignmentId)]);
      clientPhone = r.rows[0]?.client_phone;
    }
    if (!clientPhone) {
      const r = await query(`SELECT client_phone FROM design_assignments WHERE order_id = $1 AND assigned_to = $2 AND status != 'aprobado' LIMIT 1`, [parseInt(orderId), designerId]);
      clientPhone = r.rows[0]?.client_phone;
    }

    // Send via WhatsApp
    if (clientPhone) {
      try {
        if (isImage) {
          const { sendWhatsAppImage } = await import('../services/whatsapp-media.js');
          const waResult = await sendWhatsAppImage(clientPhone, fileUrl, caption ? `*${designerName}:* ${caption}` : `*${designerName}:*`);
          const waId = waResult?.data?.messages?.[0]?.id || waResult?.messages?.[0]?.id;
          if (waId) await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`, [waId, savedMessage.id]);
        } else {
          const { sendWhatsAppDocument } = await import('../services/whatsapp-media.js');
          const waResult = await sendWhatsAppDocument(clientPhone, fileUrl, req.file.originalname, `*${designerName}:*`);
          const waId = waResult?.data?.messages?.[0]?.id || waResult?.messages?.[0]?.id;
          if (waId) await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`, [waId, savedMessage.id]);
        }
      } catch (waError) {
        console.error('WhatsApp file send error:', waError.message);
      }
    }

    // Return with the URL so frontend can display it
    res.json({ success: true, message: { ...savedMessage, file_url: fileUrl } });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: 'Error uploading file' });
  }
});

// ========================================
// 5. POST /messages/send — designer sends message
// ========================================
router.post('/messages/send', employeeAuth, async (req, res) => {
  try {
    const { orderId, designAssignmentId, content, messageType = 'text' } = req.body;

    if (!orderId || !content) {
      return res.status(400).json({ success: false, error: 'orderId y content son requeridos' });
    }

    // Get designer name from the authenticated employee
    const designerName = req.employee.name;
    const designerId = req.employee.id;

    // Find the client phone — use specific assignment if provided, else match by designer
    let clientPhone;
    if (designAssignmentId) {
      const r = await query(`SELECT client_phone FROM design_assignments WHERE id = $1`, [parseInt(designAssignmentId)]);
      clientPhone = r.rows[0]?.client_phone;
    }
    if (!clientPhone) {
      const r = await query(`SELECT client_phone FROM design_assignments WHERE order_id = $1 AND assigned_to = $2 AND status != 'aprobado' LIMIT 1`, [parseInt(orderId), designerId]);
      clientPhone = r.rows[0]?.client_phone;
    }
    if (!clientPhone) {
      const r = await query(`SELECT client_phone FROM design_assignments WHERE order_id = $1 AND status != 'aprobado' LIMIT 1`, [parseInt(orderId)]);
      clientPhone = r.rows[0]?.client_phone;
    }

    // Save message to DB
    const msgResult = await query(`
      INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_id, sender_name, message_type, content)
      VALUES ($1, $2, 'designer', $3, $4, $5, $6)
      RETURNING *
    `, [
      designAssignmentId ? parseInt(designAssignmentId) : null,
      parseInt(orderId),
      designerId,
      designerName,
      messageType,
      content
    ]);

    const savedMessage = msgResult.rows[0];

    // Send to WhatsApp (non-blocking)
    if (clientPhone) {
      try {
        const prefixedContent = `*${designerName}:*\n${content}`;

        if (messageType === 'image') {
          // content is the image URL for image messages
          const { sendWhatsAppImage } = await import('../services/whatsapp-media.js');
          const waResult = await sendWhatsAppImage(clientPhone, content, `*${designerName}:*`);
          if (waResult?.messages?.[0]?.id) {
            await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`,
              [waResult.messages[0].id, savedMessage.id]);
          }
        } else {
          const { sendWhatsAppMessage } = await import('../services/whatsapp-api.js');
          const waResult = await sendWhatsAppMessage(clientPhone, prefixedContent);
          console.log('WhatsApp send result:', JSON.stringify(waResult));
          const waMessageId = waResult?.data?.messages?.[0]?.id || waResult?.messages?.[0]?.id;
          if (waMessageId) {
            await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`,
              [waMessageId, savedMessage.id]);
          }
        }
      } catch (waError) {
        console.error('Error sending WhatsApp message from designer portal:', waError.message);
        // Don't fail the request — message is saved in DB
      }
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
  }
});

// ========================================
// 6. PUT /designs/:id/status — update design status
// ========================================
router.put('/designs/:id/status', employeeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pendiente', 'en_progreso', 'en_revision', 'cambios', 'aprobado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status inválido. Debe ser: ${validStatuses.join(', ')}`
      });
    }

    let sql = `
      UPDATE design_assignments
      SET status = $1, updated_at = NOW()
    `;
    const values = [status];

    if (status === 'aprobado') {
      sql += `, completed_at = NOW()`;
    }

    sql += ` WHERE id = $${values.length + 1} RETURNING *`;
    values.push(parseInt(id));

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Diseño no encontrado' });
    }

    await logActivity(req.employee.id, 'design_status_update', 'design_assignment', parseInt(id), { status });

    res.json({ success: true, design: result.rows[0] });
  } catch (error) {
    console.error('Error updating design status:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
});

// ========================================
// 7. POST /assign — create design assignments (admin)
// ========================================
router.post('/assign', employeeAuth, requireManager, async (req, res) => {
  try {
    const { orderId, assignments } = req.body;

    if (!orderId || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'orderId y assignments[] son requeridos'
      });
    }

    const created = [];

    for (const a of assignments) {
      const result = await query(`
        INSERT INTO design_assignments
          (order_id, order_item_id, design_number, total_designs, assigned_to, assigned_by,
           specs, client_phone, client_name, due_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        parseInt(orderId),
        a.orderItemId ? parseInt(a.orderItemId) : null,
        a.designNumber,
        a.totalDesigns,
        parseInt(a.assignedTo),
        req.employee.id,
        a.specs ? JSON.stringify(a.specs) : '{}',
        a.clientPhone || null,
        a.clientName || null,
        a.dueDate || null
      ]);

      created.push(result.rows[0]);
    }

    await logActivity(req.employee.id, 'design_assign', 'order', parseInt(orderId), {
      count: created.length
    });

    res.json({ success: true, assignments: created });
  } catch (error) {
    console.error('Error creating design assignments:', error);
    res.status(500).json({ success: false, error: 'Error al crear asignaciones' });
  }
});

export default router;
