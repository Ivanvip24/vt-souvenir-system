# Quick Start - 5 Minutes to First Order

Get your Souvenir Management System running in 5 minutes!

## Prerequisites

- Node.js installed
- PostgreSQL installed and running
- Notion account

---

## Step 1: Notion Setup (2 minutes)

1. Create integration at https://www.notion.so/my-integrations
2. Copy the API token (starts with `secret_`)
3. Create a database in Notion called "Orders"
4. Share the database with your integration
5. Copy database ID from URL

---

## Step 2: Install (1 minute)

```bash
cd souvenir-management-system/backend
npm install
```

---

## Step 3: Configure (1 minute)

```bash
cp .env.example .env
```

Edit `.env` - minimum required:

```env
NOTION_API_TOKEN=secret_YOUR_TOKEN
NOTION_ORDERS_DATABASE_ID=YOUR_DATABASE_ID

DB_NAME=souvenir_management
DB_USER=postgres
DB_PASSWORD=your_password

EMAIL_USER=your.email@gmail.com
EMAIL_PASSWORD=your_app_password
REPORT_RECIPIENTS=your.email@gmail.com

COMPANY_NAME=Your Company
```

---

## Step 4: Initialize Database (30 seconds)

```bash
# Create database first
createdb souvenir_management

# Then initialize
npm run init-db
```

---

## Step 5: Start Server (30 seconds)

```bash
npm start
```

You should see:
```
✅ Server running on port 3000
```

---

## Step 6: Create Your First Order!

```bash
node examples/create-sample-order.js
```

**Check Notion** - you should see the order! 🎉

---

## What's Next?

### View Analytics
```bash
curl http://localhost:3000/api/analytics?period=today
```

### Send Test Report
```bash
curl -X POST http://localhost:3000/api/test/email
```

### Check Scheduled Jobs
```bash
curl http://localhost:3000/api/reports/schedule
```

---

## Common Issues

**Issue**: Database connection failed
```bash
# Start PostgreSQL
# macOS:
brew services start postgresql

# Linux:
sudo systemctl start postgresql
```

**Issue**: Notion API error
- Verify token in `.env`
- Ensure integration is added to database
- Check database ID

**Issue**: Email not sending
- Use Gmail App Password (not regular password)
- Enable 2FA first

---

## Full Documentation

- **Setup Guide**: `docs/SETUP_GUIDE.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Main README**: `README.md`

---

**You're all set! Start creating orders and let the system automate your workflow!** ✨
