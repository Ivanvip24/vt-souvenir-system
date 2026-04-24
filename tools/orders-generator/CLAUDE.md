# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**AXKAN PDF + Notion Reference Sheet Generator** - Python scripts that automatically create editable reference sheets for laser-cut souvenir orders. Supports dual output: **Notion pages for real-time collaboration** AND **PDFs for printing/backup**. Replaces manual sheet creation with automated generation.

**NEW: AI-Powered Order Extraction** - Upload/paste order images and Claude Code automatically extracts designs, types, and quantities to generate PDFs instantly.

## Architecture

### Tech Stack
- **Language**: Python 3.8+
- **PDF Generation**: ReportLab
- **Image Processing**: Pillow (PIL)
- **Excel Reading**: openpyxl
- **PDF Forms**: PyPDF2
- **Configuration**: YAML
- **Notion Integration**: notion-client, python-dotenv

### Core Components

**generate_reference.py** - Classic PDF generator
- Reads order data from Excel file
- Generates PDF with grid layout (3 columns)
- Auto-arranges product images
- Adds editable form fields (Contados, Cajas, Notas)
- Saves to network path
- Usage: `python generate_reference.py order.xlsx`

**generate_quick.py** - Interactive GUI-based generator
- Shows dialog prompts for order name, instructions, number of designs
- Includes image editor with copy-paste support (Ctrl+V from clipboard)
- Allows browsing for image files
- Auto-arranges multiple designs in grid layout
- Generates styled PDFs with VT logo and blue theme
- Includes editable "CAJAS TOTALES" field in header
- Dynamic cell sizing based on number of designs (max 9 per page)
- Usage: `python generate_quick.py` (no Excel file needed)

**quick_generate.py** - Simplified dialog-based generator
- Simple dialog prompt for order name
- Generates blank PDF template
- Lighter weight than generate_quick.py

**notion_quick.py** - Notion + PDF dual-output generator
- Same GUI as generate_quick.py (dialogs + image editor)
- Creates Notion page with designs database for real-time collaboration
- ALSO generates PDF for printing/backup
- Enables multiple people to edit same order simultaneously
- Mobile-friendly via Notion app
- Searchable database of all orders
- Usage: `python notion_quick.py`

**generate_axkan.py** - AXKAN branded PDF generator ⭐ **RECOMMENDED**
- Colorful AXKAN branding (pink, green, orange, cyan, red)
- Same GUI workflow as generate_quick.py
- Supports pre-filled data from AI extraction
- Can be called with JSON data for automation
- Usage: `python generate_axkan.py`

**ai_order_extractor.py** - AI Order Image Upload GUI ⭐ **NEW**
- Upload or paste order images (like client-sent order sheets)
- Save images for Claude Code to analyze
- One-click to trigger Claude Code processing
- Automatically extracts: number of designs, types, quantities
- Usage: `python ai_order_extractor.py`

**process_order_image.py** - Order Processing Script (for Claude Code)
- Called by Claude Code after analyzing order images
- Accepts JSON data with extracted order information
- Generates PDF automatically with pre-filled data
- Usage: `python process_order_image.py --file order_data.json`

**config.yaml** - Configuration
- Output path settings
- Layout dimensions (columns, cell size)
- Image size limits
- Font settings
- Product types

**create_sample_excel.py** - Template generator
- Creates sample Excel file with correct format
- Demonstrates expected data structure
- Generates sample_order.xlsx with 6 sample products

## How It Works

### Input: Excel File Format

```
Row 1: Order Number | [Value]
Row 2: Client Name  | [Value]
Row 3: [Empty]
Row 4: Product Name | Type | Quantity | Image Path
Row 5+: [Product data rows]
```

### Process Flow

1. Script reads Excel file
2. Extracts order info (number, client, items)
3. Creates PDF canvas with header
4. Draws grid of cells (3 columns)
5. For each product:
   - Draws cell border
   - Adds "Tipo" label
   - Inserts and scales product image
   - Adds "Requeridos" quantity
   - Creates editable fields (Contados, Cajas, Notas)
6. Saves PDF to output path

### Output: Editable PDF

- Grid layout matching manual sheets
- Product images auto-sized and centered
- Form fields fillable in Adobe Reader
- Saved to: `\\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_XXX.pdf`

