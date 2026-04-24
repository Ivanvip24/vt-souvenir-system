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
import { log, logError } from '../shared/logger.js';

const router = express.Router();

// Mirror designer messages to whatsapp_messages so admin dashboard can see them
async function mirrorToAdminChat(clientPhone, designerName, content, messageType, mediaUrl) {
  try {
    const convResult = await query(
      `SELECT id FROM whatsapp_conversations WHERE wa_id = $1 LIMIT 1`,
      [clientPhone]
    );
    if (convResult.rows.length > 0) {
      const convId = convResult.rows[0].id;
      const waId = 'designer_' + Date.now();
      const msgContent = `*${designerName}:* ${content || ''}`;
      await query(
        `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url)
         VALUES ($1, $2, 'outbound', 'admin', $3, $4, $5)`,
        [convId, waId, messageType === 'image' ? 'image' : 'text', msgContent, mediaUrl || null]
      );
      await query(
        `UPDATE whatsapp_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [convId]
      );
    }
  } catch (err) {
    logError('design-portal.mirror-to-admin-chat-failed-non-blocking', err);
  }
}

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
             da.design_image_url,
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
    logError('design-portal.error-fetching-my-designs', error);
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
    logError('design-portal.error-fetching-order-designs', error);
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
    logError('design-portal.error-fetching-design-detail', error);
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
    logError('design-portal.error-fetching-messages', error);
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
    // Strip extension from public_id to avoid double extensions (e.g. .png.jpg)
    const nameWithoutExt = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const uploadResult = await uploadImage(dataUri, folder, `${Date.now()}-${nameWithoutExt}`);
    const fileUrl = uploadResult.url || uploadResult.secure_url;
    log('info', 'design-portal.cloudinary-upload-result-url');

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

    // Mirror to admin dashboard whatsapp chat
    if (clientPhone) await mirrorToAdminChat(clientPhone, designerName, caption || req.file.originalname, messageType, fileUrl);

    // Send via WhatsApp using Cloudinary URL (already compressed/optimized)
    if (clientPhone) {
      try {
        const { metaApiFetch, getPhoneNumberId } = await import('../services/whatsapp-api.js');
        const waCaption = `*${designerName}:*` + (caption ? ` ${caption}` : '');

        // Build a clean, compressed Cloudinary URL for WhatsApp
        // Cloudinary URLs: .../image/upload/v123/folder/filename.ext
        // Add transformation for max 1000px, quality 80, force jpg format
        let waImageUrl = fileUrl;
        if (isImage && fileUrl.includes('cloudinary.com')) {
          waImageUrl = fileUrl.replace('/image/upload/', '/image/upload/w_1000,q_80,f_jpg/');
          log('info', 'design-portal.cloudinary-compressed-url');
        }

        const mediaType = isImage ? 'image' : 'document';
        const mediaPayload = isImage
          ? { link: waImageUrl, caption: waCaption }
          : { link: fileUrl, caption: waCaption, filename: req.file.originalname };

        log('info', 'design-portal.sending-whatsapp-to-url');

        const sendResp = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: clientPhone,
            type: mediaType,
            [mediaType]: mediaPayload
          })
        });

        if (sendResp.ok) {
          const sendData = await sendResp.json();
          const waMessageId = sendData?.messages?.[0]?.id;
          if (waMessageId) await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`, [waMessageId, savedMessage.id]);
          log('info', 'design-portal.whatsapp-media-message-sent-successfully');
        } else {
          const errText = await sendResp.text();
          log('error', 'design-portal.debug');
          // Fallback: send as text with link
          const { sendWhatsAppMessage } = await import('../services/whatsapp-api.js');
          await sendWhatsAppMessage(clientPhone, `${waCaption}\n📎 ${req.file.originalname}\n${fileUrl}`);
        }
      } catch (waError) {
        log('error', 'design-portal.debug');
      }
    }

    // Return with the URL so frontend can display it
    res.json({ success: true, message: { ...savedMessage, file_url: fileUrl } });
  } catch (error) {
    logError('design-portal.error-uploading-file', error);
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

    // Mirror to admin dashboard whatsapp chat
    if (clientPhone) await mirrorToAdminChat(clientPhone, designerName, content, messageType, null);

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
          log('info', 'design-portal.whatsapp-send.success');
          const waMessageId = waResult?.data?.messages?.[0]?.id || waResult?.messages?.[0]?.id;
          if (waMessageId) {
            await query(`UPDATE design_messages SET wa_message_id = $1 WHERE id = $2`,
              [waMessageId, savedMessage.id]);
          }
        }
      } catch (waError) {
        log('error', 'design-portal.debug');
        // Don't fail the request — message is saved in DB
      }
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    logError('design-portal.error-sending-message', error);
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
    logError('design-portal.error-updating-design-status', error);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
});

