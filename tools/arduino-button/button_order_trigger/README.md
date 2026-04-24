# 🔴 AXKAN Order Button System

## What Is This?

A physical big red button that, when pressed, automatically triggers order creation on your computer. Perfect for quick order processing in your workshop!

---

## 📦 What You Need to Buy

### Required Hardware

| Item | Approx. Price (MXN) | Where to Buy |
|------|---------------------|--------------|
| **Arduino Uno R3** (or clone) | $150-300 | [Amazon MX](https://amazon.com.mx), [MercadoLibre](https://mercadolibre.com.mx), [Steren](https://steren.com.mx) |
| **Big Arcade Button** (any color) | $50-100 | Amazon MX, AliExpress, AFEL Electronics |
| **Jumper Wires** (Male-Female) | $30-50 | Steren, Amazon MX |

**Total Budget: ~$250-450 MXN**

### Recommended Button Options

1. **60mm Arcade Button with LED** - The classic big button
2. **100mm Emergency Stop Button** - Extra dramatic!
3. **Dome Button** - Mushroom-shaped, very satisfying to press

---

## 🔧 Step-by-Step Setup

### STEP 1: Install Arduino IDE (One Time Only)

1. Go to: https://www.arduino.cc/en/software
2. Download "Arduino IDE" for macOS
3. Open the downloaded file and drag Arduino to Applications
4. Open Arduino IDE from Applications

### STEP 2: Connect the Button to Arduino

```
WIRING DIAGRAM:

    Your Big Button
    ┌──────────────┐
    │              │
    │    (PRESS)   │
    │              │
    └──┬──────┬───┘
       │      │
       │      └──────────► Connect to Arduino GND
       │
       └─────────────────► Connect to Arduino Pin 2


Arduino Board (top view):
┌─────────────────────────────────┐
│ [USB PORT]                      │
│                                 │
│ DIGITAL PINS:                   │
│   13 12 11 10 9 8 7 6 5 4 3 [2] ← Button wire here
│                                 │
│ POWER:                          │
│   5V [GND] 3.3V                 │
│       ↑                         │
│       Button wire here          │
└─────────────────────────────────┘
```

**Physical Connection Steps:**
1. Look at your button - it has 2 metal contacts (terminals)
2. Take a jumper wire, connect one end to button terminal 1
3. Connect the other end to Arduino **Pin 2**
4. Take another jumper wire, connect to button terminal 2
5. Connect to Arduino **GND** (Ground)

### STEP 3: Upload Arduino Code

1. Connect Arduino to your Mac with USB cable
2. Open Arduino IDE
3. Go to **File → Open** and select `button_order_trigger.ino` from this folder
4. Go to **Tools → Board** and select "Arduino Uno"
5. Go to **Tools → Port** and select something like `/dev/cu.usbmodem...`
6. Click the **Upload** button (→ arrow icon)
7. Wait for "Done uploading" message

**Test it:** Open **Tools → Serial Monitor**, set baud to **9600**
- You should see `ARDUINO_READY`
- Press your button - you should see `BUTTON_PRESSED`

### STEP 4: Install Python Dependencies

Open Terminal and run:

```bash
pip3 install pyserial
```

### STEP 5: Run the Button Listener

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ARDUINO/button_order_trigger
python3 button_listener.py
```

You should see:
```
🔴 AXKAN ORDER BUTTON LISTENER 🔴

🔍 Searching for Arduino...
✅ Found Arduino at: /dev/cu.usbmodem14201
🔌 Connecting to Arduino...
✅ Connected! Waiting for button presses...
```

**Now press your button!** 🔴

---

## ⚙️ Configuration Options

Edit `button_listener.py` to change what happens when button is pressed:

```python
# Change this line:
BUTTON_ACTION = "open_axkan"  # Opens AXKAN order form

# Other options:
BUTTON_ACTION = "open_folder"  # Opens orders folder
BUTTON_ACTION = "run_script"   # Runs a custom script
```

### Sound Notification

```python
PLAY_SOUND = True          # Enable/disable sound
SOUND_NAME = "Glass"       # Change sound (macOS)

# Available sounds: Glass, Ping, Pop, Purr, Sosumi, Submarine, Tink
```

---

## 🚀 Make It Start Automatically

### Option 1: Launch Agent (Recommended)

Create a file at `~/Library/LaunchAgents/com.axkan.button.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.axkan.button</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ARDUINO/button_order_trigger/button_listener.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then run:
```bash
launchctl load ~/Library/LaunchAgents/com.axkan.button.plist
```

### Option 2: Simple Alias

Add to your `~/.zshrc`:
```bash
alias button="python3 /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ARDUINO/button_order_trigger/button_listener.py"
```

Then just type `button` in terminal to start!

---

## 🐛 Troubleshooting

### "Could not find Arduino"

1. Make sure Arduino is plugged in via USB
2. Check if Arduino shows up: `ls /dev/cu.*`
3. Try unplugging and replugging

### Button doesn't respond

1. Check wiring - button should connect Pin 2 to GND
2. Open Arduino Serial Monitor to test
3. Make sure you uploaded the code to Arduino

### Multiple triggers per press

Edit `button_order_trigger.ino`:
```cpp
const unsigned long DEBOUNCE_TIME = 100;  // Increase from 50 to 100
```
Then re-upload to Arduino.

### Sound doesn't play

1. Check volume isn't muted
2. Try different sound: `SOUND_NAME = "Ping"`

---

## 📁 Files in This Project

```
button_order_trigger/
├── button_order_trigger.ino  ← Arduino code (upload to Arduino)
├── button_listener.py        ← Python listener (run on computer)
├── README.md                 ← This file
└── logs/                     ← Button press logs (auto-created)
```

---

## 🎯 Next Steps

1. **Get a nice enclosure** - 3D print or buy a project box
2. **Add more buttons** - Different colors for different actions
3. **Add LED feedback** - Make the button light up when pressed
4. **Wireless version** - Use ESP32 for WiFi connectivity

---

## Questions?

Check the troubleshooting section or ask for help!
