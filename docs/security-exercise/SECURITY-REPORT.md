# Security Penetration Test Report
**Target Systems:** axkan.art + admin dashboard
**Date:** March 12, 2026
**Tester:** Ivan Valencia

---

## Executive Summary

Two systems were tested: the main brand website (axkan.art) hosted on Vercel, and the admin dashboard (vt-souvenir-frontend.onrender.com) hosted on Render. The backend API was also tested.

**Results:**
- 5 vulnerabilities found in axkan.art — **ALL 5 FIXED**
- 2 vulnerabilities found in admin dashboard (accepted risk for now)
- Backend API was well-hardened (all attacks blocked)

---

## Target 1: axkan.art (Vercel)

### VULNERABILITY 1: Clickjacking (MEDIUM)
**What:** The site has no `X-Frame-Options` header, so it can be embedded in an invisible iframe on a malicious page.

**Attack:** A hacker creates a page with a transparent iframe of axkan.art overlaid on a fake "Claim Prize" button. When the user clicks the button, they're actually clicking something on axkan.art.

**Proof:** Open `clickjack-poc.html` in a browser.

**Fix:** Add `X-Frame-Options: SAMEORIGIN` header in Vercel config.

**Status: FIXED** — Added `X-Frame-Options: SAMEORIGIN` to `frontend/vercel.json`

---

### VULNERABILITY 2: Open CORS (MEDIUM)
**What:** The server sends `Access-Control-Allow-Origin: *`, allowing ANY website to make JavaScript requests to axkan.art.

**Attack:** A hacker's website can silently fetch all of axkan.art's content using `fetch('https://axkan.art')`. If there were any user-specific data, it could be stolen.

**Proof:** Open `xss-test.html` in a browser and click "Run CORS Exploit."

**Fix:** Remove the wildcard CORS header entirely.

**Status: FIXED** — Removed `Access-Control-Allow-Origin: *` from `frontend/vercel.json`

---

### VULNERABILITY 3: Missing Content-Security-Policy (LOW)
**What:** No CSP header means the browser won't block injected scripts.

**Impact:** If an attacker finds any XSS vector (e.g., URL parameters reflected in the page), there's no CSP to prevent the injected script from executing.

**Status: FIXED** — Added full CSP policy to `frontend/vercel.json`

---

### VULNERABILITY 4: Missing X-Content-Type-Options (LOW)
**What:** Without `nosniff`, the browser may interpret uploaded files as a different MIME type, potentially executing malicious content.

**Status: FIXED** — Added `X-Content-Type-Options: nosniff` to `frontend/vercel.json`

---

### VULNERABILITY 5: Missing Permissions-Policy (LOW)
**What:** No restrictions on browser features (camera, microphone, geolocation). If XSS is found, an attacker could access these features.

**Status: FIXED** — Added `Permissions-Policy: camera=(), microphone=(), geolocation=()` to `frontend/vercel.json`

---

## Target 2: Admin Dashboard Frontend (Render)

### VULNERABILITY 6: Information Disclosure in JavaScript (MEDIUM)
**What:** All frontend JS files are publicly accessible and reveal:
- Backend URL: `https://vt-souvenir-backend.onrender.com`
- All API endpoint paths
- Authentication mechanism (JWT in localStorage)
- Token header format (`Bearer {token}`)

**Attack:** `curl https://vt-souvenir-frontend.onrender.com/admin-dashboard/login.html` reveals the entire authentication flow.

**Impact:** Gives attackers a complete map of the API surface to target.

**Note:** This is normal for SPAs (Single Page Applications) — the code MUST be sent to the browser. Mitigation: ensure backend security is solid (which it is).

---

### VULNERABILITY 7: Token in localStorage (MEDIUM)
**What:** The JWT token is stored in `localStorage`, which is accessible to any JavaScript running on the page.

**Attack:** If XSS is found, an attacker can steal the token with `localStorage.getItem('admin_token')` and use it to access the admin API.

**Fix:** Use `httpOnly` cookies instead of localStorage (requires backend changes).

---

## Target 3: Backend API (Render)

### All attacks BLOCKED:

| Attack | HTTP Code | Result |
|--------|-----------|--------|
| Access /api/orders without auth | 401 | Blocked |
| Access /api/clients without auth | 401 | Blocked |
| Fake JWT (garbage) | 401 | Blocked |
| Fake JWT (wrong secret) | 401 | Blocked |
| Fake JWT (none algorithm) | 401 | Blocked |
| Default creds admin/admin123 | 401 | Blocked |
| Brute force (5+ attempts) | 429 | Rate limited |
| SQL injection in catalog | 200 | No data leaked |
| Path traversal (/.env) | 404 | Blocked |
| CORS from evil origin | - | No headers returned |
| Access receipts/quotes | 401 | Blocked |

---

## Tools Used

| Tool | Purpose |
|------|---------|
| curl | HTTP requests, header analysis |
| node.js | JWT token forging |
| Browser DevTools | XSS testing, CORS testing |
| grep | Source code analysis |

---

## Recommendations

### Immediate (axkan.art) — COMPLETED:
1. Security headers added to `frontend/vercel.json`:
   - `X-Frame-Options: SAMEORIGIN` (blocks clickjacking)
   - `X-Content-Type-Options: nosniff` (blocks MIME sniffing)
   - `Content-Security-Policy` (restricts script/resource loading)
   - `Permissions-Policy` (disables camera/mic/geo)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - Removed `Access-Control-Allow-Origin: *` (was open CORS)

### Future (Admin Dashboard):
2. Migrate token storage from localStorage to httpOnly cookies
3. Add Content-Security-Policy header to Render static site

---

## Proof-of-Concept Files

- `clickjack-poc.html` — Clickjacking attack demo against axkan.art
- `xss-test.html` — CORS exploitation demo against axkan.art

Open these in Chrome to see the attacks in action.
