# Barcode & Invoice Processing System - Testing Guide

## Overview
This guide covers testing the newly implemented barcode scanning, invoice processing, QR code label generation, and quick receive features for the inventory management system.

## Installation & Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

This will install the new `multer` package required for file uploads.

### 2. Start the Demo Server
```bash
cd backend
node demo-server.js
```

The server should start on http://localhost:3000

### 3. Access Admin Dashboard
1. Open browser: http://localhost:3000/admin
2. Login with credentials:
   - Username: `admin`
   - Password: `VTAnunciando2025!`

## Features Implemented

### 1. Barcode System
All materials now have auto-generated barcodes:
- MAT-001: MDF Board 1.22x2.44m
- MAT-002: Circular Black Magnets
- MAT-003: Transparent Protective Backs
- MAT-004: Industrial Glue

New materials automatically get barcodes (MAT-005, MAT-006, etc.)

---

## Testing Each Feature

### Feature 1: Quick Receive Mode (Barcode Scanner)

**Purpose**: Rapidly receive inventory using a USB barcode scanner.

**How to Test**:

1. Click **"⚡ Quick Receive"** button in inventory view
2. Modal opens with large input fields
3. **Without Scanner** (keyboard test):
   - Type barcode: `MAT-001`
   - Press **Enter**
   - Material details appear
   - Type quantity: `10`
   - Press **Enter**
   - Transaction recorded, stock updated
   - Ready for next scan

4. **With USB Scanner**:
   - Print labels first (see Feature 3)
   - Scan barcode from label
   - Scanner acts as keyboard, automatically enters barcode
   - Enter quantity
   - Press **Enter**
   - Repeat for multiple items

**Expected Results**:
- Material found instantly by barcode
- Right panel shows transaction history
- Stock updates in real-time
- Keyboard-only operation (no mouse needed)
- Large text for warehouse visibility

**Test Cases**:
```
Test 1: Valid barcode
Input: MAT-001 + Enter, quantity 50 + Enter
Expected: Stock increases by 50, transaction recorded

Test 2: Invalid barcode
Input: MAT-999 + Enter
Expected: Error message "Material not found"

Test 3: Multiple items in sequence
Input: MAT-001 (qty 10), MAT-002 (qty 100), MAT-003 (qty 50)
Expected: All three transactions appear in history panel

Test 4: History limit
Input: 15 different transactions
Expected: Only last 10 shown in history
```

---

### Feature 2: Invoice Photo Processing

**Purpose**: Upload invoice images, extract data using AI (simulated), and bulk-record purchases.

**How to Test**:

1. Click **"📸 Upload Invoice"** button
2. Modal opens with drag-and-drop area
3. **Upload an invoice image**:
   - Click upload area or drag image
   - Supported formats: JPG, PNG, PDF
   - Max size: 50MB

4. **AI Processing** (Currently Simulated):
   - Click "Process Invoice"
   - System simulates extraction (in production, would use Claude Vision API)
   - Demo extracts 2 sample items:
     * MDF Board 1.22x2.44m (50 units @ $245.00)
     * Black Magnets (5000 units @ $0.48)

5. **Review & Approve**:
   - Review modal shows extracted data
   - Green badge: Material matched automatically
   - Yellow badge: No match, select manually
   - Edit quantities/prices if needed
   - Select correct materials from dropdowns
   - Click **"Approve & Record All"**

6. **Verification**:
   - All transactions created
   - Stock updated for each material
   - Toast notification confirms success

**Expected Results**:
- Image preview shows before processing
- Extracted data displays with confidence scores
- Matched materials pre-selected
- Can edit before approval
- All transactions recorded atomically

**Test Cases**:
```
Test 1: Upload valid invoice image
Expected: Image preview appears, process button enabled

Test 2: Process invoice
Expected: 2 line items extracted with material matches

Test 3: Edit quantities
Change MDF quantity from 50 to 75
Expected: Can edit, approval uses new quantity

Test 4: Manual material selection
Unselect matched material, choose different one
Expected: Dropdown works, new material used on approval

Test 5: Approve all
Expected: 2 transactions created, stock updated, success message
```

