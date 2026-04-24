# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDF Auto-Print & Archive System with cross-platform Adobe Illustrator integration. This system automates the printing workflow for PDFs with preview confirmation and dual-save functionality from Illustrator.

## System Architecture

The system consists of two main components:

1. **PDF Auto-Print System** (macOS only) - On-demand processing via keyboard shortcut
2. **Illustrator Save Scripts** (Cross-platform) - Dual save functionality with automatic PDF export

### Core Files

- `pdf_autoprint_ondemand.scpt` - Main on-demand PDF processing script for macOS
- `illustrator_save.jsx` - Cross-platform Illustrator script for dual saves
- `illustrator_pdf_save_mac.scpt` - macOS-specific Illustrator PDF save script
- `setup_macos.scpt` - macOS system setup and validation
- `setup_windows.bat` - Windows setup script
- `Script_log/pdf_autoprint_fixed_syntax.scpt` - Current working version with print dialog verification
- `Codex_guide.txt` - Technical documentation of printing issues and solutions

## Key Configuration

### Folder Paths
- **Watch Folder:** `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT`
- **Archive Folder:** `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT/ARCHIVED`
- **Windows Path:** `D:\TRABAJOS\2025\ARMADOS VT\TO_PRINT`

### Print Settings
- **Printer:** SHARP_MX_6580N__8513615400_ (192.168.100.150)
- **Print Preset:** "ADHESIVO" (must be configured in system)
- **Paper Size:** ADHESIVE (330 x 480 mm / 33cm x 48cm)
- **Page Range:** First page only (1 to 1)
- **Scale:** 100.2% (CRITICAL - often defaults to 101%, must be manually verified)
- **Auto Rotate:** OFF (must be unchecked)
- **PDF Page Size:** 33cm x 48cm (full ADHESIVE paper)
- **Target Content Rectangle:** 30cm x 39cm (must print at exactly this size)
- **Auto-archive:** Processed files moved to ARCHIVED folder

## Development Commands

### macOS Setup
```bash
# Run system setup and validation
osascript setup_macos.scpt

# Create keyboard shortcut service
osascript create_keyboard_shortcut.scpt

# Test PDF auto-print functionality (current working version)
osascript Script_log/pdf_autoprint_fixed_syntax.scpt

# Or use the standard version
osascript pdf_autoprint_ondemand.scpt
```

### Windows Setup
```cmd
# Run Windows setup
setup_windows.bat
```

### Illustrator Script Installation
```bash
# Copy to Illustrator Scripts folder (macOS)
cp illustrator_save.jsx "~/Library/Application Support/Adobe/[AI Version]/[Language]/Scripts/"

# Or copy to system scripts (requires admin)
cp illustrator_save.jsx "/Applications/Adobe Illustrator [Version]/Presets/Scripts/"
```

## Workflow Integration

1. **Design Phase:** Work in Illustrator
2. **Save Phase:** Use keyboard shortcut for dual save (native + PDF copy)
3. **Print Phase:** Use PDF auto-print shortcut to process files from TO_PRINT folder
4. **Archive Phase:** Automatic archival after successful printing

## System Requirements

- **macOS:** 10.14 Mojave or later for full functionality
- **Windows:** Windows 10 (Illustrator script only, no auto-print)
- **Illustrator:** CC 2018 or later
- **Network Access:** Stable connection to shared TO_PRINT folder
- **Permissions:** Accessibility permissions for script automation (macOS)

## Critical Printing Information

### Scaling Issue
The SHARP MX-6580N printer has a known scaling issue:
- **PDF Structure:** 33cm × 48cm page (ADHESIVE paper) with 30cm × 39cm content rectangle
- **Problem:** Content rectangle prints at 29.9cm × 38.9cm instead of target 30cm × 39cm (missing 1mm per dimension)
- **Solution:** Manual scale setting of 100.2% in print dialog OR pre-scale PDF before printing
- **IMPORTANT:** Scale often defaults to 101% and MUST be manually corrected to 100.2%
- ADHESIVO preset saves most settings but NOT the scale percentage

### What DOES NOT Work (Avoid These)
❌ Command-line scaling with lp command (`-o scaling=X`) - SHARP printer ignores this completely
❌ Custom page sizes larger than paper dimensions - causes content to be cut off
❌ Margin controls (`-o page-left=0`, etc.) - no effect on actual print size
❌ Python PDF preprocessing with PyPDF2/Quartz - causes rotation issues
❌ Ghostscript PDF resizing - print jobs fail to send
❌ Complex GUI automation to set print dialog values - unreliable
❌ fit-to-page option - distorts aspect ratio and causes wrong orientation
❌ Preview.app automated printing via System Events - causes rotation problems

### What DOES Work
✅ ADHESIVO preset loads correct paper size, page range, auto-rotate off
✅ Manual print dialog verification prevents errors
✅ 100.2% scaling in GUI (when set manually)
✅ File detection and processing workflow
✅ Preview confirmation before printing
✅ Copy count specification
✅ File archival after printing

### Print Dialog Verification Checklist
When the print dialog opens, verify these settings:
1. Printer: SHARP MX-6580N (8513615400)
2. Preset: ADHESIVE
3. Paper Size: ADHESIVE 330 by 480 mm
4. Pages: Range from 1 to 1
5. Orientation: Portrait
6. Double-sided: Off
7. Preview section:
   - Auto Rotate: UNCHECKED (very important)
   - Scale: **100.2%** (most critical - verify and correct if needed)
   - Print Entire Image: SELECTED

## Troubleshooting

### Common Issues
- **"ADHESIVO preset not found"** - Verify print preset exists in system
- **"No write permissions"** - Check TO_PRINT folder permissions
- **"Accessibility permissions required"** - Add script runner to Accessibility in Security & Privacy
- **"Wrong print size (29.9cm x 38.9cm)"** - Scale was not set to 100.2% in print dialog
- **"Rotated output"** - Auto Rotate must be unchecked in Preview section