## Key Features

**Image Auto-Arrangement**
- Reads image from path in Excel
- Auto-scales to fit cell (max 160x150 points)
- Preserves aspect ratio
- Centers in cell

**Editable Form Fields**
- Uses ReportLab's pdfform module
- Creates text fields for:
  - Contados (actual quantity)
  - Cajas (boxes used)
  - Notas (observations)
- Fields can be filled and saved in PDF reader

**Grid Layout**
- Configurable columns (default: 3)
- Auto-pagination when page is full
- Consistent cell sizing
- Bordered cells for clarity

## Configuration

Edit `config.yaml` to customize:

```yaml
output_path: "\\\\Pcdvt\\\\d\\\\TRABAJOS\\\\2025\\\\ARMADOS VT\\\\ORDERS"
layout:
  columns: 3
  page_size: "A4"
cell:
  width: 180
  height: 250
form_fields:
  enable_editable: true
```

## Usage

```bash
# Install dependencies
pip install -r requirements.txt

# Method 1: INTEGRATED SYSTEM ⭐⭐⭐ RECOMMENDED - ONE CLICK
python axkan_order_system.py           # Or double-click START_AXKAN.command
# Paste order image → Auto-crops designs → Enter details → Generate PDF

# Method 2: AXKAN Branded PDF (manual image input)
python generate_axkan.py               # Opens dialogs with AXKAN branding

# Method 3: Notion + PDF dual-output
python notion_quick.py                 # Creates Notion page + PDF, enables collaboration

# Method 4: VT Branded PDF only - Interactive GUI
python generate_quick.py               # Opens dialogs, image editor with copy-paste

# Method 5: Excel-based generation (classic workflow)
python create_sample_excel.py          # Create template
python generate_reference.py sample_order.xlsx

# Method 6: Simple dialog-based (minimal)
python quick_generate.py               # Single dialog, blank template

# Output locations
# - PDF: /Volumes/TRABAJOS/2025/ARMADOS VT/ORDERS/ORDER_XXX.pdf (macOS)
# - PDF: \\Pcdvt\d\TRABAJOS\2025\ARMADOS VT\ORDERS\ORDER_XXX.pdf (Windows)
# - Notion: https://notion.so/[page-id]
```

## AI Order Extraction Workflow ⭐ NEW

When you receive an order image from a client (showing designs with types and quantities):

**Option A: Using Claude Code directly**
1. Paste or share the order image in Claude Code
2. Tell Claude Code: "Analyze this order image and generate the PDF"
3. Claude Code will:
   - Identify all designs (types: Imanes, Llaveros, Destapadores, etc.)
   - Extract quantities for each design
   - Generate a JSON file with extracted data
   - Create the PDF with AXKAN branding

**Option B: Using the GUI**
1. Run: `python ai_order_extractor.py`
2. Paste order image (Cmd+V) or browse for file
3. Click "ACCEPT & Process with Claude Code"
4. Image is saved to `pending_orders/` directory
5. Open Claude Code and say: "Process the pending order image"

**Example extraction from order image:**
```json
{
    "order_name": "Puerto Arista - Tortugas",
    "instructions": "50 piezas de cada diseno",
    "designs": [
        {"type": "Imanes", "quantity": 50},
        {"type": "Imanes", "quantity": 50},
        {"type": "Llaveros", "quantity": 50},
        {"type": "Llaveros", "quantity": 50},
        {"type": "Destapadores", "quantity": 50},
        {"type": "Destapadores", "quantity": 50}
    ]
}
```

## Common Modifications

**Change Grid Columns**
1. Edit `config.yaml` → `layout: columns: 4`

**Adjust Cell Size**
1. Edit `config.yaml` → `cell: width/height`

**Change Output Path**
1. Edit `config.yaml` → `output_path: "C:\\temp\\pdfs"`

**Disable Editable Fields**
1. Edit `config.yaml` → `form_fields: enable_editable: false`

**Add Product Type**
1. Edit `config.yaml` → Add to `product_types` list

## File Structure

