# Deployment Guide - VT Anunciando Souvenir System

## Deploy to Render (Recommended - FREE)

Render offers free hosting for Node.js applications with automatic deploys from GitHub.

### Prerequisites

✅ GitHub repository: **https://github.com/Ivanvip24/vt-souvenir-system**
✅ Supabase database: Already set up
✅ Environment variables: Ready in `.env`

---

## Step 1: Create Render Account

1. Go to **https://render.com**
2. Click **"Get Started for Free"**
3. Sign up with GitHub (recommended - easier integration)
4. Verify your email

---

## Step 2: Create New Web Service

1. Click **"New +"** (top right)
2. Select **"Web Service"**
3. Connect your GitHub repository:
   - Click **"Connect GitHub"**
   - Authorize Render to access your repositories
   - Select **"Ivanvip24/vt-souvenir-system"**

---

## Step 3: Configure Web Service

Fill in these settings:

### Basic Settings:
- **Name:** `vt-souvenir-system` (or any name you like)
- **Region:** Choose closest to you (e.g., "Oregon (US West)")
- **Branch:** `main`
- **Root Directory:** Leave empty (use root)
- **Runtime:** `Node`

### Build & Deploy:
- **Build Command:**
  ```
  cd backend && npm install
  ```

- **Start Command:**
  ```
  cd backend && npm start
  ```

### Advanced Settings:
- **Auto-Deploy:** Yes (enabled by default)
- **Health Check Path:** `/health`

---

## Step 4: Add Environment Variables

Click **"Environment"** tab and add these variables:

### Database (Supabase):
```
DB_TYPE=postgres
DB_HOST=db.rgfnptfazdzkngprkzrp.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_database_password_here
```

### Notion Integration:
```
NOTION_API_TOKEN=your_notion_token_here
NOTION_ORDERS_DATABASE_ID=your_database_id_here
```

### Server Configuration:
```
PORT=10000
NODE_ENV=production
```

### Admin Credentials:
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=VTAnunciando2025!
JWT_SECRET=vtanunciando-secret-key-change-in-production
```

### Company Info:
```
COMPANY_NAME=VT Anunciando - Souvenirs Personalizados
COMPANY_EMAIL=informacion@vtanunciando.com
COMPANY_TIMEZONE=America/Mexico_City
CURRENCY=MXN
```

### Optional (Google Drive):
```
GOOGLE_DRIVE_FOLDER_ID=1CgF4LXj1K__VexRZP_QITE8ls0WeosvK
```

---

## Step 5: Deploy!

1. Click **"Create Web Service"**
2. Wait 2-5 minutes for the build to complete
3. You'll see logs in real-time

### Successful Deployment Shows:
```
✓ Database connected successfully
✅ Server running on port 10000
Your service is live at https://vt-souvenir-system.onrender.com
```

---

## Step 6: Access Your Live Site

Your system will be available at:

**URL:** `https://vt-souvenir-system.onrender.com` (Render provides this)

### Endpoints:
- **Client Order Form:** `https://your-app.onrender.com/order`
- **Admin Dashboard:** `https://your-app.onrender.com/admin`
- **API Health Check:** `https://your-app.onrender.com/health`

---

## Step 7: Custom Domain (Optional)

### Free Render Subdomain:
`https://vt-souvenir-system.onrender.com`

### Custom Domain Setup:
1. Go to **Settings** → **Custom Domain**
2. Add your domain (e.g., `pedidos.vtanunciando.com`)
3. Add these DNS records to your domain registrar:
   ```
   Type: CNAME
   Name: pedidos
   Value: your-app.onrender.com
   ```
4. Wait 5-60 minutes for DNS propagation
5. Render automatically provides FREE SSL certificate!

---

## What You Get (FREE Tier)

✅ **750 hours/month** (enough to run 24/7)
✅ **Automatic HTTPS** (SSL certificate included)
✅ **Automatic deploys** from GitHub
✅ **Custom domain support**
✅ **500 MB RAM** (enough for this app)
✅ **No credit card required**

### Limitations:
⚠️ App spins down after 15 minutes of inactivity
⚠️ First request after spin-down takes ~30 seconds
⚠️ Shared resources (slower than paid tiers)

**For production use**, consider upgrading to **$7/month**:
- No spin-down
- Faster response times
- More resources

---

## Monitoring & Maintenance

### View Logs:
1. Go to Render dashboard
2. Click on your service
3. View **"Logs"** tab for real-time output

### Manual Redeploy:
Click **"Manual Deploy"** → **"Deploy latest commit"**

### Auto-Deploy:
Every time you `git push` to GitHub, Render automatically rebuilds and redeploys!

---

## Sharing with Clients

Once deployed, share this link with your clients:

**📱 Order Form:**
```
https://vt-souvenir-system.onrender.com/order
```

They can:
- Fill out the order form
- Upload payment proofs
- Receive confirmation

You'll receive orders in your admin dashboard and Notion!

---

## Alternative: Deploy to Railway

If Render doesn't work for you, try Railway (also free):

1. Go to **https://railway.app**
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your repository
5. Add same environment variables
6. Deploy!

Railway provides: `https://your-app.railway.app`

---

## Troubleshooting Deployment

### Build Fails:
**Error:** `Cannot find module`
**Fix:** Check that `package.json` is in the `backend` folder

### Database Connection Fails:
**Error:** `Database connection failed`
**Fix:**
- Verify all DB_ environment variables are correct
- Check Supabase is active (login to supabase.com)

### App Crashes on Start:
**Error:** `Port already in use`
**Fix:** Use `PORT=10000` (not 3000) in environment variables

### Health Check Fails:
**Fix:** Make sure `/health` endpoint returns 200 status

---

## Post-Deployment Checklist

After successful deployment:

✅ Test client order form: `/order`
✅ Test admin login: `/admin`
✅ Submit a test order
✅ Verify order appears in Notion
✅ Check database has the order (Supabase dashboard)
✅ Share link with first test client!

---

## Updating Your Live Site

To push updates:

```bash
# Make your changes locally
git add .
git commit -m "Update: description of changes"
git push origin main
```

Render automatically detects the push and redeploys (takes 2-3 minutes).

---

## Cost Summary

### Current Setup (FREE):
- ✅ Render hosting: FREE
- ✅ Supabase database: FREE (500MB)
- ✅ GitHub: FREE
- ✅ Notion: FREE
- ⏳ Google Drive: FREE (15GB)

**Total Monthly Cost: $0**

### Recommended Upgrades:
- Render Pro: $7/month (no spin-down)
- Supabase Pro: $25/month (8GB storage)
- Custom domain: $10-15/year

---

## Production Recommendations

For serious business use:

1. **Upgrade Render to Pro** ($7/month)
   - No spin-down
   - Better performance
   - Worth it when you have customers!

2. **Set up custom domain**
   - More professional
   - Easier to remember
   - Better for branding

3. **Enable Google Drive**
   - Follow `GOOGLE_DRIVE_SETUP.md`
   - Store client images properly

4. **Set up monitoring**
   - Use Render's built-in monitoring
   - Get alerts if site goes down

---

## Support

- **Render Docs:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Your GitHub:** https://github.com/Ivanvip24/vt-souvenir-system

---

## Next Steps

1. ✅ **Deploy to Render** (follow this guide)
2. **Test everything** works online
3. **Set up Google Drive** for images
4. **Share link** with your first client!
5. **Monitor** the first few orders closely

---

Your live system will be accessible worldwide 24/7!
Clients can submit orders from anywhere, anytime.
