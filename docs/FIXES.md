# FIXES - Pending Issues Log

This document tracks bugs and issues that need to be fixed. Check this at the start of every session.

---

## PENDING ISSUES

*(No pending issues)*

---

## COMPLETED ISSUES

### 1. Old PDF Receipts Not Downloadable
**Status:** COMPLETED
**Reported:** 2025-12-07
**Resolved:** 2025-12-07
**Priority:** High

**Description:**
When trying to download a receipt from a past/old order, the download fails with the error: "File wasn't available on site"

**Root Cause:**
- PDF receipts were stored in `/backend/receipts/` folder
- On Render, the filesystem is ephemeral - files are lost on redeploy
- Old receipts generated before the latest deploy no longer existed

**Solution Implemented:**
- Added new API endpoint: `GET /api/orders/:orderId/receipt/download`
- This endpoint regenerates the PDF on-demand from database order data
- Updated `downloadReceipt()` function in admin dashboard to use this endpoint
- Receipts are now always available regardless of server redeploys

**Files Modified:**
- `backend/api/server.js` - Added regeneration endpoint
- `frontend/admin-dashboard/dashboard.js` - Updated download function

---

## How to Use This Document

1. **Adding Issues:** Add new issues under "PENDING ISSUES" with status, date, description, and visual references if available
2. **Completing Issues:** Move resolved issues to "COMPLETED ISSUES" section with resolution date and solution notes
3. **Session Start:** Claude will remind about pending issues at the start of each session
