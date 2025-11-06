# Render.com Deployment Guide

## Overview

Your souvenir management system is configured for deployment on **Render.com** as a single **Web Service**. This eliminates the need for separate frontend deployment (like Vercel) - everything runs from one place.

## Architecture

- **Backend:** Node.js Express server
- **Frontend:** Static files served by the backend
- **Database:** PostgreSQL (separate Render service or external)
- **GitHub:** Auto-deploys on push to `main` branch

## URLs After Deployment

Once deployed, you'll access everything through a single domain:

- **Backend API:** `https://vt-souvenir-backend.onrender.com/api`
- **Client Order Form:** `https://vt-souvenir-backend.onrender.com/`
- **Admin Login:** `https://vt-souvenir-backend.onrender.com/admin/login`
- **Admin Dashboard:** `https://vt-souvenir-backend.onrender.com/admin`
- **Webhooks (Make.com):** `https://vt-souvenir-backend.onrender.com/api/webhooks/`

## Step-by-Step Setup

### 1. Create New Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository: `Ivanvip24/vt-souvenir-system`
4. Configure the service:

**Basic Settings:**
```
Name: vt-souvenir-backend
Region: Oregon (US West) or closest to you
Branch: main
Root Directory: backend
```

**Build & Deploy:**
```
Runtime: Node
Build Command: npm install
Start Command: npm start
```

**Instance Type:**
- Free tier: OK for testing
- Starter ($7/month): Recommended for production
  - 512 MB RAM
  - No sleep on inactivity
  - Persistent storage

### 2. Set Environment Variables

Go to **Environment** tab in your Render service and add these variables:

#### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database
DB_TYPE=postgres

# Node Environment
NODE_ENV=production
PORT=3000

# Company Info
COMPANY_NAME=VT Anunciando - Souvenirs Personalizados
COMPANY_EMAIL=informacion@vtanunciando.com
COMPANY_TIMEZONE=America/Mexico_City

# Make.com Webhooks (IMPORTANT!)
MAKE_WEBHOOK_SECRET=your-strong-secret-key-here-change-this

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

#### Optional but Recommended

```bash
# Notion Integration (if using)
NOTION_API_TOKEN=secret_xxxxxxxxxxxxx
NOTION_ORDERS_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email Reporting
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
REPORT_RECIPIENTS=email1@example.com,email2@example.com

# Report Schedules (cron format)
DAILY_REPORT_SCHEDULE=0 8 * * *
WEEKLY_REPORT_SCHEDULE=0 9 * * 1
MONTHLY_REPORT_SCHEDULE=0 10 1 * *

# Google Drive (for payment proofs)
GOOGLE_DRIVE_CLIENT_ID=your-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_DRIVE_REFRESH_TOKEN=your-refresh-token
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
```

### 3. Database Setup

You have two options:

#### Option A: Render PostgreSQL (Recommended)

1. In Render Dashboard → "New +" → "PostgreSQL"
2. Name: `souvenir-database`
3. Database: `souvenir_management`
4. User: `souvenir_management_user`
5. Region: Same as your web service
6. Instance Type: Free tier or Starter
7. After creation, copy the **Internal Database URL**
8. Add it to your web service Environment as `DATABASE_URL`

#### Option B: External Database

If using an external PostgreSQL (like your current setup):

```bash
DATABASE_URL="postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management"
```

### 4. Initialize Database Schema

After first deployment, you need to create tables:

**Via Render Shell:**
1. Go to your web service → "Shell" tab
2. Run:
```bash
cd backend
node -e "require('./shared/database.js').initializeDatabase()"
```

**Or via your local machine:**
```bash
cd backend
DB_TYPE=postgres DATABASE_URL="your-production-db-url" node -e "require('./shared/database.js').initializeDatabase()"
```

### 5. Verify Deployment

Once deployed, test these endpoints:

```bash
# 1. Health check
curl https://vt-souvenir-backend.onrender.com/health

# 2. Client order form (should return HTML)
curl https://vt-souvenir-backend.onrender.com/

# 3. Admin login page (should return HTML)
curl https://vt-souvenir-backend.onrender.com/admin/login

# 4. API products (should return JSON)
curl https://vt-souvenir-backend.onrender.com/api/products

# 5. Webhook test (should succeed with secret)
curl "https://vt-souvenir-backend.onrender.com/api/webhooks/test?secret=YOUR_SECRET"
```

### 6. Configure Make.com Webhooks

Now that your server is live, set up your Make.com automations:

1. **Important:** Use the secret you set in `MAKE_WEBHOOK_SECRET`
2. Follow the guide in [`MAKE_COM_WEBHOOKS.md`](./MAKE_COM_WEBHOOKS.md)
3. Test webhook: `https://vt-souvenir-backend.onrender.com/api/webhooks/test?secret=YOUR_SECRET`

