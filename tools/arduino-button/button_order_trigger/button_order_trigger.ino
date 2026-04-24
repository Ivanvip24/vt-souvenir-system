/*
 * AXKAN ORDER BUTTON - Arduino Code
 * ==================================
 *
 * This code reads a big red button and sends a signal
 * to your computer when pressed.
 *
 * WIRING:
 *   - Button wire 1 → Pin 2
 *   - Button wire 2 → GND
 *
 * HOW IT WORKS:
 *   When you press the button, Arduino sends "BUTTON_PRESSED"
 *   through USB to your computer. A Python script on your
 *   computer listens for this and creates an order.
 */

// Configuration - Easy to change!
const int BUTTON_PIN = 2;           // Which pin the button is connected to
const int LED_PIN = 13;             // Built-in LED on Arduino (for feedback)
const unsigned long DEBOUNCE_TIME = 50;    // Prevents accidental double-presses (milliseconds)
const unsigned long COOLDOWN_TIME = 2000;  // Wait 2 seconds between button presses

// Variables to track button state
int lastButtonState = HIGH;         // HIGH because we use internal pull-up resistor
unsigned long lastDebounceTime = 0;
unsigned long lastPressTime = 0;

void setup() {
  // Start communication with computer at 9600 baud rate
  Serial.begin(9600);

  // Set up the button pin with internal pull-up resistor
  // This means: button not pressed = HIGH, button pressed = LOW
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Set up the LED for visual feedback
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Let the computer know Arduino is ready
  Serial.println("ARDUINO_READY");

  // Blink LED 3 times to show it's working
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

void loop() {
  // Read the current button state
  int currentButtonState = digitalRead(BUTTON_PIN);

  // Check if button state changed (for debouncing)
  if (currentButtonState != lastButtonState) {
    lastDebounceTime = millis();
  }

  // Only react if the button state has been stable for DEBOUNCE_TIME
  if ((millis() - lastDebounceTime) > DEBOUNCE_TIME) {

    // Detect button PRESS (transition from HIGH to LOW)
    if (currentButtonState == LOW && lastButtonState == HIGH) {

      // Check if enough time has passed since last press (cooldown)
      if ((millis() - lastPressTime) > COOLDOWN_TIME) {

        // BUTTON WAS PRESSED! Send signal to computer
        Serial.println("BUTTON_PRESSED");

        // Visual feedback - turn on LED
        digitalWrite(LED_PIN, HIGH);

        // Record the time of this press
        lastPressTime = millis();

      } else {
        // Button pressed too quickly - ignore but notify
        Serial.println("COOLDOWN_ACTIVE");
      }
    }

    // Detect button RELEASE (transition from LOW to HIGH)
    if (currentButtonState == HIGH && lastButtonState == LOW) {
      // Turn off LED when button is released
      digitalWrite(LED_PIN, LOW);
    }
  }

  // Save the current state for next loop iteration
  lastButtonState = currentButtonState;

  // Small delay to prevent overwhelming the processor
  delay(10);
}


/*
 * TROUBLESHOOTING:
 * ================
 *
 * 1. Nothing happens when I press the button:
 *    - Check your wiring! Button should connect Pin 2 to GND
 *    - Open Serial Monitor in Arduino IDE (9600 baud)
 *    - You should see "ARDUINO_READY" when it starts
 *
 * 2. Button triggers multiple times:
 *    - Increase DEBOUNCE_TIME to 100 or 150
 *
 * 3. Want to use a different pin?
 *    - Change BUTTON_PIN at the top of this file
 *    - Make sure to wire the button to that pin instead
 *
 * 4. LED doesn't blink on startup:
 *    - Your Arduino might not have a built-in LED on pin 13
 *    - The code will still work, just no visual feedback
 */
