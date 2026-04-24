# Client Order Form - Testing Guide

## 🎉 Frontend Complete!

The mobile-first client order form is now ready for testing. This guide will help you test all features.

---

## 🚀 Quick Start

### Option 1: Demo Server (Easiest - No Database Required)

1. **Server is already running!** The demo server should be running on port 3000
2. **Open the order form** in your browser:
   ```
   http://localhost:3000/order/
   ```
3. That's it! You can start placing orders immediately.

### Option 2: Full Server with PostgreSQL (For Production)

1. Install PostgreSQL (if not already installed)
2. Run migrations: `npm run migrate`
3. Start full server: `npm start`
4. Open: `http://localhost:3000/order/`

---

## 📱 Features to Test

### ✅ 1. Phone-Based Account System

**First-time user:**
1. Enter a 10-digit phone number (e.g., `5512345678`)
2. Click "Continuar"
3. Fill in your name, email, address, city, and state
4. Click "Continuar"

**Returning user:**
1. Enter the same phone number you used before
2. You should see: "¡Hola de nuevo, [Your Name]!"
3. The form will skip to products automatically
4. Your info is saved in LocalStorage

**Test tip:** Open browser DevTools → Application → Local Storage → `souvenir_client_data` to see saved data

---

### ✅ 2. Product Catalog

**Features to test:**
- All 6 products should display with images
- Each product shows:
  - Category badge (QUINCEAÑERA, BODA, etc.)
  - Name and description
  - Price per unit
  - Quantity controls
- Click **+** and **−** buttons to change quantities
- Type directly in the quantity input
- Card highlights with purple border when quantity > 0
- Subtotal appears below each selected product

**Test tip:** Try adding 50 of "Tazas Personalizadas" and watch the subtotal update

---

### ✅ 3. Real-Time Total Calculation

**Features to test:**
- Top-right corner shows running total
- Bottom sticky footer shows:
  - Total order amount
  - Deposit amount (50% of total)
- Both update instantly when you change quantities
- "Continuar al Evento →" button is disabled until you select at least 1 product

**Test tip:** Add multiple products and watch all totals update simultaneously

---

### ✅ 4. Event Details

**Features to test:**
- Select event type from dropdown
- Choose event date (must be in the future)
- Add special notes or design requests
- Upload reference images (up to 5)
  - Click upload area
  - Select images
  - See thumbnails appear
  - Click × to remove an image

**Test tip:** Try uploading multiple images and removing them

---

### ✅ 5. Payment Options

**Two payment methods:**

#### Option A: Stripe (Credit/Debit Card)
- Select "Tarjeta de Crédito/Débito"
- ⚠️ Stripe integration coming soon
- Currently shows alert: "Integración con Stripe en desarrollo"

#### Option B: Bank Transfer
- Select "Transferencia Bancaria"
- Bank details appear:
  - Banco: Banco Demo
  - CLABE: 012345678901234567
  - Account holder
  - Amount to transfer (deposit amount)
- Upload payment proof (image or PDF)
- Click "✅ Enviar Pedido"

**Test tip:** Use bank transfer method for full testing

---

### ✅ 6. Order Submission

**What happens:**
1. Order validates all required fields
2. Creates client record (or updates existing)
3. Creates order with "pending_review" status
4. Generates unique order number (e.g., `ORD-20250102-0001`)
5. Calculates 50% deposit
6. Shows success screen

**Test tip:** Check the terminal/console for the order creation log

---

## 🧪 Test Scenarios

### Scenario 1: Complete Order Flow (Bank Transfer)
```
1. Enter phone: 5512345678
2. Enter name: María González
3. Enter email: maria@test.com
4. Enter address: Calle Reforma 123, Col. Centro
5. Enter city: Ciudad de México
6. Enter state: CDMX
7. Add 50 Tazas Personalizadas ($2,250 total)
8. Add 100 Llaveros Acrílicos ($3,500 more)
9. Total should be: $5,750.00
10. Deposit should be: $2,875.00
11. Select event type: Quinceañera
12. Select event date: [future date]
13. Add notes: "Colores rosa y dorado"
14. Upload 2 reference images
15. Select payment method: Transferencia Bancaria
16. Upload payment proof (any image)
17. Click "✅ Enviar Pedido"
18. See success screen with order number
```

### Scenario 2: Returning Client
```
1. Complete Scenario 1 first
2. Reload the page
3. Enter same phone: 5512345678
4. Should see welcome message: "¡Hola de nuevo, María González!"
5. Should auto-skip to products step
6. Complete another order (info already filled)
```

### Scenario 3: Multiple Products
```
1. Add quantities to all 6 products:
   - 50 Tazas ($2,250)
   - 100 Llaveros ($3,500)
   - 200 Etiquetas ($5,000)
   - 30 Pins ($1,650)
   - 40 Bolsas ($2,600)
   - 75 Vasos ($3,000)
2. Total: $18,000
3. Deposit: $9,000
4. Complete order
```