```
ORDERS_REPOSITORY/
├── axkan_order_system.py    # INTEGRATED SYSTEM ⭐⭐⭐ ONE-CLICK SOLUTION
├── START_AXKAN.command      # Double-click launcher for macOS
├── generate_axkan.py        # AXKAN branded PDF generator (standalone)
├── ai_order_extractor.py    # AI order image upload GUI
├── process_order_image.py   # Order processing script (for Claude Code)
├── crop_designs.py          # Standalone design cropper utility
├── generate_reference.py    # Excel-based PDF generator (classic)
├── generate_quick.py        # Interactive GUI generator (VT branding)
├── notion_quick.py          # Notion + PDF dual-output generator
├── quick_generate.py        # Simple dialog-based generator
├── create_sample_excel.py   # Excel template creator
├── config.yaml              # Configuration
├── .env                     # API credentials (git-ignored)
├── requirements.txt         # Python dependencies
├── axkan_logo.png           # AXKAN logo for PDFs ⭐ NEW
├── vt.png / vt1.png         # VT logo assets (legacy)
├── pending_orders/          # Saved order images for AI processing ⭐ NEW
├── database/
│   └── orders.db            # SQLite database (if used)
├── temp_images/             # Temporary storage for pasted images
├── README.md                # User documentation
├── NOTION_GUIDE.md          # Notion integration guide
├── INSTALLATION_GUIDE.md    # Installation instructions
├── QUICK_START.bat          # Windows batch file for quick launch
├── CLAUDE.md                # This file
└── sample_order.xlsx        # Example data (generated)
```

## Dependencies

- `reportlab>=4.0.0` - PDF creation and forms
- `Pillow>=10.0.0` - Image loading, processing, clipboard support
- `openpyxl>=3.1.0` - Excel file reading (for generate_reference.py)
- `PyPDF2>=3.0.0` - PDF manipulation
- `pyyaml` - YAML configuration parsing
- `tkinter` - GUI dialogs (included with Python on most systems)
- `notion-client>=2.2.1` - Official Notion API client (for notion_quick.py)
- `python-dotenv>=1.0.0` - Environment variable management (for notion_quick.py)

## Workflow Integration

**Workflow Option 1: Notion + PDF (Recommended for Teams)** ⭐
1. Run: `python notion_quick.py`
2. Enter order name in dialog
3. Enter instructions (e.g., "100 pzas of each design")
4. Select number of designs (3, 5, 6, or custom)
5. In image editor:
   - Click slot and press Cmd+V (or Ctrl+V) to paste from clipboard
   - OR click "Browse File" to select image
6. Click "Generate PDF"
7. **Dual output created:**
   - ✅ Notion page with editable designs database
   - ✅ PDF saved to network path
8. Share Notion link with team for real-time collaboration

**Workflow Option 2: PDF Only - Interactive GUI**
1. Run: `python generate_quick.py`
2. Enter order name in dialog
3. Enter instructions (e.g., "100 pzas of each design")
4. Select number of designs (3, 5, 6, or custom)
5. In image editor:
   - Click slot and press Cmd+V (or Ctrl+V) to paste from clipboard
   - OR click "Browse File" to select image
6. Click "Generate PDF"
7. PDF saved with styled header, VT logo, editable fields

**Workflow Option 3: Excel-based (Traditional)**
1. Fill Excel file with order data
2. Run: `python generate_reference.py order.xlsx`
3. PDF saved to network automatically

**For Printing Department:**
1. Open Notion page on tablet/phone OR PDF from network path
2. View designs and quantities
3. Check items as they're printed

**For QC/Counting Department:**
1. Open Notion page (multiple people can edit simultaneously!)
2. Fill "Contados" field (actual quantity)
3. Fill "Cajas" field (boxes used)
4. Changes save automatically
5. OR use PDF in Adobe Reader if offline

**For Shipping:**
1. Open Notion page or filled PDF
2. Read "Cajas" counts
3. Update Status to "Shipped" in Notion
4. Generate shipping labels accordingly

**For Billing:**
1. Open Notion Orders database
2. Filter by Status: "Completed"
3. Compare "Requeridos" vs "Contados"
4. Adjust invoice if quantities differ

## Key Features

