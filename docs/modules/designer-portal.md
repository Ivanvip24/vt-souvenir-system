# Designer Portal

> WhatsApp-bridged chat where designers talk directly to clients, with task tracking and daily reports.

## What it does

1. Ivan assigns design tasks in the "AXKAN Diseno" WhatsApp group
2. Bot detects task assignments and creates tasks in the database
3. Designers get a web portal to chat directly with clients (bridged through WhatsApp)
4. Images upload through Cloudinary (compressed) and send via WhatsApp API
5. Daily reports track designer productivity and pending tasks
6. Keepalive scheduler updates clients on design progress every 22-24h

## How it works

```
Ivan sends in AXKAN Diseno group:
    "@Sarahi disenar 200 imanes de Cancun para Luis"
    |
    v
designer-task-tracker.js (Claude Haiku 4.5 parses assignment)
    +--> Creates task in designer_tasks table
    +--> Assigns to designer (Sarahi or Majo)
    |
    v
Designer opens portal (iframe in employee dashboard)
    +--> design-portal-routes.js serves chat UI
    +--> Designer types message --> WhatsApp API sends to client
    +--> Client replies --> webhook routes to designer portal
    +--> Images: Cloudinary upload (returns .url NOT .secure_url)
    |
    v
Automated:
    +--> designer-scheduler.js (9 AM) --> follow-up to designers with pending tasks
    +--> design-keepalive-scheduler.js (22-24h) --> updates client on progress
    +--> designer-report-generator.js --> daily/weekly productivity reports
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/designer-task-tracker.js` | NLP task detection (Haiku 4.5) |
| `backend/api/design-portal-routes.js` | Portal endpoints |
| `backend/services/designer-scheduler.js` | 6 PM designer reminders |
| `backend/services/design-keepalive-scheduler.js` | Client update keepalive |
| `backend/services/designer-report-generator.js` | Productivity reports |
| `frontend/admin-dashboard/designs.html` | Portal UI (iframe) |

## Current state

### What works
1. WhatsApp-bridged chat — designers talk to clients without Ivan relaying
2. Task auto-detection from group messages
3. Image upload through Cloudinary
4. Daily follow-up reminders to designers
5. Embedded in employee dashboard via iframe (?embedded=1)

### What still fails or needs work
1. Task parsing sometimes misses assignments in non-standard format
2. No way for designers to mark tasks as "done" from WhatsApp (only portal)
3. No design revision tracking (just chat history)

### Future plans
1. Design approval workflow (client approves directly in chat)
2. Revision counter and time tracking
3. Template gallery for common designs

## Team

- **Sarahi:** +52 1 55 1894 2408
- **Majo:** +52 1 55 3481 1233
- **Group:** "AXKAN Diseno"
