# Sales Intelligence

> Coaching pills, learning engine, and conversation analysis to improve sales conversion.

## What it does

1. **Sales Coach** — After each WhatsApp message, Haiku analyzes the conversation and generates a "coaching pill" (a specific suggestion for what to do next)
2. **Learning Engine** — Learns from completed orders, admin corrections, and failed conversations. Adjusts bot behavior over time.
3. **Sales Insights** — Periodic analysis of all conversation data to identify patterns, what works, and what doesn't

## How it works

```
Every incoming WhatsApp message:
    |
    +--> sales-coach.js (non-blocking)
    |    +--> Claude Haiku analyzes conversation
    |    +--> Categorizes: missing_info, ready_to_close, cold_lead, change_technique
    |    +--> Stores pill in sales_coaching table
    |    +--> Dashboard shows pills with "follow" / "dismiss" actions
    |
    +--> sales-learning-engine.js
         +--> On order: learns what worked (learnFromOrder)
         +--> On correction: learns what to avoid (detectCorrection)
         +--> Nightly: pattern analysis across all conversations

Sales Insights (local via Claude Code):
    +--> node backend/scripts/sales-insights-local.js
    +--> 17 SQL queries: conversion rates, response times, coaching ROI, etc.
    +--> Claude Code analyzes, human stores back to DB
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/sales-coach.js` | Per-message coaching pills (Haiku) |
| `backend/services/sales-learning-engine.js` | Pattern learning + nightly analysis |
| `backend/services/sales-insights-engine.js` | Data fetcher for insights |
| `backend/scripts/sales-insights-local.js` | Local analysis script |
| `backend/api/coaching-routes.js` | Coaching + insights API |

## Current state

### What works
1. Coaching pills generated for every conversation
2. 4 categories: missing_info, ready_to_close, cold_lead, change_technique
3. Dashboard shows pills with follow/dismiss
4. Learning engine captures corrections and patterns
5. Hundreds of sales learnings accumulated (growing over time)
6. Insights data fetcher with delta mode (no API cost)

### What still fails or needs work
1. **0% ROI on coaching:** 1,426 pills generated, 0 orders attributed to them
2. Coaching pills pile up without being acted on
3. Learnings have 0 validations — no feedback loop
4. "Applied" learnings don't measurably change bot behavior
5. Coach costs ~$10-20/month in Haiku calls with no proven return
6. Nightly pattern analysis generates generic insights

### Future plans
1. Only generate coaching pills for high-intent conversations (not every message)
2. Auto-apply top learnings to system prompt instead of manual toggle
3. Track which specific learnings correlate with closed deals
4. Cost-gate: skip coaching for conversations under 5 messages

## Cost impact

| Component | Model | Cost/month |
|-----------|-------|-----------|
| Sales coach | Claude Haiku 4.5 | ~$10-20 |
| Learning engine | Claude Haiku 4.5 | ~$3-5 |
| Sales insights | Local (Claude Code) | $0 |
| Conversation insights | Claude Sonnet 4.5 | ~$15-30 (dashboard trigger) |
