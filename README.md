# Souvenir Management System

Complete automation system for managing custom souvenir orders with Notion integration and automated analytics reporting.

## Features

### 🎯 Notion Integration Agent
- Automatically create order pages in Notion
- Bidirectional sync between local database and Notion
- Real-time status updates across systems
- Query and filter orders
- Bulk sync operations

### 📊 Analytics & Reporting Agent
- Automated revenue and profit calculations
- Product and client performance analytics
- Production efficiency metrics
- Scheduled email reports (daily, weekly, monthly)
- Low-margin order alerts
- Comprehensive dashboards

## Quick Start

### 1. Prerequisites
- Node.js v18 or higher
- PostgreSQL database
- Notion account with API access
- Email account for sending reports (Gmail or SMTP)

### 2. Installation

```bash
cd souvenir-management-system/backend
npm install
```

### 3. Configuration

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Notion
NOTION_API_TOKEN=secret_xxxxx
NOTION_ORDERS_DATABASE_ID=xxxxx

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=souvenir_management
DB_USER=your_username
DB_PASSWORD=your_password

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
REPORT_RECIPIENTS=owner@company.com,manager@company.com

# Company
COMPANY_NAME=Your Souvenir Company
COMPANY_EMAIL=contact@yourcompany.com
```

### 4. Initialize Database

```bash
npm run init-db
```

### 5. Start the Server

```bash
npm start

# Or for development with auto-reload:
npm run dev
```

The API will be available at `http://localhost:3000`

## Notion Setup

### Create Notion Database

1. Go to your Notion workspace
2. Create a new database called "Orders"
3. Add the following properties:

| Property Name | Type | Description |
|--------------|------|-------------|
| Order Number | Title | Unique order identifier |
| Order Date | Date | Order creation date |
| Client Name | Text | Customer name |
| Phone | Phone | Customer phone |
| Address | Text | Shipping address |
| City | Text | City |
| State | Text | State |
| Products | Text | Product list |
| Quantities | Text | Quantity details |
| Total Price | Number | Total order value |
| Production Cost | Number | Production cost |
| Profit | Formula | `prop("Total Price") - prop("Production Cost")` |
| Profit Margin % | Formula | `prop("Profit") / prop("Total Price") * 100` |
| Status | Select | New, Design, Printing, Cutting, Counting, Shipping, Delivered |
| Department | Select | Design, Production, Counting, Shipping |
| Priority | Select | Low, Normal, High, Urgent |
| Shipping Label | Checkbox | Label generated |
| Tracking Number | Text | Shipping tracking |
| Delivery Date | Date | Expected delivery |
| Notes | Text | Customer notes |
| Internal Notes | Text | Internal use |

### Get Notion Credentials

1. **API Token**: Go to https://www.notion.so/my-integrations
   - Click "+ New integration"
   - Give it a name (e.g., "Souvenir Management")
   - Copy the "Internal Integration Token"

2. **Database ID**:
   - Open your Orders database in Notion
   - Click "Share" and invite your integration
   - Copy the database ID from the URL:
     - `https://notion.so/workspace/{DATABASE_ID}?v=...`

## Email Setup

### Gmail Configuration

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
   - Use this as `EMAIL_PASSWORD` in `.env`

### Test Email Configuration

```bash
curl -X POST http://localhost:3000/api/test/email
```

## API Documentation

### Orders

#### Create Order
```bash
POST /api/orders
Content-Type: application/json

{
  "clientName": "María González",
  "clientPhone": "5512345678",
  "clientAddress": "Av. Juárez 123",
  "clientCity": "Guadalajara",
  "clientState": "Jalisco",
  "totalPrice": 750,
  "productionCost": 150,
  "items": [
    {
      "productName": "Quinceañera Souvenir",
      "quantity": 50,
      "unitPrice": 10,
      "unitCost": 2
    }
  ],
  "notes": "Rush order"
}
```

#### Get Orders
```bash
GET /api/orders?status=new&from=2024-01-01&to=2024-12-31
```

#### Update Order Status
```bash
PATCH /api/orders/123/status
Content-Type: application/json

{
  "status": "printing"
}
```

#### Sync Order to Notion
```bash
POST /api/orders/123/sync
```

### Analytics

#### Get Analytics Summary
```bash
GET /api/analytics?period=this_month
```

