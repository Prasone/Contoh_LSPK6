# Contoh Code LSP K6 Little Fs
> Web Server IoT berbasis **ESP32**, **LittleFS**, dan **ESPAsyncWebServer** untuk pemantauan parameter mikroklimat (suhu, kelembapan udara, kelembapan tanah) serta aktuasi otomatis relay pompa air dan kipas ventilasi.

---


## 📂 1. Struktur Folder Proyek

Untuk menjalankan website pada ESP32 menggunakan **LittleFS**, file kode program Arduino (`.ino`) dan file aset web (HTML, CSS, JS) dipisahkan secara terstruktur. File web disimpan di dalam folder bernama `data/`:

```text
Contoh_LSPK6/
│
├── Contoh_LSPK6.ino   # Program C++ utama (WiFi, Sensor, WebServer, Logika Otomatis)
│
└── data/                          # Folder sistem file LittleFS (di-flash ke memori flash ESP32)
    ├── index.html                 # Struktur tampilan web (Zero-CDN, inline SVG icons)
    ├── style.css                  # Desain visual modern, layout responsif, switch tactile
    └── script.js                  # Logika JavaScript (Fetch polling, Optimistic UI, Relay control)
```

> **Catatan Penting LittleFS:**
> - Seluruh file di dalam folder `data/` akan dikompilasi menjadi *filesystem image* biner dan di-flash ke partisi flash ESP32 menggunakan plugin **ESP32 LittleFS Data Upload**.
> - ESP32 tidak memerlukan koneksi internet untuk menampilkan website, karena file HTML, CSS, dan JS disajikan langsung dari memori internal ESP32 (mendukung mode Access Point `192.168.4.1` maupun Station WiFi lokal `192.168.1.x`).

---

## 🏗️ 2. Arsitektur Komunikasi Client - Server

Sistem ini mengadopsi arsitektur **Client-Server RESTful Asinkron**:

```text
┌─────────────────────────────────────────────────────────────┐
│                 ESP32 Microcontroller                       │
│                                                             │
│  ┌────────────────────┐          ┌───────────────────────┐  │
│  │ LittleFS Storage   │          │  ESPAsyncWebServer    │  │
│  │ - index.html       │─────────>│  Port 80              │  │
│  │ - style.css        │          │                       │  │
│  │ - script.js        │          │  - GET /              │  │
│  └────────────────────┘          │  - GET /data          │  │
│                                  │  - GET /pump?state=   │  │
│  ┌────────────────────┐          │  - GET /fan?state=    │  │
│  │ Hardware & Sensor  │          │  - GET /auto?state=   │  │
│  │ - DHT22 (Pin 4)    │          └───────────▲───────────┘  │
│  │ - Soil (Pin 34)    │                      │              │
│  │ - Relay 1 (Pin 12) │                      │ HTTP / Wi-Fi │
│  │ - Relay 2 (Pin 13) │                      │              │
│  └────────────────────┘                      │              │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │   Web Browser Client (Smartphone / PC)    │
                         │                                           │
                         │   - Meminta file web via HTTP GET         │
                         │   - Polling sensor tiap 2 detik (/data)   │
                         │   - Mengirim trigger toggle relay / auto  │
                         │   - Update status visual (glow, spin)     │
                         └───────────────────────────────────────────┘
```

---

## ⚙️ 3. Bagaimana ESP32 Melayani Website Menggunakan LittleFS?

Di dalam kode Arduino (`.ino`), ESP32 menginisialisasi partisi **LittleFS** dan menjalankan **ESPAsyncWebServer**:

```cpp
// 1. Mount sistem file LittleFS
if (!LittleFS.begin()) {
  Serial.println("Gagal me-mount LittleFS!");
  return;
}

// 2. Layani seluruh file web di root folder "/" secara otomatis
server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

// 3. Jalankan server
server.begin();
```

Ketika browser klien membuka IP ESP32 (misal `http://192.168.1.17`):
1. Browser meminta `/` &rarr; ESP32 mengambil file `index.html` dari LittleFS dan mengirimkannya ke browser.
2. File `index.html` meminta file relasinya (`style.css` dan `script.js`).
3. ESP32 mengirimkan masing-masing file statis tersebut dengan MIME type yang tepat (`text/css` dan `application/javascript`).

---

## 🔄 4. Alur Komunikasi Dua Arah (Web ⟷ ESP32)

### A. ESP32 Mengirim Data Sensor ke Website
1. **Di Sisi ESP32 (`.ino`):**
   ESP32 menyediakan endpoint JSON `GET /data`:
   ```cpp
   server.on("/data", HTTP_GET, [](AsyncWebServerRequest* request) {
     String json = "{";
     json += "\"temperature\":" + String(temperature, 1) + ",";
     json += "\"humidity\":" + String(humidity, 1) + ",";
     json += "\"soil\":" + String(soilPercent) + ",";
     json += "\"pump\":" + String(statePump ? 1 : 0) + ",";
     json += "\"fan\":" + String(stateFan ? 1 : 0) + ",";
     json += "\"auto\":" + String(autoMode ? 1 : 0);
     json += "}";
     request->send(200, "application/json", json);
   });
   ```

