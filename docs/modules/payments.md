# Payments

> Receipt verification, bank transfer validation, and payment auto-approval.

## What it does

1. Client sends payment receipt image via WhatsApp or uploads through portal
2. Claude Vision analyzes the receipt — extracts amount, date, reference number
3. Banxico CEP validates SPEI transfers (confirms money actually moved)
4. If amount matches order total, auto-approves payment
5. Generates branded PDF receipt for client

## How it works

```
Payment receipt arrives (WhatsApp image or upload)
    |
    v
payment-receipt-verifier.js (Claude Sonnet 4 Vision)
    +--> Extracts: amount, date, reference, bank, account
    +--> Compares against order total
    +--> Result: approved, partial, overpayment, mismatch
    |
    v (if bank transfer)
cep-service.js --> Banxico CEP portal
    +--> Validates SPEI transfer actually happened
    +--> CAPTCHA: hardcoded 'c' (backend doesn't enforce)
    +--> Date format: DD/MM/YYYY (slashes, not ISO)
    +--> Transfers take up to 30min to register
    |
    v (if not found yet)
cep-retry-scheduler.js (every 5min, up to 4 retries)
    +--> Escalating delays: 5, 15, 30, 60 minutes
    +--> CEP is additive — never prevents Vision-only approvals
    |
    v
Auto-approval --> update order status
    +--> Send branded receipt PDF to client
    +--> Email notification to admin
```

## Key files

| File | Purpose |
|------|---------|
| `backend/services/payment-receipt-verifier.js` | Claude Vision receipt analysis |
| `backend/services/claude-receipt-analyzer.js` | Supplier receipt scanner |
| `backend/services/cep-service.js` | Banxico CEP HTTP client |
| `backend/services/cep-retry-scheduler.js` | Retry queue for failed CEP lookups |
| `backend/services/pdf-generator.js` | Branded receipt PDF |
| `backend/api/receipt-routes.js` | Upload/verification endpoints |

## Current state

### What works
1. Claude Vision extracts payment data from receipt images accurately
2. Banxico CEP validates SPEI transfers
3. Auto-approval when amount matches
4. Retry queue handles the 30-min registration delay
5. Branded PDF receipts with AXKAN identity
6. Accepts overpayments (flags but approves)

### What still fails or needs work
1. Uses Claude Sonnet 4 Vision — expensive ($3/$15 per M tokens + vision)
2. Should switch to Haiku 4.5 (still has vision, 5-8x cheaper)
3. No support for cash payments or Oxxo deposits
4. Receipt PDF redesign pending

### Future plans
1. Switch receipt analyzer to Haiku 4.5 to reduce costs
2. Add Oxxo/cash deposit verification
3. Redesign receipt PDF template
4. Payment dashboard with reconciliation view

## Cost impact

| Component | Model | Cost |
|-----------|-------|------|
| Customer receipt verification | Claude Sonnet 4 (Vision) | ~$0.10-0.20/receipt |
| Supplier receipt scanning | Claude Sonnet 4 (Vision) | ~$0.10-0.20/receipt |
| Banxico CEP | Free HTTP POST | $0 |

**Cost reduction opportunity:** Switching both vision models to Haiku 4.5 would cut receipt costs by ~80%.