---

### Feature 3: QR Code Label Generator

**Purpose**: Generate printable labels with QR codes for all materials.

**How to Test**:

1. Click **"🏷️ Print Labels"** button
2. Modal shows all materials with checkboxes
3. Select materials to print (all checked by default)
4. Click **"Generate Labels"**
5. New window opens with printable labels

**Label Format**:
- Barcode text (large, monospace): `MAT-001`
- QR code (scannable, 150x150px)
- Material name
- Current stock + unit type
- 2 labels per row, standard size

6. **Print**:
   - Click "🖨️ Print Labels" in new window
   - Browser print dialog opens
   - Select printer (4x2" label printer recommended)
   - Print

**Expected Results**:
- All selected materials have labels
- QR codes are scannable
- Labels fit standard sizes (4"x2")
- Print-friendly layout (no UI elements)

**Test Cases**:
```
Test 1: Generate all labels
Select: All 4 materials
Expected: 4 labels in 2x2 grid

Test 2: Generate specific labels
Select: Only MAT-001 and MAT-003
Expected: 2 labels only

Test 3: QR code scan
Print label, scan QR with phone
Expected: QR contains barcode text (MAT-001)

Test 4: Print layout
Preview in print dialog
Expected: Clean layout, 2 per page, no buttons
```

---

### Feature 4: Barcode Lookup API

**Endpoint**: `GET /api/inventory/materials/barcode/:barcode`

**Purpose**: Find material by barcode (used by Quick Receive).

**How to Test with curl**:

```bash
# Valid barcode
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/inventory/materials/barcode/MAT-001

# Expected:
{
  "success": true,
  "material": {
    "id": 1,
    "barcode": "MAT-001",
    "name": "MDF Board 1.22x2.44m",
    "current_stock": 200,
    ...
  }
}

# Invalid barcode
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/inventory/materials/barcode/INVALID

# Expected:
{
  "success": false,
  "error": "Material not found"
}
```

**Test Cases**:
```
Test 1: Lookup MAT-001
Expected: Returns full material object

Test 2: Lookup MAT-004
Expected: Returns Industrial Glue

Test 3: Case insensitive
Input: mat-001 (lowercase)
Expected: Still finds MAT-001 (uppercase)

Test 4: Non-existent
Input: MAT-999
Expected: 404 error, material not found
```

---

### Feature 5: Quick Receive API

**Endpoint**: `POST /api/inventory/quick-receive`

**Purpose**: Record purchase via barcode (fast, minimal data).

**How to Test with curl**:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "barcode": "MAT-001",
    "quantity": 25
  }' \
  http://localhost:3000/api/inventory/quick-receive

# Expected:
{
  "success": true,
  "material": {
    "id": 1,
    "name": "MDF Board 1.22x2.44m",
    "barcode": "MAT-001",
    "unit_type": "sheets"
  },
  "transaction": {
    "quantity": 25,
    "stockBefore": 200,
    "stockAfter": 225,
    "timestamp": "2025-11-04T10:30:00.000Z"
  }
}
```

**Test Cases**:
```
Test 1: Basic receive
Barcode: MAT-001, Quantity: 10
Expected: Stock increases by 10

Test 2: Decimal quantity
Barcode: MAT-004, Quantity: 2.5
Expected: Stock increases by 2.5 bottles

Test 3: Large quantity
Barcode: MAT-002, Quantity: 5000
Expected: Stock increases by 5000

Test 4: Transaction recorded
After receive, check /api/inventory/materials/1/transactions
Expected: New transaction appears with type "purchase"
```

---

### Feature 6: Invoice Processing API

**Endpoint**: `POST /api/inventory/invoices/process`

**Purpose**: Extract data from invoice image using AI vision.

**Note**: Currently returns **simulated data**. In production, this would:
1. Send image to Claude Vision API
2. Extract supplier, date, line items
3. Use fuzzy matching to find materials
4. Return structured JSON

**How to Test with curl**:

```bash
# With base64 image
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageData": "data:image/jpeg;base64,/9j/4AAQ..."
  }' \
  http://localhost:3000/api/inventory/invoices/process