### Scenario 4: Validation Testing
```
Try these to test validation:
- Submit with no phone number
- Submit with 9-digit phone number
- Skip name (should fail)
- Skip address (should fail)
- Skip event type (should fail)
- Select past event date (should fail)
- Try to continue from products with no items selected (button disabled)
- Try bank transfer without uploading proof (should fail)
```

---

## 📊 Checking Orders in Demo Server

Orders are stored in memory while demo-server.js is running.

**Via API:**
```bash
# Get all orders
curl http://localhost:3000/api/orders

# Check order status (replace 1 with actual order ID)
curl http://localhost:3000/api/client/orders/1/status

# See analytics
curl http://localhost:3000/api/analytics
```

**Via Terminal:**
Look for these log messages:
- `📦 New order created: ORD-20250102-0001 from María González`
- `💰 Payment proof uploaded for order ORD-20250102-0001`

---

## 📱 Mobile Testing

### On your phone:

#### Option 1: Local Network
1. Find your computer's IP address:
   ```bash
   ipconfig getifaddr en0  # macOS/Linux
   ```
2. On your phone's browser, go to:
   ```
   http://[YOUR_IP]:3000/order/
   ```
   Example: `http://192.168.1.100:3000/order/`

#### Option 2: Using ngrok (Recommended)
1. Install ngrok: https://ngrok.com/
2. Run:
   ```bash
   ngrok http 3000
   ```
3. Use the https URL provided on any device
4. Example: `https://abc123.ngrok.io/order/`

### What to test on mobile:
- ✅ Text is readable (no need to zoom)
- ✅ Forms are easy to fill (no keyboard zooming)
- ✅ Buttons are easy to tap
- ✅ Images load properly
- ✅ Sticky header/footer work correctly
- ✅ Quantity controls are touch-friendly
- ✅ File upload works via camera or gallery
- ✅ Progress feels smooth

---

## 🎨 Design Features (Mobile-First)

### Optimized for phones (320px - 428px)
- Gradient purple theme (matches your brand)
- Large tap targets (44px minimum)
- Prevents iOS zoom on input focus (16px font)
- Sticky footer for order summary
- Smooth step transitions
- Real-time feedback
- Progressive disclosure (multi-step wizard)

### Desktop/Tablet (768px+)
- Centered container with shadow
- More spacing
- Cards are wider
- Same functionality

---

## 🐛 Troubleshooting

### "Endpoint not found"
- Make sure demo-server.js is running
- Check terminal for errors
- Restart: `pkill -f "node demo-server.js" && node demo-server.js`

### Products not loading
- Check console for errors (F12 → Console)
- Verify API is responding: `curl http://localhost:3000/api/client/products`
- Check CORS settings (should be enabled in demo-server.js)

### LocalStorage not working
- Make sure you're using http:// or https:// (not file://)
- Check browser settings allow LocalStorage
- Test in incognito mode to rule out extensions

### Images not displaying
- Product images use Unsplash URLs
- Check internet connection
- Images may take a moment to load

### Form not submitting
- Check browser console for JavaScript errors
- Verify all required fields are filled
- Make sure quantities are > 0
- Ensure event date is in future

---

## 🔄 Next Steps

### Immediate (Already Working)
- ✅ Phone-based account system
- ✅ Product catalog with images
- ✅ Real-time calculations
- ✅ Order submission
- ✅ Bank transfer with proof upload
- ✅ Success confirmation

### Coming Soon
- 🔲 Stripe payment integration
- 🔲 File upload to Cloudinary/S3 (currently placeholder URLs)
- 🔲 Admin approval dashboard
- 🔲 Email notifications to clients
- 🔲 Order tracking for clients
- 🔲 WhatsApp integration

### For Production
- 🔲 Run with PostgreSQL (not demo mode)
- 🔲 Configure Stripe keys
- 🔲 Set up file upload service
- 🔲 Configure email service
- 🔲 Set up SSL certificate
- 🔲 Deploy to hosting (Heroku, Vercel, Railway, etc.)

---

## 📞 Support

If you encounter any issues during testing:

1. Check the browser console (F12 → Console)
2. Check the terminal running demo-server.js
3. Try the scenarios above to isolate the issue
4. Clear LocalStorage and try as a new user
5. Restart the demo server

---

## ✨ Success Criteria

You'll know everything is working when:

1. ✅ You can complete an order from start to finish
2. ✅ Returning client auto-fill works
3. ✅ All products display with images
4. ✅ Totals calculate correctly
5. ✅ Payment proof uploads successfully
6. ✅ Success screen shows order number
7. ✅ Works smoothly on your phone
8. ✅ Orders appear when you check via API

---

**Ready to test? Open http://localhost:3000/order/ in your browser!** 🚀
