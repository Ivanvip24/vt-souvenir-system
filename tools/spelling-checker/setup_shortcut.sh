#!/bin/bash
# Setup script for keyboard shortcut integration on macOS

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_SCRIPT="$SCRIPT_DIR/check_document.py"

echo "======================================"
echo "Document Checker - Keyboard Shortcut Setup"
echo "======================================"
echo ""

# Make the Python script executable
chmod +x "$PYTHON_SCRIPT"

# Create Automator service directory if it doesn't exist
SERVICES_DIR="$HOME/Library/Services"
mkdir -p "$SERVICES_DIR"

# Create the Automator service
SERVICE_NAME="Check Document.workflow"
SERVICE_PATH="$SERVICES_DIR/$SERVICE_NAME"

echo "Creating Automator Quick Action..."

# Create the workflow structure
mkdir -p "$SERVICE_PATH/Contents"

# Create the Info.plist
cat > "$SERVICE_PATH/Contents/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSServices</key>
    <array>
        <dict>
            <key>NSMenuItem</key>
            <dict>
                <key>default</key>
                <string>Check Document</string>
            </dict>
            <key>NSMessage</key>
            <string>runWorkflowAsService</string>
            <key>NSRequiredContext</key>
            <dict>
                <key>NSApplicationIdentifier</key>
                <string>com.apple.finder</string>
            </dict>
            <key>NSSendFileTypes</key>
            <array>
                <string>com.adobe.pdf</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST_EOF

# Create the document.wflow
mkdir -p "$SERVICE_PATH/Contents/QuickAction"
cat > "$SERVICE_PATH/Contents/QuickAction/document.wflow" << WFLOW_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AMApplicationBuild</key>
    <string>521.1</string>
    <key>AMApplicationVersion</key>
    <string>2.10</string>
    <key>AMDocumentVersion</key>
    <string>2</string>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>AMAccepts</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.path</string>
                    </array>
                </dict>
                <key>AMActionVersion</key>
                <string>1.0.2</string>
                <key>AMApplication</key>
                <array>
                    <string>Automator</string>
                </array>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <string>python3 "$PYTHON_SCRIPT" "\$@"</string>
                    <key>CheckedForUserDefaultShell</key>
                    <true/>
                    <key>inputMethod</key>
                    <integer>1</integer>
                    <key>shell</key>
                    <string>/bin/bash</string>
                    <key>source</key>
                    <string></string>
                </dict>
            </dict>
        </dict>
    </array>
    <key>connectors</key>
    <dict/>
    <key>workflowMetaData</key>
    <dict>
        <key>workflowTypeIdentifier</key>
        <string>com.apple.Automator.servicesMenu</string>
    </dict>
</dict>
</plist>
WFLOW_EOF

# Replace the placeholder with actual script path
sed -i '' "s|\$PYTHON_SCRIPT|$PYTHON_SCRIPT|g" "$SERVICE_PATH/Contents/QuickAction/document.wflow"

echo "✓ Automator Quick Action created!"
echo ""
echo "======================================"
echo "INSTALLATION COMPLETE!"
echo "======================================"
echo ""
echo "To set up the keyboard shortcut:"
echo ""
echo "1. Open System Settings (System Preferences)"
echo "2. Go to: Keyboard → Keyboard Shortcuts → Services"
echo "3. Scroll down to 'Files and Folders'"
echo "4. Find 'Check Document' and check the box"
echo "5. Click on 'Check Document' and click 'Add Shortcut'"
echo "6. Press your desired key combination (e.g., ⌘⌥C or Ctrl+Shift+C)"
echo ""
echo "USAGE:"
echo "------"
echo "1. Select a PDF file in Finder"
echo "2. Press your keyboard shortcut"
echo "3. Wait for the check to complete"
echo "4. A dialog will show results"
echo ""
echo "ALTERNATIVE USAGE:"
echo "-----------------"
echo "You can also run directly from terminal:"
echo "  python3 check_document.py yourfile.pdf"
echo ""
echo "Or right-click a PDF in Finder and select:"
echo "  Quick Actions → Check Document"
echo ""
