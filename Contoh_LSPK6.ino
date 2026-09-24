#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include "DHT.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// --- Konfigurasi WiFi ---
const char* ssid = "faiz";
const char* password = "arshaka18";

// --- Konfigurasi ThingSpeak ---
String apiKey = ".";  // write API Key ThingSpeak Anda
const char* serverTS = "http://api.thingspeak.com/update";

// --- Konfigurasi Sensor ---
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
#define SOIL_PIN 34  // ADC input soil sensor

// --- Relay Pin ---
#define RELAY_PUMP 12
#define RELAY_FAN 13

// --- Web Server ---
AsyncWebServer server(80);

// Variabel sensor, status relay & mode otomatis
float temperature = 32.0;
float humidity = 23.0;
int soilPercent = 80;
bool statePump = false;
bool stateFan = false;
bool autoMode = true;  // Default: Mode Otomatis Aktif

// --- Threshold Batas Otomatisasi ---
const float AUTO_TEMP_HIGH = 31.0;  // Jika suhu > 31°C -> Fan ON
const float AUTO_TEMP_LOW = 29.5;   // Jika suhu < 29.5°C -> Fan OFF (histeresis)
const int AUTO_SOIL_LOW = 60;       // Jika tanah < 60% -> Pump ON
const int AUTO_SOIL_HIGH = 75;      // Jika tanah >= 75% -> Pump OFF (histeresis)

// ================= Timing non-blocking =================
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000;  // baca sensor + kontrol tiap 2 detik
unsigned long lastThingSpeak = 0;
const unsigned long THINGSPEAK_INTERVAL = 20000;  // kirim ThingSpeak tiap 20 detik

// ================= LCD I2C =================
LiquidCrystal_I2C lcd(0x27, 20, 4);

void updateLCD() {
  lcd.setCursor(7, 1);
  lcd.print("      ");
  lcd.setCursor(7, 1);
  lcd.print(temperature, 1);
  lcd.print((char)223);
  lcd.print("C");

  lcd.setCursor(9, 2);
  lcd.print("      ");
  lcd.setCursor(9, 2);
  lcd.print(humidity, 1);
  lcd.print("%");

  lcd.setCursor(9, 3);
  lcd.print("      ");
  lcd.setCursor(9, 3);
  lcd.print(soilPercent);
  lcd.print("%");
}

void sendThingSpeak() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = serverTS;
  url += "?api_key=" + apiKey;
  url += "&field1=" + String(temperature, 1);
  url += "&field2=" + String(humidity, 1);
  url += "&field3=" + String(soilPercent);
  http.begin(url);
  int httpCode = http.GET();
  if (httpCode > 0) {
    Serial.println("ThingSpeak update OK");
  } else {
    Serial.println("Gagal kirim ke ThingSpeak");
  }
  http.end();
}

