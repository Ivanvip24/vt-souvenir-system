# 📦 Inventory System - Setup Guide

Your inventory management system is now **fully integrated** into your admin panel!

---

## ✅ What's Been Integrated

The inventory system is now part of your **VT Anunciando** admin panel at `http://localhost:3000/admin/`

**New Features:**
- 📦 **Products Tab** - Now shows full inventory management
- 📊 **Material Tracking** - Track MDF boards, magnets, glue, transparent backs
- 🔔 **Smart Alerts** - Automated low-stock warnings
- 📈 **Forecasting** - Predicts when you'll run out
- 💰 **Purchase Tracking** - Record all material purchases
- ⚙️ **Stock Adjustments** - Manual inventory counts

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Run the Inventory Migration

The inventory tables need to be added to your existing database:

```bash
cd souvenir-management-system/backend
node shared/run-inventory-migration.js
```

This will create:
- ✅ 6 new inventory tables
- ✅ 3 analytical views
- ✅ 2 automatic triggers
- ✅ Sample data (4 materials)

### Step 2: Restart Your Server

If your server is running, restart it to load the new inventory routes:

```bash
# Stop current server (Ctrl+C)
# Then start again:
npm start
```

You should see:
```
📦 /api/inventory/* (Materials, Alerts, BOM, Forecasting)
```

### Step 3: Access the Inventory

1. Open `http://localhost:3000/admin/`
2. Login with your admin credentials
3. Click on **"Productos"** in the sidebar
4. You'll see the full inventory management interface!

---

## 📊 Using the Inventory System

### View Materials

The **Products** tab now shows:
- 🟢 **Healthy materials** (30+ days stock)
- 🟡 **Low stock warnings** (15-30 days)
- 🔴 **Critical alerts** (<15 days)
- ⚫ **Out of stock** (0 available)

### Add a New Material

1. Click **"➕ Agregar Material"**
2. Fill in:
   - Name (e.g., "Lamina MDF 1.22x2.44m")
   - Unit type (e.g., "hojas", "unidades", "litros")
   - Initial stock
   - Minimum stock level
   - Reorder point
   - Supplier info
3. Click **"Guardar Material"**

### Record a Purchase

1. Click on any material card
2. Click **"📦 Registrar Compra"**
3. Enter:
   - Quantity purchased
   - Cost per unit
   - Supplier name
   - Notes
4. Click **"Guardar Compra"**

The system automatically:
- Updates stock levels
- Recalculates forecasts
- Updates alerts
- Records transaction history

### Adjust Stock (Physical Count)

If you do a physical inventory count:

1. Click on the material
2. Click **"⚙️ Ajustar Stock"**
3. Enter the actual counted quantity
4. Provide a reason (e.g., "Physical inventory count")
5. Click **"Guardar Ajuste"**

---

## 🔍 Understanding the Alerts

### Alert Levels

The system shows 4 alert levels:

| Icon | Level | Meaning | Action |
|------|-------|---------|--------|
| 🟢 | Healthy | Stock > 30 days | No action needed |
| 🟡 | Warning | Stock 15-30 days | Consider ordering soon |
| 🔴 | Critical | Stock < 15 days | **ORDER NOW!** |
| ⚫ | Out of Stock | No stock available | **URGENT!** |

### How Forecasting Works

The system calculates:
```
Average Daily Consumption = Last 30 days usage / 30
Days of Stock Remaining = Available Stock / Avg Daily Consumption
Estimated Depletion Date = Today + Days Remaining
```

If `Days Remaining < Supplier Lead Time` → 🔴 **CRITICAL ALERT**

---

## 🔗 Integration with Orders

### Automatic Material Reservation

When an order is created, the system:

1. **Checks availability** - Ensures materials exist
2. **Reserves materials** - Locks stock for the order
3. **Updates alerts** - Recalculates forecasts
4. **Warns you** - If order will drop below safety levels

### Automatic Consumption

When order status changes:

- **New** → Materials reserved
- **Printing** → Materials consumed (deducted from stock)
- **Cancelled** → Materials released (back to available)
- **Delivered** → Final consumption recorded

This happens **automatically** via database triggers!

---

## 📈 Sample Data Included

The migration creates 4 sample materials:

1. **MDF Board 1.22x2.44m**
   - Initial stock: 200 sheets
   - Reorder point: 50 sheets
   - Supplier: "MDF Supplier SA"

2. **Circular Black Magnets**
   - Initial stock: 10,000 units
   - Reorder point: 3,000 units
   - Supplier: "Magnet Wholesale Inc"

3. **Transparent Protective Backs**
   - Initial stock: 8,000 units
   - Reorder point: 2,500 units
   - Supplier: "Packaging Solutions Ltd"

4. **Industrial Glue**
   - Initial stock: 20 bottles (500ml each)
   - Reorder point: 8 bottles
   - Supplier: "Adhesives Depot"

