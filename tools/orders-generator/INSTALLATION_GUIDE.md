# Installation Guide - PDF Reference Sheet Generator

Complete step-by-step guide to set up and use the PDF Reference Sheet Generator.

---

## Step 1: Install Python

### Download Python

1. Go to https://www.python.org/downloads/
2. Click **"Download Python 3.12.x"** (or latest version)
3. Run the installer

### During Installation - IMPORTANT!

✅ **Check "Add Python to PATH"** (very important!)
✅ Click "Install Now"

### Verify Installation

Open **Command Prompt** (press Windows Key, type "cmd", press Enter):

```bash
python --version
```

Expected output: `Python 3.12.x`

If you get an error, Python is not in PATH. Reinstall and check the box!

---

## Step 2: Install Required Libraries

Open **Command Prompt**:

```bash
# Navigate to project folder
cd C:\Users\usuario\Desktop\CLAUDE\ORDERS_REPOSITORY

# Install dependencies
pip install -r requirements.txt
```

**Wait for installation** (takes 1-2 minutes)

Expected output:
```
Successfully installed reportlab-4.0.x Pillow-10.0.x openpyxl-3.1.x PyPDF2-3.0.x pyyaml-6.0.x
```

---

## Step 3: Create Sample Excel Template

Still in Command Prompt:

```bash
python create_sample_excel.py
```

Expected output:
```
✓ Created sample_order.xlsx
```

This creates a sample Excel file you can use as a template.

---

## Step 4: Prepare Your First Order

### Option A: Use Sample File (for testing)

1. Open `sample_order.xlsx` in Excel
2. Look at the format:
   - Row 1: Order Number
   - Row 2: Client Name
   - Row 4: Headers (Product Name, Type, Quantity, Image Path)
   - Row 5+: Your products

### Option B: Create Your Own

1. Copy `sample_order.xlsx` to `my_order.xlsx`
2. Edit in Excel:

   **Update order info:**
   - Cell B1: Your order number (e.g., "001")
   - Cell B2: Client name (e.g., "Tourist Shop")

   **Add your products (starting row 5):**
   - Column A: Product name (e.g., "Imán Ahualulco")
   - Column B: Type (Imanes chicos, Llaveros, Destapadores, etc.)
   - Column C: Quantity (e.g., 50)
   - Column D: Full path to image (e.g., "C:\images\iman1.jpg")

3. Save the file

---

## Step 5: Prepare Product Images

### Create Images Folder

```bash
# In Command Prompt
mkdir C:\images
```

### Add Your Images

1. Copy your product images to `C:\images\`
2. Rename for easy reference:
   - `iman_ahualulco.jpg`
   - `llavero_tequila.jpg`
   - etc.

### Recommended Image Specs:

- **Format:** JPG or PNG
- **Size:** 800x800 pixels minimum
- **Resolution:** 300 DPI for best quality
- **Background:** Transparent (PNG) or white

---

## Step 6: Generate Your First PDF

### Run the Generator

In Command Prompt:

```bash
python generate_reference.py sample_order.xlsx
```

### Expected Output:

```
============================================================
PDF Reference Sheet Generator
============================================================

Reading order data from: sample_order.xlsx
Order Number: 001
Client: Sample Client
Items: 6

Generating PDF...
✓ PDF generated successfully: \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_001_20250930_153045.pdf

✓ Done! PDF saved to:
  \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_001_20250930_153045.pdf

You can now:
  1. Open the PDF in Adobe Reader
  2. Fill in the editable fields (Contados, Cajas, Notas)
  3. Save the filled PDF
