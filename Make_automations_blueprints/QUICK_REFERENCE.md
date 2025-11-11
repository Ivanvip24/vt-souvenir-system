# Quick Reference Card - All 10 Automations

Print this and keep it handy! 📋

---

## 1. WhatsApp Auto-Updates ⭐⭐⭐⭐⭐

**Trigger:** Schedule (every 30 mins)
**Webhook:** `/api/webhooks/pending-orders?status=approved,in_production,ready`
**Key Modules:** 7 (Schedule → HTTP → Filter → Iterator → Router[4] → WhatsApp → Log)
**Message Types:** 4 (Approved, Production, Ready, Urgent)
**Business Impact:** Saves 15 hrs/week

---

## 2. Payment Reminders ⭐⭐⭐⭐⭐

**Trigger:** Schedule (9 AM, 2 PM, 6 PM)
**Webhook:** `/api/webhooks/orders-filter?unpaid_balance=true&event_soon=14`
**Key Modules:** 8 (Schedule → HTTP → Filter → Iterator → Calculate → Router[4] → Messages → Log)
**Urgency Levels:** 4 (Low, Medium, High, Critical)
**Business Impact:** +$2,000-5,000/month

---

## 3. Inventory Reorder ⭐⭐⭐⭐⭐

**Trigger:** Schedule (daily 8 AM + after order creation)
**Webhook:** `/api/webhooks/low-inventory`
**Key Modules:** 6 (Schedule → HTTP → Filter → Iterator → Router[3] → WhatsApp/Email)
**Alert Levels:** 3 (Red <3d, Yellow <7d, Green <14d)
**Business Impact:** Saves $800/month

---

## 4. Instagram Auto-Quotes ⭐⭐⭐⭐

**Trigger:** Instagram DM received
**Webhooks:** `/api/client/products`, OpenAI analysis
**Key Modules:** 7 (Instagram → OpenAI → HTTP → Format → Instagram Reply → Log)
**Response Time:** <2 minutes
**Business Impact:** 3x conversion rate

---

## 5. Event Calendar ⭐⭐⭐⭐

**Trigger:** Schedule (hourly)
**Webhook:** `/api/webhooks/pending-orders?event_date=true`
**Key Modules:** 5 (Schedule → HTTP → Iterator → Google Calendar → Notion Update)
**Calendar Events:** Auto-creates with production timeline
**Business Impact:** Zero missed deadlines

---

## 6. Daily Dashboard ⭐⭐⭐⭐

**Trigger:** Schedule (11 PM daily)
**Webhook:** `/api/webhooks/analytics/daily`
**Key Modules:** 4 (Schedule → HTTP → Google Sheets → Alert if needed)
**Data Points:** Orders, Revenue, Profit, Margin %, Top Product
**Business Impact:** Real-time business insights

---

## 7. Satisfaction Survey ⭐⭐⭐

**Trigger:** Schedule (daily 10 AM)
**Webhook:** `/api/webhooks/pending-orders` + filter event=yesterday
**Key Modules:** 6 (Schedule → HTTP → Wait → WhatsApp → Monitor → Router[3])
**Follow-up:** 1-3 stars = admin alert, 5 stars = request review
**Business Impact:** 5x more reviews

---

## 8. Design Approval ⭐⭐⭐⭐

**Trigger:** Webhook (order status → pending_design)
**Tools:** Google Drive, WhatsApp to designer & client
**Key Modules:** 8 (Webhook → Drive Create → WhatsApp Designer → Watch Folder → WhatsApp Client → Monitor → Update Status)
**Approval Time:** 2-3 days → 4-6 hours
**Business Impact:** Faster production start

---

## 9. Supplier Tracker ⭐⭐⭐

**Trigger:** Manual log + scheduled reminder
**Tools:** Google Sheets for tracking
**Key Modules:** 5 (Log Order → Set Reminder → WhatsApp Confirm → Calculate Metrics → Monthly Report)
**Metrics:** On-time %, avg price, quality issues
**Business Impact:** Save 10-15% annually

---

## 10. Social Media ⭐⭐⭐

**Trigger:** Order status → delivered
**Webhook:** None (waits for client photos)
**Key Modules:** 7 (Order Delivered → Wait 2d → WhatsApp Request → OpenAI Analyze → Drive Save → Instagram Post → Tag)
**Post Frequency:** 5-10 per month
**Business Impact:** +20% inquiries

---

## 🔑 Essential Information

### Your Backend URL:
```
https://vt-souvenir-backend.onrender.com
```

### Common Webhook Endpoints:
```
/api/webhooks/test                    - Test connection
/api/webhooks/pending-orders          - Get orders
/api/webhooks/orders-filter           - Filter orders
/api/webhooks/low-inventory           - Get low stock
/api/webhooks/analytics/daily         - Daily stats
/api/webhooks/log-event               - Log events
/api/webhooks/order/{id}/status       - Update status
```

