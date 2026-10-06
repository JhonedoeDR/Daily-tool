/* =========================================================
   Service Worker(1つに統合)
   - オフライン対応(静的アセットのキャッシュ)
   - アプリ外プッシュ通知の受信・表示(Firebase Cloud Messaging)
   同じscopeにService Workerは1つしか置けないため、通知処理もここに入れる
   ========================================================= */

// --- Firebase Cloud Messaging(バックグラウンド通知の受信) ---
try {
  importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyAjcD8w1rMolAw_q3f6n02B2N8JJuhgFB0',
    authDomain: 'dailytool-3414b.firebaseapp.com',
    projectId: 'dailytool-3414b',
    storageBucket: 'dailytool-3414b.firebasestorage.app',
    messagingSenderId: '832994228236',
    appId: '1:832994228236:web:374f1ed1ba4a8a394a1629',
  });

  const messaging = firebase.messaging();

  // サーバーからは data のみのメッセージを送る。表示はここで必ず1回だけ行う
  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    const title = d.title || '通知';
    const body = d.body || '';
    return self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
    });
  });
} catch (e) {
  // オフライン等でFirebaseの読み込みに失敗しても、キャッシュ機能は動かす
  console.error('Firebase messaging init failed', e);
}

// 通知をタップしたらアプリを開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// --- オフライン用キャッシュ ---
const CACHE_NAME = 'lm-cache-v23';
const ASSETS = [
  './',
  './index.html',
  './schedule.html',
  './belongings.html',
  './time-calc.html',
  './shift.html',
  './wishlist.html',
  './event.html',
  './todo.html',
  './style.css',
  './app.js',
  './renderNav-menu.js',
  './firebase-sync.js',
  './home.js',
  './schedule.js',
  './belongings.js',
  './time-calc.js',
  './shift.js',
  './wishlist.js',
  './event.js',
  './todo.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先、失敗したらキャッシュにフォールバック
// 別ドメイン(Firebase等)への通信には触らない
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
