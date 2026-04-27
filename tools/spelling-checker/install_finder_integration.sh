#!/bin/bash
# Install Finder integration for Claude Check

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_SCRIPT="$SCRIPT_DIR/claude_check.py"
SERVICES_DIR="$HOME/Library/Services"

echo "======================================"
echo "Claude Check - Finder Integration"
echo "======================================"
echo ""

# Make sure script is executable
chmod +x "$PYTHON_SCRIPT"

# Create Services directory
mkdir -p "$SERVICES_DIR"

# Create Automator workflow
SERVICE_NAME="Verificar con Claude.workflow"
SERVICE_PATH="$SERVICES_DIR/$SERVICE_NAME"

echo "Creando Quick Action..."

# Create workflow directory structure
mkdir -p "$SERVICE_PATH/Contents"

# Create Info.plist
cat > "$SERVICE_PATH/Contents/Info.plist" << 'EOF'
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
                <string>Verificar con Claude</string>
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
EOF

# Create the workflow
mkdir -p "$SERVICE_PATH/Contents/QuickAction"
cat > "$SERVICE_PATH/Contents/QuickAction/document.wflow" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AMApplicationVersion</key>
    <string>2.10</string>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>AMActionVersion</key>
                <string>1.0.2</string>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <string>for f in "\$@"; do
    python3 "$PYTHON_SCRIPT" "\$f"
done</string>
                    <key>CheckedForUserDefaultShell</key>
                    <true/>
                    <key>inputMethod</key>
                    <integer>1</integer>
                    <key>shell</key>
                    <string>/bin/bash</string>
                </dict>
            </dict>
        </dict>
    </array>
    <key>workflowMetaData</key>
    <dict>
        <key>workflowTypeIdentifier</key>
        <string>com.apple.Automator.servicesMenu</string>
    </dict>
</dict>
</plist>
EOF

echo "✓ Quick Action creada!"
echo ""
echo "======================================"
echo "¡INSTALACIÓN COMPLETA!"
echo "======================================"
echo ""
echo "CÓMO USAR:"
echo "----------"
echo "1. En Finder, selecciona un archivo PDF"
echo "2. Click derecho → Quick Actions → 'Verificar con Claude'"
echo "3. O asigna un atajo de teclado:"
echo "   - Abre: System Settings → Keyboard → Keyboard Shortcuts"
echo "   - Ve a: Services → Files and Folders"
echo "   - Busca: 'Verificar con Claude'"
echo "   - Asigna un atajo (ej: ⌘⌥V)"
echo ""
echo "El sistema comprimirá el PDF y te dirá qué enviar a Claude Code"
echo ""