Period options: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_year`

#### Get Revenue
```bash
GET /api/analytics/revenue?startDate=2024-01-01&endDate=2024-01-31
```

#### Get Top Products
```bash
GET /api/analytics/products/top?period=this_month&limit=10
```

#### Get Top Clients
```bash
GET /api/analytics/clients/top?period=this_month&limit=10
```

### Reports

#### Send Daily Report
```bash
POST /api/reports/daily/send
Content-Type: application/json

{
  "date": "2024-01-15"
}
```

#### Send Monthly Report
```bash
POST /api/reports/monthly/send
Content-Type: application/json

{
  "year": 2024,
  "month": 1
}
```

#### Get Scheduled Jobs
```bash
GET /api/reports/schedule
```

## Automated Reports

Reports are automatically generated and sent via email based on your schedule configuration in `.env`:

- **Daily Report**: Revenue, orders, and top products from previous day
- **Weekly Report**: Week's performance summary
- **Monthly Report**: Comprehensive analytics with insights and recommendations

### Configure Report Schedule

Edit `.env`:
```env
# Daily report at 8:00 AM
DAILY_REPORT_SCHEDULE=0 8 * * *

# Weekly report every Monday at 9:00 AM
WEEKLY_REPORT_SCHEDULE=0 9 * * 1

# Monthly report on 1st day at 10:00 AM
MONTHLY_REPORT_SCHEDULE=0 10 1 * *
```

Cron format: `minute hour day month weekday`

## Usage Examples

### Creating an Order from WhatsApp

When a client messages you on WhatsApp with order details, use the API:

```javascript
const orderData = {
  clientName: "Carlos Ramírez",
  clientPhone: "5587654321",
  clientAddress: "Calle Morelos 456",
  clientCity: "Monterrey",
  clientState: "Nuevo León",
  totalPrice: 600,
  productionCost: 120,
  items: [
    {
      productName: "Wedding Favor",
      quantity: 50,
      unitPrice: 12,
      unitCost: 2.4
    }
  ]
};

// Send POST request to create order
// This will automatically create a Notion page and send confirmation
```

### Checking Daily Performance

```bash
# Get today's analytics
curl http://localhost:3000/api/analytics?period=today
```

### Manual Report Generation

```bash
# Generate and send yesterday's report
curl -X POST http://localhost:3000/api/reports/daily/send

# Generate specific month
curl -X POST http://localhost:3000/api/reports/monthly/send \
  -H "Content-Type: application/json" \
  -d '{"year": 2024, "month": 1}'
```

## Project Structure

```
souvenir-management-system/
├── backend/
│   ├── agents/
│   │   ├── notion-agent/          # Notion integration
│   │   │   ├── index.js            # Main agent functions
│   │   │   ├── config.js           # Configuration
│   │   │   ├── sync.js             # Sync operations
│   │   └── analytics-agent/       # Analytics & reporting
│   │       ├── index.js            # Main agent
│   │       ├── revenue-calculator.js
│   │       ├── report-generator.js
│   │       ├── email-sender.js
│   │       ├── scheduler.js
│   │       └── templates/          # Email templates
│   ├── shared/
│   │   ├── database.js             # Database connection
│   │   └── utils.js                # Utility functions
│   ├── api/
│   │   └── server.js               # Express API server
│   ├── package.json
│   └── .env
├── docs/                           # Documentation
└── examples/                       # Example scripts
```

## Troubleshooting

### Database Connection Issues

1. Verify PostgreSQL is running:
```bash
psql -U your_username -d souvenir_management
```

2. Check database credentials in `.env`

3. Ensure database exists:
```bash
createdb souvenir_management
```

### Notion Integration Issues

1. Verify API token is correct
2. Ensure integration is added to your database (Share → Add integration)
3. Check database ID matches your Notion database

### Email Sending Issues

1. For Gmail, ensure you're using an App Password, not your regular password
2. Check that 2FA is enabled on your Google account
3. Verify `EMAIL_USER` and `EMAIL_PASSWORD` in `.env`
4. Test with: `POST /api/test/email`

### Scheduled Reports Not Sending

1. Ensure server is running continuously
2. Check cron expressions in `.env`
3. Verify `ENABLE_DAILY_REPORTS=true` in `.env`
4. Check server logs for errors

## Development

### Run in Development Mode

```bash
npm run dev
```

### Test Individual Components

```bash
# Test Notion connection
node examples/test-notion.js

# Test analytics
node examples/test-analytics.js

# Test email
curl -X POST http://localhost:3000/api/test/email
```

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the logs in your terminal
3. Verify all environment variables are set correctly

## License

MIT License - feel free to use and modify for your business needs.
