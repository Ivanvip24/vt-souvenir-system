# Complete Setup Guide

This guide will walk you through setting up the Souvenir Management System from scratch.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Notion Setup](#notion-setup)
3. [Database Setup](#database-setup)
4. [Email Configuration](#email-configuration)
5. [Application Installation](#application-installation)
6. [Testing](#testing)
7. [Deployment](#deployment)

---

## System Requirements

### Required Software
- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **PostgreSQL** 13 or higher ([Download](https://www.postgresql.org/download/))
- **Git** (optional, for cloning)

### Required Accounts
- **Notion** account (free tier works)
- **Email** account (Gmail recommended)

### System Specifications
- **OS**: macOS, Linux, or Windows
- **RAM**: 2GB minimum
- **Storage**: 500MB available space

---

## Notion Setup

### Step 1: Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Fill in the details:
   - **Name**: Souvenir Management System
   - **Logo**: (optional)
   - **Associated workspace**: Select your workspace
4. Under **Capabilities**, ensure these are enabled:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content
5. Click **"Submit"**
6. **Copy the "Internal Integration Token"** - you'll need this later
   - Format: `secret_XXXXXXXXXXXXXXXXXXXXXX`

### Step 2: Create Orders Database

1. Open Notion and create a new page
2. Type `/database` and select **"Table - Full page"**
3. Name it **"Orders"**
4. Add the following properties (click **"+"** to add):

| Property Name | Type | Options/Formula |
|--------------|------|-----------------|
| Order Number | Title | (default) |
| Order Date | Date | (default) |
| Client Name | Text | (default) |
| Phone | Phone | (default) |
| Address | Text | (default) |
| City | Text | (default) |
| State | Text | (default) |
| Products | Text | (default) |
| Quantities | Text | (default) |
| Total Price | Number | Format: Mexican peso (MXN) |
| Production Cost | Number | Format: Mexican peso (MXN) |
| Profit | Formula | `prop("Total Price") - prop("Production Cost")` |
| Profit Margin % | Formula | `round((prop("Total Price") - prop("Production Cost")) / prop("Total Price") * 100)` |
| Status | Select | Options: New, Design, Printing, Cutting, Counting, Shipping, Delivered, Cancelled |
| Department | Select | Options: Design, Production, Counting, Shipping, Completed |
| Priority | Select | Options: Low, Normal, High, Urgent |
| Shipping Label | Checkbox | (default) |
| Tracking Number | Text | (default) |
| Delivery Date | Date | (default) |
| Notes | Text | (default) |
| Internal Notes | Text | (default) |

### Step 3: Connect Integration to Database

1. Open your **Orders** database in Notion
2. Click **"..."** (three dots) in the top right
3. Scroll to **"Connections"**
4. Click **"+ Add connections"**
5. Select your **"Souvenir Management System"** integration
6. Click **"Confirm"**

### Step 4: Get Database ID

1. Open your Orders database in Notion
2. Copy the URL from your browser
3. The URL format is: `https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID`
4. Extract the `DATABASE_ID` part (32 characters, usually letters and numbers)
5. **Save this ID** - you'll need it for configuration

Example:
```
URL: https://www.notion.so/myworkspace/a1b2c3d4e5f67890abcdef1234567890?v=...
Database ID: a1b2c3d4e5f67890abcdef1234567890
```

---

## Database Setup

### Step 1: Install PostgreSQL

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
- Download installer from https://www.postgresql.org/download/windows/
- Run installer and follow prompts
- Remember the password you set for the `postgres` user

### Step 2: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE souvenir_management;

# Create user (optional but recommended)
CREATE USER souvenir_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE souvenir_management TO souvenir_user;

# Exit
\q
```

### Step 3: Verify Connection

```bash
psql -U souvenir_user -d souvenir_management -h localhost

# If successful, you'll see:
# souvenir_management=>

# Exit with \q
```

---

## Email Configuration

### Option 1: Gmail (Recommended)

1. **Enable 2-Factor Authentication**:
   - Go to https://myaccount.google.com/security
   - Enable **"2-Step Verification"**

2. **Generate App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select **"Mail"** and **"Other (Custom name)"**
   - Enter name: **"Souvenir Management"**
   - Click **"Generate"**
   - **Copy the 16-character password** (format: xxxx xxxx xxxx xxxx)

3. **Save credentials**:
   - Email: your.email@gmail.com
   - Password: the 16-character app password (without spaces)

### Option 2: Custom SMTP

If using another email provider:

1. Get SMTP settings from your provider:
   - SMTP Host (e.g., smtp.example.com)
   - SMTP Port (usually 587 or 465)
   - Username (usually your email)
   - Password

2. Note whether TLS/SSL is required

---

## Application Installation

### Step 1: Download or Clone

**Option A: Clone with Git**
```bash
cd ~/Downloads/CLAUDE/GENERAL_SYSTEM
# If already have the folder, skip this
```

**Option B: Download ZIP**
- Download and extract to desired location

### Step 2: Install Dependencies

```bash
cd souvenir-management-system/backend
npm install
```

This will install all required packages (~50MB).

### Step 3: Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit configuration
nano .env
# (or use your preferred text editor)
```

### Step 4: Fill in Configuration

Edit `.env` file with your information:

```env
# ===================================
# NOTION INTEGRATION
# ===================================
NOTION_API_TOKEN=secret_YOUR_TOKEN_HERE
NOTION_ORDERS_DATABASE_ID=YOUR_DATABASE_ID_HERE

# ===================================
# DATABASE
# ===================================
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=souvenir_management
DB_USER=souvenir_user
DB_PASSWORD=your_secure_password

# ===================================
# EMAIL & REPORTING
# ===================================
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your.email@gmail.com
EMAIL_PASSWORD=your_16_char_app_password

# Report recipients (comma-separated)
REPORT_RECIPIENTS=owner@company.com,manager@company.com

# Report schedules (cron format)
DAILY_REPORT_SCHEDULE=0 8 * * *
WEEKLY_REPORT_SCHEDULE=0 9 * * 1
MONTHLY_REPORT_SCHEDULE=0 10 1 * *

# ===================================
# COMPANY INFORMATION
# ===================================
COMPANY_NAME=Your Souvenir Company Name
COMPANY_EMAIL=contact@yourcompany.com
COMPANY_TIMEZONE=America/Mexico_City
CURRENCY=MXN

# ===================================
# API SERVER
# ===================================
PORT=3000
NODE_ENV=development

# ===================================
# ANALYTICS
# ===================================
ENABLE_DAILY_REPORTS=true
ENABLE_WEEKLY_REPORTS=true
ENABLE_MONTHLY_REPORTS=true
LOW_MARGIN_THRESHOLD=20
```

### Step 5: Initialize Database

```bash
npm run init-db
```

You should see:
```
✓ Database connected successfully
📝 Creating tables and views...
✅ Database schema created successfully!
📦 Inserting sample data...
  ✓ Sample data inserted
✨ Database initialization complete!
```

---

## Testing

### Test 1: Database Connection

```bash
npm start
```

Look for:
```
✓ Database connected successfully
✅ Email sender initialized
✅ Server running on port 3000
```

**If successful**: Continue to next test
**If failed**: Check database credentials in `.env`

### Test 2: Notion Integration

In a new terminal:
```bash
cd souvenir-management-system/backend
node examples/test-notion.js
```

Expected output:
```
Test 1: Creating test order in both systems...
✅ Test order created:
   Order Number: ORD-20240115-1234
   Notion Page URL: https://notion.so/...
...
✅ All tests passed!
```

**If failed**: Check Notion token and database ID in `.env`

### Test 3: Email Configuration

```bash
curl -X POST http://localhost:3000/api/test/email
```

You should receive a test email.

**If failed**: Check email configuration in `.env`

### Test 4: Analytics

```bash
node examples/test-analytics.js
```

Expected output:
```
✅ Analytics summary:
   Orders: X
   Revenue: XXX.XX MXN
   Profit: XXX.XX MXN
...
✅ All analytics tests passed!
```

### Test 5: Create Sample Order

```bash
node examples/create-sample-order.js
```

This creates a realistic order and syncs to Notion.

**Check Notion**: You should see the order in your Orders database!

---

## Deployment

### For Local/Office Use

1. **Run continuously**:
```bash
# Use a process manager like PM2
npm install -g pm2
pm2 start api/server.js --name souvenir-system
pm2 save
pm2 startup
```

2. **Access from other computers**:
   - Find your local IP: `ifconfig` (Mac/Linux) or `ipconfig` (Windows)
   - Access API at: `http://YOUR_IP:3000`

### For Cloud Deployment

**Heroku Example:**

1. Install Heroku CLI
2. Create app:
```bash
heroku create souvenir-management
heroku addons:create heroku-postgresql:mini
```

3. Configure environment:
```bash
heroku config:set NOTION_API_TOKEN=secret_xxx
heroku config:set NOTION_ORDERS_DATABASE_ID=xxx
# ... set all other variables
```

4. Deploy:
```bash
git push heroku main
```

**DigitalOcean/AWS/Google Cloud:**
- Deploy as a Node.js application
- Use managed PostgreSQL database
- Set environment variables in platform dashboard

---

## Troubleshooting

### Common Issues

**Issue**: "Database connection failed"
- **Solution**: Check PostgreSQL is running, verify credentials in `.env`

**Issue**: "Notion API error"
- **Solution**: Verify token is correct, integration is added to database

**Issue**: "Email not sending"
- **Solution**: Use App Password for Gmail, check SMTP settings

**Issue**: "Port 3000 already in use"
- **Solution**: Change `PORT=3001` in `.env` or kill process on port 3000

### Getting Help

1. Check the logs in your terminal
2. Review the main README.md
3. Verify all environment variables are set
4. Test each component individually

---

## Next Steps

✅ **Your system is now ready!**

1. **Create your first order**:
   ```bash
   node examples/create-sample-order.js
   ```

2. **Check Notion** to see the order

3. **View analytics**:
   ```bash
   curl http://localhost:3000/api/analytics?period=this_month
   ```

4. **Set up automated reports**: Already configured! They'll send according to your schedule

5. **Integrate with your workflow**: Use the API endpoints to create orders from WhatsApp, web forms, etc.

---

## Configuration Reference

### Cron Schedule Format

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, Sunday = 0 or 7)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

Examples:
- `0 8 * * *` - Every day at 8:00 AM
- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 10 1 * *` - 1st day of month at 10:00 AM

### Timezone Reference

Common Mexican timezones:
- `America/Mexico_City` - Central Mexico
- `America/Cancun` - Eastern Mexico
- `America/Tijuana` - Pacific Mexico

---

## Security Best Practices

1. **Never commit .env file** to git
2. **Use strong database passwords**
3. **Rotate API tokens regularly**
4. **Restrict API access** if exposed to internet
5. **Keep dependencies updated**: `npm update`

---

**Congratulations! Your Souvenir Management System is ready to use!** 🎉
