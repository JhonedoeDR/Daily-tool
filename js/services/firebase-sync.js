import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { arrayUnion, doc, getFirestore, setDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { getMessaging, getToken } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAjcD8w1rMolAw_q3f6n02B2N8JJuhgFB0',
  authDomain: 'dailytool-3414b.firebaseapp.com',
  projectId: 'dailytool-3414b',
  storageBucket: 'dailytool-3414b.firebasestorage.app',
  messagingSenderId: '832994228236',
  appId: '1:832994228236:web:374f1ed1ba4a8a394a1629',
};

// Firebaseコンソール > プロジェクトの設定 > Cloud Messaging > ウェブ プッシュ証明書 で発行したVAPIDキー
const VAPID_KEY = 'BExAl_zmANkdrShHTTNzV_79GzjwuESS4Yi9eNzt89BNRLrFj2Ttk7CrXEHv92ozd7GSFhEOmjw38DenaOeI0NU';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const stateRef = doc(db, 'notify', 'state');

// データ変換層: 通知判定に必要な項目だけをローカル状態から組み立てる。
function readLocalJson(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw);
}

function buildTodoManagerSnapshot() {
  const raw = readLocalJson('lm_todoManager', null);
  if (!raw || !Array.isArray(raw.tasks)) return [];
  return raw.tasks.filter((task) => task && typeof task === 'object').map((task) => ({
    id: String(task.id || ''),
    category: ['main', 'routine', 'other'].includes(task.category) ? task.category : 'other',
    name: String(task.name || '').slice(0, 200),
    checked: !!task.checked,
    checkedDay: String(task.checkedDay || ''),
    routinePeriod: ['daily', 'weekdays', 'weekly', 'monthly'].includes(task.routinePeriod) ? task.routinePeriod : 'daily',
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(task.startDate || '') ? task.startDate : '',
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(task.endDate || '') ? task.endDate : '',
    createdAt: Number(task.createdAt) || 0,
    archivedAt: Number(task.archivedAt) || 0,
    notifications: {
      weekdays: (Array.isArray(task.notifications?.weekdays) ? task.notifications.weekdays : [])
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      times: (Array.isArray(task.notifications?.times) ? task.notifications.times : [])
        .filter((time) => /^([01]\d|2[0-3]):00$/.test(time)),
      custom: (Array.isArray(task.notifications?.custom) ? task.notifications.custom : [])
        .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || ''))
        .map((item) => ({ date: item.date, time: item.time })),
    },
  })).filter((task) => task.id && task.name);
}

function buildGameReminders() {
  return readLocalJson('lm_gameReminders', [])
    .filter((game) => game && game.notifyEnabled === true)
    .map((game) => ({
      id: String(game.id || ''),
      name: String(game.name || '').slice(0, 120),
      lastLoginDate: /^\d{4}-\d{2}-\d{2}$/.test(game.lastLoginDate || '') ? game.lastLoginDate : '',
      reminderTimes: (Array.isArray(game.reminderTimes) ? game.reminderTimes : [game.reminderTime || '20:00'])
        .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 8),
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(game.reminderTime || '') ? game.reminderTime : '20:00',
      notifyEnabled: true,
    }))
    .filter((game) => game.id && game.name);
}

function buildSyncPayload() {
  const schedules = readLocalJson('lm_schedules', []);
  const events = readLocalJson('lm_events', []);
  return {
    schedules: (Array.isArray(schedules) ? schedules : []).filter(Boolean).map((schedule) => ({
      id: schedule.id,
      kind: schedule.kind,
      date: schedule.date,
      start: schedule.start,
      name: schedule.name,
      travelMin: schedule.travelMin,
      prepMin: schedule.prepMin,
      arriveBeforeMin: schedule.arriveBeforeMin,
      ...(Array.isArray(schedule.notifyBefore) ? { notifyBefore: schedule.notifyBefore } : {}),
    })),
    events: (Array.isArray(events) ? events : []).filter(Boolean).map((event) => ({
      id: event.id,
      name: event.name,
      end: event.end,
    })),
    todoManager: buildTodoManagerSnapshot(),
    gameReminders: buildGameReminders(),
    updatedAt: Date.now(),
  };
}

// Firebase保存層と、アプリから呼び出す公開API。
function reportFirebaseError(action, error) {
  console.error(`Firebase ${action} failed`, error);
  window.dispatchEvent(new CustomEvent('lm-firebase-error', {
    detail: { action, message: error && error.message ? error.message : String(error) },
  }));
}

window.LMFirebase = {
  // 通知判定用の予定・イベント・タスク状態をFirestoreに同期する。
  async syncData() {
    try {
      await setDoc(stateRef, buildSyncPayload(), { merge: true });
      return true;
    } catch (error) {
      reportFirebaseError('予定の同期', error);
      return false;
    }
  },

  // アプリと同じService Workerを使って通知トークンを登録する。
  async registerToken() {
    try {
      if (!('serviceWorker' in navigator)) return null;
      await navigator.serviceWorker.register('./sw.js');
      const registration = await navigator.serviceWorker.ready;
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) return null;

      await setDoc(stateRef, { tokens: arrayUnion(token) }, { merge: true });
      return token;
    } catch (error) {
      reportFirebaseError('FCMトークンの登録', error);
      return null;
    }
  },
};