## Common Issues & Solutions

### Issue: "Cannot connect to database"

**Solution:**
- Check `DATABASE_URL` is correct
- Ensure database allows connections from Render IPs
- If using Render PostgreSQL, use the **Internal URL** not External

### Issue: "Frontend shows 404 or doesn't load"

**Solution:**
- Check build logs: Render Dashboard → Logs tab
- Verify `frontend/` directory exists in your repo
- Check that `Root Directory` is set to `backend`
- Frontend files should be at `backend/../frontend/`

### Issue: "Webhook returns 401 Unauthorized"

**Solution:**
- Verify `MAKE_WEBHOOK_SECRET` is set in Render Environment
- Make sure Make.com sends the secret in header (`X-Webhook-Secret`) or query param (`?secret=`)
- Secret is case-sensitive

### Issue: "Email reports not sending"

**Solution:**
- If using Gmail, generate an **App Password** (not your regular password)
- Go to Google Account → Security → 2-Step Verification → App Passwords
- Use the 16-character password in `EMAIL_PASSWORD`

### Issue: "Server goes to sleep (Free tier)"

**Solution:**
- Free tier sleeps after 15 minutes of inactivity
- First request will be slow (~30 seconds)
- Upgrade to **Starter plan** ($7/month) to avoid sleep
- Or use a service like UptimeRobot to ping every 10 minutes

## Deployment Workflow

Your system uses **automatic deployments**:

```
Local changes → git push origin main → Render detects push → Builds & deploys → Live in 2-3 minutes
```

**Manual Deploy:**
1. Render Dashboard → Your service
2. Click "Manual Deploy" → "Deploy latest commit"

## Monitoring

### View Logs

Render Dashboard → Your service → "Logs" tab

Shows real-time server logs:
```
✅ Server running on port 3000
📊 Database connected
📧 Email sender initialized
🔔 Analytics scheduler started
```

### Check Metrics

Render Dashboard → Your service → "Metrics" tab

- CPU usage
- Memory usage
- Request count
- Response times

## Security Checklist

- [ ] Changed `MAKE_WEBHOOK_SECRET` from default
- [ ] Changed `ADMIN_PASSWORD` from default (`admin123`)
- [ ] Using Gmail App Password (not account password)
- [ ] Database URL uses SSL (Render PostgreSQL does by default)
- [ ] Environment variables are set (not hardcoded in code)

## Backup & Data Safety

**Database Backups:**

Render PostgreSQL (Starter plan) includes:
- Automatic daily backups
- 7-day retention
- One-click restore

**Manual Backup:**
```bash
# From Render Shell
pg_dump $DATABASE_URL > backup.sql

# Or from local machine
pg_dump "your-database-url" > backup-$(date +%Y%m%d).sql
```

## Cost Estimate

**Free Tier Setup:**
- Web Service: Free (with sleep)
- PostgreSQL: Free (90 days, then $7/month)
- **Total: $0/month initially**

**Production Setup (Recommended):**
- Web Service Starter: $7/month
- PostgreSQL Starter: $7/month
- **Total: $14/month**

**Professional Setup:**
- Web Service Pro: $25/month (1GB RAM)
- PostgreSQL Standard: $20/month (1GB storage, backups)
- **Total: $45/month**

## Support Resources

- **Render Docs:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Your System Docs:**
  - [`MAKE_COM_WEBHOOKS.md`](./MAKE_COM_WEBHOOKS.md) - Webhook automation guide
  - [`CLAUDE.md`](./CLAUDE.md) - System architecture overview

## Next Steps

1. ✅ Deploy to Render (following steps above)
2. ✅ Set environment variables
3. ✅ Initialize database
4. ✅ Test all endpoints
5. ⏭️ Set up Make.com automations (see `MAKE_COM_WEBHOOKS.md`)
6. ⏭️ Configure email reporting
7. ⏭️ Connect Google Drive for payment proofs
8. ⏭️ Set up Notion integration (optional)

---

**Need help?** Check the logs first:
```bash
# View recent logs
render logs --tail 100

# Or in dashboard: Logs tab
```

**Deployment successful?** Your URLs are:
- 🌐 Client Order Form: `https://vt-souvenir-backend.onrender.com/`
- 🔧 Admin Dashboard: `https://vt-souvenir-backend.onrender.com/admin`
- 🔗 API: `https://vt-souvenir-backend.onrender.com/api`
- 🪝 Webhooks: `https://vt-souvenir-backend.onrender.com/api/webhooks/`