```

---

## Step 7: View and Test the PDF

### Open the PDF

1. Navigate to: `\\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\`
2. Find your PDF (e.g., `ORDER_001_20250930_153045.pdf`)
3. Open with **Adobe Reader** (recommended) or **Foxit Reader**

### What You'll See:

```
┌─────────────────────────────────────────────────┐
│ REFERENCE SHEET                                  │
│ Order: 001 | Client: Sample Client | Date: ... │
├──────────────┬──────────────┬────────────────────┤
│ Tipo: Imanes │ Tipo: Llaveros│ Tipo: Destapadores│
│   [Image]    │   [Image]     │   [Image]         │
│ Requeridos:50│ Requeridos:100│ Requeridos: 50    │
│ Contados: __ │ Contados: ___ │ Contados: __      │ ← Click to fill
│ Cajas: __    │ Cajas: ___    │ Cajas: __         │ ← Click to fill
│ Notas: _____ │ Notas: ______│ Notas: _____      │ ← Click to fill
└──────────────┴──────────────┴────────────────────┘
```

### Test Editable Fields:

1. Click on "Contados" field
2. Type a number (e.g., "48")
3. Click on "Cajas" field
4. Type a number (e.g., "1")
5. Click "File" → "Save" to save your changes

---

## Step 8: Customize Settings (Optional)

### Edit Configuration

Open `config.yaml` in Notepad:

```bash
notepad config.yaml
```

### Common Changes:

**Change output path** (if network path doesn't work):
```yaml
output_path: "C:\\temp\\pdfs"  # Local folder instead
```

**Change grid columns** (4 columns instead of 3):
```yaml
layout:
  columns: 4
```

**Disable editable fields** (static PDF only):
```yaml
form_fields:
  enable_editable: false
```

Save and close Notepad.

---

## Troubleshooting

### Error: "python is not recognized"

**Problem:** Python not in PATH

**Solution:**
1. Uninstall Python
2. Reinstall, checking "Add Python to PATH"
3. Restart Command Prompt

### Error: "No module named 'reportlab'"

**Problem:** Dependencies not installed

**Solution:**
```bash
pip install -r requirements.txt
```

### Error: "File not found: sample_order.xlsx"

**Problem:** Wrong directory

**Solution:**
```bash
# Make sure you're in the right folder
cd C:\Users\usuario\Desktop\CLAUDE\ORDERS_REPOSITORY

# Then run again
python generate_reference.py sample_order.xlsx
```

### Warning: "Could not load image"

**Problem:** Image path in Excel doesn't exist

**Solution:**
1. Check image paths in Excel column D
2. Use full paths: `C:\images\file.jpg`
3. Verify files exist at those paths

### Can't Save to Network Path

**Problem:** Network path not accessible

**Solution:**
1. Test path in Windows Explorer: `\\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS`
2. If it doesn't work, change to local path in `config.yaml`:
   ```yaml
   output_path: "C:\\Orders"
   ```

### PDF Fields Not Editable

**Problem:** PDF opened in browser or wrong reader

**Solution:**
1. Download PDF to local computer
2. Open in Adobe Reader (not Chrome/Edge)
3. Try Foxit Reader if Adobe doesn't work

---

## Daily Usage Workflow

### For You (Order Creator):

```bash
# 1. Create/edit Excel file with order data
# 2. Run generator
python generate_reference.py order_001.xlsx

# 3. PDF automatically saved to network
```

### For Printing Team:

1. Open PDF from network path
2. View on tablet OR print
3. Check items as you print them

### For QC/Counting Team:

1. Open PDF in Adobe Reader
2. Fill "Contados" (actual quantity)
3. Fill "Cajas" (boxes used)
4. Add notes if needed
5. Save PDF

### For Shipping Team:

1. Open filled PDF
2. Read "Cajas" counts
3. Generate shipping labels

---

## Quick Reference

### Generate PDF:
```bash
python generate_reference.py <excel_file>
```

### Create Template:
```bash
python create_sample_excel.py
```

### Install Dependencies:
```bash
pip install -r requirements.txt
```

### Check Python:
```bash
python --version
```

---

## Next Steps

1. ✅ Create Excel file for your first real order
2. ✅ Add product images to `C:\images\`
3. ✅ Generate PDF
4. ✅ Test with your team
5. ✅ Adjust `config.yaml` if needed

---

## Support

If you encounter issues:
1. Check this guide
2. Review error messages
3. Verify all file paths are correct
4. Ensure network path is accessible

---

**You're all set! Start creating digital reference sheets! 🎉**
