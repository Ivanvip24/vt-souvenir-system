# Sales AI Insights Feed — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static Sales AI tab with a living AI-generated insights feed that surfaces patterns, compares approaches (natural A/B testing), and gives actionable recommendations — all backed by real conversation data.

**Architecture:** A cron job runs every 20 minutes, fetches ALL analytics data + learnings + coaching outcomes, sends to Claude Haiku which returns 8-12 categorized insights as JSON. Stored in `sales_insights` table. Frontend fetches latest batch and renders as sectioned cards: What's Working, What's Not Working, Experiments, Recommendations. KPI bar at top for context.

**Tech Stack:** PostgreSQL, Claude Haiku API (claude-haiku-4-5-20251001), node-cron, Express, vanilla JS frontend

---

## Tasks

### Task 1: Database Migration
- Create: `backend/migrations/add-sales-insights.js`
- Modify: `backend/api/server.js` (~line 6039, add migration call)

### Task 2: Insights Engine Service
- Create: `backend/services/sales-insights-engine.js`
- Collects ALL data (17 analytics queries + all learnings + all coaching pills + recent conversations)
- Sends to Claude Haiku, stores categorized insights

### Task 3: API Endpoint + Scheduler
- Modify: `backend/api/coaching-routes.js` (add GET /insights)
- Modify: `backend/api/server.js` (add 20min cron)

### Task 4: Frontend — Replace Sales AI Tab
- Modify: `frontend/admin-dashboard/whatsapp.js` (replace loadSalesAnalytics + renderSalesDashboard)

### Task 5: CSS Styles
- Modify: `frontend/admin-dashboard/whatsapp.js` (CSS section)

### Task 6: Clean Up Old Code
- Remove unused helper functions (formatSalesTime, createSalesCard, buildPriorityGroup, old renderSalesDashboard)

---

See conversation context for full implementation details per task.
