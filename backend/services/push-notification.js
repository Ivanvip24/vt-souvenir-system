import webpush from 'web-push';
import { query } from '../shared/database.js';

let initialized = false;

function initializePushService() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@axkan.mx';

  if (!publicKey || !privateKey) {
    console.log('⚠️  Push notifications disabled — VAPID keys not configured');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
  console.log('🔔 Push notification service initialized');
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function saveSubscription(subscription, userAgent) {
  const { endpoint, keys } = subscription;
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       is_active = true`,
    [endpoint, keys.p256dh, keys.auth, userAgent || null]
  );
}

async function removeSubscription(endpoint) {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function sendToAll(title, body, data) {
  if (!initialized) return { sent: 0, failed: 0 };

  const result = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE is_active = true'
  );
  const subs = result.rows;
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title,
    body,
    icon: '/jaguar.png',
    badge: '/jaguar.png',
    data: data || {},
  });

  let sent = 0;
  let failed = 0;
  const staleIds = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSub, payload, { TTL: 7200 });
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [staleIds]);
  }

  return { sent, failed, cleaned: staleIds.length };
}

// Convenience notification helpers (fire-and-forget)
function notifyNewOrder(orderNumber, clientName, total) {
  sendToAll(
    'Nuevo Pedido',
    `${orderNumber} — ${clientName} — $${Number(total).toLocaleString('es-MX')}`,
    { view: 'orders', orderNumber }
  ).catch(() => {});
}

function notifyStatusChange(orderNumber, oldStatus, newStatus) {
  sendToAll(
    'Status Actualizado',
    `${orderNumber}: ${oldStatus} → ${newStatus}`,
    { view: 'orders', orderNumber }
  ).catch(() => {});
}

function notifyOrderApproved(orderNumber, clientName) {
  sendToAll(
    'Pedido Aprobado',
    `${orderNumber} — ${clientName} listo para producción`,
    { view: 'orders', orderNumber }
  ).catch(() => {});
}

export default {
  initializePushService,
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendToAll,
  notifyNewOrder,
  notifyStatusChange,
  notifyOrderApproved,
};