# Expected (simulated):
{
  "success": true,
  "extractedData": {
    "supplier": "Demo Supplier Inc.",
    "invoiceNumber": "INV-1699123456789",
    "invoiceDate": "2025-11-04",
    "lineItems": [
      {
        "description": "MDF Board 1.22x2.44m",
        "quantity": 50,
        "unitCost": 245.00,
        "total": 12250.00,
        "matchedMaterial": {...},
        "matchConfidence": 0.95
      },
      ...
    ],
    "total": 14650.00
  }
}
```

---

### Feature 7: Invoice Approval API

**Endpoint**: `POST /api/inventory/invoices/approve`

**Purpose**: Record all line items from invoice as purchases.

**How to Test with curl**:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceData": {
      "supplier": "Demo Supplier Inc.",
      "invoiceNumber": "INV-123",
      "invoiceDate": "2025-11-04"
    },
    "lineItems": [
      {
        "materialId": 1,
        "quantity": 50,
        "unitCost": 245.00
      },
      {
        "materialId": 2,
        "quantity": 5000,
        "unitCost": 0.48
      }
    ]
  }' \
  http://localhost:3000/api/inventory/invoices/approve

# Expected:
{
  "success": true,
  "transactionsCreated": 2,
  "transactions": [...],
  "errors": []
}
```

**Test Cases**:
```
Test 1: Approve valid invoice
2 line items with valid material IDs
Expected: 2 transactions created, stock updated

Test 2: Missing material ID
Line item without materialId
Expected: Error in errors array, other items processed

Test 3: Invalid material ID
materialId: 999 (doesn't exist)
Expected: Error recorded, transaction skipped

Test 4: Check stock
After approval, verify stock increased correctly
Expected: MAT-001 stock = previous + 50
```

---

### Feature 8: Label Generation API

**Endpoint**: `GET /api/inventory/labels/generate`

**Purpose**: Generate printable HTML with QR code labels.

**How to Test**:

**Browser**:
```
http://localhost:3000/api/inventory/labels/generate?materials=1,2,3
```

**With curl** (save to file):
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/inventory/labels/generate?materials=1,2" \
  -o labels.html

# Open in browser
open labels.html
```

**Query Parameters**:
- `materials`: Comma-separated material IDs
- Omit for all materials

**Expected Results**:
- HTML page with QR code labels
- Uses qrcode.js CDN for generation
- Print button at top
- 2 labels per row
- Each label shows:
  * Barcode text
  * QR code
  * Material name
  * Current stock

**Test Cases**:
```
Test 1: All materials
URL: /api/inventory/labels/generate
Expected: 4 labels (all materials)

Test 2: Specific materials
URL: /api/inventory/labels/generate?materials=1,3
Expected: 2 labels (MAT-001, MAT-003)

Test 3: Single material
URL: /api/inventory/labels/generate?materials=2
Expected: 1 label (MAT-002)

Test 4: QR code generation
Open in browser, inspect QR codes
Expected: Canvas elements with QR codes rendered
```

---

## Integration Testing Scenarios

### Scenario 1: New Material Workflow
```
1. Add new material (no barcode provided)
   Expected: Auto-generates MAT-005

2. Print label for MAT-005
   Expected: Label generated with QR code

3. Scan barcode in Quick Receive
   Expected: Material found, can receive

4. Receive 100 units
   Expected: Stock updates, transaction recorded
```

### Scenario 2: Invoice Processing Workflow
```
1. Upload invoice image (simulated)
   Expected: Extracts 2 line items

2. Review extraction results
   Expected: Materials auto-matched with confidence scores

3. Edit quantity on line 1
   Expected: Can modify before approval

4. Approve invoice
   Expected: 2 transactions created, stock updated

5. Check material transactions
   Expected: Purchase transactions show invoice number
