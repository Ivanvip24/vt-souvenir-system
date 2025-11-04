# Setup Issues and How to Fix Them

## Issue 1: Images Not Showing in Admin Dashboard ❌

**Problem:** Client-uploaded images (payment proofs, reference images) aren't visible or downloadable.

**Root Cause:** Images need to be stored in Google Drive to be accessible.

### Solution: Set Up Google Drive Integration

Follow the detailed guide in `GOOGLE_DRIVE_SETUP.md` (in this same folder).

**Quick checklist:**
- [ ] Create Google Cloud Project
- [ ] Enable Google Drive API
- [ ] Create Service Account
- [ ] Download credentials JSON → save as `backend/google-drive-credentials.json`
- [ ] Share your Drive folder with the service account email
- [ ] Folder ID is already in .env: `1CgF4LXj1K__VexRZP_QITE8ls0WeosvK`
- [ ] Restart server

**Estimated time:** 10 minutes

---

## Issue 2: Notion Pages Not Being Created ❌

**Problem:** When you approve orders in the admin dashboard, pages aren't being created in Notion.

**Root Cause:** The Notion API token in your `.env` file is invalid or incomplete.

### Solution: Update Notion Integration Token

#### Step 1: Get a Valid Notion Token

1. Go to https://www.notion.so/my-integrations
2. Click on your existing integration or "Create new integration"
3. Fill in:
   - **Name:** VT Anunciando Orders
   - **Associated workspace:** Your workspace
   - **Type:** Internal Integration
4. Click "Submit"
5. Copy the "Internal Integration Token" (starts with `secret_...`)

#### Step 2: Update Your .env File

Open `backend/.env` and replace the current token:

```bash
# OLD (invalid):
NOTION_API_TOKEN=your_notion_token_here

# NEW (your actual token):
NOTION_API_TOKEN=secret_YOUR_ACTUAL_TOKEN_HERE
```

#### Step 3: Share Database with Integration

1. Open your Notion Orders database
2. Click the "..." menu (top right)
3. Scroll down and click "Add connections"
4. Search for "VT Anunciando Orders" (or whatever you named your integration)
5. Click it to connect

#### Step 4: Update Property Mappings (IMPORTANT!)

The code expects specific property names in your Notion database. We need to map them correctly.

**Option A: Match Your Database to the Code**

Add these properties to your Notion database (if missing):
- Order Number (Title)
- Order Date (Date)
- Client Name (Text)
- Phone (Phone)
- Address (Text)
- City (Text)
- State (Text)
- Products (Text)
- Quantities (Text)
- Total Price (Number)
- Production Cost (Number)
- Profit (Number - Formula)
- Profit Margin % (Number - Formula)
- Status (Status)
- Department (Select)
- Delivery Date (Date)
- Notes (Text)

**Option B: Update the Code to Match Your Database**

If you already have a database with different property names:

1. Open your Notion database
2. Take note of your actual property names
3. Edit `backend/agents/notion-agent/config.js`
4. Update the `propertyMappings` object with YOUR property names:

```javascript
export const propertyMappings = {
  orderNumber: 'Name', // Replace with YOUR title property
  orderDate: 'Date',   // Replace with YOUR date property
  // ... etc
};
```

#### Step 5: Test the Integration

```bash
# Kill and restart server
killall -9 node
node demo-server.js

# Test Notion connection
node -e "
import('./agents/notion-agent/index.js').then(async (agent) => {
  console.log('Testing Notion...');
  const result = await agent.createOrder({
    orderNumber: 'TEST-001',
    clientName: 'Test',
    totalPrice: 100,
    status: 'Design'
  });
  console.log(result.success ? '✅ Working!' : '❌ Failed');
}).catch(e => console.error('Error:', e.message));
"
```

---

## Verification Checklist

After completing the setup:

### Google Drive ✓
- [ ] Credentials file exists at `backend/google-drive-credentials.json`
- [ ] Drive folder shared with service account
- [ ] Server logs show: `✅ Google Drive integration configured`
- [ ] Upload test image in client form
- [ ] Image appears in your Google Drive folder
- [ ] Image is visible in admin dashboard

### Notion Integration ✓
- [ ] Valid token in `.env` (starts with `secret_`)
- [ ] Database is shared with the integration
- [ ] Property names match between database and config.js
- [ ] Server logs show no Notion errors
- [ ] Approve a test order
- [ ] New page appears in Notion database

---

## Quick Test Workflow

1. **Create a test order:**
   - Go to: http://localhost:3000/order
   - Fill out form with test data
   - Upload a test payment proof image
   - Submit order

2. **Approve the order:**
   - Go to: http://localhost:3000/admin
   - Login with admin credentials
   - Click "Revisar Pedido" on the test order
   - Click "Aprobar Pedido"

3. **Verify:**
   - ✓ Image should be visible in the admin dashboard
   - ✓ Image should be in your Google Drive folder
   - ✓ A new page should appear in your Notion database
   - ✓ The Notion page should have all order details

---

## Troubleshooting

### Google Drive Issues

**"Google Drive not configured"**
- Check that `google-drive-credentials.json` exists in backend folder
- Verify it's valid JSON (open the file and check)

**"Permission denied"**
- Ensure you shared the folder with the service account email
- The email is in the credentials JSON as `client_email`
- Give "Editor" permissions, not just "Viewer"

**Files upload but don't show in dashboard**
- Restart your browser (clear cache)
- Check browser console for errors
- Verify the file URLs are using the correct Drive format

### Notion Issues

**"API token is invalid"**
- Token must start with `secret_`
- Copy the entire token (they're quite long)
- No quotes or spaces in the .env file

**"Property ... is not a property that exists"**
- The property names in config.js don't match your database
- Open your Notion database and check the actual property names (they're at the top of each column)
- Update config.js to match exactly (case-sensitive!)

**"Unauthorized" or "Database not found"**
- You need to share the database with your integration
- In Notion: Click "..." → "Add connections" → Select your integration

**Notion pages created but missing data**
- Property types might not match (e.g., trying to put text in a number field)
- Check the property types in your Notion database
- Update the code in `agents/notion-agent/index.js` if needed

---

## Need Help?

1. Check the server logs - they show detailed error messages
2. Look at the browser console (F12) for frontend errors
3. Verify all credentials are correct in `.env`
4. Make sure you restarted the server after making changes

---

## Current Status

Based on the test we just ran:

- ❌ **Google Drive:** Not configured yet (needs credentials file)
- ❌ **Notion:** Token is invalid (needs to be updated)

Once you fix both, your system will be fully functional!
