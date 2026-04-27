# PDF Spanish Spell Checker - Claude Code

Automated macOS Quick Action to check Spanish spelling in PDF design files using Claude AI's vision capabilities.

## Overview

This tool allows designers to quickly verify PDF files for Spanish spelling errors before printing. It uses Claude Code's vision analysis to read ALL text in PDFs (including cursive, decorative, and small text) and detect spelling mistakes and missing accents.

## Features

- ✅ **macOS Quick Action** - Right-click any PDF in Finder to check
- ✅ **Vision-based analysis** - Reads cursive, script, and decorative fonts (not just plain text)
- ✅ **Spanish spell checking** - Detects missing accents and misspelled words
- ✅ **Fast processing** - 10-15 seconds per document
- ✅ **Visual feedback** - macOS dialog shows results immediately
- ✅ **Works with large files** - Automatically compresses PDFs over 30MB

## Requirements

- macOS (tested on macOS Sequoia)
- [Claude Code CLI](https://docs.claude.com/claude-code) installed and configured
- Python 3 with dependencies:
  - `pdf2image`
  - `Pillow`
- Poppler (for PDF conversion)

## Installation

### 1. Install Dependencies

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Poppler (required for pdf2image)
brew install poppler

# Install Python packages
pip3 install pdf2image Pillow
```

### 2. Install Claude Code CLI

Follow the instructions at [Claude Code Documentation](https://docs.claude.com/claude-code) to install and authenticate the Claude CLI.

```bash
# Verify installation
claude --version
```

### 3. Clone This Repository

```bash
cd ~/Downloads
git clone https://github.com/YOUR_USERNAME/pdf-spell-checker-claude.git
cd pdf-spell-checker-claude
```

### 4. Update Script Paths

Edit the paths in both scripts to match your installation location:

In `simple_wrapper.sh` (line 27), update:
```bash
/PATH/TO/YOUR/INSTALLATION/auto_verify.sh "$file"
```

### 5. Make Scripts Executable

```bash
chmod +x auto_verify.sh
chmod +x simple_wrapper.sh
```

### 6. Create macOS Quick Action

1. Open **Automator** (from Applications)
2. Click **"New Document"**
3. Select **"Quick Action"** and click **"Choose"**
4. Configure workflow settings at the top:
   - "Workflow receives current" → **files or folders**
   - "in" → **Finder**
5. In the left sidebar, search for **"Run Shell Script"**
6. Drag **"Run Shell Script"** to the right panel
7. Configure the action:
   - "Shell:" → **/bin/bash**
   - "Pass input:" → **as arguments**
8. Paste this script content (UPDATE THE PATH):

```bash
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

/PATH/TO/YOUR/INSTALLATION/simple_wrapper.sh "$@"
```

9. Save the workflow:
   - Press **⌘S**
   - Name it: **Verify_spelling_pdf**
   - It will automatically save to `~/Library/Services/`
10. Close Automator

### 7. Enable Notifications (Important!)

1. Open **System Settings** → **Notifications**
2. Scroll down to find **"Automator Runner"** or **"WorkflowServiceRunner"**
3. Change setting to **"Alerts"** or **"Banners"**
4. Enable **"Allow Notifications"**

*Note: Automator Runner may only appear after you run the Quick Action once.*

### 8. Restart Finder

```bash
killall Finder
```

## Usage

### Quick Action Method (Recommended)

1. Navigate to any PDF file in Finder
2. Right-click the PDF
3. Select **Quick Actions** → **Verify_spelling_pdf**
4. Wait 10-15 seconds
5. A dialog will appear with results:
   - **"FELICITACIONES - ARCHIVO CORRECTO"** = No errors found
   - **"ERROR - NO IMPRIMIR"** = Lists all spelling errors found

### Command Line Method

```bash
./simple_wrapper.sh "/path/to/your/file.pdf"
```

### Check Logs

```bash
cat /tmp/claude_verify_log.txt
```

## How It Works

1. **File Selection** - User selects PDF in Finder and runs Quick Action
2. **PDF Preparation** - Script checks file size:
   - Files ≤ 30MB: Analyzed directly
   - Files > 30MB: Compressed to ~10MB using 120 DPI conversion
3. **Claude Analysis** - Claude Code analyzes the PDF visually and reads ALL text
4. **Error Detection** - Finds:
   - Missing accents (e.g., "Jimenez" → "Jiménez")
   - Misspelled words (e.g., "FUNENRARIA" → "FUNERARIA")
   - Small text errors (e.g., "TACING" → "TAXI")
5. **Result Display** - macOS dialog shows errors or success message

## Examples

### Error Detection

Input PDF contains:
- "FUNENRARIA SANTA LUCIA" (should be "FUNERARIA")
- "Huautla de Jimenez" (should be "Jiménez")
- Taxi sign says "TACING" (should be "TAXI")

Result:
```
ERROR - NO IMPRIMIR

Se detectaron 3 errores:

1. 'FUNENRARIA' -> 'FUNERARIA'
2. 'Jimenez' -> 'Jiménez'
3. 'TACING' -> 'TAXI'

CORREGIR INMEDIATAMENTE
```

### Success

Input PDF has no errors.

Result:
```
FELICITACIONES - ARCHIVO CORRECTO

No se detectaron errores de ortografia.
```

## Configuration

### Change Model Speed/Quality

Edit `auto_verify.sh` line 79:

```bash
# For faster processing (less strict format following):
RESULT=$(claude --print --dangerously-skip-permissions --model haiku "...")

# For better accuracy (current default - Sonnet):
RESULT=$(claude --print --dangerously-skip-permissions "...")

# For maximum accuracy (slower - Opus):
RESULT=$(claude --print --dangerously-skip-permissions --model opus "...")
```

### Adjust PDF Compression

Edit `auto_verify.sh` lines 41-47 to change DPI and quality:

```python
# Higher quality (larger file, slower):
images = convert_from_path(pdf_path, dpi=150, ...)
images[0].save(output_path, 'PDF', resolution=100.0, quality=95)

# Current default (balanced):
images = convert_from_path(pdf_path, dpi=120, ...)
images[0].save(output_path, 'PDF', resolution=72.0, quality=85)

# Faster (lower quality):
images = convert_from_path(pdf_path, dpi=96, ...)
images[0].save(output_path, 'PDF', resolution=72.0, quality=75)
```

## Troubleshooting

### "claude: command not found"

Claude CLI is not in PATH. Check installation:
```bash
which claude
```

Add the correct path to the workflow script in Automator. Common locations:
- `~/.npm-global/bin/claude`
- `/usr/local/bin/claude`
- `/opt/homebrew/bin/claude`

### No dialog appears

1. Check notifications are enabled for "Automator Runner" in System Settings
2. Check the log file: `cat /tmp/claude_verify_log.txt`
3. Look for "Exit code: 1" which indicates an error
4. Verify the Quick Action has correct file paths

### AppleScript syntax errors

Check the log file for details:
```bash
cat /tmp/claude_verify_log.txt
```

This usually indicates UTF-8 encoding issues (should be fixed in current version).

### PDF compression fails

Install required dependencies:
```bash
brew install poppler
pip3 install pdf2image Pillow
```

Verify installation:
```bash
python3 -c "from pdf2image import convert_from_path; print('OK')"
```

### Analysis is inaccurate

1. Check if the PDF is high enough resolution
2. Try using Opus model for better accuracy (slower)
3. Check `/tmp/claude_verify_log.txt` for Claude's full response

## Project Structure

```
pdf-spell-checker-claude/
├── README.md                 # This file
├── auto_verify.sh           # Main verification script
├── simple_wrapper.sh        # Automator wrapper script
├── .gitignore              # Git ignore file
└── LICENSE                 # License file
```

## Performance

- **Small PDFs** (< 5MB): ~8-10 seconds
- **Medium PDFs** (5-30MB): ~10-12 seconds
- **Large PDFs** (> 30MB): ~12-15 seconds (includes compression time)

Processing time includes:
- PDF compression (if needed): 2-4 seconds
- Claude API call: 6-10 seconds
- Dialog display: instant

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Known Limitations

- Processes first 10 pages only for large multi-page PDFs
- Requires internet connection for Claude API
- macOS only (uses AppleScript and Automator)
- Spanish language focus (can be adapted for other languages)

## Future Enhancements

- [ ] Support for multiple languages
- [ ] Batch processing of multiple PDFs
- [ ] Custom dictionary support
- [ ] Integration with design software (Adobe Illustrator, etc.)
- [ ] Windows/Linux support via alternative automation tools

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Built with [Claude Code](https://docs.claude.com/claude-code) by Anthropic
- Uses Claude Sonnet 4.5 for vision-based text analysis
- Inspired by the need for faster design review workflows

## Author

Created for professional design workflow automation to catch spelling errors before printing.

## Version History

### v1.0.0 (2025-11-12)
- Initial release
- macOS Quick Action support
- Spanish spell checking with accent detection
- Vision-based analysis (reads cursive/decorative text)
- Automatic PDF compression for large files
- UTF-8 encoding fixes for special characters
- Optimized prompt for better accuracy
- Fast processing with Sonnet model (10-15 seconds)

---

**Need help?** Check the troubleshooting section or review the logs at `/tmp/claude_verify_log.txt`
