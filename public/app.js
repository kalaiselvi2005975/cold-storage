/**
 * SMART FRUIT & VEGETABLE COLD STORAGE MANAGEMENT SYSTEM
 * Core Application Engine & State Controller
 * 
 * Manages UI rendering, Demo Simulation Mode, Firebase Realtime Database Sync,
 * 3-Chamber Monitoring, Crop Database, Chart.js Analytics, Alert Engine,
 * and AI Visual Quality Assessment via camera capture.
 */

// ============================================================================
// APPLICATION GLOBAL STATE
// ============================================================================
const state = {
  demoMode: false, // Default to FALSE — connect to live Firebase immediately if configured
  firebaseConnected: false,

  chambers: {
    C1: {
      id: 'C1',
      name: 'Chamber 1',
      fruitType: 'tomato',
      temperature: 14.8,
      humidity: 72,
      targetTemperature: 11.5,
      temperatureMode: 'recommended', // 'recommended' or 'custom'
      customTarget: null,
      fanOn: false,
      status: 'NORMAL', // NORMAL, COOLING, ATTENTION, QUALITY_WARNING, CRITICAL
      ai: null // { overallCondition, summary, totalDetected, goodCount, warningCount, spoiledCount, confidence, lastChecked, imageUrl }
    },
    C2: {
      id: 'C2',
      name: 'Chamber 2',
      fruitType: 'carrot',
      temperature: 8.5,
      humidity: 80,
      targetTemperature: 1.5,
      temperatureMode: 'recommended',
      customTarget: null,
      fanOn: true,
      status: 'COOLING',
      ai: null
    },
    C3: {
      id: 'C3',
      name: 'Chamber 3',
      fruitType: 'apple',
      temperature: 4.2,
      humidity: 88,
      targetTemperature: 2.0,
      temperatureMode: 'recommended',
      customTarget: null,
      fanOn: true,
      status: 'COOLING',
      ai: null
    }
  },

  system: {
    lastUpdated: new Date().toLocaleTimeString()
  },

  alerts: [],
  readingsHistory: [],
  charts: {}
};

// Demo Timer
let demoTimer = null;

// Camera state
let activeCameraChamberId = null;
let cameraStream = null;
let capturedImageDataUrl = null;

// Hysteresis deadband (°C) to prevent rapid fan switching
const HYSTERESIS = 1.0;

// Web Alarm System
let webAlarmEnabled = false;
let isAlarmPlaying = false;
const webAlarmAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/991/991-preview.mp3');
webAlarmAudio.loop = true;

function toggleWebAlarm() {
  webAlarmEnabled = !webAlarmEnabled;
  const btn = document.getElementById('webAlarmToggleBtn');
  if (webAlarmEnabled) {
    btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Web Alarm ON';
    btn.style.background = 'rgba(244, 63, 94, 0.15)';
    showToast("Web Alarm Enabled! Leave page open.");
    webAlarmAudio.play().then(() => {
       webAlarmAudio.pause();
       webAlarmAudio.currentTime = 0;
    }).catch(e => console.warn("Audio Context Error", e));
  } else {
    btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> Web Alarm OFF (Tap to Turn ON)';
    btn.style.background = 'transparent';
    stopWebAlarm();
    showToast("Web Alarm Disabled.");
  }
}

function startWebAlarm() {
  if (webAlarmEnabled && !isAlarmPlaying) {
    webAlarmAudio.play().catch(e => console.warn("Audio play blocked", e));
    isAlarmPlaying = true;
  }
}

function stopWebAlarm() {
  if (isAlarmPlaying) {
    webAlarmAudio.pause();
    webAlarmAudio.currentTime = 0;
    isAlarmPlaying = false;
  }
}

// ============================================================================
// INITIALIZATION & BOOTSTRAP
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Initializing Smart Cold Storage Management System...");

  // 1. Setup Tab Navigation
  initNavigation();

  // 2. Initialize Crop Selectors UI
  onCropSelectChange('C1');
  onCropSelectChange('C2');
  onCropSelectChange('C3');

  // 3. Initialize Charts
  initCharts();

  // 4. Generate Initial Demo History Data
  generateInitialHistoryData();

  // 5. Firebase or Demo
  setupFirebaseOrDemo();

  // 6. Initial UI Refresh
  updateUI();
});

// ============================================================================
// FIREBASE VS DEMO MODE MANAGEMENT
// ============================================================================
function setupFirebaseOrDemo() {
  const isConfigured = isFirebaseConfigured();
  
  if (isConfigured) {
    initFirebaseApp();
  }

  if (isConfigured && isFirebaseInitialized) {
    // When Firebase is configured with real credentials, run in Live Mode!
    state.demoMode = false;
    state.firebaseConnected = true;
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
    setupFirebaseListeners();
    console.log("✅ Live Firebase Mode active — listening to real DHT11 sensor readings.");
  } else {
    // Fall back to Demo Mode only if credentials are missing
    state.demoMode = true;
    state.firebaseConnected = false;
    startDemoSimulation();
    console.warn("⚠️ Firebase not configured or failed to initialize — falling back to Demo Mode.");
  }

  updateModePillUI();
}