**Image Handling**
- Copy-paste from clipboard (Ctrl+V) in generate_quick.py
- Browse and select files from disk
- Automatic image scaling and centering
- Preserves aspect ratio
- Temporary storage in temp_images/ directory

**PDF Styling (generate_axkan.py)** ⭐ NEW
- Colorful AXKAN branding with 5-color palette:
  - A: Pink (#E91E63)
  - X: Green (#7CB342)
  - K: Orange (#FF9800)
  - A: Cyan (#00BCD4)
  - N: Red (#F44336)
- Each design cell has colored accent border (rotating colors)
- Rainbow separator line in header
- Professional header with "ORDEN DE COMPRA"
- Large "CAJAS TOTALES" field with orange border

**PDF Styling (generate_quick.py)** - VT Branding
- Navy blue (#1B4F72) and bright blue (#2E86C1) theme
- VT logo integration (vt1.png)
- Rounded corners on form fields
- Light blue (#EBF5FB) field backgrounds
- Professional header with "ORDEN DE COMPRA"
- Large "CAJAS TOTALES" field at top

**Dynamic Layout**
- Auto-calculates cell size based on number of designs
- Centers grid on page
- Max 9 designs per page (3x3 grid)
- Auto-pagination for larger orders
- Consistent spacing between cells

**Editable Fields**
- Type (Tipo) - editable in quick generator
- Required quantity (Requeridos) - editable in quick generator
- Counted (Contados)
- Boxes (Cajas)
- Notes (Notas) - only in classic generator
- Total boxes (CAJAS TOTALES) - header field in quick generator

## Architecture Notes

**Three Generation Approaches:**

1. **Notion + PDF dual-output (notion_quick.py)** ⭐ **RECOMMENDED**
   - Class-based: `NotionIntegration` + `QuickPDFGenerator` + `ImageEditorGUI`
   - Reuses GUI components from generate_quick.py
   - Creates Notion page with designs database
   - Generates PDF simultaneously
   - Supports real-time multi-user collaboration
   - Best for: Team environments, orders requiring collaboration

2. **Excel-driven (generate_reference.py)**
   - Class-based: `ReferenceSheetGenerator`
   - Reads from Excel template with product data
   - Fixed grid layout (3 columns from config)
   - Includes all editable fields
   - Best for: Complex orders with many products

3. **Dialog-driven PDF only (generate_quick.py)**
   - Class-based: `QuickPDFGenerator` + `ImageEditorGUI`
   - No Excel needed, uses GUI dialogs
   - Dynamic cell sizing based on design count
   - Copy-paste image support via clipboard
   - Styled with VT branding
   - Best for: Quick orders, single-user workflow

**Image Clipboard Support:**
- Primary: PIL's `ImageGrab.grabclipboard()`
- Fallback: `win32clipboard` (Windows-specific)
- Handles CF_DIB and CF_BITMAP formats
- Saves to temp_images/ as PNG

**Notion Integration:**
- Uses official `notion-client` Python library
- Credentials stored in `.env` file (git-ignored for security)
- Creates/finds "Orders" database automatically
- Each order is a page with child "Designs" database
- Supports gallery and table views
- Real-time sync across all users
- Mobile-friendly via Notion app

**Database:**
- SQLite database (database/orders.db) exists but not actively used in current scripts
- Notion database now serves as primary collaborative database
- Potential for syncing between Notion and local SQLite

## Advantages Over Manual Process

**Automation Benefits:**
- ✅ No manual image arrangement
- ✅ Copy-paste images directly from browser/screen
- ✅ Consistent formatting with VT branding
- ✅ Fast generation (seconds vs minutes)

**Digital Workflow:**
- ✅ Editable digital forms (PDF + Notion)
- ✅ No paper waste (use tablets/phones)
- ✅ Network storage for backup
- ✅ Multiple workflow options (Excel, GUI, or Notion)

**Collaboration Features (Notion):** ⭐ **NEW**
- ✅ Multiple people edit simultaneously
- ✅ Real-time sync across all devices
- ✅ Mobile-friendly (Notion app)
- ✅ Searchable database of all orders
- ✅ Comments and @mentions
- ✅ Automatic version history
- ✅ Status tracking (Pending → In Progress → Completed → Shipped)
- ✅ Filter and sort orders by any property
