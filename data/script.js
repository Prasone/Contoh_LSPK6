/**
 * ESP32 LittleFS Client Script - Realtime Fast Response (<50ms)
 * Telah disesuaikan untuk kompatibel dengan Toggle Switch maupun Dual Button
 */

const CONFIG = {
  POLL_INTERVAL_MS: 1000, // 1 detik polling stabil
  URL_DATA: '/data',
  URL_PUMP: '/pump',
  URL_FAN: '/fan',
  URL_AUTO: '/auto'
};

let currentAutoMode = true;

// Update tampilan sensor dan sinkronisasi status relay dari ESP32
function updateDashboard(data) {
  // 1. Suhu Udara
  if (data.temperature !== undefined) {
    const temp = Number(data.temperature);
    const tempVal = document.getElementById('tempVal');
    if (tempVal) tempVal.textContent = temp.toFixed(1);
    
    const tempBar = document.getElementById('tempBar');
    if (tempBar) {
      const tempPct = Math.min(Math.max((temp / 50) * 100, 0), 100);
      tempBar.style.width = tempPct + '%';
    }
    
    const tempStatus = document.getElementById('tempStatus');
    if (tempStatus) {
      tempStatus.textContent = temp > 31 ? '⚠️ Panas (>31°C)' : 'Normal';
    }
  }

  // 2. Kelembapan Udara
  if (data.humidity !== undefined) {
    const hum = Math.round(data.humidity);
    const humVal = document.getElementById('humVal');
    if (humVal) humVal.textContent = hum;
    
    const humBar = document.getElementById('humBar');
    if (humBar) {
      humBar.style.width = Math.min(Math.max(hum, 0), 100) + '%';
    }
    
    const humStatus = document.getElementById('humStatus');
    if (humStatus) {
      humStatus.textContent = hum < 40 ? 'Kering' : 'Optimal';
    }
  }

  // 3. Kelembapan Tanah
  if (data.soil !== undefined) {
    const soil = Math.round(data.soil);
    const soilVal = document.getElementById('soilVal');
    if (soilVal) soilVal.textContent = soil;
    
    const soilBar = document.getElementById('soilBar');
    if (soilBar) {
      soilBar.style.width = Math.min(Math.max(soil, 0), 100) + '%';
    }
    
    const soilStatus = document.getElementById('soilStatus');
    if (soilStatus) {
      soilStatus.textContent = soil < 60 ? '⚠️ Kering (<60%)' : 'Subur & Lembap';
    }
  }

  // 4. Sinkronisasi Mode Sistem (Otomatis vs Manual)
  if (data.auto !== undefined) {
    const isAuto = Boolean(data.auto);
    currentAutoMode = isAuto;
    syncModeUI(isAuto);
  }

  // 5. Sinkronisasi Status Pompa dari ESP32 (data.pump)
  if (data.pump !== undefined) {
    const pumpActive = Boolean(data.pump);
    const pumpInput = document.getElementById('pumpToggle');
    if (pumpInput && pumpInput.checked !== pumpActive) {
      pumpInput.checked = pumpActive;
    }
    syncRelayUI('pump', pumpActive);
  }

  // 6. Sinkronisasi Status Kipas dari ESP32 (data.fan)
  if (data.fan !== undefined) {
    const fanActive = Boolean(data.fan);
    const fanInput = document.getElementById('fanToggle');
    if (fanInput && fanInput.checked !== fanActive) {
      fanInput.checked = fanActive;
    }
    syncRelayUI('fan', fanActive);
  }

  // Update timestamp
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const lastUpdate = document.getElementById('lastUpdate');
  if (lastUpdate) lastUpdate.textContent = timeStr;
  
  setConnectionStatus(true);
}

// Visual state sync untuk Tombol / Toggle Mode Sistem
function syncModeUI(isAuto) {
  const badge = document.getElementById('autoBadge');
  const desc = document.getElementById('modeDesc');
  const autoToggle = document.getElementById('autoToggle'); // Toggle switch
  const btnAuto = document.getElementById('btnModeAuto');    // Button 1
  const btnManual = document.getElementById('btnModeManual'); // Button 2

  // Sinkronkan Toggle switch jika ada di HTML
  if (autoToggle && autoToggle.checked !== isAuto) {
    autoToggle.checked = isAuto;
  }

  if (isAuto) {
    if (badge) {
      badge.textContent = 'OTOMATIS AKTIF';
      badge.className = 'mode-badge active-auto';
    }
    if (desc) {
      desc.textContent = 'Fan ON jika Suhu > 31°C · Pompa ON jika Tanah < 60%';
    }
    if (btnAuto) btnAuto.className = 'mode-btn active-auto';
    if (btnManual) btnManual.className = 'mode-btn';
  } else {
    if (badge) {
      badge.textContent = 'MANUAL AKTIF';
      badge.className = 'mode-badge active-manual';
    }
    if (desc) {
      desc.textContent = 'Kendali manual aktif. Sensor TIDAK AKAN mengubah status relay.';
    }
    if (btnAuto) btnAuto.className = 'mode-btn';
    if (btnManual) btnManual.className = 'mode-btn active-manual';
  }
}