function updateModePillUI() {
  const pill = document.getElementById('demoModeToggle');
  const modeText = document.getElementById('modeText');
  const dot = document.getElementById('systemOnlineDot');
  const text = document.getElementById('systemOnlineText');

  if (state.demoMode) {
    pill.className = 'mode-pill demo-active';
    modeText.textContent = 'DEMO MODE';
    dot.className = 'dot offline';
    text.textContent = 'Demo Mode (Simulated)';
  } else {
    pill.className = 'mode-pill live-active';
    modeText.textContent = 'LIVE FIREBASE';
    if (state.firebaseConnected) {
      dot.className = 'dot online';
      text.textContent = 'Firebase Connected (Realtime)';
    } else {
      dot.className = 'dot offline';
      text.textContent = 'Connecting to Firebase...';
    }
  }
}

// Toggle Demo Mode
document.getElementById('demoModeToggle').addEventListener('click', () => {
  if (state.demoMode) {
    if (isFirebaseConfigured() && initFirebaseApp()) {
      state.demoMode = false;
      state.firebaseConnected = true;
      if (demoTimer) {
        clearInterval(demoTimer);
        demoTimer = null;
      }
      setupFirebaseListeners();
      showToast("Switched to Live Firebase Mode!");
    } else {
      alert("⚠️ Firebase credentials not configured in 'firebase-config.js'. Please paste your API key to enable Live Mode.");
    }
  } else {
    state.demoMode = true;
    startDemoSimulation();
    showToast("Switched to Demo Simulation Mode!");
  }
  updateModePillUI();
  updateUI();
});

// ============================================================================
// DEMO SIMULATION ENGINE
// ============================================================================
function startDemoSimulation() {
  if (demoTimer) clearInterval(demoTimer);

  demoTimer = setInterval(() => {
    if (!state.demoMode) return;

    const now = new Date();
    state.system.lastUpdated = now.toLocaleTimeString();

    ['C1', 'C2', 'C3'].forEach(id => {
      const ch = state.chambers[id];
      const target = ch.targetTemperature;
      const crop = CROP_DATABASE[ch.fruitType] || CROP_DATABASE.other;

      // Simple thermal drift simulation
      const coolingEffect = ch.fanOn ? -0.3 : 0;
      const ambientDrift = 0.15;
      const noise = (Math.random() * 0.1 - 0.05);
      const netDelta = ambientDrift + coolingEffect + noise;

      ch.temperature = parseFloat((ch.temperature + netDelta).toFixed(1));
      if (ch.temperature < -2.0) ch.temperature = -2.0;
      if (ch.temperature > 25.0) ch.temperature = 25.0;

      // Humidity fluctuation
      ch.humidity += Math.floor(Math.random() * 3) - 1;
      if (ch.humidity < 50) ch.humidity = 50;
      if (ch.humidity > 99) ch.humidity = 99;

      // Cooling control with hysteresis
      if (ch.temperature > target + HYSTERESIS) {
        ch.fanOn = true;
      } else if (ch.temperature <= target) {
        ch.fanOn = false;
      }

      // Chamber status calculation
      ch.status = computeChamberStatus(ch, crop);
    });

    // Record demo history
    pushHistoricalReading(now);

    updateUI();
  }, 3000);
}

// ============================================================================
// CHAMBER STATUS COMPUTATION
// ============================================================================
function computeChamberStatus(ch, crop) {
  // Check AI condition first
  if (ch.ai && ch.ai.overallCondition === 'SPOILED') return 'CRITICAL';
  if (ch.ai && ch.ai.overallCondition === 'WARNING') {
    // If also cooling, prioritize quality warning
    return 'QUALITY_WARNING';
  }

  // Temperature checks
  if (ch.temperature > crop.maxTemp + 3.0 || ch.temperature < crop.minTemp - 3.0) {
    return 'ATTENTION';
  }

  if (ch.fanOn) return 'COOLING';

  return 'NORMAL';
}

// ============================================================================
// FIREBASE REALTIME DATABASE LISTENERS
// ============================================================================
let firebaseListenersAttached = false;

function setupFirebaseListeners() {
  if (!dbInstance) return;
  if (firebaseListenersAttached) return; // Prevent attaching duplicate listeners
  firebaseListenersAttached = true;

  console.log("📡 Attaching Firebase Realtime Database Listeners for C1, C2, C3...");

  // Monitor live connection status via .info/connected
  dbInstance.ref('.info/connected').on('value', (snap) => {
    state.firebaseConnected = snap.val() === true;
    console.log(state.firebaseConnected ? "🟢 Firebase RTDB Connected!" : "🔴 Firebase RTDB Disconnected.");
    updateModePillUI();
  });

  ['C1', 'C2', 'C3'].forEach(id => {
    // Listen to current sensor data
    const currentPath = DB_PATHS[`${id}_CURRENT`];
    dbInstance.ref(currentPath).on('value', (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        console.log(`📥 Live reading received for ${id}:`, val);
        updateChamberFromFirebase(id, val);
      }
    });

    // Listen to configuration
    const configPath = DB_PATHS[`${id}_CONFIG`];
    dbInstance.ref(configPath).on('value', (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const ch = state.chambers[id];
        if (data.produceType !== undefined) ch.fruitType = data.produceType;
        if (data.temperatureMode !== undefined) ch.temperatureMode = data.temperatureMode;
        if (data.customTarget !== undefined) ch.customTarget = data.customTarget;
        if (data.activeTarget !== undefined) ch.targetTemperature = data.activeTarget;
        updateUI();
      }
    });

    // Listen to cooling status
    const coolingPath = DB_PATHS[`${id}_COOLING`];
    dbInstance.ref(coolingPath).on('value', (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.fan !== undefined) state.chambers[id].fanOn = data.fan;
        updateUI();
      }
    });

    // Listen to AI results
    const aiPath = DB_PATHS[`${id}_AI`];
    dbInstance.ref(aiPath).on('value', (snapshot) => {
      if (snapshot.exists()) {
        state.chambers[id].ai = snapshot.val();
        updateUI();
      }
    });

    // Legacy control paths (for ESP32 backward compatibility)
    const controlPath = DB_PATHS[`${id}_CONTROL`];
    dbInstance.ref(controlPath).on('value', (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.fanSpeed !== undefined) {
          state.chambers[id].fanOn = data.fanSpeed > 0;
        }
        updateUI();
      }
    });
  });

  // Listen to Historical Readings
  dbInstance.ref(DB_PATHS.READINGS).limitToLast(30).on('value', (snapshot) => {
    if (snapshot.exists()) {
      const records = Object.values(snapshot.val());
      state.readingsHistory = records;
      updateChartsData();
    }
  });
}