**Important:** Adjust these quantities to match your actual inventory!

---

## ⚙️ Setting Up Bill of Materials (BOM)

The BOM defines how much material each product needs.

**Already configured for sample products:**
- Each souvenir uses:
  - 0.02 MDF boards (1/50th of a sheet)
  - 1 magnet
  - 1 transparent back
  - 2ml glue (0.004 bottles)

### Add BOM for New Products

You can add BOM entries via API:

```bash
POST /api/inventory/products/:productId/bom
{
  "materialId": 1,
  "quantityPerUnit": 0.02,
  "wastePercentage": 10,
  "notes": "Standard souvenir size with 10% cutting waste"
}
```

Or wait for the frontend BOM manager (coming soon to Products tab).

---

## 🎯 Best Practices

### 1. Set Realistic Reorder Points

```
Reorder Point = (Avg Daily Usage × Lead Time) + Safety Buffer

Example:
- Daily usage: 2.5 boards/day
- Lead time: 7 days
- Safety buffer: 10 boards
- Reorder point: (2.5 × 7) + 10 = 27.5 → 28 boards
```

### 2. Record All Purchases

**Always** record purchases through the system to keep forecasts accurate.

### 3. Do Regular Physical Counts

Monthly or quarterly, count your actual stock and adjust in the system.

### 4. Check Alerts Daily

Review the Products tab each morning to see critical alerts.

### 5. Update Stock BEFORE Big Orders

If you're about to accept a large order, check if you have materials first!

---

## 🧪 Testing the System

### Test 1: Add a Material

1. Go to Products tab
2. Click "Agregar Material"
3. Add a test material
4. Verify it appears in the grid

### Test 2: Record a Purchase

1. Click on any material
2. Click "Registrar Compra"
3. Add 50 units
4. Verify stock updated

### Test 3: Check Forecasting

1. View a material's details
2. Check "Pronóstico" section
3. Verify it shows:
   - Days of stock
   - Estimated depletion date
   - Recommended action

### Test 4: Adjust Stock

1. Click "Ajustar Stock"
2. Change quantity
3. Add reason
4. Verify adjustment recorded

---

## 📡 API Endpoints

All inventory endpoints are available at `/api/inventory/*`:

### Materials
- `GET /api/inventory/materials` - Get all materials
- `POST /api/inventory/materials` - Create material
- `GET /api/inventory/materials/:id` - Get one material
- `GET /api/inventory/materials/:id/forecast` - Get forecast
- `POST /api/inventory/materials/:id/purchase` - Record purchase
- `POST /api/inventory/materials/:id/adjust` - Adjust stock

### Alerts
- `GET /api/inventory/alerts` - Get active alerts
- `GET /api/inventory/alerts/summary` - Get alert counts
- `POST /api/inventory/alerts/generate` - Manual regeneration

### Dashboard
- `GET /api/inventory/dashboard/overview` - Complete overview

See full API documentation in the main README.md

---

## 🐛 Troubleshooting

### Materials Not Loading

1. Check server logs for errors
2. Verify migration ran successfully
3. Test database connection: `GET /health`

### Alerts Not Showing

Run manual generation:
```bash
curl -X POST http://localhost:3000/api/inventory/alerts/generate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Forecast Shows "N/A"

The system needs consumption history to forecast. It will show data after:
- Materials have been consumed
- Orders have been processed
- Some time has passed

---

## 🎓 Understanding Your Data

### Stock Types

- **Current Stock**: Total physical inventory
- **Reserved Stock**: Locked for pending orders
- **Available Stock**: Current - Reserved (what you can actually use)

### Consumption Tracking

The system tracks:
- Last 7 days consumption
- Last 30 days consumption
- Average daily consumption
- Uses this to predict future needs

### Alerts Logic

```
IF Available Stock < Minimum Stock → CRITICAL
IF Available Stock < Reorder Point → WARNING
IF Days of Stock < Lead Time → CRITICAL
ELSE → HEALTHY
```

---

## 🔐 Security Note

The inventory system uses the same authentication as your admin panel:
- Login required at `/admin/login`
- JWT token in localStorage
- All API calls include `Authorization: Bearer <token>`

---

## 🎉 You're All Set!

Your inventory system is now **fully operational** and integrated into your admin panel!

**Next Steps:**
1. ✅ Adjust the sample material quantities to match your actual stock
2. ✅ Add any additional materials you use
3. ✅ Set realistic reorder points based on your usage
4. ✅ Start recording purchases
5. ✅ Check alerts daily

**No more running out of materials at the last minute!** 🚀

---

## 📞 Need Help?

- Check server logs in your terminal
- Verify all migrations ran: `ls backend/shared/migrations/`
- Test API health: `curl http://localhost:3000/health`
- Review error messages in browser console (F12)

---

**Welcome to stress-free inventory management!** 📦✨
