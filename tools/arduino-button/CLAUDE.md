# Arduino Button — Physical Order Trigger

A physical arcade button connected to Arduino that triggers order creation when pressed.

## Hardware

- Arduino Uno R3
- 60mm+ arcade button
- Jumper wires (male-female)

## Setup

1. Upload `button_order_trigger.ino` to Arduino via Arduino IDE
2. Run `python3 button_listener.py` on computer
3. Press button → triggers order action

## Files

- `button_order_trigger/button_order_trigger.ino` — Arduino firmware
- `button_order_trigger/button_listener.py` — Python serial listener
