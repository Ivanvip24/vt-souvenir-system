# Illustrator Dual PDF Save - macOS Setup Guide

## Overview

This system allows you to save a PDF from Illustrator to your chosen location AND automatically create a copy in the TO_PRINT folder for the print workflow, all with a single keyboard shortcut: **CMD + OPTION + CONTROL + S**.

## Files Included

- `illustrator_pdf_save_mac.scpt` - Main Illustrator dual save script
- `create_illustrator_shortcut_mac.scpt` - Automator service setup helper
- `ILLUSTRATOR_MAC_SETUP.md` - This setup guide

## Quick Setup (Automatic)

1. **Run the setup script:**
   ```bash
   osascript "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/create_illustrator_shortcut_mac.scpt"
   ```

2. **Follow the prompts** to create the Automator service

3. **Save the service** as "Illustrator Dual PDF Save"

4. **Assign keyboard shortcut:**
   - System Preferences → Keyboard → Shortcuts → Services
   - Find "Illustrator Dual PDF Save" under General
   - Assign: **CMD + OPTION + CONTROL + S**

## Manual Setup (If Automatic Fails)

### Step 1: Create Automator Service

1. Open **Automator**
2. Choose **Service** template
3. Configure service:
   - **Service receives:** "no input"
   - **in:** "any application"

4. Add **"Run AppleScript"** action
5. Replace the default script with:

```applescript
on run {input, parameters}
    try
        run script alias "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/illustrator_pdf_save_mac.scpt"
    on error errMsg
        display alert "Illustrator Save Error" message errMsg buttons {"OK"}
    end try
    return input
end run
```

6. Save as **"Illustrator Dual PDF Save"**

### Step 2: Assign Keyboard Shortcut

1. **System Preferences** → **Keyboard** → **Shortcuts**
2. Click **Services** in left panel
3. Scroll to **General** section
4. Find **"Illustrator Dual PDF Save"**
5. Check the box to enable it
6. Click where it says "none" on the right
7. Press: **CMD + OPTION + CONTROL + S**
8. Close System Preferences

## How to Use

1. **Open Illustrator** with your document
2. **Press CMD + OPTION + CONTROL + S** from anywhere
3. **Choose where to save your PDF** in the dialog
4. **Click Save**

The script will:
- ✅ Save PDF to your chosen location
- ✅ Automatically copy to `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT`
- ✅ Handle duplicate filenames with incremental numbering
- ✅ Show notifications for success/failure

## Workflow Integration

This system integrates perfectly with the PDF auto-print system:

1. **Design in Illustrator**
2. **Save with CMD+OPT+CTRL+S** → PDF goes to both locations
3. **Use PDF auto-print shortcut** → Processes files from TO_PRINT folder

## Troubleshooting

### "Illustrator Not Running" Error
- **Solution:** Open Adobe Illustrator before using the shortcut

### "No Document Open" Error
- **Solution:** Create or open a document in Illustrator first

### "TO_PRINT Folder Not Found" Error
- **Solution:** Check network connection to `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT`
- **Alternative:** Manually create the folder structure

### Keyboard Shortcut Not Working
- **Check:** System Preferences → Keyboard → Shortcuts → Services
- **Verify:** "Illustrator Dual PDF Save" is enabled and has the correct shortcut
- **Try:** Restart applications after setting up shortcut

### PDF Export Fails
- **Fallback:** Script will open Save As dialog manually
- **Action:** Set format to "Adobe PDF" and save manually

## System Requirements

- **macOS:** 10.14 Mojave or later
- **Illustrator:** CC 2018 or later (any recent version)
- **Permissions:** Accessibility access for automated operations

## Network Drive Notes

If the TO_PRINT folder is on a network drive:
- Ensure stable network connection
- The folder path `/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT` must be accessible
- Network drives should be automatically mounted on login

## Success Indicators

When working correctly, you'll see:
- 📱 **Notification:** "PDF copied to TO_PRINT folder as: filename.pdf"
- 🔊 **Sound:** Glass notification sound
- ✅ **Files:** PDF appears in both chosen location and TO_PRINT folder

The system is now ready for seamless design-to-print workflow!