function updateChamberFromFirebase(chamberId, data) {
  const ch = state.chambers[chamberId];
  if (!ch || !data) return;

  if (data.fruitType !== undefined && data.fruitType !== null) ch.fruitType = data.fruitType;

  // Robust parsing of temperature (e.g. 30.3 or "30.3")
  if (data.temperature !== undefined && data.temperature !== null) {
    const parsedTemp = parseFloat(data.temperature);
    if (!isNaN(parsedTemp)) {
      ch.temperature = Math.round(parsedTemp * 10) / 10;
    }
  }

  // Robust parsing of humidity (e.g. 49.5 or "49.5")
  if (data.humidity !== undefined && data.humidity !== null) {
    const parsedHumid = parseFloat(data.humidity);
    if (!isNaN(parsedHumid)) {
      ch.humidity = Math.round(parsedHumid * 10) / 10;
    }
  }

  if (data.targetTemperature !== undefined && data.targetTemperature !== null) {
    const parsedTarget = parseFloat(data.targetTemperature);
    if (!isNaN(parsedTarget)) ch.targetTemperature = parsedTarget;
  }

  if (data.fanOn !== undefined && data.fanOn !== null) ch.fanOn = !!data.fanOn;
  if (data.fanSpeed !== undefined) ch.fanOn = data.fanSpeed > 0;

  // Recompute chamber status based on produce optimal temperature
  const crop = CROP_DATABASE[ch.fruitType] || CROP_DATABASE.other;
  ch.status = (data.status !== undefined && data.status !== null) ? data.status : computeChamberStatus(ch, crop);

  // Update timestamps
  const now = new Date();
  state.system.lastUpdated = now.toLocaleTimeString();

  // In live mode, add live reading to chart history so graphs update
  if (!state.demoMode) {
    pushHistoricalReading(now);
  }

  updateUI();
}

// ============================================================================
// UI RENDERING & DOM UPDATES
// ============================================================================
function updateUI() {
  updateChamberCard('C1');
  updateChamberCard('C2');
  updateChamberCard('C3');
  updateOverviewStatus();
  evaluateAlerts();
  updateHeaderTimestamp();
}

function updateHeaderTimestamp() {
  document.getElementById('lastUpdatedHeader').textContent = `Updated: ${state.system.lastUpdated}`;
}

function updateOverviewStatus() {
  const statuses = ['C1', 'C2', 'C3'].map(id => state.chambers[id].status);
  const dot = document.getElementById('overviewStatusDot');
  const text = document.getElementById('overviewStatusText');

  if (statuses.includes('CRITICAL')) {
    dot.className = 'dot offline';
    dot.style.backgroundColor = 'var(--status-critical)';
    dot.style.boxShadow = '0 0 10px var(--status-critical)';
    text.textContent = 'CRITICAL';
    text.style.color = 'var(--status-critical)';
  } else if (statuses.includes('QUALITY_WARNING') || statuses.includes('ATTENTION')) {
    dot.className = 'dot offline';
    dot.style.backgroundColor = 'var(--status-warning)';
    dot.style.boxShadow = '0 0 10px var(--status-warning)';
    text.textContent = 'NEEDS ATTENTION';
    text.style.color = 'var(--status-warning)';
  } else {
    dot.className = 'dot online';
    dot.style.backgroundColor = '';
    dot.style.boxShadow = '';
    text.textContent = 'ALL NORMAL';
    text.style.color = 'var(--status-normal)';
  }
}

