# Cloud Database Setup with Supabase

This guide will help you set up a **permanent, cloud-based PostgreSQL database** that's accessible from any computer.

## Why Cloud Database?

- Data persists across server restarts
- Accessible from any computer with internet
- Automatic backups
- Free tier (500MB storage)
- No installation required

---

## Step 1: Create Supabase Account (2 minutes)

1. Go to: **https://supabase.com**
2. Click **"Start your project"**
3. Sign up with GitHub or email
4. Verify your email if needed

---

## Step 2: Create New Project (1 minute)

1. Click **"New Project"**
2. Fill in:
   - **Name:** `vt-souvenirs` (or any name you like)
   - **Database Password:** Create a strong password (SAVE THIS!) your_database_password_here
   - **Region:** Choose closest to Mexico (e.g., "South America (São Paulo)")
   - **Pricing Plan:** Free tier is fine
3. Click **"Create new project"**
4. Wait ~2 minutes for database to be ready

---

## Step 3: Get Database Connection String (1 minute)

1. Once your project is ready, click **"Connect"** (top right)
2. Go to the **"URI"** tab
3. You'll see a connection string like:

```
postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
```

4. **IMPORTANT:** Replace `[YOUR-PASSWORD]` with your actual database password
5. **Copy the complete connection string**
postgresql://postgres:[your_database_password_here]@db.rgfnptfazdzkngprkzrp.supabase.co:5432/postgres
---

## Step 4: Update Your .env File

Open `backend/.env` and update these lines:

```bash
# Change from demo to postgres
DB_TYPE=postgres

# Replace with your Supabase connection details
# Format: postgresql://postgres:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres
DB_HOST=db.xxx.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_actual_password_here
```

**Quick method - Use the full connection string:**

You can also parse the connection string Supabase gave you:
- If it's: `postgresql://postgres:MyPass123@db.abcdefgh.supabase.co:5432/postgres`
- Then:
  - DB_HOST=db.abcdefgh.supabase.co
  - DB_PASSWORD=MyPass123

---

## Step 5: Initialize Database Schema

Run this command from the `backend` folder:

```bash
npm run init-db
```

This will create all tables, views, and sample data in your cloud database.

You should see:

```
✓ Database connected successfully
📝 Creating tables and views...
✅ Database schema created successfully!

Created tables:
  - clients
  - products
  - orders
  - order_items
  - production_tracking
  - reports_history
  - analytics_cache

Created views:
  - order_summary
  - daily_revenue
  - top_products
  - top_clients
```

---

## Step 6: Start Server with Database

Kill all old demo servers and start fresh:

```bash
killall -9 node
npm start
```

Or if you don't have nodemon:

```bash
killall -9 node
node demo-server.js
```

---

## Step 7: Verify Everything Works

### Test 1: Check Server Logs

You should see:
```
✓ Database connected successfully
✅ System running with PostgreSQL database
```

### Test 2: Create a Test Order

1. Go to: http://localhost:3000/order
2. Fill out the form and submit
3. Check admin dashboard: http://localhost:3000/admin

### Test 3: Verify Persistence

1. Create an order
2. Kill the server: `killall -9 node`
3. Restart: `node demo-server.js`
4. Check admin dashboard - your order should still be there!

### Test 4: Access from Another Computer

Your data is now in the cloud! To access from another computer:

1. Copy the entire `backend` folder to the other computer
2. Make sure the `.env` file has the same database credentials
3. Run `npm install` (first time only)
4. Run `npm start`
5. All your orders will be there!

---

## Troubleshooting

### "Database connection failed"

**Problem:** Can't connect to Supabase

**Solutions:**
1. Check your password is correct (no spaces, exact match)
2. Verify the DB_HOST includes the full domain (e.g., `db.abcdefgh.supabase.co`)
3. Make sure DB_PORT=5432
4. Check your internet connection
5. In Supabase dashboard, go to Settings → Database and verify connection string

### "relation does not exist"

**Problem:** Tables not created yet

**Solution:**
```bash
npm run init-db
```

### Multiple servers still running

**Problem:** Old demo-mode servers interfering

**Solution:**
```bash
# Kill ALL node processes
killall -9 node

# Wait 2 seconds
sleep 2

# Start fresh
npm start
```

---

## What's Different Now?

### BEFORE (Demo Mode):
- ❌ Data stored in memory (JavaScript arrays)
- ❌ Lost on server restart
- ❌ Only accessible on this computer
- ❌ No real analytics

### AFTER (Cloud Database):
- ✅ Data permanently stored in PostgreSQL
- ✅ Survives server restarts
- ✅ Accessible from any computer
- ✅ Full analytics with views
- ✅ Automatic backups (Supabase handles this)
- ✅ Multi-user ready

---

## Free Tier Limits

Supabase free tier includes:
- 500 MB database space (plenty for thousands of orders)
- Unlimited API requests
- Automatic backups (7 days retention)
- 2 GB bandwidth per month

For a souvenir business, this should be more than enough!

---

## Next Steps After Setup

Once your database is running:

1. **Set up Google Drive** (for images) - Follow `GOOGLE_DRIVE_SETUP.md`
2. **Configure email reports** (optional) - Update email settings in `.env`
3. **Share with team** - Give them the `.env` file (securely!) so they can connect from their computers

---

## Security Note

Your `.env` file contains sensitive database credentials.

- ❌ DON'T commit it to git (it's already in .gitignore)
- ❌ DON'T share it publicly
- ✅ DO share it securely with team members (encrypted message, password manager, etc.)
- ✅ DO keep a backup in a safe place

---

## Viewing Your Data Directly

You can view/edit your database directly in Supabase:

1. Go to your Supabase dashboard
2. Click "Table Editor" in the left menu
3. Select any table (clients, orders, etc.)
4. View, edit, or export data

This is useful for:
- Checking data is saving correctly
- Manual edits if needed
- Exporting to CSV
- Running custom SQL queries

---

## Current Status Summary

Your system currently has:
- ✅ **Notion Integration** - Working! Creates pages on approval
- ⏳ **Google Drive** - Code ready, needs service account setup
- ⏳ **Database** - About to set up! (Follow this guide)

Once you complete this database setup, your system will be FULLY FUNCTIONAL with permanent storage!
