# Cost Management

> Tracking and controlling API costs across the system.

## Current API cost breakdown

| Service | Model | Trigger | Est. cost/month |
|---------|-------|---------|----------------|
| WhatsApp bot replies | GPT-4.1-mini (default) | Every message | $5-15 |
| Sales coach pills | Claude Haiku 4.5 | Every message | $10-20 |
| Conversation insights | Claude Sonnet 4.5 | Dashboard click | $15-30 |
| Receipt verification | Claude Sonnet 4 (Vision) | Per receipt | $5-15 |
| Supplier receipt scan | Claude Sonnet 4 (Vision) | Per receipt | $3-10 |
| Learning engine | Claude Haiku 4.5 | Per order + nightly | $3-5 |
| Design analyzer | Claude Haiku 3.5 | Per design | $1-3 |
| Designer task parser | Claude Haiku 4.5 | Per group message | $1-3 |
| Knowledge AI | Haiku (default) | Admin queries | $1-5 |
| AI Assistant | Multi-model | Admin queries | $5-20 |
| ~~Sales insights~~ | ~~Haiku 4.5~~ | ~~Every 20min~~ | ~~$45~~ **REMOVED** |
| **Total estimated** | | | **$50-130/month** |

## Cost history

| Period | Spend | Cause |
|--------|-------|-------|
| Before Mar 20 | ~$25/month | Only WhatsApp bot + receipt vision |
| Mar 20-28 | Spike began | Added sales coach, learning engine, expanded context |
| Apr 7 | Major spike | Added insights engine (72 API calls/day) |
| Apr 16 | Fixed | Removed insights cron, switched to local Claude Code |

## What changed on each date

**Mar 20** — `sales-coach.js` added: +1 Haiku call per incoming message
**Mar 21** — `sales-learning-engine.js` added: +1 Haiku per order + nightly analysis
**Mar 24** — Injected sales learnings into every bot prompt (bigger input tokens)
**Mar 28** — Expanded conversation history from 10 to 30-40 messages (3-5x more input tokens per call)
**Mar 28** — Bumped max_tokens to 800 for order creation
**Apr 7** — `sales-insights-engine.js` with 20-min cron: +72 calls/day, 4000 max_tokens each

## Cost reduction opportunities

| Action | Est. savings | Status |
|--------|-------------|--------|
| Remove insights cron | $45/month | DONE (Apr 16) |
| Switch receipt vision to Haiku 4.5 | $10-20/month | Planned |
| Gate coaching pills (only 5+ messages) | $5-10/month | Planned |
| Switch conversation insights to Haiku | $10-20/month | Planned |
| Reduce conversation context to 15 messages | $5-10/month | Planned |

## Rules

1. Default bot model is GPT-4.1-mini (cheapest) — only switch to Claude for specific chats
2. Never add a cron that calls an AI API without a "skip if unchanged" check
3. Vision models (Sonnet 4) should be replaced with Haiku 4.5 when possible
4. Local Claude Code analysis is always preferred over API calls for batch analytics
