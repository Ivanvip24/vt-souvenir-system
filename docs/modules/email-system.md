# Email System

> Transactional emails: receipts, shipping notifications, daily digests, and reports.

## What it does

1. Sends payment receipts to clients after order confirmation
2. Sends shipping notifications when package is in transit
3. Daily digest email at 9 AM with sales summary
4. Scheduled reports (daily/weekly/monthly) with HTML templates

## How it works

```
Email flows:
    +--> sendReceiptEmail() — after payment verified
    +--> sendClientReceiptEmail() — branded PDF receipt
    +--> sendShippingNotificationEmail() — when Skydropx shows IN_TRANSIT
    +--> Daily digest — 9 AM cron via sales-digest-generator.js
    +--> Reports — analytics-agent/scheduler.js via cron
```

## Key files

| File | Purpose |
|------|---------|
| `backend/agents/analytics-agent/email-sender.js` | Resend/SendGrid/SMTP sender |
| `backend/services/sales-digest-generator.js` | Daily digest builder |
| `backend/agents/analytics-agent/report-generator.js` | Report HTML builder |
| `backend/agents/analytics-agent/templates/` | Handlebars report templates |

## Important email gotchas

- **Gmail strips `padding` on `<table>` elements** — only `<td>` padding works
- Use spacer rows: `<tr><td style="height:Xpx; line-height:Xpx; font-size:0;" height="X">&nbsp;</td></tr>`
- Body content uses raw `<tr>` rows injected into main wrapper table
- Provider: Resend (`RESEND_API_KEY`, from `envios@axkan.art`)

## Current state

### What works
1. All 3 email types sending correctly
2. Resend as primary provider
3. Branded templates with AXKAN identity
4. Scheduled reports running on cron

### What still fails or needs work
1. No email open/click tracking
2. Templates not responsive on all email clients
3. No unsubscribe mechanism for report emails

### Future plans
1. Email template redesign
2. Click tracking for shipping notifications
3. Welcome email sequence for new clients
