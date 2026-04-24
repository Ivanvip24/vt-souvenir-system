# AI Assistant

> Admin-facing Claude assistant for quotes, images, shipping analysis, and brand knowledge queries.

## What it does

1. Universal assistant in the admin dashboard — ask anything about AXKAN
2. Generates quotes and cotizaciones
3. Creates product mockup images via Google Gemini
4. Analyzes shipping costs and carrier options
5. Answers brand knowledge questions from indexed AXKAN content
6. Supports multiple Claude models (Haiku, Sonnet, Opus)

## Key files

| File | Purpose |
|------|---------|
| `backend/api/ai-assistant-routes.js` | Assistant endpoints |
| `backend/services/knowledge-ai.js` | Brand knowledge Q&A |
| `backend/services/knowledge-index.js` | In-memory search index |
| `backend/services/gemini-image.js` | Gemini 2.5 Flash for images |
| `backend/services/rd-insights.js` | R&D business intelligence |
| `frontend/admin-dashboard/ai-assistant.js` | Assistant UI (110 KB) |

## Current state

### What works
1. Multi-model support (Haiku for fast, Sonnet for complex, Opus for deep)
2. Image generation via Gemini
3. Brand knowledge search with in-memory index
4. Quote generation integration
5. Shipping cost analysis

### What still fails or needs work
1. UI file is 110 KB — very large, slow to load
2. Knowledge index rebuilds on every server restart
3. No conversation history (each query is standalone)

### Future plans
1. Conversation memory for multi-turn interactions
2. Direct order creation from assistant
3. Integrate with inventory for real-time stock answers
