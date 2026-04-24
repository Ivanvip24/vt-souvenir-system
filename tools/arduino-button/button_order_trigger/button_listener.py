#!/usr/bin/env python3
"""
AXKAN ORDER BUTTON - Python Listener
=====================================

This script runs on your computer and listens for button presses
from the Arduino. When a button press is detected, it can:
  1. Open the AXKAN order form GUI
  2. Create an order directly in VT database
  3. Play a notification sound
  4. Run any custom action you want

REQUIREMENTS:
  pip install pyserial

USAGE:
  python button_listener.py

Author: AXKAN System
"""

import serial
import serial.tools.list_ports
import subprocess
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# ============================================================
# CONFIGURATION - Change these settings!
# ============================================================

# What action to take when button is pressed?
# Options: "open_axkan", "open_folder", "run_script", "api_call"
BUTTON_ACTION = "open_axkan"

# Path to your AXKAN order system
AXKAN_SYSTEM_PATH = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR/axkan_order_system.py"

# Sound notification (macOS)
PLAY_SOUND = True
SOUND_NAME = "Glass"  # macOS system sounds: Glass, Ping, Pop, Purr, Sosumi, etc.

# Serial communication settings
BAUD_RATE = 9600
READ_TIMEOUT = 1  # seconds

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def find_arduino_port():
    """
    Automatically find the Arduino's USB port.
    Returns the port name (e.g., '/dev/cu.usbmodem14201') or None.
    """
    print("🔍 Searching for Arduino...")

    ports = serial.tools.list_ports.comports()

    for port in ports:
        # Print all found ports for debugging
        print(f"   Found: {port.device} - {port.description}")

        # Look for Arduino-related keywords in the description
        description = port.description.lower()
        if any(keyword in description for keyword in ['arduino', 'usb', 'serial', 'ch340', 'ftdi']):
            # On macOS, prefer /dev/cu.* over /dev/tty.*
            if sys.platform == 'darwin' and 'cu.' in port.device:
                print(f"✅ Found Arduino at: {port.device}")
                return port.device
            elif sys.platform != 'darwin':
                print(f"✅ Found Arduino at: {port.device}")
                return port.device

    # If no specific Arduino found, try any USB serial device on macOS
    if sys.platform == 'darwin':
        for port in ports:
            if 'cu.usbmodem' in port.device or 'cu.usbserial' in port.device:
                print(f"✅ Found USB serial device at: {port.device}")
                return port.device

    return None


def play_notification_sound():
    """Play a system notification sound (macOS)."""
    if not PLAY_SOUND:
        return

    try:
        if sys.platform == 'darwin':  # macOS
            subprocess.run(['afplay', f'/System/Library/Sounds/{SOUND_NAME}.aiff'],
                         capture_output=True)
        elif sys.platform == 'win32':  # Windows
            import winsound
            winsound.MessageBeep()
    except Exception as e:
        print(f"⚠️  Could not play sound: {e}")


def open_axkan_system():
    """Open the AXKAN order system GUI."""
    print("📋 Opening AXKAN Order System...")

    if not os.path.exists(AXKAN_SYSTEM_PATH):
        print(f"❌ Error: AXKAN system not found at {AXKAN_SYSTEM_PATH}")
        return False

    try:
        # Run the AXKAN system in a new process
        subprocess.Popen([sys.executable, AXKAN_SYSTEM_PATH])
        print("✅ AXKAN Order System opened!")
        return True
    except Exception as e:
        print(f"❌ Error opening AXKAN system: {e}")
        return False


def create_order_log_entry():
    """Log the button press with timestamp."""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / "button_presses.log"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(log_file, "a") as f:
        f.write(f"{timestamp} - Button pressed\n")

    print(f"📝 Logged press at {timestamp}")


def handle_button_press():
    """
    Main handler for button press events.
    Customize this function to do whatever you want!
    """
    print("\n" + "="*50)
    print("🔴 BUTTON PRESSED!")
    print("="*50 + "\n")

    # Play notification sound
    play_notification_sound()

    # Log the press
    create_order_log_entry()

    # Execute the configured action
    if BUTTON_ACTION == "open_axkan":
        open_axkan_system()

    elif BUTTON_ACTION == "open_folder":
        # Open the orders folder in Finder
        orders_folder = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/ORDERS_GENERATOR"
        subprocess.run(['open', orders_folder])
        print(f"📂 Opened folder: {orders_folder}")

    elif BUTTON_ACTION == "run_script":
        # Run a custom script
        custom_script = "/path/to/your/custom/script.py"
        subprocess.Popen([sys.executable, custom_script])

    elif BUTTON_ACTION == "api_call":
        # Make an API call to your VT system
        # This is a placeholder - we can expand this later!
        print("📡 API call feature - coming soon!")

    else:
        print(f"⚠️  Unknown action: {BUTTON_ACTION}")


# ============================================================
# MAIN LISTENER
# ============================================================

def main():
    """Main function - connects to Arduino and listens for button presses."""

    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║     🔴 AXKAN ORDER BUTTON LISTENER 🔴                    ║
    ║                                                           ║
    ║     Press the big red button to create an order!          ║
    ║     Press Ctrl+C to stop this program.                    ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """)

    # Find Arduino port
    arduino_port = find_arduino_port()

    if not arduino_port:
        print("\n❌ ERROR: Could not find Arduino!")
        print("   Make sure:")
        print("   1. Arduino is connected via USB")
        print("   2. Arduino has the button_order_trigger.ino sketch uploaded")
        print("\n   Available ports:")
        for port in serial.tools.list_ports.comports():
            print(f"      {port.device}: {port.description}")
        return

    # Connect to Arduino
    try:
        print(f"\n🔌 Connecting to Arduino at {arduino_port}...")
        arduino = serial.Serial(arduino_port, BAUD_RATE, timeout=READ_TIMEOUT)

        # Wait for Arduino to reset (it resets when serial connection opens)
        time.sleep(2)

        # Flush any startup messages
        arduino.flushInput()

        print("✅ Connected! Waiting for button presses...\n")
        print("-" * 50)

    except serial.SerialException as e:
        print(f"\n❌ ERROR: Could not connect to Arduino: {e}")
        return

    # Main listening loop
    try:
        while True:
            if arduino.in_waiting > 0:
                # Read message from Arduino
                message = arduino.readline().decode('utf-8').strip()

                if message == "BUTTON_PRESSED":
                    handle_button_press()

                elif message == "ARDUINO_READY":
                    print("🟢 Arduino is ready!")

                elif message == "COOLDOWN_ACTIVE":
                    print("⏳ Cooldown active - wait a moment before pressing again")

                elif message:
                    # Print any other messages for debugging
                    print(f"📨 Arduino: {message}")

            # Small delay to prevent CPU overload
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n\n👋 Stopping listener...")

    finally:
        arduino.close()
        print("🔌 Disconnected from Arduino")


if __name__ == "__main__":
    main()
