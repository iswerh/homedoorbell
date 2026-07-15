const int BUTTON_PIN = 2;      // Pin connected to the button
const int LED_PIN = 13;        // Pin connected to the LED
const int SIGNAL_PIN = 3;      // Pin to send a HIGH signal to the ESP32-CAM when the button is pressed
const int UNLOCK_IN_PIN = 4;   // Wired to the ESP32-CAM's UNLOCK_OUT_PIN
const int RELAY_PIN = 5;       // Drives the door-lock relay

// Most cheap relay modules trigger on LOW, not HIGH. Flip this if your
// relay clicks on release instead of on press.
const bool RELAY_ACTIVE_HIGH = true;
const unsigned long RELAY_PULSE_MS = 1000;

int buttonState = LOW;     // Current state of the button
int lastButtonState = LOW; // Previous state of the button
unsigned long lastDebounceTime = 0; // Time since last button state change
const unsigned long debounceDelay = 50; // Debounce delay in milliseconds

int lastUnlockInState = LOW;
bool relayPulseActive = false;
unsigned long relayPulseStart = 0;

// Testing aid: type 'r' + Enter in the Serial Monitor to simulate a button
// tap without any button wired up yet. See simulatedPressActive below.
bool simulatedPressActive = false;
unsigned long simulatedPressStart = 0;
const unsigned long SIMULATED_PRESS_MS = 300;

void setup() {
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT);
  pinMode(SIGNAL_PIN, OUTPUT);
  pinMode(UNLOCK_IN_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH); // start de-energized

  // Start serial communication
  Serial.begin(9600);
  Serial.println("Type 'r' + Enter to simulate a button press (no wiring needed).");
}

void loop() {
  // Read the button's state
  int currentState = digitalRead(BUTTON_PIN);

  // Debounce the button
  if (currentState != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (currentState != buttonState) {
      buttonState = currentState;

      // Check the button state and perform actions
      if (buttonState == HIGH) {
        buttonPressedActions();
      } else {
        buttonReleasedActions();
      }
    }
  }

  lastButtonState = currentState;

  checkUnlockSignal();
  updateRelayPulse();
  checkSerialSimulate();
  updateSimulatedPress();
}

void buttonPressedActions() {
  // Turn on LED and send HIGH signal on SIGNAL_PIN
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(SIGNAL_PIN, HIGH);

  // Print status to Serial Monitor
  Serial.println("Button is pressed! HIGH signal sent on Pin 3.");
}

void buttonReleasedActions() {
  // Turn off LED and send LOW signal on SIGNAL_PIN
  digitalWrite(LED_PIN, LOW);
  digitalWrite(SIGNAL_PIN, LOW);

  // Print status to Serial Monitor
  Serial.println("Button is not pressed. LOW signal sent on Pin 3.");
}

// The ESP32-CAM pulses UNLOCK_IN_PIN high when the app's "Unlock" button is
// pressed. On that rising edge, start a timed relay pulse.
void checkUnlockSignal() {
  int state = digitalRead(UNLOCK_IN_PIN);
  if (state == HIGH && lastUnlockInState == LOW && !relayPulseActive) {
    digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? HIGH : LOW);
    relayPulseActive = true;
    relayPulseStart = millis();
    Serial.println("Unlock signal received — relay energized.");
  }
  lastUnlockInState = state;
}

// millis()-based timer instead of delay() so the button debounce loop above
// keeps running while the relay pulse is in progress.
void updateRelayPulse() {
  if (relayPulseActive && (millis() - relayPulseStart) > RELAY_PULSE_MS) {
    digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH);
    relayPulseActive = false;
    Serial.println("Relay de-energized.");
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