// Visual state sync untuk kartu dan efek relay
function syncRelayUI(type, isActive) {
  if (type === 'pump') {
    const card = document.getElementById('relayCard1');
    const sub = document.getElementById('pumpSub');
    if (card) {
      if (isActive) card.classList.add('active');
      else card.classList.remove('active');
    }
    if (sub) {
      sub.textContent = isActive 
        ? (currentAutoMode ? 'Status: ON · Menyiram (Otomatis)' : 'Status: ON · Menyiram (Manual)')
        : 'Status: OFF · Standby';
    }
  } else if (type === 'fan') {
    const card = document.getElementById('relayCard2');
    const sub = document.getElementById('fanSub');
    const fanSvg = document.getElementById('fanIconSvg');
    if (card) {
      if (isActive) card.classList.add('active');
      else card.classList.remove('active');
    }
    if (fanSvg) {
      if (isActive) fanSvg.classList.add('spinning');
      else fanSvg.classList.remove('spinning');
    }
    if (sub) {
      sub.textContent = isActive 
        ? (currentAutoMode ? 'Status: ON · Kipas Mendinginkan (Otomatis)' : 'Status: ON · Kipas Berputar (Manual)')
        : 'Status: OFF · Standby';
    }
  }
}

// ==========================================
// HANDLER KENDALI MODE (DUAL COMPATIBILITY)
// ==========================================

// Dipanggil jika HTML menggunakan Toggle Switch: onchange="toggleAuto(this.checked)"
async function toggleAuto(isChecked) {
  await setSystemMode(isChecked);
}

// Dipanggil jika HTML menggunakan Button: onclick="setSystemMode(true/false)"
async function setSystemMode(isAuto) {
  currentAutoMode = isAuto;
  syncModeUI(isAuto);

  try {
    const stateVal = isAuto ? '1' : '0';
    console.log('Mengirim Mode ke ESP32:', stateVal);
    
    const response = await fetch(`${CONFIG.URL_AUTO}?state=${stateVal}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      updateDashboard(data); // Respons instan dari ESP32
    }
  } catch (error) {
    console.error('Mode error:', error);
  }
}

// Handler kendali Pompa Air
async function togglePump(isChecked) {
  syncRelayUI('pump', isChecked);

  try {
    const stateVal = isChecked ? '1' : '0';
    const response = await fetch(`${CONFIG.URL_PUMP}?state=${stateVal}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      updateDashboard(data);
    }
  } catch (error) {
    console.error('Pump error:', error);
    const pumpInput = document.getElementById('pumpToggle');
    if (pumpInput) pumpInput.checked = !isChecked;
    syncRelayUI('pump', !isChecked);
  }
}

// Handler kendali Kipas Ventilasi
async function toggleFan(isChecked) {
  syncRelayUI('fan', isChecked);

  try {
    const stateVal = isChecked ? '1' : '0';
    const response = await fetch(`${CONFIG.URL_FAN}?state=${stateVal}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.ok) {
      const data = await response.json();
      updateDashboard(data);
    }
  } catch (error) {
    console.error('Fan error:', error);
    const fanInput = document.getElementById('fanToggle');
    if (fanInput) fanInput.checked = !isChecked;
    syncRelayUI('fan', !isChecked);
  }
}

// Indikator status koneksi (Online/Terputus)
function setConnectionStatus(isOnline) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  if (badge && text) {
    if (isOnline) {
      badge.classList.remove('offline');
      text.textContent = 'Online';
    } else {
      badge.classList.add('offline');
      text.textContent = 'Terputus';
    }
  }
}

// Fetch loop non-blocking ke /data
async function fetchSensorData() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

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

// Inisialisasi saat halaman selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
  const currentHost = window.location.hostname;
  if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    const ipDisplay = document.getElementById('ipDisplay');
    if (ipDisplay) ipDisplay.textContent = currentHost;
  }

  fetchSensorData();
  setInterval(fetchSensorData, CONFIG.POLL_INTERVAL_MS);
});