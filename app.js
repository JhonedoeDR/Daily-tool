/* =========================================================
   生活管理ツール - 共通データレイヤー / ユーティリティ
   全ページ(index.html, schedule.html, ...)から <script src="./app.js"> で読み込む。
   ========================================================= */

const LM = {};

/* ---------- localStorage キー一覧 ----------
 * lm_schedules      : 予定 [{id, name, date, start, end, place, travelMin, prepMin, arriveBeforeMin, belongingSetId, memo}]
 * lm_belongingSets   : 持ちものセット [{id, name, items:[{id, name}]}]
 * lm_dailyChecks     : 日付ごとの持ちものチェック { "2026-09-18": { checkedItemIds: [...] } }
 * lm_tasks           : 日付ごとのタスク { "2026-09-18": [{id, text, done}] }
 * lm_shifts          : シフト [{id, date, start, end, breakMin}]
 * lm_wageSettings    : 給与設定 {hourlyWage, transportFee}
 * lm_events          : イベント [{id, name, start, end, target, current, unit}]
 * lm_wishlist        : 欲しいものリスト [{id, name, category, price, url, desire, planThisMonth, purchased, memo}]
 * -------------------------------------------- */

LM.KEYS = {
  SCHEDULES: 'lm_schedules',
  BELONGING_SETS: 'lm_belongingSets',
  DAILY_CHECKS: 'lm_dailyChecks',
  TASKS: 'lm_tasks',
  SHIFTS: 'lm_shifts',
  WAGE_SETTINGS: 'lm_wageSettings',
  EVENTS: 'lm_events',
  WISHLIST: 'lm_wishlist',
};

/* ---------- 汎用 get/set ---------- */
LM.get = function (key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('LM.get failed for', key, e);
    return fallback;
  }
};

LM.set = function (key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('LM.set failed for', key, e);
    alert('データの保存に失敗しました。\n理由: ' + (e && e.message ? e.message : e));
    return false;
  }
};

LM.uid = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