### Webhook Secret Location:
```
Render Dashboard → Your Service → Environment → MAKE_WEBHOOK_SECRET
```

### All URLs Must Include:
```
?secret=YOUR_SECRET
```

---

## 📊 Combined Operations Budget

| Automation | Ops/Month | WhatsApp Msgs |
|-----------|-----------|---------------|
| 1. WhatsApp Updates | 1,440 | ~200 |
| 2. Payment Reminders | 1,500 | ~200 |
| 3. Inventory | 400 | ~50 |
| 4. Instagram | 300 | ~50 |
| 5. Calendar | 750 | ~0 |
| 6. Dashboard | 100 | ~5 |
| 7. Surveys | 200 | ~100 |
| 8. Design | 150 | ~100 |
| 9. Supplier | 100 | ~30 |
| 10. Social | 200 | ~10 |
| **TOTAL** | **~5,140** | **~745** |

**Recommended Make.com Plan:** Pro ($16/month for 10,000 ops)
**WhatsApp Cost:** FREE (first 1,000 conversations)

---

## ⚡ Emergency Commands

### Test Webhook Connection:
```bash
curl "https://vt-souvenir-backend.onrender.com/api/webhooks/test?secret=YOUR_SECRET"
```

### Get Pending Orders:
```bash
curl "https://vt-souvenir-backend.onrender.com/api/webhooks/pending-orders?secret=YOUR_SECRET"
```

### Pause All Scenarios (Make.com):
```
Dashboard → Select All → Actions → Deactivate
```

### Check Render Logs:
```bash
render logs -r srv-d45eipuuk2gs73cg1f10 --tail
```

---

## 🐛 Quick Troubleshooting

| Issue | Most Likely Cause | Fix |
|-------|------------------|-----|
| "Unauthorized" | Wrong secret | Check MAKE_WEBHOOK_SECRET in Render |
| No data returned | No matching orders | Verify order statuses in database |
| WhatsApp not sending | Template not approved | Check Meta Business Suite |
| Scenario keeps failing | Rate limit hit | Add delay between operations |
| Wrong phone format | Missing country code | Use 10 digits only: 5551234567 |

---

## 📞 Support Resources

**Make.com Help:**
- Dashboard → ? icon → Help Center
- [make.com/en/help](https://www.make.com/en/help)

**WhatsApp Business API:**
- [business.facebook.com](https://business.facebook.com/)
- Business Settings → WhatsApp → Message Templates

**Your Backend Docs:**
- `MAKE_COM_WEBHOOKS.md` in project root
- Test endpoints with Postman

---

## 🎯 Success Checklist

### Week 1:
- [ ] All 3 critical automations running
- [ ] No errors in Make.com logs
- [ ] Clients receiving WhatsApp messages
- [ ] Payments being tracked

### Week 2:
- [ ] Instagram auto-quotes working
- [ ] Events syncing to calendar
- [ ] Daily dashboard updating

### Week 3:
- [ ] Surveys sending post-event
- [ ] Design approval workflow tested
- [ ] Supplier tracker logging data

### Week 4:
- [ ] Social media posting
- [ ] All 10 automations active
- [ ] Metrics being tracked

### Month 1:
- [ ] 20+ hours/week saved
- [ ] Payment collection >90%
- [ ] Zero stockouts
- [ ] Client satisfaction up

---

## 💡 Pro Tips

1. **Name scenarios descriptively:**
   ```
   ✅ "WA-PaymentRemind-3xDaily-Prod"
   ❌ "Untitled scenario (5)"
   ```

2. **Always test with your own phone first**

3. **Clone scenarios before major changes**

4. **Use folders: Production, Testing, Archive**

5. **Check operations usage weekly**

6. **Document any customizations you make**

7. **Keep webhook secret secure (don't commit to git)**

---

## 🚨 If Something Breaks

1. **Don't panic** - check Make.com execution history
2. **Find the failed module** - click to see error details
3. **Check webhook endpoint** - test in browser/Postman
4. **Verify data format** - ensure order structure matches expected
5. **Check rate limits** - pause scenario if hitting limits
6. **Review recent changes** - restore previous version if needed

---

## 📈 Monthly Review Template

```
Month: _______

Operations Used: _____ / 10,000
WhatsApp Messages: _____ (free: 1,000)

Automations Running: ___ / 10

Time Saved This Month: _____ hours
Value: $_____ (hours × $100)

Financial Impact:
- Improved payments: $_____
- Reduced rush orders: $_____
- Other savings: $_____
Total: $_____

Issues Encountered: _____
Optimizations Made: _____

Next Month Goals: _____
```

---

_Print this page and keep it at your desk! 📋✨_