// Fungsi bantu untuk merespons dengan JSON status terkini seketika (<10ms)
void sendStateJson(AsyncWebServerRequest* request) {
  String json = "{";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"humidity\":" + String(humidity, 1) + ",";
  json += "\"soil\":" + String(soilPercent) + ",";
  json += "\"pump\":" + String(statePump ? 1 : 0) + ",";
  json += "\"fan\":" + String(stateFan ? 1 : 0) + ",";
  json += "\"auto\":" + String(autoMode ? 1 : 0);
  json += "}";
  request->send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  // Inisialisasi LCD
  lcd.begin();
  lcd.backlight();
  lcd.setCursor(5, 0);
  lcd.print("Monitoring");
  lcd.setCursor(0, 1);
  lcd.print("Suhu : ");
  lcd.setCursor(0, 2);
  lcd.print("K.Udara: ");
  lcd.setCursor(0, 3);
  lcd.print("K.Tanah: ");

  // Inisialisasi LittleFS
  if (!LittleFS.begin()) {
    Serial.println("LittleFS mount gagal!");
    return;
  }
  Serial.println("LittleFS mounted berhasil.");

  // Koneksi WiFi
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan WiFi...");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) {
    delay(300);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi terhubung!");
    Serial.print("Buka dashboard di: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi gagal konek, lanjut tanpa WiFi.");
  }

  // Konfigurasi Pin Relay
  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  digitalWrite(RELAY_PUMP, LOW);
  digitalWrite(RELAY_FAN, LOW);

  // Serve static files dari LittleFS (/index.html, /style.css, /script.js)
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  // 1. Endpoint data sensor JSON
  server.on("/data", HTTP_GET, [](AsyncWebServerRequest* request) {
    sendStateJson(request);
  });

  // 2. Endpoint ubah Mode Otomatis / Manual (/auto?state=1|0)
  server.on("/auto", HTTP_GET, [](AsyncWebServerRequest* request) {
    if (request->hasParam("state")) {
      String stateStr = request->getParam("state")->value();
      autoMode = (stateStr == "1");

      Serial.print("[KENDALI] Mode berhasil diubah: ");
      if (autoMode) {
        Serial.println("OTOMATIS (Sensor mengontrol relay)");
        // Langsung cek sensor sekarang agar relay langsung merespons
        if (temperature > AUTO_TEMP_HIGH) {
          stateFan = true;
          digitalWrite(RELAY_FAN, HIGH);
        } else if (temperature < AUTO_TEMP_LOW) {
          stateFan = false;
          digitalWrite(RELAY_FAN, LOW);
        }

        if (soilPercent < AUTO_SOIL_LOW) {
          statePump = true;
          digitalWrite(RELAY_PUMP, HIGH);
        } else if (soilPercent >= AUTO_SOIL_HIGH) {
          statePump = false;
          digitalWrite(RELAY_PUMP, LOW);
        }
      } else {
        Serial.println("MANUAL (Sensor dinonaktifkan dari relay)");
      }
    }
    // PENTING: Harus balas dengan sendStateJson agar script.js tidak error!
    sendStateJson(request);
  });

  // 3. Endpoint kontrol Pompa Manual
  server.on("/pump", HTTP_GET, [](AsyncWebServerRequest* request) {
    if (request->hasParam("state")) {
      String state = request->getParam("state")->value();
      statePump = (state == "1");
      digitalWrite(RELAY_PUMP, statePump ? HIGH : LOW);
      Serial.print("[MANUAL] Pompa Air diubah menjadi: ");
      Serial.println(statePump ? "ON" : "OFF");
    }
    sendStateJson(request);
  });

  // 4. Endpoint kontrol Kipas Manual
  server.on("/fan", HTTP_GET, [](AsyncWebServerRequest* request) {
    if (request->hasParam("state")) {
      String state = request->getParam("state")->value();
      stateFan = (state == "1");
      digitalWrite(RELAY_FAN, stateFan ? HIGH : LOW);
      Serial.print("[MANUAL] Kipas Ventilasi diubah menjadi: ");
      Serial.println(stateFan ? "ON" : "OFF");
    }
    sendStateJson(request);
  });

  server.begin();
  Serial.println("AsyncWebServer siap!");
}

void loop() {
  unsigned long now = millis();

  // Baca sensor + update LCD + Logika Otomatis tiap 2 detik (non-blocking)
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;

    // Nilai uji saat ini:
    humidity = 23.0;
    temperature = 32.0;
    soilPercent = 80;

    updateLCD();

    // ================= LOGIKA KONTROL OTOMATIS =================
    // HANYA JALAN JIKA autoMode == true!
    if (autoMode) {
      // 1. Kipas Otomatis berdasarkan Suhu
      if (temperature > AUTO_TEMP_HIGH && !stateFan) {
        stateFan = true;
        digitalWrite(RELAY_FAN, HIGH);
        Serial.println("[AUTO] Suhu tinggi (>31C)! Kipas Ventilasi DINYALAKAN.");
      } else if (temperature < AUTO_TEMP_LOW && stateFan) {
        stateFan = false;
        digitalWrite(RELAY_FAN, LOW);
        Serial.println("[AUTO] Suhu stabil (<29.5C). Kipas Ventilasi DIMATIKAN.");
      }

      // 2. Pompa Otomatis berdasarkan Kelembapan Tanah (< 60%)
      if (soilPercent < AUTO_SOIL_LOW && !statePump) {
        statePump = true;
        digitalWrite(RELAY_PUMP, HIGH);
        Serial.println("[AUTO] Tanah kering (<60%)! Pompa Air DINYALAKAN.");
      } else if (soilPercent >= AUTO_SOIL_HIGH && statePump) {
        statePump = false;
        digitalWrite(RELAY_PUMP, LOW);
        Serial.println("[AUTO] Tanah cukup lembap (>=75%). Pompa Air DIMATIKAN.");
      }
    }
  }

  // Kirim ke ThingSpeak tiap 20 detik (non-blocking)
  if (now - lastThingSpeak >= THINGSPEAK_INTERVAL) {
    lastThingSpeak = now;
    sendThingSpeak();
  }
}