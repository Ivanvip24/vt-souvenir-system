/**
 * Sales Coach — DEPRECATED: API calls removed to stop cost drain.
 *
 * Coaching analysis now runs via Claude Code local cron session.
 * Script: node backend/scripts/sales-coaching-local.js [fetch|store]
 *
 * This file is kept only for the DB helper exports used by routes
 * that display existing coaching pills.
 */

import { query } from '../shared/database.js';

// No-op stubs — analysis now happens in Claude Code sessions
export async function analyzeConversation() {}
export async function analyzeAllActive() {}
