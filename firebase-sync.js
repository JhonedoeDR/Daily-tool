import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
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
const STATE_REF_PATH = ['notify', 'state'];

window.LMFirebase = {
  // 予定・イベントのデータをFirestoreへ同期する(通知チェックはGitHub Actions側がこれを見て行う)
  async syncData() {
    try {
      const schedules = JSON.parse(localStorage.getItem('lm_schedules') || '[]');
      const events = JSON.parse(localStorage.getItem('lm_events') || '[]');
      // タスクは通知の判定に必要な部分だけ送る(日付区切り・各枠の名前と達成状況)
      const todoRaw = JSON.parse(localStorage.getItem('lm_todoState') || 'null');
      const todo = todoRaw ? {
        dayKey: todoRaw.dayKey || '',
        dailyTasks: todoRaw.dailyTasks || {},
        taskEnteredAt: Number(todoRaw.taskEnteredAt) || 0,
      } : null;
      // 締切タスクを空いている枠に入れて送る(外部通知が「未入力」と誤判定しないように)
      if (todo && window.LM && window.LM.mergeLinkedTasksForSync) window.LM.mergeLinkedTasksForSync(todo);
      // 「明日のタスク」の自動入力待ち分も送る(AM4:00以降にアプリを開く前でも、外部通知が入力済みと判定できるように)
      let tomorrowTasks = null;
      try {
        const pending = JSON.parse(localStorage.getItem('lm_tomorrowTasks') || 'null');
        if (pending && pending.forDay && pending.tasks) {
          const tasks = {};
          Object.keys(pending.tasks).forEach((id) => {
            const name = String(pending.tasks[id] || '').trim();
            if (name) tasks[id] = name.slice(0, 120);
          });
          if (Object.keys(tasks).length > 0) tomorrowTasks = { forDay: String(pending.forDay), tasks };
        }
      } catch (e) { tomorrowTasks = null; }
      // ゲームの通知判定に必要な最小限の情報だけ同期する。攻略メモ・画像・石の履歴は送らない。
      const gameReminders = JSON.parse(localStorage.getItem('lm_gameReminders') || '[]')
        .filter((g) => g && g.notifyEnabled === true)
        .map((g) => ({
          id: String(g.id || ''),
          name: String(g.name || '').slice(0, 120),
          lastLoginDate: /^\d{4}-\d{2}-\d{2}$/.test(g.lastLoginDate || '') ? g.lastLoginDate : '',
          reminderTimes: (Array.isArray(g.reminderTimes) ? g.reminderTimes : [g.reminderTime || '20:00'])
            .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).slice(0, 8),
          reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(g.reminderTime || '') ? g.reminderTime : '20:00',
          notifyEnabled: true,
        }))
        .filter((g) => g.id && g.name);
      await setDoc(doc(db, ...STATE_REF_PATH), { schedules, events, todo, tomorrowTasks, gameReminders, updatedAt: Date.now() }, { merge: true });
      return true;
    } catch (e) {
      console.error('Firestore sync failed', e);
      window.dispatchEvent(new CustomEvent('lm-firebase-error', { detail: { action: '予定の同期', message: (e && e.message) || String(e) } }));
      return false;
    }
  },

  // 通知許可時にFCMトークンを取得し、Firestoreに登録する
  async registerToken() {
    try {
      if (!('serviceWorker' in navigator)) return null;
      // アプリ本体と同じService Worker(sw.js)を使う(同じscopeに2つは置けないため)
      await navigator.serviceWorker.register('./sw.js');
      const reg = await navigator.serviceWorker.ready;
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) return null;

      const ref = doc(db, ...STATE_REF_PATH);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data().tokens || [] : [];
      const tokens = Array.from(new Set([...existing, token]));
      await setDoc(ref, { tokens }, { merge: true });
      return token;
    } catch (e) {
      console.error('FCMトークンの登録に失敗', e);
      window.dispatchEvent(new CustomEvent('lm-firebase-error', { detail: { action: '通知トークンの登録', message: (e && e.message) || String(e) } }));
      return null;
    }
  },
};

// 準備ができたことを他のスクリプト(app.js等)に伝える
window.dispatchEvent(new Event('lm-firebase-ready'));
if (window.LM.get('lm_shiftScheduleSyncPending', false)) window.LM.syncFirebase();