function updateChamberCard(chamberId) {
  const ch = state.chambers[chamberId];
  const crop = CROP_DATABASE[ch.fruitType] || CROP_DATABASE.other;
  const p = chamberId.toLowerCase(); // 'c1', 'c2', 'c3'

  // Crop Pill
  const cropIconEl = document.getElementById(`${p}CropIcon`);
  const cropNameEl = document.getElementById(`${p}CropName`);
  if (cropIconEl) cropIconEl.textContent = crop.icon;
  if (cropNameEl) cropNameEl.textContent = crop.name.split('/')[0].trim();

  // Sensor Values
  const tempEl = document.getElementById(`${p}Temp`);
  const humidEl = document.getElementById(`${p}Humidity`);
  if (tempEl) tempEl.textContent = ch.temperature !== null ? ch.temperature : '--';
  if (humidEl) humidEl.textContent = ch.humidity !== null ? ch.humidity : '--';

  // Target Temp
  const targetEl = document.getElementById(`${p}TargetTemp`);
  if (targetEl) targetEl.textContent = `${ch.targetTemperature}°C`;

  // Temperature Source
  const sourceEl = document.getElementById(`${p}TempSource`);
  if (sourceEl) sourceEl.textContent = ch.temperatureMode === 'custom' ? 'Custom' : 'Recommended';

  // Temperature Status
  const tempStatusEl = document.getElementById(`${p}TempStatus`);
  if (tempStatusEl) {
    if (ch.temperature > crop.maxTemp + 1.5) {
      tempStatusEl.textContent = 'TOO WARM';
      tempStatusEl.style.color = 'var(--accent-rose)';
    } else if (ch.temperature < crop.minTemp - 1.5) {
      tempStatusEl.textContent = 'TOO COLD';
      tempStatusEl.style.color = 'var(--accent-blue)';
    } else if (ch.fanOn) {
      tempStatusEl.textContent = 'COOLING';
      tempStatusEl.style.color = 'var(--accent-cyan)';
    } else {
      tempStatusEl.textContent = 'NORMAL';
      tempStatusEl.style.color = 'var(--primary)';
    }
  }

  // Fan Status
  const fanStatusEl = document.getElementById(`${p}FanStatus`);
  if (fanStatusEl) {
    if (ch.fanOn) {
      fanStatusEl.innerHTML = '<i class="fa-solid fa-fan fan-spinning" style="color:var(--accent-cyan);"></i> ON';
    } else {
      fanStatusEl.innerHTML = '<i class="fa-solid fa-fan" style="color:var(--text-muted);"></i> OFF';
    }
  }

  // Chamber Status Bar
  const statusBar = document.getElementById(`${p}StatusBar`);
  const statusText = document.getElementById(`${p}ChamberStatus`);
  if (statusBar && statusText) {
    // Recalculate status
    ch.status = computeChamberStatus(ch, crop);
    statusText.textContent = ch.status.replace('_', ' ');

    statusBar.className = 'chamber-status-bar';
    switch (ch.status) {
      case 'COOLING':
        statusBar.classList.add('cooling');
        statusBar.querySelector('i').className = 'fa-solid fa-snowflake';
        break;
      case 'ATTENTION':
        statusBar.classList.add('attention');
        statusBar.querySelector('i').className = 'fa-solid fa-triangle-exclamation';
        break;
      case 'QUALITY_WARNING':
        statusBar.classList.add('quality-warning');
        statusBar.querySelector('i').className = 'fa-solid fa-eye';
        break;
      case 'CRITICAL':
        statusBar.classList.add('critical');
        statusBar.querySelector('i').className = 'fa-solid fa-circle-xmark';
        break;
      default:
        statusBar.querySelector('i').className = 'fa-solid fa-circle-check';
    }
  }

  // Produce Condition (from AI)
  const conditionBadge = document.getElementById(`${p}ConditionBadge`);
  const conditionSummary = document.getElementById(`${p}ConditionSummary`);
  if (conditionBadge && conditionSummary) {
    if (ch.ai && ch.ai.overallCondition) {
      const condition = ch.ai.overallCondition.toUpperCase();
      conditionBadge.textContent = condition;
      conditionBadge.className = 'condition-badge';
      if (condition === 'GOOD') conditionBadge.classList.add('good');
      else if (condition === 'WARNING') conditionBadge.classList.add('warning');
      else if (condition === 'SPOILED') conditionBadge.classList.add('spoiled');
      conditionSummary.textContent = ch.ai.summary || 'AI analysis complete.';
    } else {
      conditionBadge.textContent = '—';
      conditionBadge.className = 'condition-badge good';
      conditionSummary.textContent = 'No AI assessment yet';
    }
  }

  // Last Updated
  const lastUpdEl = document.getElementById(`${p}LastUpdated`);
  if (lastUpdEl) {
    if (ch.ai && ch.ai.lastChecked) {
      lastUpdEl.textContent = `AI: ${ch.ai.lastChecked} | Sensors: ${state.system.lastUpdated}`;
    } else {
      lastUpdEl.textContent = state.system.lastUpdated;
    }
  }
}

// ============================================================================
// CROP SELECTION & TEMPERATURE MODE HANDLERS
// ============================================================================
function onCropSelectChange(chamberId) {
  const p = chamberId.toLowerCase();
  const select = document.getElementById(`${p}CropSelect`);
  if (!select) return;
  const cropKey = select.value;
  const crop = CROP_DATABASE[cropKey] || CROP_DATABASE.other;

  const catEl = document.getElementById(`${p}RecCategory`);
  const tempEl = document.getElementById(`${p}RecTemp`);
  const optEl = document.getElementById(`${p}RecOptimalTemp`);
  const humEl = document.getElementById(`${p}RecHumidity`);
  const lifeEl = document.getElementById(`${p}RecLife`);

  if (catEl) catEl.textContent = crop.category;
  if (tempEl) tempEl.textContent = `${crop.minTemp}°C - ${crop.maxTemp}°C`;
  if (optEl) optEl.textContent = `${crop.optimalTemp}°C`;
  if (humEl) humEl.textContent = `${crop.minHumidity}% - ${crop.maxHumidity}%`;
  if (lifeEl) lifeEl.textContent = crop.storageLife;
}

function onTempModeChange(chamberId) {
  const p = chamberId.toLowerCase();
  const mode = document.querySelector(`input[name="${p}TempMode"]:checked`).value;
  const customBox = document.getElementById(`${p}CustomTempBox`);

  if (mode === 'custom') {
    customBox.style.display = 'flex';
  } else {
    customBox.style.display = 'none';
  }
}

