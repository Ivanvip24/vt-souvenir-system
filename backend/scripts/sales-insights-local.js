#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// Force postgres mode + SSL for cloud DB + suppress query logs
process.env.DB_TYPE = 'postgres';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
process.env.QUIET_DB = '1';

const { fetchInsightsData, storeInsights } = await import('../services/sales-insights-engine.js');

const STATE_FILE = resolve(__dirname, '../.insights-last-run');

function getLastRun() {
  if (existsSync(STATE_FILE)) {
    return readFileSync(STATE_FILE, 'utf-8').trim();
  }
  return null;
}

function saveLastRun(ts) {
  writeFileSync(STATE_FILE, ts);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { messages: 50, full: false, store: false, loop: null, json: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--messages' && args[i + 1]) opts.messages = parseInt(args[i + 1], 10) || 50;
    if (args[i] === '--full') opts.full = true;
    if (args[i] === '--store') opts.store = true;
    if (args[i] === '--json') opts.json = true;
    if (args[i] === '--loop' && args[i + 1]) {
      const val = args[i + 1];
      const match = val.match(/^(\d+)(m|h|s)?$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2] || 'm';
        opts.loop = num * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1) * 1000;
      }
    }
    if (args[i] === '--help') {
      console.log(`
Sales Insights — Local Analysis (no API cost)

Usage: node backend/scripts/sales-insights-local.js [options]

Options:
  --messages N    Number of recent conversations to include (default: 50)
  --full          Fetch all data, not just delta since last run
  --json          Output raw JSON instead of formatted report
  --store         After analysis, store insights back to DB for dashboard
  --loop Xm       Re-run every X minutes (e.g., --loop 30m, --loop 2h)
  --help          Show this help

Examples:
  node backend/scripts/sales-insights-local.js                  # Delta since last run
  node backend/scripts/sales-insights-local.js --full           # Full dataset
  node backend/scripts/sales-insights-local.js --messages 20    # Limit context
  node backend/scripts/sales-insights-local.js --loop 30m       # Auto-refresh every 30min
`);
      process.exit(0);
    }
  }
  return opts;
}

async function run(opts) {
  const since = opts.full ? null : getLastRun();
  const now = new Date().toISOString();

  if (since && !opts.full) {
    console.log(`\n--- SALES INSIGHTS (delta since ${since}) ---\n`);
  } else {
    console.log(`\n--- SALES INSIGHTS (full dataset) ---\n`);
  }

  const data = await fetchInsightsData({ since, messageLimit: opts.messages });

  // Check if there's actually new data
  if (since && data.delta) {
    if (data.delta.newMessageCount === 0 && data.delta.newOrderCount === 0) {
      console.log('No new messages or orders since last run. Nothing to analyze.');
      console.log(`Last checked: ${since}`);
      return;
    }
    console.log(`New since last run: ${data.delta.newMessageCount} messages, ${data.delta.newOrderCount} orders\n`);
  }

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Print formatted summary for Claude Code to analyze
    printFormattedReport(data);
  }

  // Save timestamp
  saveLastRun(now);

  // If --store flag, prompt for JSON input to save to DB
  if (opts.store) {
    console.log('\n--- To store insights, pipe JSON array to stdin ---');
    console.log('Format: [{"category":"working","title":"...","body":"...","evidence":{},"confidence":"high"}]');
  }
}

