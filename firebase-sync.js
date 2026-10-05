import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { getMessaging, getToken } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js';

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
const appCheckSiteKey = document.querySelector('meta[name="firebase-app-check-site-key"]')?.content.trim();
if (!appCheckSiteKey) {
  reportFirebaseConfigError('Firebase App Check site key is missing; server notification registration is unavailable.');
} else {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.error('Firebase App Check initialization failed', error);
    reportFirebaseConfigError(`Firebase App Check initialization failed: ${error.message || error}`);
  }
}

const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const STATE_REF_PATH = ['notify', 'state'];
let authPromise = null;

function reportFirebaseConfigError(message) {
  console.error(message);
  window.dispatchEvent(new CustomEvent('lm-firebase-error', {
    detail: { action: 'Firebase App Check設定', message },
  }));
}

function ensureAuthenticated() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch((error) => {
        authPromise = null;
        throw error;
      });
  }
  return authPromise;
}

window.LMFirebase = {
  // 予定・イベントのデータをFirestoreへ同期する(通知チェックはGitHub Actions側がこれを見て行う)
  async syncData() {
    try {
      await ensureAuthenticated();
      const schedules = JSON.parse(localStorage.getItem('lm_schedules') || '[]');
      const events = JSON.parse(localStorage.getItem('lm_events') || '[]');
      // タスクは通知の判定に必要な部分だけ送る(日付区切り・各枠の名前と達成状況)
      const todoRaw = JSON.parse(localStorage.getItem('lm_todoState') || 'null');
      const todo = todoRaw ? {
        dayKey: todoRaw.dayKey || '',
        dailyTasks: todoRaw.dailyTasks || {},
        taskEnteredAt: Number(todoRaw.taskEnteredAt) || 0,
      } : null;
      await setDoc(doc(db, ...STATE_REF_PATH), { schedules, events, todo, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.error('Firestore sync failed', e);
      window.dispatchEvent(new CustomEvent('lm-firebase-error', { detail: { action: '予定の同期', message: (e && e.message) || String(e) } }));
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
      await ensureAuthenticated();
      await httpsCallable(functions, 'registerNotificationToken')({ token });
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
// 準備ができたことを他のスクリプト(app.js等)に伝える
window.dispatchEvent(new Event('lm-firebase-ready'));