2. **Di Sisi Website (`script.js`):**
   Browser secara non-blocking meminta data setiap 2 detik menggunakan `Fetch API`:
   ```javascript
   async function fetchSensorData() {
     const response = await fetch('/data', { cache: 'no-cache' });
     const data = await response.json();

     // Update angka & bar level
     document.getElementById('tempVal').textContent = data.temperature.toFixed(1);
     document.getElementById('humVal').textContent = data.humidity;
     document.getElementById('soilVal').textContent = data.soil;

     // Sinkronisasi status saklar secara otomatis
     document.getElementById('pumpToggle').checked = Boolean(data.pump);
     document.getElementById('fanToggle').checked = Boolean(data.fan);
   }

   setInterval(fetchSensorData, 2000);
   ```

---

### B. Website Mengirim Perintah Kendali ke ESP32
Ketika pengguna menekan saklar di web:
1. **Di Sisi Website (`script.js`):**
   Fungsi trigger mengirim request HTTP GET dengan query parameter status (`state=1` atau `state=0`):
   ```javascript
   async function togglePump(isChecked) {
     const stateVal = isChecked ? '1' : '0';
     await fetch(`/pump?state=${stateVal}`);
   }

   async function toggleFan(isChecked) {
     const stateVal = isChecked ? '1' : '0';
     await fetch(`/fan?state=${stateVal}`);
   }
   ```

2. **Di Sisi ESP32 (`.ino`):**
   ESP32 menerima parameter, mengubah status pin GPIO relay, dan merespons balik:
   ```cpp
   server.on("/pump", HTTP_GET, [](AsyncWebServerRequest* request) {
     if (request->hasParam("state")) {
       String state = request->getParam("state")->value();
       statePump = (state == "1");
       digitalWrite(RELAY_PUMP, statePump ? HIGH : LOW);
       request->send(200, "text/plain", statePump ? "Pump ON" : "Pump OFF");
     }
   });
   ```

---

## 🤖 5. Logika Mode Otomatis (Smart Greenhouse)

Sistem dilengkapi kontrol otomatis berbasis ambang batas (*threshold*) dan histeresis:

- **Kipas Ventilasi (Fan):**
  - **Suhu > 31.0°C** &rarr; Kipas Otomatis **DINYALAKAN (ON)** untuk membuang panas.
  - **Suhu < 29.5°C** &rarr; Kipas Otomatis **DIMATIKAN (OFF)**.
- **Pompa Air (Pump):**
  - **Kelembapan Tanah < 60%** &rarr; Pompa Otomatis **DINYALAKAN (ON)** untuk menyiram.
  - **Kelembapan Tanah ≥ 75%** &rarr; Pompa Otomatis **DIMATIKAN (OFF)** setelah tanah basah optimal.

---

## 🔌 6. Konfigurasi Pinout Hardware ESP32

| Komponen | Pin ESP32 | Keterangan |
| :--- | :--- | :--- |
| **DHT22 (Sensor Suhu & Kelembapan)** | `GPIO 4` | Digital Input (dengan resistor pull-up) |
| **Capacitive/Resistive Soil Sensor** | `GPIO 34` | ADC Analog Input (0 - 4095) |
| **Relay 1 (Pompa Air)** | `GPIO 12` | Digital Output |
| **Relay 2 (Kipas Ventilasi)** | `GPIO 13` | Digital Output |
| **LCD 20x4 I2C (SDA / SCL)** | `GPIO 21` (SDA) / `GPIO 22` (SCL) | Display monitoring lokal (Alamat `0x27`) |

---

## 🚀 7. Langkah-langkah Upload ke ESP32

1. **Persiapan Arduino IDE:**
   - Pasang Board Package **ESP32 by Espressif Systems**.
   - Pasang Library: `ESPAsyncWebServer`, `AsyncTCP`, `DHT sensor library`, `LiquidCrystal_I2C`, `ArduinoJson`.
   - Pasang tool plugin **Arduino ESP32 LittleFS Filesystem Uploader**.
2. **Upload File Website ke LittleFS (Folder `data/`):**
   - Pastikan file `index.html`, `style.css`, dan `script.js` sudah berada di dalam folder `data/` di samping sketch `.ino`.
   - Pastikan Serial Monitor dalam keadaan **TERTUTUP** agar port COM tidak sibuk.
   - Tekan kombinasi tombol:
     ```text
     Ctrl + Shift + P    (atau Cmd + Shift + P di macOS)
     ```
   - Di kolom Command Palette yang muncul, ketik dan pilih:
     ```text
     Upload LittleFS to Pico/ESP8266/ESP32
     ```
   - Tunggu proses pembuatan filesystem image dan flashing ke memori flash ESP32 hingga selesai (ditandai pesan sukses pada output console).
3. **Upload Program Utama:**
   - Klik tombol **Upload** (`Ctrl + U`) untuk mengunggah `ESP32_Greenhouse_Project.ino`.
4. **Buka Website:**
   - Buka Serial Monitor (baudrate `115200`) untuk melihat IP yang didapat ESP32 (contoh: `192.168.1.17`).
   - Buka browser di HP/Laptop pada jaringan WiFi yang sama, lalu akses: `http://192.168.1.17`.