/* ---------- 日付ユーティリティ ---------- */
LM.todayStr = function () {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

LM.formatDateHeader = function (dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;
};

LM.daysBetween = function (fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  return Math.round((to - from) / 86400000);
};

LM.minutesToClock = function (totalMin) {
  const h = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const m = ((totalMin % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

LM.clockToMinutes = function (hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/* ---------- 予定・逆算計算 ---------- */
// 出発/準備開始時刻を算出する
LM.calcDeparture = function (schedule) {
  const arriveMin = LM.clockToMinutes(schedule.start) - (schedule.arriveBeforeMin || 0);
  const departMin = arriveMin - (schedule.travelMin || 0);
  const prepStartMin = departMin - (schedule.prepMin || 0);
  return {
    arrive: LM.minutesToClock(arriveMin),
    depart: LM.minutesToClock(departMin),
    prepStart: LM.minutesToClock(prepStartMin),
  };
};

/* ---------- 給与計算 ---------- */
LM.calcShiftPay = function (shift, wageSettings) {
  const workMin = LM.clockToMinutes(shift.end) - LM.clockToMinutes(shift.start) - (shift.breakMin || 0);
  const pay = Math.max(0, Math.round((workMin / 60) * (wageSettings.hourlyWage || 0)));
  return { workMin, pay };
};

/* ---------- イベント進捗計算 ---------- */
LM.calcEventProgress = function (ev, todayStr) {
  const remain = Math.max(0, (ev.target || 0) - (ev.current || 0));
  const remainDays = Math.max(0, LM.daysBetween(todayStr, ev.end));
  const perDay = remainDays > 0 ? Math.ceil(remain / remainDays) : remain;
  const rate = ev.target > 0 ? Math.min(100, Math.round((ev.current / ev.target) * 100)) : 0;
  return { remain, remainDays, perDay, rate };
};

/* ---------- 通知(Notification API・ページが開いている間のみ動作) ----------
 * iOSのWeb/PWAはアプリを閉じた状態でのプッシュ通知に強い制約があるため、
 * ここでは「ページを開いた時/開いている間にチェックして通知する」方式のみを実装する。
 * 対象: (1)今日の予定の開始前 (2)予定の準備開始時刻 (3)イベント終了3日前以内
 * ------------------------------------------------------------------------- */
LM.NOTIFIED_KEY = 'lm_notifiedKeys';

LM.requestNotificationPermission = async function () {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
};

LM.notify = function (title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: './icons/icon-192.png' });
  } catch (e) {
    console.error('notify failed', e);
  }
};

// 一度通知したキーは繰り返し通知しないよう記録する
LM._alreadyNotified = function (key) {
  const notified = LM.get(LM.NOTIFIED_KEY, []);
  return notified.includes(key);
};
LM._markNotified = function (key) {
  const notified = LM.get(LM.NOTIFIED_KEY, []);
  notified.push(key);
  // 古くなりすぎないよう直近500件のみ保持
  LM.set(LM.NOTIFIED_KEY, notified.slice(-500));
};

LM.checkAndNotify = function () {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const today = LM.todayStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // (1)(2) 今日の予定: 開始10分前、準備開始10分前
  const schedules = LM.get(LM.KEYS.SCHEDULES, []).filter((s) => s.date === today);
  schedules.forEach((s) => {
    const startMin = LM.clockToMinutes(s.start);
    if (Math.abs(startMin - nowMin) <= 2) {
      const key = `start:${s.id}:${today}`;
      if (!LM._alreadyNotified(key)) {
        LM.notify('まもなく予定の時間です', `${s.name}(${s.start}〜)`);
        LM._markNotified(key);
      }
    }
    if (s.prepMin || s.travelMin || s.arriveBeforeMin) {
      const { prepStart } = LM.calcDeparture(s);
      const prepStartMin = LM.clockToMinutes(prepStart);
      if (Math.abs(prepStartMin - nowMin) <= 2) {
        const key = `prep:${s.id}:${today}`;
        if (!LM._alreadyNotified(key)) {
          LM.notify('準備を始める時間です', `${s.name}の準備開始時刻です`);
          LM._markNotified(key);
        }
      }
    }
  });

  // (3) イベント終了3日前以内、かつ1日1回だけ通知
  const events = LM.get(LM.KEYS.EVENTS, []).filter((ev) => ev.end >= today);
  events.forEach((ev) => {
    const remainDays = LM.daysBetween(today, ev.end);
    if (remainDays <= 3) {
      const key = `event:${ev.id}:${today}`;
      if (!LM._alreadyNotified(key)) {
        LM.notify('イベント終了が近づいています', `${ev.name}(残り${remainDays}日)`);
        LM._markNotified(key);
      }
    }
  });
};

// ページ表示時とその後1分ごとにチェック(ページを開いている間のみ動作)
LM.startNotificationLoop = function () {
  LM.checkAndNotify();
  setInterval(LM.checkAndNotify, 60 * 1000);
};

/* ---------- バックアップ(全データの書き出し/読み込み) ---------- */
LM.exportAllData = function () {
  const data = {};
  Object.values(LM.KEYS).forEach((k) => {
    const raw = localStorage.getItem(k);
    if (raw !== null) data[k] = JSON.parse(raw);
  });
  const raw = localStorage.getItem('lm_timeCalcItems');
  if (raw !== null) data['lm_timeCalcItems'] = JSON.parse(raw);
  return data;
};

LM.importAllData = function (data) {
  Object.entries(data).forEach(([k, v]) => {
    localStorage.setItem(k, JSON.stringify(v));
  });
};

/* ---------- タスク(固定枠のデイリーTodo・週間メインタスク記録) ---------- */
LM.TODO_KEY = 'lm_todoState';
LM.TODO_GROUPS = [
  { key: 'main', label: 'メイン', isMain: true, ids: ['main1', 'main2', 'main3'] },
  { key: 'priority', label: '優先', isMain: false, ids: ['pri1', 'pri2', 'pri3'] },
  { key: 'plus', label: 'プラス', isMain: false, ids: ['plus1', 'plus2', 'plus3'] },
  { key: 'gap', label: 'スキマ', isMain: false, ids: ['gap1', 'gap2', 'gap3'] },
  { key: 'routine', label: 'ルーティン', isMain: false, ids: ['rt1', 'rt2', 'rt3'] },
  { key: 'other', label: 'その他', isMain: false, ids: ['other1'] },
];
LM.TODO_MAIN_IDS = ['main1', 'main2', 'main3'];
LM.TODO_WEEK_TOTAL = 14;

// 週の始まり(月曜)をAM4:00basisで算出(4:00より前はまだ前日=前週として扱う)
LM.todoMondayKey = function (d) {
  d = d || new Date();
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const date = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

LM.defaultTodoTasks = function () {
  const tasks = {};
  LM.TODO_GROUPS.forEach((g) => g.ids.forEach((id) => (tasks[id] = { name: '', checked: false })));
  return tasks;
};
LM.defaultTodoReflected = function () {
  const r = {};
  LM.TODO_MAIN_IDS.forEach((id) => (r[id] = false));
  return r;
};
LM.defaultTodoState = function () {
  return {
    dailyTasks: LM.defaultTodoTasks(),
    weeklyClears: 0,
    reflected: LM.defaultTodoReflected(),
    weekStartDate: LM.todoMondayKey(),
    dayKey: LM.todoDayKey(),
    reward: '',
  };
};

// タスクの「1日」の区切りをAM4:00とする(4:00より前は前日扱い)
LM.todoDayKey = function (d) {
  d = d || new Date();
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

LM.getTodoState = function () {
  let state = LM.get(LM.TODO_KEY, null);
  if (!state) state = LM.defaultTodoState();
  if (!state.dailyTasks) state.dailyTasks = LM.defaultTodoTasks();
  if (typeof state.weeklyClears !== 'number') state.weeklyClears = 0;
  if (!state.reflected) state.reflected = LM.defaultTodoReflected();
  if (!state.weekStartDate) state.weekStartDate = LM.todoMondayKey();
  if (!state.dayKey) state.dayKey = LM.todoDayKey();
  if (typeof state.reward !== 'string') state.reward = '';

  const thisMonday = LM.todoMondayKey();
  if (state.weekStartDate !== thisMonday) {
    state.weekStartDate = thisMonday;
    state.weeklyClears = 0;
    state.reflected = LM.defaultTodoReflected();
    state.reward = '';
  }

  // AM4:00を過ぎたら日付が変わったとみなし、入力・チェックを自動リセット(週間記録は保持)
  const today = LM.todoDayKey();
  if (state.dayKey !== today) {
    state.dayKey = today;
    state.dailyTasks = LM.defaultTodoTasks();
    state.reflected = LM.defaultTodoReflected();
  }

  LM.set(LM.TODO_KEY, state);
  return state;
};

// ユーザー操作によるタスクの変更を保存し、Firestoreへ少し遅らせて同期する(通知の判定に使われる)
LM.saveTodoState = function (state) {
  LM.set(LM.TODO_KEY, state);
  LM.syncFirebaseDebounced();
};

// 予定・イベントの変更をFirestoreへ同期する(準備が間に合っていなければ待ってから送る)
LM.syncFirebase = async function () {
  if (!window.LMFirebase) {
    await new Promise((resolve) => window.addEventListener('lm-firebase-ready', resolve, { once: true }));
  }
  if (window.LMFirebase) window.LMFirebase.syncData();
};

// 連続した変更(文字入力など)をまとめて、最後の変更から少し後に1回だけ同期する
LM._syncTimer = null;
LM.syncFirebaseDebounced = function (delayMs) {
  clearTimeout(LM._syncTimer);
  LM._syncTimer = setTimeout(() => {
    LM._syncTimer = null;
    LM.syncFirebase();
  }, delayMs || 2000);
};
// 画面を閉じる/別アプリに切り替える時に、待機中の同期があれば今すぐ送る
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && LM._syncTimer) {
    clearTimeout(LM._syncTimer);
    LM._syncTimer = null;
    LM.syncFirebase();
  }
});

// メインタスクを初めてチェックした時だけ週間クリア数を+1する(週をまたぐとリセット)
LM.toggleTodoCheck = function (state, id, checked) {
  state.dailyTasks[id].checked = checked;
  if (LM.TODO_MAIN_IDS.includes(id) && checked && !state.reflected[id] && state.weeklyClears < LM.TODO_WEEK_TOTAL) {
    state.weeklyClears += 1;
    state.reflected[id] = true;
  }
  LM.saveTodoState(state);
};

/* ---------- モーダル(レイヤー表示) ---------- */
LM.openModal = function (title, contentEl) {
  LM.closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'lm-modal-overlay';
  overlay.innerHTML = `
    <div class="lm-modal">
      <div class="lm-modal-header">
        <strong>${title}</strong>
        <button type="button" class="lm-modal-close">✕</button>
      </div>
      <div class="lm-modal-body"></div>
    </div>
  `;
  overlay.querySelector('.lm-modal-body').appendChild(contentEl);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) LM.closeModal();
  });
  overlay.querySelector('.lm-modal-close').addEventListener('click', LM.closeModal);
  document.body.appendChild(overlay);
};