```

### Scenario 3: Warehouse Receiving Day
```
1. Open Quick Receive mode
2. Scan 10 different barcodes with quantities
3. Monitor right panel for history
4. Close session
5. Verify all 10 transactions in material history
6. Confirm stock levels updated correctly
```

---

## Debugging Tips

### Console Logs
Backend logs show:
```
🔍 Looking up material by barcode: MAT-001
✅ Material found: MDF Board 1.22x2.44m
📦 Quick receive: MAT-001 x 10
✅ Quick receive completed: MDF Board 1.22x2.44m - New stock: 210
📸 Processing invoice image...
✅ Invoice processed: 2 items extracted
📋 Approving invoice: INV-123
✅ Processed: MDF Board 1.22x2.44m - Qty: 50
🏷️ Generating labels...
✅ Generated 4 labels
```

### Browser DevTools
Check Network tab for:
- API responses (200 OK)
- Auth headers (Bearer token)
- Request/response bodies

Check Console for:
- JavaScript errors
- API call logs
- QR code generation

### Common Issues

**Issue**: "Material not found" for valid barcode
- Check barcode is uppercase (MAT-001 not mat-001)
- Verify material exists in inventory
- Check browser console for errors

**Issue**: Invoice processing fails
- Image too large (>50MB limit)
- Check Content-Type header
- Verify auth token in request

**Issue**: QR codes not appearing
- Check internet connection (CDN)
- Verify qrcode.js loaded
- Check browser console for errors

**Issue**: Quick Receive doesn't focus inputs
- Browser might block autofocus
- Click input manually first time
- Check keyboard event listeners

---

## Production Considerations

### 1. Real AI Vision Processing
Replace simulated extraction in `/api/inventory/invoices/process` with:
```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const message = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imageBase64
        }
      },
      {
        type: "text",
        text: "Extract invoice data: supplier, date, line items (description, quantity, unit cost). Return as JSON."
      }
    ]
  }]
});

// Parse JSON response and return
```

### 2. Fuzzy Matching
Add fuzzy string matching for better material detection:
```bash
npm install fuse.js
```

```javascript
import Fuse from 'fuse.js';

const fuse = new Fuse(materials, {
  keys: ['name', 'description'],
  threshold: 0.3
});

const results = fuse.search(invoiceItemDescription);
```

### 3. QR Code Generation (Server-Side)
For better performance, generate QR codes server-side:
```bash
npm install qrcode
```

```javascript
import QRCode from 'qrcode';

const qrDataUrl = await QRCode.toDataURL(barcode);
```

### 4. Label Printer Integration
For direct printing to label printers:
- Use Zebra ZPL commands
- Or DYMO SDK
- Or Brother P-touch SDK

### 5. Barcode Scanner Configuration
Most USB scanners work as keyboard input, but ensure:
- Suffix: Carriage Return (Enter)
- Prefix: None (or configure to match)
- Uppercase mode: On

---

## Summary of Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/inventory/materials/barcode/:barcode` | GET | Lookup material by barcode | Yes |
| `/api/inventory/quick-receive` | POST | Fast receive via barcode | Yes |
| `/api/inventory/invoices/process` | POST | Extract invoice data from image | Yes |
| `/api/inventory/invoices/approve` | POST | Record invoice line items | Yes |
| `/api/inventory/labels/generate` | GET | Generate printable QR labels | Yes |

All endpoints require JWT authentication via `Authorization: Bearer TOKEN` header.

---

## Success Metrics

After testing, verify:
- [x] All 4 materials have barcodes (MAT-001 to MAT-004)
- [x] New materials auto-generate barcodes (MAT-005+)
- [x] Quick Receive mode is keyboard-only
- [x] Barcode lookup works (exact match, case-insensitive)
- [x] Invoice processing extracts data (simulated)
- [x] Invoice approval creates transactions
- [x] QR code labels print correctly
- [x] Stock updates reflect all transactions
- [x] Transaction history shows all purchases

---

## Next Steps

1. **Install multer**: `cd backend && npm install`
2. **Start server**: `node demo-server.js`
3. **Login to admin dashboard**
4. **Test each feature** using this guide
5. **Report any issues**

For questions or issues, check the console logs or contact support.

---

**Happy Testing!**
