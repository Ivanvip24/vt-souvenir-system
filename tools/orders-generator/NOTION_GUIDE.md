# Notion Integration Guide

## Overview

This system now supports **dual output**: it creates **both** a Notion page for real-time collaboration AND a PDF for printing/backup.

### Why Notion?

✅ **Multiple people can edit the same order simultaneously**
✅ Mobile-friendly (Notion app)
✅ Searchable database of all orders
✅ Comments and @mentions
✅ Automatic version history
✅ Still generates PDF for printing

---

## Setup (One-Time)

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `notion-client` - Official Notion API library
- `python-dotenv` - Environment variable management

### 2. Verify Credentials

Your `.env` file should already contain:

```
NOTION_API_TOKEN=ntn_YOUR_TOKEN_HERE
NOTION_PARENT_PAGE_ID=YOUR_PAGE_ID_HERE
```

⚠️ **NEVER commit the `.env` file to version control!** (Already protected by `.gitignore`)

---

## Usage

### Running the Script

```bash
python notion_quick.py
```

### Workflow

1. **Enter order name** (dialog box)
2. **Enter instructions** (optional, e.g., "100 pzas of each design")
3. **Select number of designs** (3, 5, 6, or custom)
4. **Add images** using the image editor:
   - Click a slot and press **Cmd+V** (Mac) or **Ctrl+V** (Windows) to paste from clipboard
   - OR click **"Browse File"** to select an image
   - Repeat for each design
5. Click **"Generate PDF"**
6. Script creates:
   - ✓ Notion page with designs database
   - ✓ PDF file in network path

### Success Dialog

After completion, you'll see:
- **Notion page URL** - Click to open in browser
- **PDF file path** - Location of generated PDF

---

## Notion Database Structure

### Orders Database (Created Automatically)

Located in your parent page, contains all orders with these properties:

| Property | Type | Description |
|----------|------|-------------|
| **Order Name** | Title | Name/number of the order |
| **Date Created** | Date | Automatically set to today |
| **Instructions** | Text | Production instructions |
| **# of Designs** | Number | Number of designs in order |
| **Total Boxes** | Number | Editable - total boxes used |
| **Status** | Select | Pending, In Progress, Completed, Shipped |

### Each Order Page Contains

**Designs Database** (child database with these properties):

| Property | Type | Description |
|----------|------|-------------|
| **Design Name** | Title | Design 1, Design 2, etc. |
| **Tipo** | Text | Type of product (editable) |
| **Requeridos** | Number | Required quantity (editable) |
| **Contados** | Number | Actual count (fill during QC) |
| **Cajas** | Number | Boxes used (fill during production) |
| **Image** | Files | Product image (auto-added) |

---

## Collaboration Workflow

### For Production Manager

1. Run `python notion_quick.py`
2. Create order with images
3. Share Notion page link with team

### For Production Team

1. Open Notion page on tablet/phone
2. View designs and quantities
3. Fill in **"Tipo"** and **"Requeridos"** as needed

### For QC/Counting

1. Open Notion page
2. Fill in **"Contados"** field (actual quantity counted)
3. Fill in **"Cajas"** field (boxes used)
4. Changes save automatically

### For Shipping

1. Open Notion page
2. Read **"Cajas"** counts
3. Update **Status** to "Shipped"

### For Billing

1. Open Notion database
2. Filter by **Status: "Completed"**
3. Compare **"Requeridos"** vs **"Contados"**

---

## Notion Features

### Views

**Gallery View** - Visual cards showing each order
**Table View** - Spreadsheet-like view for quick scanning
**Filters** - Filter by Status, Date, etc.
**Sorts** - Sort by Date, Order Name, etc.

### Creating Custom Views

1. Open the Orders database in Notion
2. Click **"+ New"** next to views
3. Select view type (Gallery, Table, Board, etc.)
4. Configure filters and sorts

### Mobile Access

