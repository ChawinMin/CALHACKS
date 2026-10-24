
#define HEARTBEAT_PIN 4

const unsigned long SAMPLE_INTERVAL = 10000;
unsigned long lastSample = 0;

void setup() {
  Serial.begin(115200);

  analogReadResolution(12);
  analogSetPinAttenuation(
    HEARTBEAT_PIN,
    ADC_11db
  );
}

void loop() {
  unsigned long currentTime = micros();

  if (currentTime - lastSample >= SAMPLE_INTERVAL) {
    lastSample = currentTime;

    int heartbeat = analogRead(HEARTBEAT_PIN);

    // Send timestamp and analog reading
    Serial.printf(
      "%lu,%d\n",
      millis(),
      heartbeat
    );
  }
}
