/**
 * SMART FRUIT & VEGETABLE COLD STORAGE MANAGEMENT SYSTEM
 * Firebase Configuration & Integration Layer
 * 
 * Firebase Project: ColdStorage
 * Realtime Database URL: https://coldstorage-c5f65-default-rtdb.asia-southeast1.firebasedatabase.app
 * Region: Singapore / asia-southeast1
 * 
 * IMPORTANT INSTRUCTION FOR USER:
 * Replace "YOUR_API_KEY" and other placeholder fields below with your actual Firebase Web App credentials.
 * You can get these credentials from:
 * Firebase Console -> Project Settings -> General -> Your Apps -> Web App configuration.
 * 
 * Note: Firebase security rules must be secured before production deployment.
 */

const firebaseConfig = {
  apiKey: "AIzaSyCQ-orNKRMoDAyrAOWDJs6Q-ux-pg8QRz4",
  authDomain: "coldstorage-c5f65.firebaseapp.com",
  databaseURL: "https://coldstorage-c5f65-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coldstorage-c5f65",
  storageBucket: "coldstorage-c5f65.firebasestorage.app",
  messagingSenderId: "904380582110",
  appId: "1:904380582110:web:cedd42d87f5a5d9d5a9a4f",
  measurementId: "G-FZHHM5C9HK"
};


// Database Node Paths as per System Schema (3-Chamber Architecture)
const DB_PATHS = {
  // Chamber current sensor readings
  C1_CURRENT: 'chambers/C1/current',
  C2_CURRENT: 'chambers/C2/current',
  C3_CURRENT: 'chambers/C3/current',

  // Chamber configuration (produce type, temperature mode, targets)
  C1_CONFIG: 'chambers/C1/configuration',
  C2_CONFIG: 'chambers/C2/configuration',
  C3_CONFIG: 'chambers/C3/configuration',

  // Chamber cooling control (fan status)
  C1_COOLING: 'chambers/C1/cooling',
  C2_COOLING: 'chambers/C2/cooling',
  C3_COOLING: 'chambers/C3/cooling',

  // Chamber AI visual assessment results
  C1_AI: 'chambers/C1/ai',
  C2_AI: 'chambers/C2/ai',
  C3_AI: 'chambers/C3/ai',

  // Legacy control paths (preserved for ESP32 backward compatibility)
  C1_CONTROL: 'control/C1',
  C2_CONTROL: 'control/C2',
  C3_CONTROL: 'control/C3',

  // Historical readings & system
  READINGS: 'readings',
  SYSTEM: 'system',
  FCM_TOKENS: 'fcm_tokens',
  NOTIFICATION_COOLDOWNS: 'notification_cooldowns'
};

// Web Push VAPID Key Placeholder (Found in Firebase Console -> Project Settings -> Cloud Messaging -> Web Configuration)
const FCM_VAPID_KEY = "YOUR_FCM_VAPID_KEY";

let dbInstance = null;
let isFirebaseInitialized = false;

/**
 * Checks if Firebase API credentials are provided (i.e., user pasted real keys)
 */
function isFirebaseConfigured() {
  return firebaseConfig.apiKey && 
         firebaseConfig.apiKey !== "YOUR_API_KEY" && 
         firebaseConfig.apiKey.trim() !== "";
}

/**
 * Initializes Firebase App and Database using Firebase SDK Compat
 */
function initFirebaseApp() {
  if (!isFirebaseConfigured()) {
    console.warn("⚠️ Firebase configuration incomplete or using default placeholders. Falling back to DEMO MODE.");
    return false;
  }

  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      dbInstance = firebase.database();
      isFirebaseInitialized = true;
      console.log("✅ Firebase initialized successfully connected to:", firebaseConfig.databaseURL);
      return true;
    } else {
      console.warn("⚠️ Firebase SDK not loaded in window. Falling back to DEMO MODE.");
      return false;
    }
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    isFirebaseInitialized = false;
    return false;
  }
}
