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
    // Fetch all active (non-archived) orders with relevant info
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
        c.phone as client_phone
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE (o.archive_status IS NULL OR o.archive_status = 'active')
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
        daysUntilDelivery,
        daysSinceCreation,
        daysInStatus
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
 * Generate HTML email for daily digest
 */
export async function generateDailyDigestEmail() {
  const alerts = await getOrderAlerts();
  const today = new Date();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 700px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .summary { display: flex; justify-content: space-around; padding: 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .summary-item { text-align: center; }
        .summary-count { font-size: 32px; font-weight: bold; }
        .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
        .critical .summary-count { color: #dc2626; }
        .warning .summary-count { color: #f59e0b; }
        .upcoming .summary-count { color: #3b82f6; }
        .section { padding: 20px; }
        .section-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid; }
        .critical-title { color: #dc2626; border-color: #dc2626; }
        .warning-title { color: #f59e0b; border-color: #f59e0b; }
        .upcoming-title { color: #3b82f6; border-color: #3b82f6; }
        .alert-card { background: #fff; border-radius: 8px; padding: 15px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid; }
        .critical-card { border-left-color: #dc2626; background: #fef2f2; }
        .warning-card { border-left-color: #f59e0b; background: #fffbeb; }
        .upcoming-card { border-left-color: #3b82f6; background: #eff6ff; }
        .alert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .alert-type { font-weight: bold; font-size: 14px; }
        .order-number { font-size: 12px; color: #6b7280; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
        .alert-message { font-size: 14px; color: #4b5563; margin-bottom: 8px; }
        .alert-meta { font-size: 12px; color: #6b7280; }
        .no-alerts { text-align: center; padding: 30px; color: #6b7280; }
        .no-alerts-icon { font-size: 48px; margin-bottom: 10px; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
        .footer a { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Resumen Diario de Pedidos</h1>
          <p>${today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div class="summary">
          <div class="summary-item critical">
            <div class="summary-count">${alerts.summary.criticalCount}</div>
            <div class="summary-label">🔴 Críticos</div>
          </div>
          <div class="summary-item warning">
            <div class="summary-count">${alerts.summary.warningCount}</div>
            <div class="summary-label">🟡 Advertencias</div>
          </div>
          <div class="summary-item upcoming">
            <div class="summary-count">${alerts.summary.upcomingCount}</div>
            <div class="summary-label">🔵 Próximos</div>
          </div>
        </div>

        ${alerts.summary.totalAlerts === 0 ? `
          <div class="no-alerts">
            <div class="no-alerts-icon">✅</div>
            <p><strong>¡Todo en orden!</strong></p>
            <p>No hay alertas pendientes para hoy.</p>
          </div>
        ` : ''}

        ${alerts.critical.length > 0 ? `
          <div class="section">
            <div class="section-title critical-title">🔴 ACCIÓN REQUERIDA HOY (${alerts.critical.length})</div>
            ${alerts.critical.map(alert => `
              <div class="alert-card critical-card">
                <div class="alert-header">
                  <span class="alert-type">${alert.alertTitle}</span>
                  <span class="order-number">${alert.orderNumber}</span>
                </div>
                <div class="alert-message">${alert.alertMessage}</div>
                <div class="alert-meta">
                  <strong>${alert.clientName}</strong> • ${formatCurrency(alert.totalPrice)}
                  ${alert.eventDate ? ` • Entrega: ${new Date(alert.eventDate).toLocaleDateString('es-MX')}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${alerts.warning.length > 0 ? `
          <div class="section">
            <div class="section-title warning-title">🟡 REQUIERE ATENCIÓN (${alerts.warning.length})</div>
            ${alerts.warning.map(alert => `
              <div class="alert-card warning-card">
                <div class="alert-header">
                  <span class="alert-type">${alert.alertTitle}</span>
                  <span class="order-number">${alert.orderNumber}</span>
                </div>
                <div class="alert-message">${alert.alertMessage}</div>
                <div class="alert-meta">
                  <strong>${alert.clientName}</strong> • ${formatCurrency(alert.totalPrice)}
                  ${alert.eventDate ? ` • Entrega: ${new Date(alert.eventDate).toLocaleDateString('es-MX')}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${alerts.upcoming.length > 0 ? `
          <div class="section">
            <div class="section-title upcoming-title">🔵 PRÓXIMOS (${alerts.upcoming.length})</div>
            ${alerts.upcoming.map(alert => `
              <div class="alert-card upcoming-card">
                <div class="alert-header">
                  <span class="alert-type">${alert.alertTitle}</span>
                  <span class="order-number">${alert.orderNumber}</span>
                </div>
                <div class="alert-message">${alert.alertMessage}</div>
                <div class="alert-meta">
                  <strong>${alert.clientName}</strong> • ${formatCurrency(alert.totalPrice)}
                  ${alert.eventDate ? ` • Entrega: ${new Date(alert.eventDate).toLocaleDateString('es-MX')}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="footer">
          <p>Este es un resumen automático de tu sistema de pedidos.</p>
          <p><a href="${process.env.ADMIN_URL || 'https://vt-souvenir-backend.onrender.com/admin'}">Ver todos los pedidos en el dashboard →</a></p>
          <p style="margin-top: 15px;">${process.env.COMPANY_NAME || 'VT Anunciando'}</p>
        </div>
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