1. Install **Notion app** on iOS/Android
2. Open workspace
3. Navigate to Orders database
4. Edit on the go

---

## Image Handling

### Current Limitations

The Notion API **does not support direct file uploads**. Images are currently:
- Saved to `temp_images/` folder
- Referenced in Notion as file paths
- **Visible in the PDF** (works perfectly)

### For Production Use (Optional Enhancement)

To display images in Notion, you'd need to:
1. Upload images to a CDN (Cloudinary, AWS S3, etc.)
2. Modify `upload_image_to_notion()` in `notion_quick.py`
3. Use external URLs in Notion

**Current workaround:**
- Images are embedded in the PDF
- Notion shows file path reference
- Team can still see designs in PDF

---

## Troubleshooting

### Error: "Missing Notion credentials"

**Solution:** Verify `.env` file exists and contains both:
- `NOTION_API_TOKEN`
- `NOTION_PARENT_PAGE_ID`

### Error: "Could not create database"

**Solution:** Ensure your Notion integration has access to the parent page:
1. Open parent page in Notion
2. Click **"•••"** (top right)
3. Click **"Add connections"**
4. Select **"VT Orders System"** (or your integration name)

### Images Not Showing in Notion

**Expected behavior:** Images show in PDF, not in Notion (API limitation)
**Solution:** Use PDF for viewing images, Notion for data entry

### Can't Edit Fields

**Solution:**
1. Ensure you're editing the page, not viewing
2. Check permissions (must have edit access to workspace)

---

## Comparison: PDF vs Notion

| Feature | PDF | Notion |
|---------|-----|--------|
| **Multi-user editing** | ❌ No | ✅ Yes (real-time) |
| **Mobile-friendly** | ⚠️ Limited | ✅ Full app support |
| **Image display** | ✅ Perfect | ⚠️ Path reference only |
| **Printing** | ✅ Designed for print | ⚠️ Export required |
| **Offline access** | ✅ Always | ⚠️ Needs sync |
| **Search/filter** | ❌ No | ✅ Full database features |
| **Version history** | ❌ No | ✅ Automatic |
| **Comments** | ❌ No | ✅ Yes with @mentions |

**Recommendation:** Use **Notion** for daily operations, **PDF** for printing/archiving.

---

## Advanced: Manual Database Setup

If you prefer to manually create the database:

1. **Create a database** in your Notion workspace
2. **Add properties** as listed above
3. **Get database ID** from the URL:
   - URL: `https://notion.so/abc123def456...`
   - Database ID: `abc123def456...`
4. **Update `.env`:**
   ```
   NOTION_ORDERS_DB_ID=abc123def456...
   ```
5. **Modify `notion_quick.py`:**
   - In `find_or_create_orders_database()`, use the existing ID

---

## Support

### Issues

If you encounter problems:
1. Check this guide first
2. Verify `.env` configuration
3. Ensure Notion integration has access to parent page
4. Check terminal output for error messages

### Future Enhancements

Possible improvements:
- [ ] Image upload to CDN for Notion display
- [ ] Bulk import from Excel to Notion
- [ ] Export Notion data to Excel
- [ ] Custom templates for different product types
- [ ] Automated status updates based on field completion
- [ ] Integration with shipping/billing systems

---

## Quick Reference

### Commands

```bash
# Generate order in Notion + PDF
python notion_quick.py

# Generate PDF only (classic)
python generate_quick.py
```

### File Locations

- **PDFs:** `/Volumes/TRABAJOS/2025/ARMADOS VT/ORDERS/`
- **Temp Images:** `temp_images/`
- **Credentials:** `.env` (NEVER commit!)

### Keyboard Shortcuts

- **Cmd+V / Ctrl+V** - Paste image from clipboard
- **Cmd+C / Ctrl+C** - Copy image to clipboard

---

**You're all set!** Run `python notion_quick.py` to create your first order in Notion.
