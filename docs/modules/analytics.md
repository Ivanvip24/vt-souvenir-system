# Analytics & Reports

> Revenue tracking, email reports, and sales insights — now analyzed locally via Claude Code.

## What it does

1. Calculates revenue, profit, and margins from the orders database
2. Sends daily digest emails at 8 AM with priority action list (configurable via DAILY_DIGEST_SCHEDULE)
3. Generates daily/weekly/monthly HTML reports via email
4. Sales insights engine fetches analytics data for local analysis
5. Stores insights in database for the admin dashboard

## How it works

```
Scheduled reports (analytics-agent):
    scheduler.js (cron) --> report-generator.js
        +--> revenue-calculator.js queries DB
        +--> Handlebars template compiles HTML
        +--> email-sender.js sends via Resend
        +--> Saved to reports_history table

Sales insights (local — no API cost):
    node backend/scripts/sales-insights-local.js
        +--> fetchInsightsData() runs 17 SQL queries
        +--> Delta mode: only fetches data changed since last run
        +--> Prints formatted report for Claude Code to analyze
        +--> store-insights.js writes results back to DB
        +--> Dashboard reads from sales_insights table
```

## Key files

| File | Purpose |
|------|---------|
| `backend/agents/analytics-agent/scheduler.js` | Cron jobs for reports |
| `backend/agents/analytics-agent/report-generator.js` | HTML report builder |
| `backend/agents/analytics-agent/revenue-calculator.js` | Revenue queries |
| `backend/agents/analytics-agent/email-sender.js` | Email via Resend |
| `backend/services/sales-insights-engine.js` | Data fetcher (no API calls) |
| `backend/scripts/sales-insights-local.js` | Local analysis script |
| `backend/scripts/store-insights.js` | Stores Claude Code analysis to DB |
| `backend/services/sales-digest-generator.js` | Daily digest email |

## Current state

### What works
1. Daily/weekly/monthly email reports
2. Daily digest with priority action list at 8 AM (default)
3. Sales insights data fetcher with delta mode
4. Configurable message limit for context control
5. Dashboard shows latest insights batch
6. Revenue/profit auto-calculated from DB views

### What still fails or needs work
1. Insights require manual Claude Code session (not fully automated yet)
2. Report templates could be more visually polished
3. No real-time dashboard — data refreshes on page load

### Future plans
1. Continuous insight loop in dedicated Claude Code session
2. Trend comparison (this week vs last week)
3. Client lifetime value tracking
4. Cohort analysis by acquisition channel

## Cost impact

**Before (April 7-16):** Anthropic API at 72 calls/day x Haiku = ~$45/month
**After:** $0 — runs locally via Claude Code

## Usage

```bash
# Delta analysis (only new data)
node backend/scripts/sales-insights-local.js

# Full analysis
node backend/scripts/sales-insights-local.js --full

# Limit context
node backend/scripts/sales-insights-local.js --messages 20

# Auto-refresh loop
node backend/scripts/sales-insights-local.js --loop 30m

# Store insights to dashboard
echo '[...]' | node backend/scripts/store-insights.js
```
