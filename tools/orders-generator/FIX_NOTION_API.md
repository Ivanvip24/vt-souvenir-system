# 🔧 Fix Notion API Token - Step by Step Guide

## Problem Identified

```
❌ API token is invalid (401 Unauthorized)
```

Your Notion API token in `.env` is **invalid, expired, or revoked**. You need to create a new integration and get a fresh token.

---

## Solution: Create New Notion Integration (5 minutes)

### Step 1: Create Integration

1. **Go to Notion Integrations page**
   - Visit: https://www.notion.so/my-integrations
   - Click **"+ New integration"**

2. **Configure Integration**
   - **Name**: "VT Orders API" (or any name)
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
   - Click **"Submit"**

3. **Copy the Secret Token**
   - You'll see: `Internal Integration Secret`
   - Click **"Show"** then **"Copy"**
   - Format: `secret_XXXXXXXXXXXXXXXXXXXXXXXXXXXX` or `ntn_XXXXXXXXXXXXXXXXXXXXXXXXXXXX`
   - ⚠️ **Keep this token secure! Don't share it.**

### Step 2: Configure Integration Capabilities

Still on the integration page, scroll down to **Capabilities**:

✅ **Enable these permissions:**
- ✅ Read content
- ✅ Update content
- ✅ Insert content

Click **"Save changes"**

### Step 3: Get Parent Page ID

1. **Open your target page in Notion**
   - This is the page where you want orders to be created
   - Example: A page called "VT Orders 2025"

2. **Copy the page URL**
   - URL looks like: `https://www.notion.so/My-Page-Title-29381b8c4429809eadfdc87751881352?v=...`
   - The page ID is the **32-character string** after the title
   - Example: `29381b8c4429809eadfdc87751881352`

3. **Share page with integration**
   - On your target page, click **"..."** (top right)
   - Click **"Connections"** → **"Connect to"**
   - Find and select your integration ("VT Orders API")
   - ⚠️ **This step is CRITICAL - without it, the integration can't access the page!**

### Step 4: Update .env File

Open `.env` file and replace with your new values:

```env
# Notion API Credentials
NOTION_API_TOKEN=secret_YOUR_NEW_TOKEN_HERE
NOTION_PARENT_PAGE_ID=YOUR_32_CHAR_PAGE_ID_HERE

# Optional: Leave commented for now
# NOTION_ORDERS_DB_ID=

# Google Drive Configuration (optional - for images in Notion)
GOOGLE_DRIVE_FOLDER_ID=1P8ZjorcuYvm70dFERVhJY_eIIcD1mNCF
```

**Example with real format:**
```env
NOTION_API_TOKEN=secret_ABCDefgh123456789XYZabcdefg
NOTION_PARENT_PAGE_ID=29381b8c4429809eadfdc87751881352
```

### Step 5: Test the Connection

Run the diagnostic tool again:

```bash
python3 test_notion_api.py
```

**Expected output:**
```
✅ PASSED: All required environment variables found
✅ PASSED: API token is valid
✅ PASSED: Parent page is accessible
✅ PASSED: Can create pages in parent
✅ PASSED: Can create databases in parent

🎉 All tests passed!
```

If tests pass, run the main script:

```bash
python3 notion_quick.py
```

---

## Common Issues & Solutions

### Issue 1: "API token is invalid" (still)

**Causes:**
- Copied token incorrectly (extra spaces, incomplete)
- Token format is wrong

**Fix:**
- Copy token again (use "Copy" button, not manual selection)
- Ensure `.env` has NO spaces around `=`
- Correct: `NOTION_API_TOKEN=secret_abc123`
- Wrong: `NOTION_API_TOKEN = secret_abc123`

### Issue 2: "Cannot access parent page"

**Causes:**
- Forgot to share page with integration
- Page ID is incorrect

**Fix:**
1. Open page in Notion
2. Click **"..."** → **"Connections"** → Add integration
3. Verify page ID from URL (32 characters, no dashes)

### Issue 3: "Integration doesn't have access to this page"

**Causes:**
- Page not connected to integration
- Integration in different workspace

**Fix:**
1. Make sure page and integration are in SAME workspace
2. Share page with integration (see Step 3 above)

### Issue 4: Tests pass but notion_quick.py still fails

**Causes:**
- Google Drive credentials missing (images won't show)
- Database structure mismatch

**Fix:**
- Google Drive is optional - ignore if you just want text
- Run: `python3 generate_quick.py` for PDF-only workflow (no Notion)

---

## Quick Reference

### What You Need

1. ✅ **Notion Integration Token** (from https://www.notion.so/my-integrations)
2. ✅ **Parent Page ID** (32 chars from page URL)
3. ✅ **Page shared with integration** (via Connections menu)

### File Locations

- **Configuration**: `.env` (in ORDERS_REPOSITORY folder)
- **Test script**: `test_notion_api.py`
- **Main script**: `notion_quick.py`

### Commands

```bash
# Test API connection
python3 test_notion_api.py

# Generate order (Notion + PDF)
python3 notion_quick.py

# Generate order (PDF only - no Notion)
python3 generate_quick.py
```

---

## Still Having Issues?

Run the diagnostic with verbose output:

```bash
python3 test_notion_api.py 2>&1 | tee notion_debug.log
```

This saves all output to `notion_debug.log` for troubleshooting.

**Check:**
1. Is the token format `secret_XXXX` or `ntn_XXXX`?
2. Is the page ID exactly 32 characters (no dashes)?
3. Did you click "Connect to integration" on the page?

---

## Next Steps After Fix

Once tests pass:

1. ✅ Run `python3 notion_quick.py` to create first order
2. ✅ Verify order appears in Notion
3. ✅ Verify PDF is generated
4. 🎉 Done! Both outputs working independently
