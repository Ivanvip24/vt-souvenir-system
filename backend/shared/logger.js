/**
 * Structured JSON Logger (Playbook Section 5 — Observability)
 *
 * Every log line is one JSON object on stdout. Machine-parseable,
 * searchable, and ready for Loki/Grafana when we scale.
 *
 * Usage:
 *   import { log } from '../shared/logger.js';
 *   log('info', 'order.created', { orderId: 123, client: 'Juan' });
 *   log('error', 'whatsapp.send.fail', { error: err.message, phone });
 *
 * Output:
 *   {"ts":"2026-04-23T15:30:00.000Z","level":"info","event":"order.created","orderId":123,"client":"Juan"}
 */

export function log(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  process.stdout.write(JSON.stringify(record) + '\n');
}

export function logError(event, error, fields = {}) {
  log('error', event, {
    error: error.message || String(error),
    stack: error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : undefined,
    ...fields,
  });
}