function printFormattedReport(data) {
  const o = data.overview;
  console.log('== OVERVIEW ==');
  console.log(`Conversations: ${o.total_conversations} | Messages: ${o.total_messages} | Clients: ${o.total_clients}`);
  console.log(`With orders: ${o.conversations_with_orders} | Close rate: ${o.close_rate}%`);

  if (data.delta) {
    console.log(`\n== DELTA (new activity) ==`);
    console.log(`New messages: ${data.delta.newMessageCount} | New orders: ${data.delta.newOrderCount}`);
    if (data.delta.newOrders.length > 0) {
      console.log('\nNew orders:');
      for (const ord of data.delta.newOrders) {
        console.log(`  #${ord.order_number} — ${ord.client_name} — $${ord.total_price} (profit: $${ord.profit}) — ${ord.status}`);
      }
    }
    if (data.delta.newMessages.length > 0) {
      console.log(`\nRecent messages (${data.delta.newMessages.length}):`);
      for (const msg of data.delta.newMessages.slice(0, 20)) {
        const dir = msg.direction === 'inbound' ? '<-' : '->';
        const preview = (msg.content || `[${msg.message_type}]`).substring(0, 80);
        console.log(`  ${dir} ${msg.client_name || 'unknown'}: ${preview}`);
      }
    }
  }

  console.log('\n== RESPONSE TIME PATTERNS ==');
  for (const r of data.responseTimePatterns) {
    console.log(`  ${r.bucket}: ${r.count} responses (${r.with_order} led to order)`);
  }

  console.log('\n== HOURLY ACTIVITY ==');
  for (const h of data.hourlyActivity) {
    console.log(`  ${String(h.hour).padStart(2, '0')}:00 — ${h.conversations} convs (${h.with_orders} with orders)`);
  }

  console.log('\n== DAILY ACTIVITY (0=Sun) ==');
  for (const d of data.dailyActivity) {
    console.log(`  Day ${d.dow}: ${d.conversations} convs (${d.with_orders} with orders)`);
  }

  console.log('\n== CONVERSATION DEPTH ==');
  for (const d of data.conversationDepth) {
    console.log(`  ${d.depth} msgs: ${d.conversations} convs (${d.with_orders} with orders)`);
  }

  console.log('\n== CONVERSATION OUTCOMES ==');
  for (const c of data.conversationOutcomes) {
    console.log(`  ${c.has_order ? 'With order' : 'No order'}: ${c.conversation_count} convs, avg ${c.avg_messages} msgs, avg ${c.avg_duration_hours}h`);
  }

  console.log('\n== COACHING EFFECTIVENESS ==');
  for (const c of data.coachingByType) {
    console.log(`  ${c.coaching_type}: ${c.total} total, ${c.followed} followed, ${c.responded} responded, ${c.orders} orders`);
  }

  if (data.allLearnings.length > 0) {
    console.log('\n== TOP SALES LEARNINGS ==');
    for (const l of data.allLearnings.slice(0, 10)) {
      console.log(`  [${l.type}/${l.category}] ${l.insight} (validated ${l.times_validated}x, applied: ${l.applied})`);
    }
  }

  console.log('\n== RECENT CONVERSATIONS ==');
  for (const c of data.recentConversations.slice(0, 15)) {
    const order = c.has_order ? ' [ORDER]' : '';
    console.log(`  ${c.client_name || 'unknown'}: ${c.msg_count} msgs, intent: ${c.intent || 'unknown'}${order}`);
    if (c.ai_summary) console.log(`    Summary: ${c.ai_summary.substring(0, 100)}`);
  }

  if (data.previousInsights.length > 0) {
    console.log('\n== PREVIOUS INSIGHTS (for comparison) ==');
    for (const p of data.previousInsights) {
      console.log(`  [${p.category}] ${p.title}: ${p.body.substring(0, 100)}`);
    }
  }

  console.log('\n--- END OF DATA ---');
  console.log('Analyze the above data. Focus on what CHANGED since previous insights.');
  console.log('Generate categorized insights: working, not_working, experiment, recommendation.');
}

// Main
const opts = parseArgs();

if (opts.loop) {
  console.log(`Running in loop mode — every ${opts.loop / 1000}s`);
  const tick = async () => {
    try { await run(opts); } catch (e) { console.error('Error:', e.message); }
  };
  await tick();
  setInterval(tick, opts.loop);
} else {
  try {
    await run(opts);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
