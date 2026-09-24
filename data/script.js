/**
 * ESP32 LittleFS Client Script - 100% Cocok dengan sketch ESPAsyncWebServer Anda
 * Endpoints:
 * - GET /data -> {"temperature": 32.0, "humidity": 23.0, "soil": 80}
 * - GET /pump?state=1 atau /pump?state=0
 * - GET /fan?state=1 atau /fan?state=0
 */

const CONFIG = {
  POLL_INTERVAL_MS: 2000,
  URL_DATA: '/data',
  URL_PUMP: '/pump',
  URL_FAN: '/fan'
};

// Update tampilan sensor dari data JSON ESP32
function updateDashboard(data) {
  // 1. Suhu Udara (data.temperature)
  if (data.temperature !== undefined) {
    const temp = Number(data.temperature);
    document.getElementById('tempVal').textContent = temp.toFixed(1);
    const tempPct = Math.min(Math.max((temp / 50) * 100, 0), 100);
    document.getElementById('tempBar').style.width = tempPct + '%';
    document.getElementById('tempStatus').textContent = temp > 35 ? '⚠️ Panas' : 'Normal';
  }

  // 2. Kelembapan Udara (data.humidity)
  if (data.humidity !== undefined) {
    const hum = Math.round(data.humidity);
    document.getElementById('humVal').textContent = hum;
    document.getElementById('humBar').style.width = Math.min(Math.max(hum, 0), 100) + '%';
    document.getElementById('humStatus').textContent = hum < 40 ? 'Kering' : 'Optimal';
  }

  // 3. Kelembapan Tanah (data.soil)
  if (data.soil !== undefined) {
    const soil = Math.round(data.soil);
    document.getElementById('soilVal').textContent = soil;
    document.getElementById('soilBar').style.width = Math.min(Math.max(soil, 0), 100) + '%';
    document.getElementById('soilStatus').textContent = soil < 40 ? '⚠️ Kering (Siram)' : 'Subur & Lembap';
  }

  // Opsional: jika sketch di-upgrade menyertakan pump & fan state di JSON /data
  if (data.pump !== undefined) {
    const pumpActive = Boolean(data.pump);
    document.getElementById('pumpToggle').checked = pumpActive;
    syncRelayUI('pump', pumpActive);
  }
  if (data.fan !== undefined) {
    const fanActive = Boolean(data.fan);
    document.getElementById('fanToggle').checked = fanActive;
    syncRelayUI('fan', fanActive);
  }

  // Update timestamp
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('lastUpdate').textContent = timeStr;
  setConnectionStatus(true);
}

// Visual state sync untuk kartu dan efek relay
function syncRelayUI(type, isActive) {
  if (type === 'pump') {
    const card = document.getElementById('relayCard1');
    const sub = document.getElementById('pumpSub');
    if (isActive) {
      card.classList.add('active');
      sub.textContent = 'Status: ON · Pompa Menyiram';
    } else {
      card.classList.remove('active');
      sub.textContent = 'Status: OFF · Standby';
    }
  } else if (type === 'fan') {
    const card = document.getElementById('relayCard2');
    const sub = document.getElementById('fanSub');
    const fanSvg = document.getElementById('fanIconSvg');
    if (isActive) {
      card.classList.add('active');
      fanSvg.classList.add('spinning');
      sub.textContent = 'Status: ON · Kipas Berputar';
    } else {
      card.classList.remove('active');
      fanSvg.classList.remove('spinning');
      sub.textContent = 'Status: OFF · Standby';
    }
  }
}

// Handler kendali Pompa Air (/pump?state=1|0)
async function togglePump(isChecked) {
  // Optimistic UI update
  syncRelayUI('pump', isChecked);

  try {
    const stateVal = isChecked ? '1' : '0';
    const response = await fetch(`${CONFIG.URL_PUMP}?state=${stateVal}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      throw new Error('Gagal merespons');
    }
  } catch (error) {
    console.error('Pump error:', error);
    // Rollback switch jika gagal
    document.getElementById('pumpToggle').checked = !isChecked;
    syncRelayUI('pump', !isChecked);
    alert('Koneksi ke ESP32 terputus. Gagal mengubah relay Pompa.');
  }
}

// Handler kendali Kipas Ventilasi (/fan?state=1|0)
async function toggleFan(isChecked) {
  // Optimistic UI update
  syncRelayUI('fan', isChecked);

  try {
    const stateVal = isChecked ? '1' : '0';
    const response = await fetch(`${CONFIG.URL_FAN}?state=${stateVal}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      throw new Error('Gagal merespons');
    }
  } catch (error) {
    console.error('Fan error:', error);
    // Rollback switch jika gagal
    document.getElementById('fanToggle').checked = !isChecked;
    syncRelayUI('fan', !isChecked);
    alert('Koneksi ke ESP32 terputus. Gagal mengubah relay Kipas.');
  }
}

// Indikator status koneksi (Online/Terputus)
function setConnectionStatus(isOnline) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  if (isOnline) {
    badge.classList.remove('offline');
    text.textContent = 'Online';
  } else {
    badge.classList.add('offline');
    text.textContent = 'Terputus';
  }
}

// Fetch loop non-blocking ke /data
async function fetchSensorData() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(CONFIG.URL_DATA, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('HTTP error');
    const data = await response.json();
    updateDashboard(data);
  } catch (err) {
    setConnectionStatus(false);
  }
}

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  fetchSensorData();
  setInterval(fetchSensorData, CONFIG.POLL_INTERVAL_MS);
});