function applyCropSettings(chamberId) {
  const p = chamberId.toLowerCase();
  const select = document.getElementById(`${p}CropSelect`);
  const cropKey = select.value;
  const crop = CROP_DATABASE[cropKey] || CROP_DATABASE.other;

  const ch = state.chambers[chamberId];
  ch.fruitType = cropKey;

  // Temperature mode
  const mode = document.querySelector(`input[name="${p}TempMode"]:checked`).value;
  ch.temperatureMode = mode;

  if (mode === 'custom') {
    const customInput = document.getElementById(`${p}CustomTempInput`);
    const customVal = parseFloat(customInput.value);
    if (isNaN(customVal)) {
      alert('Please enter a valid custom temperature.');
      return;
    }
    ch.customTarget = customVal;
    ch.targetTemperature = customVal;
  } else {
    ch.customTarget = null;
    ch.targetTemperature = crop.optimalTemp;
  }

  // Write to Firebase if in live mode
  if (!state.demoMode && dbInstance) {
    const configPath = DB_PATHS[`${chamberId}_CONFIG`];
    dbInstance.ref(configPath).update({
      produceType: cropKey,
      category: crop.category,
      temperatureMode: mode,
      predefinedTarget: crop.optimalTemp,
      customTarget: ch.customTarget,
      activeTarget: ch.targetTemperature
    });

    // Also update current node for ESP32
    const currentPath = DB_PATHS[`${chamberId}_CURRENT`];
    dbInstance.ref(currentPath).update({
      fruitType: cropKey,
      targetTemperature: ch.targetTemperature
    });
  }

  showToast(`${chamberId}: ${crop.name} → Target ${ch.targetTemperature}°C (${mode})`);
  updateUI();
}

// ============================================================================
// SMART ALERT ENGINE
// ============================================================================
function evaluateAlerts() {
  const newAlerts = [];
  const now = new Date().toLocaleTimeString();

  ['C1', 'C2', 'C3'].forEach(id => {
    const ch = state.chambers[id];
    const crop = CROP_DATABASE[ch.fruitType] || CROP_DATABASE.other;

    if (ch.temperature !== null) {
      if (ch.temperature > crop.maxTemp + 1.5) {
        newAlerts.push({
          id: `${id}-temp-high`,
          type: 'warning',
          title: `${id} Temperature Above Target`,
          desc: `Current: ${ch.temperature}°C exceeds recommended range for ${crop.name} (${crop.minTemp}–${crop.maxTemp}°C).`,
          time: now
        });
      } else if (ch.temperature < crop.minTemp - 1.5) {
        newAlerts.push({
          id: `${id}-temp-low`,
          type: 'critical',
          title: `${id} Chilling Risk Warning`,
          desc: `Current: ${ch.temperature}°C is below safe minimum (${crop.minTemp}°C) for ${crop.name}.`,
          time: now
        });
      }
    }

    if (ch.humidity !== null && (ch.humidity < crop.minHumidity - 10 || ch.humidity > crop.maxHumidity + 5)) {
      newAlerts.push({
        id: `${id}-humidity-dev`,
        type: 'info',
        title: `${id} Humidity Outside Range`,
        desc: `Humidity at ${ch.humidity}% (recommended: ${crop.minHumidity}–${crop.maxHumidity}%).`,
        time: now
      });
    }

    // AI quality alerts
    if (ch.ai) {
      if (ch.ai.overallCondition === 'SPOILED') {
        newAlerts.push({
          id: `${id}-ai-spoiled`,
          type: 'critical',
          title: `${id} Produce Spoilage Detected`,
          desc: ch.ai.summary || 'AI detected significant visible deterioration.',
          time: now
        });
      } else if (ch.ai.overallCondition === 'WARNING') {
        newAlerts.push({
          id: `${id}-ai-warning`,
          type: 'warning',
          title: `${id} Produce Quality Warning`,
          desc: ch.ai.summary || 'AI detected early signs of deterioration.',
          time: now
        });
      }
    }
  });

  if (newAlerts.length === 0) {
    newAlerts.push({
      id: 'system-nominal',
      type: 'info',
      title: 'All Chambers Operating Normally',
      desc: 'Temperatures, humidity, and produce conditions are within acceptable ranges.',
      time: now
    });
  }

  state.alerts = newAlerts;

  // Render
  const feed = document.getElementById('alertFeedList');
  if (feed) {
    feed.innerHTML = state.alerts.map(a => `
      <div class="alert-item ${a.type}">
        <div class="alert-icon">
          <i class="fa-solid ${a.type === 'critical' ? 'fa-circle-xmark' : a.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
        </div>
        <div class="alert-content">
          <span class="alert-title">${a.title}</span>
          <span class="alert-desc">${a.desc}</span>
        </div>
        <span class="alert-time">${a.time}</span>
      </div>
    `).join('');
  }

  // Badge count
  const criticalCount = state.alerts.filter(a => a.type === 'warning' || a.type === 'critical').length;
  const badge = document.getElementById('alertBadgeCount');
  if (badge) badge.textContent = criticalCount;

  // Web alarm
  if (criticalCount > 0) {
    startWebAlarm();
  } else {
    stopWebAlarm();
  }
}

