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

function buildTodoSnapshot() {
  const raw = readLocalJson('lm_todoState', null);
  if (!raw) return null;

  const todo = {
    dayKey: raw.dayKey || '',
    dailyTasks: Object.fromEntries(Object.entries(raw.dailyTasks || {}).map(([id, task]) => [
      id,
      { name: String((task && task.name) || ''), checked: !!(task && task.checked) },
    ])),
    taskEnteredAt: Number(raw.taskEnteredAt) || 0,
  };
  if (window.LM && typeof window.LM.mergeLinkedTasksForSync === 'function') {
    window.LM.mergeLinkedTasksForSync(todo);
  }
  return todo;
}

function buildTomorrowTasks() {
  let pending;
  try {
    pending = readLocalJson('lm_tomorrowTasks', null);
  } catch (error) {
    console.warn('明日のタスクを同期データに変換できませんでした', error);
    return null;
  }
  if (!pending || !pending.forDay || !pending.tasks) return null;

  const tasks = {};
  Object.entries(pending.tasks).forEach(([id, value]) => {
    const name = String(value || '').trim();
    if (name) tasks[id] = name.slice(0, 120);
  });
  return Object.keys(tasks).length ? { forDay: String(pending.forDay), tasks } : null;
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
    todo: buildTodoSnapshot(),
    tomorrowTasks: buildTomorrowTasks(),
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
