# PDF Reference Sheet Generator

Automatically generates editable PDF reference sheets for laser-cut souvenir orders, replacing manual sheet creation.

## Features

✅ **Automatic PDF Generation** - Creates reference sheets from Excel data
✅ **Image Auto-Arrangement** - Arranges product images in grid layout (3 columns)
✅ **Editable Form Fields** - QC team can fill actual quantities, boxes, notes digitally
✅ **Network Path Support** - Saves PDFs to `\\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS`
✅ **No Server Needed** - Simple Python script, runs offline
✅ **Print or Digital** - PDFs can be printed or filled digitally

## Requirements

- Python 3.8 or higher
- Windows (for network path support)

## Installation

### Step 1: Install Python

1. Download Python from https://www.python.org/downloads/
2. During installation, check "Add Python to PATH"
3. Verify installation:
   ```bash
   python --version
   ```

### Step 2: Install Dependencies

Open Command Prompt and run:

```bash
cd C:\Users\usuario\Desktop\CLAUDE\ORDERS_REPOSITORY
pip install -r requirements.txt
```

This installs:
- `reportlab` - PDF generation
- `Pillow` - Image handling
- `openpyxl` - Excel reading
- `PyPDF2` - PDF manipulation

## Quick Start

### 1. Prepare Order Data

Create or edit an Excel file with your order data:

```bash
python create_sample_excel.py
```

This creates `sample_order.xlsx` with the correct format.

### 2. Edit Excel File

Open `sample_order.xlsx` and fill in:

| Product Name | Type | Quantity | Image Path |
|--------------|------|----------|------------|
| Imán Ahualulco | Imanes chicos | 50 | C:\images\iman1.jpg |
| Llavero Tequila | Llaveros | 100 | C:\images\llavero1.jpg |

**Excel Format:**
- Row 1: `Order Number` | `001`
- Row 2: `Client Name` | `Tourist Shop`
- Row 4: Column headers
- Row 5+: Product data

### 3. Generate PDF

Run the generator:

```bash
python generate_reference.py sample_order.xlsx
```

**Output:**
```
====================================
PDF Reference Sheet Generator
====================================

Reading order data from: sample_order.xlsx
Order Number: 001
Client: Tourist Shop
Items: 6

Generating PDF...
✓ PDF generated successfully: \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_001_20250930_153045.pdf

✓ Done! PDF saved to:
  \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_001_20250930_153045.pdf
```

### 4. Use the PDF

**For Printing Department:**
- Open PDF
- Print if needed
- Check items as they're printed

**For QC/Counting Department:**
- Open PDF in Adobe Reader
- Fill in editable fields:
  - **Contados:** Actual quantity counted
  - **Cajas:** Number of boxes used
  - **Notas:** Any observations
- Save filled PDF

**For Shipping:**
- Open filled PDF
- Review box counts
- Generate shipping labels based on "Cajas" field

## Workflow

```
1. Create order → Excel file
   ├─ Order number: 001
   ├─ Client name: Tourist Shop
   └─ Products with images

2. Generate PDF → Run script
   └─ python generate_reference.py order_001.xlsx

3. PDF Generated
   ├─ Saved to network: \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\
   ├─ Grid layout (3 columns)
   ├─ Product images auto-arranged
   └─ Editable form fields included

4. Printing Department
   ├─ Views PDF on screen/tablet OR prints it
   └─ Checks items as they print

5. QC/Counting Department
   ├─ Opens PDF in Adobe Reader
   ├─ Fills "Contados" (actual quantity)
   ├─ Fills "Cajas" (boxes used)
   ├─ Adds notes if needed
   └─ Saves filled PDF

6. Shipping Department
   ├─ Opens filled PDF
   ├─ Reviews box counts
   └─ Generates shipping labels

7. Billing
   └─ Compare "Requeridos" vs "Contados" for invoice
```

## Configuration

Edit `config.yaml` to customize:

```yaml
# Output path
output_path: "\\\\Pcdvt\\d\\TRABAJOS\\2025\\ARMADOS VT\\ORDERS"

# Grid layout
layout:
  columns: 3  # Number of columns

# Cell size
cell:
  width: 180
  height: 250

# Enable editable fields
form_fields:
  enable_editable: true
```

## Excel Template Format

### Required Structure:

```
Row 1: Order Number | [Your Order Number]
Row 2: Client Name  | [Client Name]
Row 3: [Empty]
Row 4: Product Name | Type | Quantity | Image Path
Row 5+: [Data rows]
```

### Example:

| | A | B | C | D |
|---|---|---|---|---|
| 1 | Order Number | 001 | | |
| 2 | Client Name | Tourist Shop | | |
| 3 | | | | |
| 4 | Product Name | Type | Quantity | Image Path |
| 5 | Imán Ahualulco | Imanes chicos | 50 | C:\images\iman.jpg |
| 6 | Llavero Tequila | Llaveros | 100 | C:\images\llavero.jpg |

## Product Types

Available types (configured in `config.yaml`):
- Imanes chicos
- Llaveros
- Destapadores
- Portallaves
- Llaverosx

## Image Guidelines

**Supported Formats:** JPG, PNG, GIF, BMP

**Recommended:**
- Resolution: 300 DPI minimum
- Size: 800x800 pixels or larger
- Format: JPG or PNG
- Background: Transparent (PNG) or white

**Image Paths:**
- Use full paths: `C:\images\product.jpg`
- Or relative paths: `images\product.jpg`
- Network paths work: `\\server\share\images\product.jpg`

## Troubleshooting

### PDF Not Generated

**Problem:** Script exits with error
**Solution:**
1. Check Excel file format is correct
2. Verify all image paths exist
3. Ensure output directory is accessible

### Images Not Showing

**Problem:** PDF shows "[Image not found]"
**Solution:**
1. Check image paths in Excel are correct
2. Use full paths (C:\images\file.jpg)
3. Verify image files exist

### Can't Edit PDF Fields

**Problem:** Form fields are read-only
**Solution:**
1. Open PDF in Adobe Reader (not browser)
2. Check `config.yaml` has `enable_editable: true`
3. Try Foxit Reader if Adobe doesn't work

### Network Path Error

**Problem:** Can't save to `\\Pcdvt\d\TRABAJOS...`
**Solution:**
1. Check network share is accessible
2. Test path in Windows Explorer
3. Temporarily change to local path in `config.yaml`

## Advanced Usage

### Batch Processing

Process multiple orders:

```bash
# Create script: process_all.bat
@echo off
for %%f in (orders\*.xlsx) do (
    python generate_reference.py "%%f"
)
```

### Custom Output Path

```bash
python generate_reference.py order.xlsx --output "C:\temp\pdfs"
```

### Without Images

If you don't have images yet:
- Leave Image Path column empty in Excel
- PDF will show product name as placeholder

## Tips

1. **Keep Images Organized** - Store all product images in one folder
2. **Use Consistent Naming** - e.g., `SKU_ProductName.jpg`
3. **Template Reuse** - Save Excel template, duplicate for new orders
4. **Backup PDFs** - Network path provides automatic backup
5. **Tablet Use** - Open PDFs on tablet for paperless workflow

## Examples

See `sample_order.xlsx` for complete example with 6 products.

## Support

For issues or questions:
1. Check this README
2. Review `config.yaml` settings
3. Verify Python and dependencies are installed correctly
