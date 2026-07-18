/*
 * Doorbell controller — ESP32-S3 Dev Module (replaces the earlier Arduino Uno).
 * Reads the physical button and drives the door-lock servo directly; no relay
 * module. Talks to the ESP32-CAM over two GPIO wires (ring signal out, unlock
 * signal in) — see ../README.md for the wiring table and power notes.
 *
 * Library needed (Arduino Library Manager): ESP32Servo (Kevin Harrington /
 * John Bennett) — the stock Servo.h library doesn't support the ESP32 core.
 */

#include <ESP32Servo.h>

const int BUTTON_PIN = 4;      // wired to GND when pressed; uses the internal pull-up
const int LED_PIN = 5;         // discrete LED + resistor to GND (LED_BUILTIN is unreliable on S3 boards)
const int SIGNAL_PIN = 6;      // HIGH signal to the ESP32-CAM while the button is held
const int UNLOCK_IN_PIN = 7;   // wired to the ESP32-CAM's UNLOCK_OUT_PIN
const int SERVO_PIN = 15;      // drives the lock servo directly (no relay module)

const int SERVO_LOCKED_ANGLE = 0;
const int SERVO_UNLOCKED_ANGLE = 90;   // 90 degrees clockwise from locked
const unsigned long SERVO_UNLOCK_HOLD_MS = 1000; // how long to hold before re-locking

Servo lockServo;

int buttonState = HIGH;      // idle/released level with the internal pull-up
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

int lastUnlockInState = LOW;
bool unlockPulseActive = false;
unsigned long unlockPulseStart = 0;

// Testing aid: type 'r' + Enter in the Serial Monitor to simulate a button
// tap without any button wired up yet.
bool simulatedPressActive = false;
unsigned long simulatedPressStart = 0;
const unsigned long SIMULATED_PRESS_MS = 300;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP); // pressed pulls this LOW
  pinMode(SIGNAL_PIN, OUTPUT);
  pinMode(UNLOCK_IN_PIN, INPUT);

  lockServo.setPeriodHertz(50);
  lockServo.attach(SERVO_PIN, 500, 2400); // tune these to your servo's datasheet if it doesn't hit range cleanly
  lockServo.write(SERVO_LOCKED_ANGLE);

  Serial.begin(9600);
  Serial.println("Type 'r' + Enter to simulate a button press (no wiring needed).");
}

void loop() {
  // LOW = pressed (internal pull-up, active-low button)
  int currentState = digitalRead(BUTTON_PIN);

  // Debounce the button
  if (currentState != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (currentState != buttonState) {
      buttonState = currentState;

      if (buttonState == LOW) {
        buttonPressedActions();
      } else {
        buttonReleasedActions();
      }
    }
  }

  lastButtonState = currentState;

  checkUnlockSignal();
  updateUnlockServo();
  checkSerialSimulate();
  updateSimulatedPress();
}

void buttonPressedActions() {
  // Turn on LED and send HIGH signal on SIGNAL_PIN
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(SIGNAL_PIN, HIGH);

  // Print status to Serial Monitor
  Serial.println("Button is pressed! HIGH signal sent on the ring-signal pin.");
}

void buttonReleasedActions() {
  // Turn off LED and send LOW signal on SIGNAL_PIN
  digitalWrite(LED_PIN, LOW);
  digitalWrite(SIGNAL_PIN, LOW);

  // Print status to Serial Monitor
  Serial.println("Button is not pressed. LOW signal sent on the ring-signal pin.");
}

// The ESP32-CAM pulses UNLOCK_IN_PIN high when the app's "Unlock" button is
// pressed. On that rising edge, sweep the servo to the unlocked position.
void checkUnlockSignal() {
  int state = digitalRead(UNLOCK_IN_PIN);
  if (state == HIGH && lastUnlockInState == LOW && !unlockPulseActive) {
    lockServo.write(SERVO_UNLOCKED_ANGLE);
    unlockPulseActive = true;
    unlockPulseStart = millis();
    Serial.println("Unlock signal received — servo turning to unlocked position.");
  }
  lastUnlockInState = state;
}

// millis()-based timer instead of delay() so the button debounce loop above
// keeps running while the servo is held in the unlocked position.
void updateUnlockServo() {
  if (unlockPulseActive && (millis() - unlockPulseStart) > SERVO_UNLOCK_HOLD_MS) {
    lockServo.write(SERVO_LOCKED_ANGLE);
    unlockPulseActive = false;
    Serial.println("Servo returned to locked position.");
  }
}

void checkSerialSimulate() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if ((c == 'r' || c == 'R') && !simulatedPressActive) {
      Serial.println("[TEST] Simulating button press.");
      simulatedPressActive = true;
      simulatedPressStart = millis();
      buttonPressedActions();
    }
  }
}

void updateSimulatedPress() {
  if (simulatedPressActive && (millis() - simulatedPressStart) > SIMULATED_PRESS_MS) {
    simulatedPressActive = false;
    buttonReleasedActions();
  }
}
