/**
 * Order Alerts System
 * Provides smart categorization of orders by urgency
 */

import { query } from '../../shared/database.js';

/**
 * Get all order alerts categorized by urgency
 * @returns {Object} Alerts organized by category
 */
export async function getOrderAlerts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = {
    critical: [],    // Need action TODAY
    warning: [],     // Need action this week
    upcoming: [],    // Plan ahead
    summary: {
      totalAlerts: 0,
      criticalCount: 0,
      warningCount: 0,
      upcomingCount: 0
    }
  };

  try {
    // Fetch all active (non-archived) orders with relevant info AND their items
    const result = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.event_date,
        o.total_price,
        o.deposit_amount,
        o.approval_status,
        o.status,
        o.archive_status,
        o.second_payment_proof_url,
        o.created_at,
        o.updated_at,
        c.name as client_name,
        c.phone as client_phone,
        json_agg(
          json_build_object(
            'productName', oi.product_name,
            'quantity', oi.quantity
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE (o.archive_status IS NULL OR o.archive_status = 'active')
      GROUP BY o.id, c.name, c.phone
      ORDER BY o.event_date ASC NULLS LAST, o.created_at DESC
    `);

    const orders = result.rows;

    for (const order of orders) {
      const eventDate = order.event_date ? new Date(order.event_date) : null;
      const createdAt = new Date(order.created_at);
      const updatedAt = order.updated_at ? new Date(order.updated_at) : createdAt;

      // Calculate days until delivery
      let daysUntilDelivery = null;
      if (eventDate) {
        eventDate.setHours(0, 0, 0, 0);
        daysUntilDelivery = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      }

      // Calculate days since creation
      const daysSinceCreation = Math.floor((today - createdAt) / (1000 * 60 * 60 * 24));

      // Calculate days in current status
      const daysInStatus = Math.floor((today - updatedAt) / (1000 * 60 * 60 * 24));

      // Calculate remaining balance
      const remainingBalance = parseFloat(order.total_price) - parseFloat(order.deposit_amount || 0);
      const hasSecondPayment = !!order.second_payment_proof_url;

      const orderInfo = {
        id: order.id,
        orderNumber: order.order_number,
        clientName: order.client_name,
        clientPhone: order.client_phone,
        totalPrice: parseFloat(order.total_price),
        remainingBalance,
        status: order.status,
        approvalStatus: order.approval_status,
        eventDate: order.event_date,
        createdAt: order.created_at,
        daysUntilDelivery,
        daysSinceCreation,
        daysInStatus,
        items: order.items || []
      };

      // ==========================================
      // CRITICAL ALERTS (Need action TODAY)
      // ==========================================

      // 1. OVERDUE: Past delivery date and not completed
      if (daysUntilDelivery !== null && daysUntilDelivery < 0) {
        alerts.critical.push({
          ...orderInfo,
          alertType: 'overdue',
          alertTitle: '⚠️ VENCIDO',
          alertMessage: `Fecha de entrega fue hace ${Math.abs(daysUntilDelivery)} día(s)`,
          priority: 1
        });
        continue;
      }

      // 2. DELIVERY TODAY or TOMORROW
      if (daysUntilDelivery !== null && daysUntilDelivery >= 0 && daysUntilDelivery <= 1) {
        alerts.critical.push({
          ...orderInfo,
          alertType: 'delivery_imminent',
          alertTitle: daysUntilDelivery === 0 ? '🚨 ENTREGA HOY' : '⏰ ENTREGA MAÑANA',
          alertMessage: daysUntilDelivery === 0 ? 'Debe entregarse hoy' : 'Debe entregarse mañana',
          priority: 2
        });
        continue;
      }

      // 3. DELIVERY IN 2-3 DAYS and not yet in shipping
      if (daysUntilDelivery !== null && daysUntilDelivery >= 2 && daysUntilDelivery <= 3 &&
          !['shipping', 'delivered'].includes(order.status)) {
        alerts.critical.push({
          ...orderInfo,
          alertType: 'delivery_soon',
          alertTitle: '🔴 ENTREGA PRÓXIMA',
          alertMessage: `Entrega en ${daysUntilDelivery} días - No está en envío`,
          priority: 3
        });
        continue;
      }

      // 4. PENDING SECOND PAYMENT with delivery approaching (≤ 5 days)
      if (hasSecondPayment && remainingBalance > 0 && daysUntilDelivery !== null && daysUntilDelivery <= 5) {
        alerts.critical.push({
          ...orderInfo,
          alertType: 'payment_pending_urgent',
          alertTitle: '💳 CONFIRMAR PAGO URGENTE',
          alertMessage: `Pago pendiente de confirmación - Entrega en ${daysUntilDelivery} días`,
          priority: 4
        });
        continue;
      }

      // ==========================================
      // WARNING ALERTS (Need action this week)
      // ==========================================

      // 5. PENDING APPROVAL for more than 24 hours
      if (order.approval_status === 'pending_review' && daysSinceCreation >= 1) {
        alerts.warning.push({
          ...orderInfo,
          alertType: 'approval_pending',
          alertTitle: '📋 PENDIENTE DE APROBAR',
          alertMessage: `Esperando aprobación desde hace ${daysSinceCreation} día(s)`,
          priority: 5
        });
        continue;
      }

      // 6. STUCK IN STATUS for more than 3 days (approved orders)
      if (order.approval_status === 'approved' && daysInStatus >= 3 &&
          !['delivered', 'cancelled'].includes(order.status)) {
        alerts.warning.push({
          ...orderInfo,
          alertType: 'status_stuck',
          alertTitle: '🔄 SIN MOVIMIENTO',
          alertMessage: `En "${translateStatus(order.status)}" desde hace ${daysInStatus} días`,
          priority: 6
        });
        continue;
      }

      // 7. DELIVERY IN 4-7 DAYS
      if (daysUntilDelivery !== null && daysUntilDelivery >= 4 && daysUntilDelivery <= 7) {
        alerts.warning.push({
          ...orderInfo,
          alertType: 'delivery_this_week',
          alertTitle: '📅 ENTREGA ESTA SEMANA',
          alertMessage: `Entrega en ${daysUntilDelivery} días`,
          priority: 7
        });
        continue;
      }

      // 8. PENDING SECOND PAYMENT (not urgent yet)
      if (hasSecondPayment && remainingBalance > 0 &&
          (daysUntilDelivery === null || daysUntilDelivery > 5)) {
        alerts.warning.push({
          ...orderInfo,
          alertType: 'payment_pending',
          alertTitle: '💳 PAGO PENDIENTE',
          alertMessage: `Confirmar pago de ${formatCurrency(remainingBalance)}`,
          priority: 8
        });
        continue;
      }

      // ==========================================
      // UPCOMING (Plan ahead - next 2 weeks)
      // ==========================================

      // 9. DELIVERY IN 8-14 DAYS
      if (daysUntilDelivery !== null && daysUntilDelivery >= 8 && daysUntilDelivery <= 14) {
        alerts.upcoming.push({
          ...orderInfo,
          alertType: 'delivery_upcoming',
          alertTitle: '📆 PRÓXIMA ENTREGA',
          alertMessage: `Entrega en ${daysUntilDelivery} días`,
          priority: 9
        });
        continue;
      }

      // 10. RECENTLY APPROVED (needs production scheduling)
      if (order.approval_status === 'approved' && order.status === 'new' && daysSinceCreation <= 3) {
        alerts.upcoming.push({
          ...orderInfo,
          alertType: 'needs_scheduling',
          alertTitle: '🏭 PROGRAMAR PRODUCCIÓN',
          alertMessage: `Aprobado hace ${daysSinceCreation} día(s) - Iniciar producción`,
          priority: 10
        });
      }
    }

    // Sort each category by priority
    alerts.critical.sort((a, b) => a.priority - b.priority);
    alerts.warning.sort((a, b) => a.priority - b.priority);
    alerts.upcoming.sort((a, b) => a.priority - b.priority);

    // Update summary counts
    alerts.summary.criticalCount = alerts.critical.length;
    alerts.summary.warningCount = alerts.warning.length;
    alerts.summary.upcomingCount = alerts.upcoming.length;
    alerts.summary.totalAlerts = alerts.critical.length + alerts.warning.length + alerts.upcoming.length;

    return alerts;

  } catch (error) {
    console.error('Error getting order alerts:', error);
    throw error;
  }
}

/**
 * Get a simple summary of alerts (for dashboard header)
 */
export async function getAlertsSummary() {
  const alerts = await getOrderAlerts();

  return {
    critical: alerts.summary.criticalCount,
    warning: alerts.summary.warningCount,
    upcoming: alerts.summary.upcomingCount,
    total: alerts.summary.totalAlerts,
    hasCritical: alerts.summary.criticalCount > 0,
    hasWarning: alerts.summary.warningCount > 0
  };
}

/**
 * Generate HTML email for daily digest - AXKAN Branded
 */
export async function generateDailyDigestEmail() {
  const alerts = await getOrderAlerts();
  const today = new Date();

  // Helper to render items list
  const renderItems = (items) => {
    if (!items || items.length === 0) return '';
    return items.map(item =>
      `<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e5e7eb;">
        <span style="color: #4b5563;">${item.productName || 'Producto'}</span>
        <span style="font-weight: 700; color: #E91E63;">${item.quantity} pzas</span>
      </div>`
    ).join('');
  };

  // Helper to render a single order card
  const renderOrderCard = (alert, colorClass) => {
    const colors = {
      critical: { bg: '#fef2f2', border: '#E91E63', accent: '#be185d' },
      warning: { bg: '#fffbeb', border: '#FF9800', accent: '#d97706' },
      upcoming: { bg: '#eff6ff', border: '#00BCD4', accent: '#0891b2' }
    };
    const c = colors[colorClass];
    const createdDate = new Date(alert.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <div style="background: ${c.bg}; border-radius: 12px; padding: 20px; margin-bottom: 16px; border-left: 5px solid ${c.border};">
        <!-- Client Name - BIGGEST -->
        <div style="font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 8px;">
          ${alert.clientName || 'Sin nombre'}
        </div>

        <!-- Order Age - BOLD -->
        <div style="background: ${c.border}; color: white; display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-bottom: 12px;">
          ⏱️ ESTE PEDIDO TIENE ${alert.daysSinceCreation} DÍA${alert.daysSinceCreation !== 1 ? 'S' : ''} • Creado el ${createdDate}
        </div>

        <!-- Alert Status -->
        <div style="font-size: 14px; font-weight: 600; color: ${c.accent}; margin-bottom: 12px;">
          ${alert.alertTitle} — ${alert.alertMessage}
        </div>

        <!-- Products Section -->
        <div style="background: white; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
            📦 Productos del Pedido
          </div>
          ${alert.items && alert.items.length > 0 ? renderItems(alert.items) : '<div style="color: #9ca3af; font-style: italic;">Sin productos</div>'}
        </div>

        <!-- Order Meta -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <div>
            <span style="font-size: 12px; color: #6b7280;">Orden:</span>
            <span style="font-weight: 700; color: #111827;">${alert.orderNumber}</span>
          </div>
          <div>
            <span style="font-size: 12px; color: #6b7280;">Total:</span>
            <span style="font-weight: 700; color: #7CB342;">${formatCurrency(alert.totalPrice)}</span>
          </div>
          ${alert.eventDate ? `
          <div>
            <span style="font-size: 12px; color: #6b7280;">Entrega:</span>
            <span style="font-weight: 700; color: ${c.accent};">${new Date(alert.eventDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5;">
      <div style="max-width: 650px; margin: 0 auto; background: white;">

        <!-- AXKAN Header with Mexican pink gradient -->
        <div style="background: linear-gradient(135deg, #E91E63 0%, #C2185B 50%, #AD1457 100%); padding: 30px 20px; text-align: center;">
          <div style="font-size: 36px; font-weight: 900; color: white; letter-spacing: 3px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
            AXKAN
          </div>
          <div style="color: white; font-size: 14px; margin-top: 8px; opacity: 0.95;">
            Resumen Diario de Pedidos
          </div>
          <div style="color: white; font-size: 13px; margin-top: 4px; opacity: 0.85;">
            ${today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        <!-- Colorful Mayan-style divider -->
        <div style="height: 6px; background: linear-gradient(90deg, #E91E63, #7CB342, #FF9800, #00BCD4, #F44336);"></div>

        <!-- Summary Cards -->
        <div style="display: flex; background: #fafafa; border-bottom: 1px solid #e5e7eb;">
          <div style="flex: 1; text-align: center; padding: 20px; border-right: 1px solid #e5e7eb;">
            <div style="font-size: 36px; font-weight: 900; color: #E91E63;">${alerts.summary.criticalCount}</div>
            <div style="font-size: 11px; font-weight: 700; color: #be185d; text-transform: uppercase; letter-spacing: 0.5px;">🔴 Urgentes</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 20px; border-right: 1px solid #e5e7eb;">
            <div style="font-size: 36px; font-weight: 900; color: #FF9800;">${alerts.summary.warningCount}</div>
            <div style="font-size: 11px; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px;">🟡 Atención</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 20px;">
            <div style="font-size: 36px; font-weight: 900; color: #00BCD4;">${alerts.summary.upcomingCount}</div>
            <div style="font-size: 11px; font-weight: 700; color: #0891b2; text-transform: uppercase; letter-spacing: 0.5px;">🔵 Próximos</div>
          </div>
        </div>

        ${alerts.summary.totalAlerts === 0 ? `
          <div style="text-align: center; padding: 50px 20px;">
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <div style="font-size: 24px; font-weight: 800; color: #7CB342; margin-bottom: 8px;">¡Todo en orden!</div>
            <div style="color: #6b7280;">No hay alertas pendientes para hoy.</div>
          </div>
        ` : ''}

        <!-- Critical Section -->
        ${alerts.critical.length > 0 ? `
          <div style="padding: 24px 20px;">
            <div style="font-size: 16px; font-weight: 800; color: #E91E63; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 3px solid #E91E63; display: flex; align-items: center;">
              <span style="background: #E91E63; color: white; padding: 4px 10px; border-radius: 4px; margin-right: 10px; font-size: 13px;">
                ${alerts.critical.length}
              </span>
              ACCIÓN URGENTE REQUERIDA
            </div>
            ${alerts.critical.map(alert => renderOrderCard(alert, 'critical')).join('')}
          </div>
        ` : ''}

        <!-- Warning Section -->
        ${alerts.warning.length > 0 ? `
          <div style="padding: 24px 20px; background: #fffbeb;">
            <div style="font-size: 16px; font-weight: 800; color: #FF9800; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 3px solid #FF9800; display: flex; align-items: center;">
              <span style="background: #FF9800; color: white; padding: 4px 10px; border-radius: 4px; margin-right: 10px; font-size: 13px;">
                ${alerts.warning.length}
              </span>
              REQUIERE ATENCIÓN
            </div>
            ${alerts.warning.map(alert => renderOrderCard(alert, 'warning')).join('')}
          </div>
        ` : ''}

        <!-- Upcoming Section -->
        ${alerts.upcoming.length > 0 ? `
          <div style="padding: 24px 20px;">
            <div style="font-size: 16px; font-weight: 800; color: #00BCD4; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 3px solid #00BCD4; display: flex; align-items: center;">
              <span style="background: #00BCD4; color: white; padding: 4px 10px; border-radius: 4px; margin-right: 10px; font-size: 13px;">
                ${alerts.upcoming.length}
              </span>
              PRÓXIMOS PEDIDOS
            </div>
            ${alerts.upcoming.map(alert => renderOrderCard(alert, 'upcoming')).join('')}
          </div>
        ` : ''}

        <!-- Footer -->
        <div style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%); padding: 30px 20px; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; color: white; letter-spacing: 2px; margin-bottom: 12px;">
            AXKAN
          </div>
          <a href="${process.env.ADMIN_URL || 'https://vt-souvenir-backend.onrender.com/admin'}"
             style="display: inline-block; background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: 700; font-size: 14px; margin-bottom: 16px;">
            Ver Dashboard Completo →
          </a>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
            Este es un resumen automático de tu sistema de pedidos AXKAN
          </div>
        </div>

        <!-- Colorful bottom border -->
        <div style="height: 6px; background: linear-gradient(90deg, #E91E63, #7CB342, #FF9800, #00BCD4, #F44336);"></div>
      </div>
    </body>
    </html>
  `;

  return {
    html,
    summary: alerts.summary,
    hasAlerts: alerts.summary.totalAlerts > 0
  };
}

// Helper functions
function translateStatus(status) {
  const translations = {
    'new': 'Nuevo',
    'pending': 'Pendiente',
    'in_production': 'En Producción',
    'design': 'Diseño',
    'printing': 'Impresión',
    'cutting': 'Corte',
    'counting': 'Conteo',
    'shipping': 'Envío',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado'
  };
  return translations[status] || status;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

export default {
  getOrderAlerts,
  getAlertsSummary,
  generateDailyDigestEmail
};