LM.closeModal = function () {
  const overlay = document.querySelector('.lm-modal-overlay');
  if (overlay) overlay.remove();
};

/* ---------- トースト通知(右下に表示) ---------- */
LM.showToast = function (message, type) {
  const toast = document.createElement('div');
  toast.className = 'lm-toast' + (type === 'error' ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
};

// FirebaseのエラーはUI上のどのページでも赤いトーストで見えるようにする
window.addEventListener('lm-firebase-error', (e) => {
  const action = (e.detail && e.detail.action) || 'Firebase処理';
  const message = (e.detail && e.detail.message) || '不明なエラー';
  if (typeof LM !== 'undefined' && LM.showToast) {
    LM.showToast(`${action}に失敗: ${message}`, 'error');
  }
});

/* ---------- 期限切れ予定の自動削除(日付が今日より前のものを削除) ---------- */
(function purgeExpiredSchedules() {
  const today = LM.todayStr();
  const schedules = LM.get(LM.KEYS.SCHEDULES, []);
  const filtered = schedules.filter((s) => s.date >= today);
  if (filtered.length !== schedules.length) {
    LM.set(LM.KEYS.SCHEDULES, filtered);
  }
})();

/* ---------- Service Worker登録(PWA・オフライン対応) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.error('SW registration failed', e));
  });
}

/* ---------- ナビゲーション(共通フッターボタン)描画 ---------- */
LM.renderNav = function (container) {
  const nav = document.createElement('nav');
  nav.className = 'lm-nav';
  const items = [
    { href: './schedule.html', label: '予定・逆算' },
    { href: './belongings.html', label: '持ちもの' },
    { href: './todo.html', label: 'タスク' },
    { href: './wishlist.html', label: 'WISHリスト' },
    { href: './time-calc.html', label: '時間計算' },
    { href: './event.html', label: 'イベント' },
    { href: './shift.html', label: '給与・シフト' },
    { href: 'https://jhonedoedr.github.io/MyBookLog/', label: 'よみもの記録', external: true },
  ];
  items.forEach((it) => {
    const a = document.createElement('a');
    a.href = it.href;
    a.className = 'lm-nav-btn';
    a.textContent = it.label;
    if (it.external) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.addEventListener('click', (e) => {
      e.preventDefault();
      a.classList.add('lm-pressed');
      setTimeout(() => {
        if (it.external) window.open(a.href, '_blank', 'noopener');
        else location.href = a.href;
      }, 90);
    });
    nav.appendChild(a);
  });
  container.appendChild(nav);
};
