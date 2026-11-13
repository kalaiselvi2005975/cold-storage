/**
 * CROP-AWARE PREDICTIVE MULTI-CHAMBER SMART COLD STORAGE
 * Firebase Cloud Messaging (FCM) Web Push Service Worker
 * 
 * Handles background push notifications when the dashboard website is closed,
 * minimized, or when the phone screen is locked.
 */

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase Configuration matching Web App credentials
const firebaseConfig = {
  apiKey: "AIzaSyCQ-orNKRMoDAyrAOWDJs6Q-ux-pg8QRz4",
  authDomain: "coldstorage-c5f65.firebaseapp.com",
  databaseURL: "https://coldstorage-c5f65-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coldstorage-c5f65",
  storageBucket: "coldstorage-c5f65.firebasestorage.app",
  messagingSenderId: "904380582110",
  appId: "1:904380582110:web:cedd42d87f5a5d9d5a9a4f"
};

// Initialize Firebase App in Service Worker context
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Background Message Handler for FCM Web Push
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background FCM payload:', payload);

  const title = (payload.notification && payload.notification.title) || 
                (payload.data && payload.data.title) || 
                "🚨 Smart Cold Storage Alert";

  const body = (payload.notification && payload.notification.body) || 
               (payload.data && payload.data.body) || 
               "New temperature/humidity alert detected.";

  const icon = (payload.notification && payload.notification.icon) || 
               (payload.data && payload.data.icon) || 
               "https://cdn-icons-png.flaticon.com/512/2913/2913524.png";

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: icon,
    tag: (payload.data && payload.data.tag) || 'cold-storage-alert',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Notification Click Listener - opens dashboard on click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