// ========================================
// 6b. PUT /designs/:id/image — upload design image to a slot
// ========================================
// Upload design image to a slot
router.put('/designs/:id/image', employeeAuth, upload.single('file'), async (req, res) => {
  try {
    const designId = req.params.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Verify this design exists and belongs to this employee (or is manager)
    const check = await query(
      `SELECT id, order_id, design_number, assigned_to FROM design_assignments WHERE id = $1`,
      [designId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Design assignment not found' });
    }

    const design = check.rows[0];
    const isManager = req.employee.role === 'manager' || req.employee.role === 'admin';
    if (!isManager && design.assigned_to !== req.employee.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Upload to Cloudinary
    const b64 = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${b64}`;
    const folder = `design-portal/order-${design.order_id}/slots`;
    const publicId = `D${design.design_number}_${Date.now()}`;

    const uploadResult = await uploadImage(dataUri, folder, publicId);
    const imageUrl = uploadResult.url || uploadResult.secure_url;

    // Save URL to design_assignments
    await query(
      `UPDATE design_assignments SET design_image_url = $1, status = 'aprobado', updated_at = NOW() WHERE id = $2`,
      [imageUrl, designId]
    );

    res.json({ success: true, imageUrl, designId: Number(designId) });
  } catch (error) {
    logError('design-portal.error-uploading-design-image', error);
    res.status(500).json({ error: 'Failed to upload design image' });
  }
});

// ========================================
// 6c. POST /orders/:orderId/add-slot — add a design slot
// ========================================
// Add a design slot to an order
router.post('/orders/:orderId/add-slot', employeeAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const existing = await query(
      `SELECT design_number, total_designs, assigned_to, assigned_by, client_phone, client_name, order_item_id
       FROM design_assignments WHERE order_id = $1 ORDER BY design_number DESC LIMIT 1`,
      [orderId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'No existing design assignments for this order' });
    }

    const last = existing.rows[0];
    const newDesignNumber = last.design_number + 1;
    const newTotalDesigns = last.total_designs + 1;

    const result = await query(
      `INSERT INTO design_assignments
        (order_id, order_item_id, design_number, total_designs, assigned_to, assigned_by, client_phone, client_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, design_number`,
      [orderId, last.order_item_id, newDesignNumber, newTotalDesigns,
       last.assigned_to, last.assigned_by || req.employee.id, last.client_phone, last.client_name]
    );

    await query(
      `UPDATE design_assignments SET total_designs = $1 WHERE order_id = $2`,
      [newTotalDesigns, orderId]
    );

    res.json({
      success: true,
      design: {
        id: result.rows[0].id,
        design_number: result.rows[0].design_number,
        label: 'D' + result.rows[0].design_number,
        status: 'pendiente',
        total_designs: newTotalDesigns
      }
    });
  } catch (error) {
    logError('design-portal.error-adding-design-slot', error);
    res.status(500).json({ error: 'Failed to add design slot' });
  }
});

// ========================================
// 6d. DELETE /orders/:orderId/remove-slot — remove a specific or last design slot
// ========================================
router.delete('/orders/:orderId/remove-slot', employeeAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const designId = req.query.designId;

    let slot;
    if (designId) {
      // Remove specific slot by ID
      const result = await query(
        `SELECT id, design_number, total_designs
         FROM design_assignments WHERE id = $1 AND order_id = $2`,
        [designId, orderId]
      );
      slot = result.rows[0];
    } else {
      // Fallback: remove last slot
      const result = await query(
        `SELECT id, design_number, total_designs
         FROM design_assignments WHERE order_id = $1 ORDER BY design_number DESC LIMIT 1`,
        [orderId]
      );
      slot = result.rows[0];
    }

    if (!slot) {
      return res.status(404).json({ error: 'Design slot not found' });
    }

    if (slot.total_designs <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last remaining slot' });
    }

    await query(`DELETE FROM design_assignments WHERE id = $1`, [slot.id]);

    const newTotal = slot.total_designs - 1;
    await query(
      `UPDATE design_assignments SET total_designs = $1 WHERE order_id = $2`,
      [newTotal, orderId]
    );

    res.json({ success: true, removedDesignNumber: slot.design_number, newTotal });
  } catch (error) {
    logError('design-portal.error-removing-design-slot', error);
    res.status(500).json({ error: 'Failed to remove design slot' });
  }
});

// ========================================
// 6e. POST /generate-order — spawn Python script with design data
// ========================================
// Generate order — spawns Python script with design data
router.post('/generate-order', employeeAuth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const designs = await query(
      `SELECT da.id, da.design_number, da.design_image_url, da.status,
              da.client_name, da.client_phone
       FROM design_assignments da
       WHERE da.order_id = $1
       ORDER BY da.design_number ASC`,
      [orderId]
    );

    if (designs.rows.length === 0) {
      return res.status(404).json({ error: 'No designs found for this order' });
    }

    const emptySlots = designs.rows.filter(d => !d.design_image_url);
    if (emptySlots.length > 0) {
      return res.status(400).json({
        error: 'Not all design slots have images',
        emptySlots: emptySlots.map(s => 'D' + s.design_number)
      });
    }

    const orderResult = await query(
      `SELECT o.id, o.order_number, c.name as client_name
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0] || {};

    const payload = {
      order_id: orderId,
      order_number: order.order_number || '',
      client_name: order.client_name || designs.rows[0].client_name || '',
      designs: designs.rows.map(d => ({
        slot: 'D' + d.design_number,
        image_url: d.design_image_url
      }))
    };

    // Return payload for frontend to download — Python script runs locally
    res.json({ success: true, payload });

  } catch (error) {
    logError('design-portal.error-generating-order', error);
    res.status(500).json({ error: 'Failed to generate order' });
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
    logError('design-portal.error-creating-design-assignments', error);
    res.status(500).json({ success: false, error: 'Error al crear asignaciones' });
  }
});

// =====================================================
// GET /api/design-portal/window-status
// Returns WhatsApp 24h window status for all active design chats
// Powers the visual timer in the designer portal
// =====================================================
router.get('/window-status', employeeAuth, async (req, res) => {
  try {
    const { getDesignWindowStatus } = await import('../services/design-keepalive-scheduler.js');
    const statuses = await getDesignWindowStatus();
    res.json({ success: true, windows: statuses });
  } catch (error) {
    logError('design-portal.error-getting-window-status', error);
    res.status(500).json({ success: false, error: 'Error al obtener estado de ventanas' });
  }
});

// ========================================
// POST /complete-order — mark design phase as complete, update order status, notify client
// ========================================
router.post('/complete-order', employeeAuth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Verify all designs are approved
    const designs = await query(
      `SELECT id, design_number, design_image_url, status, client_phone, client_name
       FROM design_assignments
       WHERE order_id = $1
       ORDER BY design_number ASC`,
      [orderId]
    );

    if (designs.rows.length === 0) {
      return res.status(404).json({ error: 'No designs found for this order' });
    }

    const notApproved = designs.rows.filter(d => !d.design_image_url || d.status !== 'aprobado');
    if (notApproved.length > 0) {
      return res.status(400).json({
        error: 'Not all designs are approved',
        pending: notApproved.map(d => 'D' + d.design_number)
      });
    }

    // Get order info
    const orderResult = await query(
      `SELECT o.id, o.order_number, o.status, c.name as client_name, c.phone as client_phone
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Update order status to Printing (next phase after Design)
    await query(
      `UPDATE orders SET status = 'printing', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // Send WhatsApp notification to client
    const clientPhone = order.client_phone || designs.rows[0].client_phone;
    let whatsappSent = false;

    if (clientPhone) {
      try {
        const { sendWhatsAppMessage } = await import('../services/whatsapp-api.js');
        const clientName = order.client_name || designs.rows[0].client_name || '';
        const firstName = clientName.split(' ')[0] || '';
        const totalDesigns = designs.rows.length;

        const message = `¡${firstName}! 🎨✅ Tus ${totalDesigns} diseño${totalDesigns > 1 ? 's' : ''} del pedido ${order.order_number} ya están listos y aprobados. Ahora pasamos a producción. ¡Pronto tendrás tus souvenirs!`;

        await sendWhatsAppMessage(clientPhone, message);
        whatsappSent = true;
      } catch (waError) {
        logError('design-portal.whatsapp-notification.error', waError);
      }
    }

    res.json({
      success: true,
      newStatus: 'printing',
      whatsappSent,
      orderNumber: order.order_number
    });

  } catch (error) {
    logError('design-portal.error-completing-order', error);
    res.status(500).json({ error: 'Failed to complete order' });
  }
});

export default router;
