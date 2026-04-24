# PDF Auto-Print & Archive System

An automated system for printing PDFs with preview confirmation and cross-platform Illustrator integration.

## System Overview

This system consists of two main components:

1. **PDF Auto-Print Script** (macOS only) - On-demand processing triggered by keyboard shortcut, previews PDFs, prints with ADHESIVO preset, archives files
2. **Illustrator Save Script** (Cross-platform) - Dual save functionality with keyboard shortcut integration

## Quick Start

### macOS Setup

1. **Run Setup Script:**
   ```bash
   osascript setup_macos.scpt
   ```

2. **Install Illustrator Script:**
   - Copy `illustrator_save.jsx` to Illustrator Scripts folder
   - Or run via File > Scripts > Other Script...

3. **Setup PDF Auto-Print Keyboard Shortcut:**
   ```bash
   osascript create_keyboard_shortcut.scpt
   ```
   - Follow the prompts to create Automator service
   - Assign keyboard shortcut in System Preferences > Keyboard > Shortcuts > Services
   - Recommended: ⌘⌥P (Command+Option+P)

### Windows Setup

1. **Run Setup Script:**
   ```cmd
   setup_windows.bat
   ```

2. **Install Illustrator Script:**
   - Follow the instructions provided by setup script
   - Configure keyboard shortcut in Illustrator

## File Structure

```
PRINTING_PJ/
├── pdf_autoprint.scpt          # macOS PDF continuous monitoring script (legacy)
├── pdf_autoprint_ondemand.scpt # macOS PDF on-demand processing script
├── illustrator_save.jsx        # Cross-platform Illustrator script
├── setup_macos.scpt           # macOS setup and validation
├── setup_windows.bat          # Windows setup and validation
├── create_keyboard_shortcut.scpt # Automator service creation helper
├── PDF_AutoPrint_Service.workflow # Automator service template
└── README.md                  # This documentation
```

## Detailed Usage

### PDF Auto-Print Workflow (macOS)

**Trigger:** Press your assigned keyboard shortcut (e.g., ⌘⌥P)

1. **Scan Folder:** Checks `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT` for PDFs
2. **Batch Overview:** Shows list of found PDFs with option to proceed or cancel
3. **Individual Processing:** For each PDF:
   - Opens in Preview.app for visual confirmation
   - User chooses: Print, Skip, or Skip All Remaining
   - If printing: prompts "How many copies do you need?"
   - Applies "ADHESIVO" print preset automatically
   - Prints first page only
   - Moves processed file to `TO_PRINT/ARCHIVED`
4. **Summary:** Shows final count of processed vs skipped files

### Illustrator Save Workflow (Cross-platform)

1. **Trigger:** Keyboard shortcut (e.g., Cmd+Shift+S / Ctrl+Shift+S)
2. **Primary Save:** User chooses location for native .ai file
3. **Auto PDF:** Automatically creates PDF copy in TO_PRINT folder
4. **Confirmation:** Success message with file locations

## Configuration

### Folder Paths

**macOS (in scripts):**
```applescript
set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
```

**Windows (in illustrator_save.jsx):**
```javascript
var WIN_TO_PRINT_FOLDER = "D:\\TRABAJOS\\2025\\ARMADOS VT\\TO_PRINT";
```

### Print Preset

The system uses a print preset named "ADHESIVO". To set this up:

1. Configure your printer with adhesive paper settings
2. Save as preset named "ADHESIVO"
3. Or modify the script to use your existing preset name

## System Requirements

### macOS
- macOS 10.12 or later
- Preview.app (built-in)
- Accessibility permissions for script automation
- Adobe Illustrator (any recent version)

### Windows
- Windows 10 or later
- Adobe Illustrator (any recent version)
- **Note:** PDF auto-printing not available on Windows

## Installation Details

### macOS Illustrator Script Installation

**Option 1 - Scripts Menu (Recommended):**
```bash
# Copy to user scripts folder
cp illustrator_save.jsx "~/Library/Application Support/Adobe/[AI Version]/[Language]/Scripts/"
```

**Option 2 - System Scripts:**
```bash
# Copy to system scripts folder (requires admin)
cp illustrator_save.jsx "/Applications/Adobe Illustrator [Version]/Presets/Scripts/"
```

### Windows Illustrator Script Installation

1. **Scripts Folder:**
   ```
   C:\Program Files\Adobe\Adobe Illustrator [Version]\Presets\Scripts\
   ```

2. **Custom Location:**
   - Place anywhere accessible
   - Use File > Scripts > Other Script... in Illustrator

## Keyboard Shortcuts

### PDF Auto-Print System (macOS)

**Automatic Setup (Recommended):**
```bash
osascript create_keyboard_shortcut.scpt
```

**Manual Setup:**
1. Open Automator
2. Create new Service (receives no input, available in any application)
3. Add "Run AppleScript" action
4. Paste script content that runs `pdf_autoprint_ondemand.scpt`
5. Save as "PDF Auto-Print" service
6. Go to System Preferences > Keyboard > Shortcuts > Services
7. Find "PDF Auto-Print" and assign keyboard shortcut (e.g., ⌘⌥P)

### Illustrator Script

**macOS:**
1. Install `illustrator_save.jsx` in Illustrator Scripts folder
2. Create Automator Service or use Illustrator's keyboard shortcuts
3. Recommended: ⌘⇧S (Command+Shift+S)

**Windows:**
1. Open Illustrator
2. Go to Edit > Keyboard Shortcuts
3. Create new shortcut set
4. Assign key combination to your script (e.g., Ctrl+Shift+S)

## Troubleshooting

### Common Issues

**"ADHESIVO preset not found"**
- Verify preset exists in Print dialog
- Check spelling and capitalization
- Create preset if missing

**"No write permissions"**
- Check folder permissions for TO_PRINT directory
- Ensure user has write access to network drives

**"Accessibility permissions required"**
- Go to System Preferences > Security & Privacy > Privacy
- Add script runner to Accessibility list

**"Illustrator script not found"**
- Verify correct installation path
- Check that .jsx file is not corrupted
- Ensure Illustrator version compatibility

### Debug Mode

To enable detailed logging in PDF auto-print script:
1. Open Script Editor
2. Add `log` statements before problem areas
3. View logs in Console.app

## Advanced Configuration

### Customizing Print Settings

Edit `pdf_autoprint.scpt` to modify:
- Paper size: Change media options
- Print quality: Adjust print preset
- Page range: Modify range settings

### Batch Processing

For large numbers of files:
1. Monitor script processes files sequentially
2. Each file requires user confirmation
3. Consider running during dedicated time blocks

### Network Drive Considerations

When using network drives:
- Ensure stable connection
- Test write permissions before batch processing
- Consider local temporary processing if network is slow

## Support

### File Locations
- **Scripts:** Current directory
- **Logs:** Console.app (macOS) / Event Viewer (Windows)
- **Temp Files:** System temp directory

### Version Compatibility
- **Illustrator:** CC 2018 or later recommended
- **macOS:** 10.14 Mojave or later for full functionality
- **Windows:** Windows 10 (Illustrator script only)

## License

This script system is provided as-is for internal use. Modify paths and settings as needed for your specific environment.