// ============================================================================
// AI VISUAL QUALITY ASSESSMENT — CAMERA & IMAGE CAPTURE
// ============================================================================
function openCameraForChamber(chamberId) {
  activeCameraChamberId = chamberId;
  capturedImageDataUrl = null;

  const crop = CROP_DATABASE[state.chambers[chamberId].fruitType] || CROP_DATABASE.other;
  const modal = document.getElementById('cameraModal');
  const title = document.getElementById('cameraModalTitle');
  title.innerHTML = `<i class="fa-solid fa-camera"></i> ${chamberId} — ${crop.name} Visual Quality Check`;

  // Reset UI
  document.getElementById('cameraPreview').style.display = 'block';
  document.getElementById('capturedImage').style.display = 'none';
  document.getElementById('captureBtn').style.display = 'inline-flex';
  document.getElementById('analyzeBtn').style.display = 'none';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('aiResultPanel').style.display = 'none';
  document.getElementById('aiLoading').style.display = 'none';

  modal.style.display = 'flex';

  // Start camera
  startCamera();
}

async function startCamera() {
  try {
    const video = document.getElementById('cameraPreview');
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    video.srcObject = cameraStream;
  } catch (err) {
    console.error("Camera access error:", err);
    alert("⚠️ Could not access camera. Please allow camera permissions.");
    closeCameraModal();
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function captureImage() {
  const video = document.getElementById('cameraPreview');
  const canvas = document.getElementById('captureCanvas');
  const capturedImg = document.getElementById('capturedImage');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  capturedImageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // Stop camera
  stopCamera();

  // Show captured image
  video.style.display = 'none';
  capturedImg.src = capturedImageDataUrl;
  capturedImg.style.display = 'block';

  // Show analyze / retake buttons
  document.getElementById('captureBtn').style.display = 'none';
  document.getElementById('analyzeBtn').style.display = 'inline-flex';
  document.getElementById('retakeBtn').style.display = 'inline-flex';
}

function retakeImage() {
  capturedImageDataUrl = null;
  document.getElementById('cameraPreview').style.display = 'block';
  document.getElementById('capturedImage').style.display = 'none';
  document.getElementById('captureBtn').style.display = 'inline-flex';
  document.getElementById('analyzeBtn').style.display = 'none';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('aiResultPanel').style.display = 'none';
  startCamera();
}

function closeCameraModal() {
  stopCamera();
  document.getElementById('cameraModal').style.display = 'none';
  activeCameraChamberId = null;
  capturedImageDataUrl = null;
}

// Direct Gemini Vision API integration (used when Cloud Functions are not deployed or on Spark plan)
const GEMINI_DIRECT_API_KEY = "AQ.Ab8RN6Ja5G_pRKlpIJ4PUt_ZSQnFqaQPnrm55vP7UukefibSlA";

async function callGeminiVisionDirect(produceType, imageBase64) {
  const prompt = `You are an expert computer-vision AI quality inspector for smart fruit & vegetable cold storage chambers.

Target produce: ${produceType || "Produce"}.

STRICT INSTRUCTIONS:
1. COUNTING (CRITICAL — DO NOT GUESS OR ESTIMATE):
- Count ONLY the actual, distinct individual pieces of ${produceType || "produce"} that are clearly visible in the camera frame.
- Count each item one by one.
- If only 3 tomatoes are visible in the photo, totalDetected MUST BE EXACTLY 3.
- Ignore container borders, white Styrofoam, background surfaces, or shadows — count ONLY individual produce items.
- Never report large batch numbers (like 10, 14, 20) unless you can visually count that exact number of separate fruits.

2. VISUAL QUALITY ASSESSMENT:
- Inspect each visible produce item for: dark spots, bruising, wrinkles/shriveling, mold, rot, skin breaks, or discoloration.
- Categorize the visible items:
  * goodCount: healthy, intact skin, fresh appearance
  * warningCount: minor spots, slight wrinkles, early color change
  * spoiledCount: severe rot, black mold, fungus, collapsed tissue
- MATHEMATICAL RULE: goodCount + warningCount + spoiledCount MUST equal totalDetected.

3. OVERALL CONDITION:
- "GOOD": If the majority of items are fresh with zero spoiled items.
- "WARNING": If minor defects or warning items are present.
- "SPOILED": If any item shows rot or mold.

Respond ONLY with a JSON object in this exact structure:
{
  "overallCondition": "GOOD or WARNING or SPOILED",
  "summary": "Short concise sentence mentioning the exact number of produce items seen and their visual condition (e.g. '3 fresh, ripe tomatoes detected with clean red skin and no signs of decay.')",
  "totalDetected": 3,
  "goodCount": 3,
  "warningCount": 0,
  "spoiledCount": 0,
  "confidence": 95
}`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_DIRECT_API_KEY}`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: "image/jpeg",
            data: imageBase64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1, // Low temperature for high precision and zero hallucination
      maxOutputTokens: 2048, // Generous budget so thinking tokens do not truncate JSON
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 } // Immediate response without thinking token overhead
    }
  };

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  let responseText = "";
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const textPart = data.candidates[0].content.parts.find(p => !p.thought && p.text) || data.candidates[0].content.parts[0];
    responseText = textPart ? (textPart.text || "") : "";
  }

  let cleanJson = responseText.trim();
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  const parsed = JSON.parse(cleanJson);
  const validConditions = ["GOOD", "WARNING", "SPOILED"];
  if (!validConditions.includes((parsed.overallCondition || "").toUpperCase())) {
    parsed.overallCondition = "WARNING";
  } else {
    parsed.overallCondition = parsed.overallCondition.toUpperCase();
  }

  parsed.totalDetected = parseInt(parsed.totalDetected) || 0;
  parsed.goodCount = parseInt(parsed.goodCount) || 0;
  parsed.warningCount = parseInt(parsed.warningCount) || 0;
  parsed.spoiledCount = parseInt(parsed.spoiledCount) || 0;

  // Sanity check for item sum
  const sum = parsed.goodCount + parsed.warningCount + parsed.spoiledCount;
  if (parsed.totalDetected !== sum) {
    if (parsed.totalDetected > 0 && sum === 0) {
      parsed.goodCount = parsed.totalDetected;
    } else {
      parsed.totalDetected = sum;
    }
  }

  let conf = parseInt(parsed.confidence);
  if (isNaN(conf)) {
    if (typeof parsed.confidence === "string" && parsed.confidence.toLowerCase().includes("high")) conf = 95;
    else if (typeof parsed.confidence === "string" && parsed.confidence.toLowerCase().includes("med")) conf = 80;
    else conf = 85;
  }
  parsed.confidence = Math.min(100, Math.max(0, conf));

  return { success: true, data: parsed };
}

async function analyzeImage() {
  if (!capturedImageDataUrl || !activeCameraChamberId) return;

  const chamberId = activeCameraChamberId;
  const ch = state.chambers[chamberId];
  const crop = CROP_DATABASE[ch.fruitType] || CROP_DATABASE.other;

  document.getElementById('analyzeBtn').style.display = 'none';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('aiLoading').style.display = 'flex';
  document.getElementById('aiResultPanel').style.display = 'none';

  try {
    let result = null;

    // 1. Try backend Cloud Function first (if deployed on Blaze)
    try {
      const response = await fetch('/api/analyzeImage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chamberId: chamberId,
          produceType: crop.name,
          imageBase64: capturedImageDataUrl.split(',')[1] // strip data:image/jpeg;base64,
        })
      });

      if (response.ok) {
        result = await response.json();
      } else {
        console.warn(`Backend /api/analyzeImage returned ${response.status} — using direct Gemini Vision API.`);
      }
    } catch (backendErr) {
      console.warn("Backend /api/analyzeImage unreachable — using direct Gemini Vision API:", backendErr);
    }

    // 2. If backend was not available (e.g. 404 on Spark plan), call Gemini Vision API directly
    if (!result || !result.success) {
      console.log("Analyzing with Gemini Vision API...");
      result = await callGeminiVisionDirect(crop.name, capturedImageDataUrl.split(',')[1]);
    }

    if (result && result.success && result.data) {
      const aiData = result.data;
      const timeNow = new Date().toLocaleTimeString();

      // Store in state
      ch.ai = {
        overallCondition: aiData.overallCondition || 'WARNING',
        summary: aiData.summary || 'Analysis complete.',
        totalDetected: aiData.totalDetected || 0,
        goodCount: aiData.goodCount || 0,
        warningCount: aiData.warningCount || 0,
        spoiledCount: aiData.spoiledCount || 0,
        confidence: aiData.confidence || 0,
        lastChecked: timeNow,
        imageUrl: aiData.imageUrl || null
      };

      // Store in Firebase Realtime Database so all devices see the AI update
      if (dbInstance) {
        const aiPath = DB_PATHS[`${chamberId}_AI`];
        dbInstance.ref(aiPath).set(ch.ai);
      }

      // Display AI result
      displayAIResult(ch.ai);
      updateUI();
      showToast(`${chamberId} AI Analysis: ${ch.ai.overallCondition}`);
    } else {
      throw new Error((result && result.error) || 'Unknown error from AI service');
    }
  } catch (err) {
    console.error("AI analysis error:", err);
    alert(`AI Analysis error: ${err.message || 'Error communicating with AI service.'}\nPlease retake the photo and try again.`);
    document.getElementById('analyzeBtn').style.display = 'inline-flex';
    document.getElementById('retakeBtn').style.display = 'inline-flex';
  } finally {
    document.getElementById('aiLoading').style.display = 'none';
  }
}

function generateDemoAIResult(produceName) {
  const conditions = ['GOOD', 'WARNING', 'GOOD', 'GOOD', 'WARNING'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const total = Math.floor(Math.random() * 15) + 5;
  const spoiled = condition === 'WARNING' ? Math.floor(Math.random() * 2) : 0;
  const warning = condition === 'WARNING' ? Math.floor(Math.random() * 3) + 1 : 0;
  const good = total - warning - spoiled;
  
  return {
    overallCondition: condition,
    summary: condition === 'GOOD' 
      ? `The ${produceName} appears generally healthy with no obvious signs of deterioration.`
      : `Some visible discoloration or surface damage was detected among the ${produceName}.`,
    totalDetected: total,
    goodCount: good,
    warningCount: warning,
    spoiledCount: spoiled,
    confidence: Math.floor(Math.random() * 15) + 80,
    lastChecked: new Date().toLocaleTimeString(),
    imageUrl: null
  };
}

function displayAIResult(aiData) {
  const panel = document.getElementById('aiResultPanel');
  panel.style.display = 'block';

  // Overall Condition
  const overallEl = document.getElementById('aiOverallCondition');
  overallEl.textContent = aiData.overallCondition;
  if (aiData.overallCondition === 'GOOD') {
    overallEl.style.color = 'var(--status-normal)';
  } else if (aiData.overallCondition === 'WARNING') {
    overallEl.style.color = 'var(--status-warning)';
  } else {
    overallEl.style.color = 'var(--status-critical)';
  }

  document.getElementById('aiSummary').textContent = aiData.summary || '—';
  document.getElementById('aiTotalCount').textContent = aiData.totalDetected || '—';
  document.getElementById('aiGoodCount').textContent = aiData.goodCount !== undefined ? aiData.goodCount : '—';
  document.getElementById('aiWarningCount').textContent = aiData.warningCount !== undefined ? aiData.warningCount : '—';
  document.getElementById('aiSpoiledCount').textContent = aiData.spoiledCount !== undefined ? aiData.spoiledCount : '—';
  document.getElementById('aiConfidence').textContent = aiData.confidence ? `${aiData.confidence}%` : '—';
  document.getElementById('aiCheckedAt').textContent = aiData.lastChecked || '—';
}

// ============================================================================
// ANALYTICS & CHART.JS ENGINE
// ============================================================================
function generateInitialHistoryData() {
  const history = [];
  const baseTime = Date.now() - 3600 * 1000;

  for (let i = 0; i < 20; i++) {
    const t = new Date(baseTime + i * 180 * 1000);
    history.push({
      timestamp: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      c1Temp: parseFloat((14.5 + Math.sin(i * 0.3) * 0.8).toFixed(1)),
      c2Temp: parseFloat((8.2 + Math.cos(i * 0.4) * 0.6).toFixed(1)),
      c3Temp: parseFloat((4.0 + Math.sin(i * 0.5) * 0.5).toFixed(1)),
      c1Humidity: Math.floor(72 + Math.sin(i * 0.3) * 4),
      c2Humidity: Math.floor(80 + Math.cos(i * 0.3) * 3),
      c3Humidity: Math.floor(88 + Math.sin(i * 0.4) * 3)
    });
  }

  state.readingsHistory = history;
}

function pushHistoricalReading(dateObj) {
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  state.readingsHistory.push({
    timestamp: timeStr,
    c1Temp: state.chambers.C1.temperature,
    c2Temp: state.chambers.C2.temperature,
    c3Temp: state.chambers.C3.temperature,
    c1Humidity: state.chambers.C1.humidity,
    c2Humidity: state.chambers.C2.humidity,
    c3Humidity: state.chambers.C3.humidity
  });

  if (state.readingsHistory.length > 30) {
    state.readingsHistory.shift();
  }

  updateChartsData();
}

function initCharts() {
  if (typeof Chart === 'undefined') return;

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
    },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
    }
  };

  // Temperature Chart
  const ctxTemp = document.getElementById('tempChart');
  if (ctxTemp) {
    state.charts.temp = new Chart(ctxTemp.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'C1 Temp (°C)', borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', data: [], tension: 0.4 },
          { label: 'C2 Temp (°C)', borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.1)', data: [], tension: 0.4 },
          { label: 'C3 Temp (°C)', borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', data: [], tension: 0.4 }
        ]
      },
      options: chartDefaults
    });
  }

  // Humidity Chart
  const ctxHum = document.getElementById('humidityChart');
  if (ctxHum) {
    state.charts.humidity = new Chart(ctxHum.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'C1 Humidity (%)', borderColor: '#34d399', data: [], tension: 0.4 },
          { label: 'C2 Humidity (%)', borderColor: '#06b6d4', data: [], tension: 0.4 },
          { label: 'C3 Humidity (%)', borderColor: '#a78bfa', data: [], tension: 0.4 }
        ]
      },
      options: chartDefaults
    });
  }

  updateChartsData();
}

function updateChartsData() {
  if (!state.charts.temp) return;

  const labels = state.readingsHistory.map(r => r.timestamp);

  // Temp Chart
  state.charts.temp.data.labels = labels;
  state.charts.temp.data.datasets[0].data = state.readingsHistory.map(r => r.c1Temp);
  state.charts.temp.data.datasets[1].data = state.readingsHistory.map(r => r.c2Temp);
  state.charts.temp.data.datasets[2].data = state.readingsHistory.map(r => r.c3Temp);
  state.charts.temp.update();

  // Humidity Chart
  if (state.charts.humidity) {
    state.charts.humidity.data.labels = labels;
    state.charts.humidity.data.datasets[0].data = state.readingsHistory.map(r => r.c1Humidity);
    state.charts.humidity.data.datasets[1].data = state.readingsHistory.map(r => r.c2Humidity);
    state.charts.humidity.data.datasets[2].data = state.readingsHistory.map(r => r.c3Humidity);
    state.charts.humidity.update();
  }
}

// ============================================================================
// NAVIGATION & UI UTILITIES
// ============================================================================
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab, .mobile-nav-btn');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');

      document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === targetId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      document.querySelectorAll('.tab-content').forEach(sec => {
        if (sec.id === targetId) {
          sec.classList.add('active');
          sec.style.display = 'block';
        } else {
          sec.classList.remove('active');
          sec.style.display = 'none';
        }
      });
    });
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 70px;
    right: 20px;
    background: rgba(16, 185, 129, 0.95);
    color: #ffffff;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s ease;
    max-width: 350px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============================================================================
// FIREBASE CLOUD MESSAGING (FCM) — Preserved for phone push notifications
// ============================================================================
let fcmMessagingInstance = null;
let currentFcmToken = localStorage.getItem('fcm_token') || null;

function checkServiceWorkerAndFcmStatus() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log("✅ FCM Service Worker registered:", registration.scope);
        const savedToken = localStorage.getItem('fcm_token');
        if (savedToken) {
          currentFcmToken = savedToken;
        }
      })
      .catch((error) => {
        console.warn("⚠️ FCM Service Worker error:", error);
      });
  }
}

// Initialize FCM check if page is served from Firebase Hosting
try {
  checkServiceWorkerAndFcmStatus();
} catch (e) {
  console.warn("FCM initialization skipped:", e);
}
