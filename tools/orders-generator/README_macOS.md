# PDF Order Sheet Generator - macOS Version

Automatically generates editable PDF reference sheets for laser-cut souvenir orders with a simple GUI interface.

## Features

✅ **Interactive GUI** - Dialog-based interface with image editor
✅ **Copy-Paste Images** - Cmd+V to paste images directly from clipboard
✅ **Drag & Drop** - Browse and select images from Finder
✅ **Auto Layout** - Automatic grid arrangement (3 columns)
✅ **Editable Fields** - Fill quantities, boxes, and notes digitally
✅ **VT Branding** - Professional styling with logo integration
✅ **macOS Native** - Optimized for macOS (no Windows dependencies)

## Requirements

- **macOS** 10.15 (Catalina) or later
- **Python 3.8+** (usually pre-installed on macOS)

## Quick Start

### 1. Install Python Dependencies

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR
pip3 install -r requirements.txt
```

If you don't have pip, install it first:
```bash
python3 -m ensurepip --upgrade
```

### 2. Run the Generator

```bash
python3 generate_quick.py
```

### 3. Use the Interface

**Step-by-step workflow:**

1. **Order Name Dialog** - Enter the order name/number (e.g., "ORDER_001")
2. **Instructions Dialog** - Enter instructions (e.g., "100 pzas of each design")
3. **Design Count Dialog** - Select number of designs (3, 5, 6, or custom)
4. **Image Editor Window** - Add images to each slot:
   - **Copy image** (Cmd+C) from browser/Finder, then **click slot** and **press Cmd+V**
   - Or click **"Browse File"** to select from Finder
   - Or click **"Paste from Clipboard"** button
5. **Generate** - Click "Generate PDF" when done
6. **Done!** - PDF saved to `~/Desktop/ORDERS/`

## Configuration

Edit `config.yaml` to customize:

```yaml
# Change output location
output_path: "~/Desktop/ORDERS"              # Default
output_path: "~/Documents/MyOrders"          # Custom folder
output_path: "/Volumes/Share/Orders"         # Network share (SMB mounted)

# Grid layout
layout:
  columns: 3        # Number of columns (default: 3)
  page_size: "A4"   # A4, Letter, Legal

# Cell dimensions
cell:
  width: 180        # Cell width in points
  height: 250       # Cell height in points
```

## macOS-Specific Features

### Clipboard Support
- Native macOS clipboard integration via PIL ImageGrab
- Supports copying images from:
  - Safari/Chrome (Cmd+C on image)
  - Finder (Cmd+C on image file)
  - Preview app
  - Screenshots (Cmd+Shift+4, then Cmd+C)

### Path Support
- Use `~` for home directory: `~/Desktop/ORDERS`
- Absolute paths: `/Users/username/Documents/Orders`
- Network shares: `/Volumes/ShareName/path/to/folder`

### File Locations
- **PDFs saved to**: `~/Desktop/ORDERS/` (configurable)
- **Temp images**: `./temp_images/` (auto-cleaned)
- **Logos**: `vt.png`, `vt1.png` (must be in script directory)

## Troubleshooting

### tkinter Not Found
If you get "No module named 'tkinter'":

```bash
# On macOS with Homebrew Python:
brew install python-tk

# Or use system Python:
/usr/bin/python3 generate_quick.py
```

### Clipboard Paste Not Working

**Solution 1**: Use "Browse File" button instead
**Solution 2**: Copy image file in Finder (Cmd+C), not just preview
**Solution 3**: Take screenshot to clipboard (Cmd+Shift+Ctrl+4), then paste

### Permission Denied on Output Path

```bash
# Check folder permissions:
ls -ld ~/Desktop/ORDERS

# Create folder manually:
mkdir -p ~/Desktop/ORDERS
chmod 755 ~/Desktop/ORDERS
```

### Images Not Showing in PDF

- Verify image files exist in `temp_images/` folder
- Check image format is supported (PNG, JPG, GIF, BMP)
- Try re-pasting or browsing for image again

## Tips for macOS Users

1. **Screenshot to Clipboard**: Press `Cmd+Shift+Ctrl+4`, select area → auto-copies to clipboard → paste into slot
2. **Finder Integration**: Right-click image → Copy → paste into generator
3. **Safari/Chrome**: Right-click image → Copy Image → paste into generator
4. **Network Shares**: Mount SMB share first in Finder, then use `/Volumes/ShareName/path`
5. **Spotlight Search**: Add `alias pdfgen='python3 ~/path/to/generate_quick.py'` to `~/.zshrc`

## Quick Access Setup

Create a macOS application launcher:

```bash
# Create launch script
cat > ~/Desktop/OrderGenerator.command << 'EOF'
#!/bin/bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR
python3 generate_quick.py
EOF

# Make executable
chmod +x ~/Desktop/OrderGenerator.command
```

Now double-click `OrderGenerator.command` on your Desktop to launch!

## What Gets Generated

**PDF Output includes:**
- Professional header with "ORDEN DE COMPRA" title
- VT logo (vt1.png)
- Order name and date
- Instructions field (editable)
- **CAJAS TOTALES** field (large, prominent)
- Grid of design slots (3 columns):
  - Product image (centered, auto-scaled)
  - Type field (editable)
  - Required quantity (editable)
  - Counted field (editable)
- Navy blue and bright blue styling
- Rounded form fields with light blue backgrounds

## File Structure

```
ORDERS_REPOSITORY/
├── generate_quick.py       # Main script (macOS optimized)
├── config.yaml             # Configuration (macOS paths)
├── requirements.txt        # Python dependencies
├── vt.png                  # VT logo (full)
├── vt1.png                 # VT logo (letters only)
├── temp_images/            # Temporary image storage
└── README_macOS.md         # This file
```

## Advanced Usage

### Custom Output Path per Order

Edit the script or config.yaml before running, or use environment variable:

```bash
# Set custom path for this session
OUTPUT_PATH=~/Documents/SpecialOrder python3 generate_quick.py
```

### Batch Processing with AppleScript

Create an AppleScript to automate multiple orders:

```applescript
tell application "Terminal"
    do script "cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR && python3 generate_quick.py"
end tell
```

### Network Share Setup (SMB)

```bash
# Mount network share
mkdir -p /Volumes/TRABAJOS
mount -t smbfs //server/TRABAJOS /Volumes/TRABAJOS

# Update config.yaml
output_path: "/Volumes/TRABAJOS/2025/ARMADOS VT/ORDERS"
```

## Keyboard Shortcuts

- **Cmd+C** - Copy image to clipboard
- **Cmd+V** - Paste image to selected slot
- **Cmd+Shift+Ctrl+4** - Screenshot to clipboard
- **Space** - Quick Look selected file in Finder

## Support

**Common Issues:**
- Check Python version: `python3 --version` (need 3.8+)
- Verify dependencies: `pip3 list | grep -E "(reportlab|Pillow|PyYAML)"`
- Test clipboard: Copy any image, run `python3 -c "from PIL import ImageGrab; print(ImageGrab.grabclipboard())"`

**File Locations:**
- Config: `config.yaml`
- Logs: Check Terminal output
- Temp files: `temp_images/` directory

---

**macOS Version** - Optimized for macOS 10.15+
**Original Windows version** - See `README.md`
