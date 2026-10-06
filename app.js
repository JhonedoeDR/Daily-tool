/* =========================================================
   生活管理ツール - 共通データレイヤー / ユーティリティ
   全ページ(index.html, schedule.html, ...)から <script src="./app.js"> で読み込む。
   ========================================================= */

const LM = {};

/* ---------- localStorage キー一覧 ----------
 * lm_schedules     : 予定 [{id, name, date, start, end, place, travelMin, prepMin, arriveBeforeMin, belongingSetId, memo, autoSource?}]
 * lm_belongingSets : 持ちものセット [{id, name, items:[{id, name}]}]
 * lm_dailyChecks   : 日付ごとの持ちものチェック { "2026-09-18": { checkedItemIds: [...] } }
 * lm_todoState     : タスク状態 { dailyTasks, weeklyClears, reflected, ... }
 * lm_shifts        : 履修・シフト [{id, date, kind, name, location, start, end, breakMin, seriesId?}]
 * lm_shiftTemplates: 履修・シフトの予定テンプレート [{id, kind, name}]
 * lm_wageSettings  : 給与設定 {hourlyWage, transportFee}
 * lm_events        : イベント [{id, name, start, end, target, current, unit}]
 * lm_wishlist      : 欲しいものリスト [{id, name, category, price, url, desire, planThisMonth, purchased, memo}]
 * -------------------------------------------- */
LM.KEYS = {
  SCHEDULES: 'lm_schedules',
  BELONGING_SETS: 'lm_belongingSets',
  DAILY_CHECKS: 'lm_dailyChecks',
  TASKS: 'lm_todoState',
  SHIFTS: 'lm_shifts',
  SHIFT_TEMPLATES: 'lm_shiftTemplates',
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

LM.syncShiftSchedules = function () {
  const earliestByDateAndKind = new Map();
  LM.get(LM.KEYS.SHIFTS, []).forEach((shift) => {
    const kind = shift.kind === 'class' ? 'class' : 'shift';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.date || '') ||
        shift.date < LM.todayStr() ||
        !/^\d{2}:\d{2}$/.test(shift.start || '')) return;
    const key = `${shift.date}:${kind}`;
    const current = earliestByDateAndKind.get(key);
    if (!current || shift.start < current.start) earliestByDateAndKind.set(key, shift);
  });

  const projected = [...earliestByDateAndKind.entries()]
    .map(([key, shift]) => {
      const [date, kind] = key.split(':');
      return {
        id: `shift-projection-${kind}-${date}`,
        date,
        name: kind === 'class' ? '学校' : 'バイト',
        start: shift.start,
        end: shift.end || '',
        place: shift.location || '',
        travelMin: Number(shift.travelMin) || 0,
        prepMin: Number(shift.prepMin) || 0,
        arriveBeforeMin: Number(shift.arriveBeforeMin) || 0,
        belongingSetIds: shift.belongingSetIds || [],
        memo: '',
        routePreset: shift.routePreset || '',
        autoSource: 'shift',
      };
    })
    .sort((a, b) => (a.date + a.start + a.name).localeCompare(b.date + b.start + b.name));

  const schedules = LM.get(LM.KEYS.SCHEDULES, []);
  const existingProjections = schedules.filter((schedule) => schedule.autoSource === 'shift');
  if (JSON.stringify(existingProjections) === JSON.stringify(projected)) return 'unchanged';

  const manualSchedules = schedules.filter((schedule) => schedule.autoSource !== 'shift');
  if (!LM.set(LM.KEYS.SCHEDULES, manualSchedules.concat(projected))) return 'failed';
  if (!LM.set('lm_shiftScheduleSyncPending', true)) return 'failed';
  return 'updated';
};

/* ---------- 日付ユーティリティ ---------- */
// 予定・イベント・勤務・持ちものの「今日」は 00:00 リセット。
// タスク系は 04:00 リセットの別軸で管理する。
LM.scheduleDateKey = function (d) {
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

LM.todayStr = function () {
  return LM.scheduleDateKey(new Date());
};

LM.taskDayKey = function (d) {
  d = d || new Date();
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

LM.todoDayKey = function (d) {
  return LM.taskDayKey(d);
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
  // タスクの境界は 04:00 で切り替える。予定類の 00:00 枠とは別管理。
  const dayKey = LM.taskDayKey(now);

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

  const taskState = LM.get(LM.TODO_KEY, null);
  const taskSummary = LM.summarizeTodoTasks(taskState, dayKey);
  const notifyAt = (key, hour, title, body, shouldNotify) => {
    if (!shouldNotify || Math.abs(nowMin - hour * 60) > 2 || LM._alreadyNotified(key)) return;
    LM.notify(title, body);
    LM._markNotified(key);
  };

  // メインタスクが未入力の間は、7時から19時まで3時間ごとに入力を促す
  [7, 10, 13, 16, 19].forEach((hour) => {
    notifyAt(
      `task-empty:${dayKey}:${hour}`,
      hour,
      'メインタスクが入力されていません',
      '今日のメインタスクを入力しましょう',
      taskSummary.mainEntered === 0
    );
  });

  // メインタスク入力時刻(分を四捨五入)の3時間後から、AM4:00のリセットまで通知
  const enteredAt = Number(taskState && taskState.taskEnteredAt);
  if (taskState && taskState.dayKey === dayKey && enteredAt > 0 &&
      taskSummary.entered > 0 && !taskSummary.mainComplete && taskSummary.unfinished > 0) {
    const roundedAt = LM.roundTodoEntryTime(enteredAt);
    const [year, month, day] = dayKey.split('-').map(Number);
    const resetAt = new Date(year, month - 1, day + 1, 4, 0, 0, 0).getTime();
    for (let at = roundedAt + 3 * 60 * 60 * 1000; at < resetAt; at += 3 * 60 * 60 * 1000) {
      if (Math.abs(at - now.getTime()) > 2 * 60 * 1000) continue;
      const key = `task-unfinished:${dayKey}:${at}`;
      if (LM._alreadyNotified(key)) continue;
      LM.notify('未達成のタスクがあります', `未達成 ${taskSummary.unfinished}件`);
      LM._markNotified(key);
    }
  }

  // メインタスクを全て達成した後、その他に残っているタスクを19時と22時に通知
  [19, 22].forEach((hour) => {
    notifyAt(
      `task-other-unfinished:${dayKey}:${hour}`,
      hour,
      'その他に未達成のタスクがあります',
      `未達成 ${taskSummary.otherUnfinished}件`,
      taskSummary.mainComplete && taskSummary.otherUnfinished > 0
    );
  });
};

LM.roundTodoEntryTime = function (timestamp) {
  const rounded = new Date(timestamp);
  rounded.setMinutes(0, 0, 0);
  if (new Date(timestamp).getMinutes() >= 30) rounded.setHours(rounded.getHours() + 1);
  return rounded.getTime();
};

LM.summarizeTodoTasks = function (state, dayKey) {
  const empty = { entered: 0, mainEntered: 0, mainUnfinished: 0, mainComplete: false, otherUnfinished: 0, unfinished: 0 };
  if (!state || state.dayKey !== dayKey || !state.dailyTasks) return empty;
  const mainTasks = LM.TODO_MAIN_IDS
    .map((id) => state.dailyTasks[id])
    .filter((task) => task && String(task.name || '').trim());
  const mainEntered = mainTasks.length;
  const mainUnfinished = mainTasks.filter((task) => !task.checked).length;
  const otherIds = LM.TODO_GROUPS.filter((group) => !group.isMain).flatMap((group) => group.ids);
  const otherUnfinished = otherIds
    .map((id) => state.dailyTasks[id])
    .filter((task) => task && String(task.name || '').trim() && !task.checked).length;
  return {
    entered: mainEntered + otherIds
      .map((id) => state.dailyTasks[id])
      .filter((task) => task && String(task.name || '').trim()).length,
    mainEntered,
    mainUnfinished,
    mainComplete: mainEntered > 0 && mainUnfinished === 0,
    otherUnfinished,
    unfinished: mainUnfinished + otherUnfinished,
  };
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
LM.TODO_KEY = LM.KEYS.TASKS;

LM.TODO_OTHER_DEFAULT_SLOTS = 1;
LM.TODO_GROUPS = [
  { key: 'main', label: 'メイン', isMain: true, ids: ['main1', 'main2', 'main3'] },
  { key: 'priority', label: '優先', isMain: false, ids: ['pri1', 'pri2', 'pri3'] },
  { key: 'plus', label: 'プラス', isMain: false, ids: ['plus1', 'plus2', 'plus3'] },
  { key: 'gap', label: 'スキマ', isMain: false, ids: ['gap1', 'gap2', 'gap3'] },
  { key: 'routine', label: 'ルーティン', isMain: false, ids: ['rt1', 'rt2', 'rt3'] },
  { key: 'other', label: 'その他', isMain: false, ids: Array.from({ length: LM.TODO_OTHER_DEFAULT_SLOTS }, (_, i) => `other${i + 1}`) },
];

LM.TODO_MAIN_IDS = ['main1', 'main2', 'main3'];
LM.TODO_WEEK_TOTAL = 14;

/* ---------- ルーティンの月間達成(ご褒美) ----------
 * ・ルーティン枠(rt1〜rt3)は、名前だけが1か月間、翌日以降も自動で引き継がれる(チェックは毎日リセット)
 * ・必要達成数 = 枠の数 × その月の日数 × 2/3 (3枠・30日なら60、31日なら62)
 * ・毎日2/3を満たす必要はなく、月全体の合計で数える(取りこぼしは後の日に全部クリアして取り返せる)
 * ・名前のあるルーティンを、その日に初めてチェックした時だけ+1(チェックを外しても減らない。メインの週間記録と同じ考え方)
 * ・月が変わると(AM4:00基準)達成数とご褒美の文字はリセットされる
 * -------------------------------------------- */
LM.TODO_ROUTINE_IDS = ['rt1', 'rt2', 'rt3'];
LM.TODO_ROUTINE_RATE = 2 / 3;
// true にすると、月が変わってもルーティンの名前を引き継ぐ(達成数・ご褒美は月ごとにリセット)
LM.TODO_ROUTINE_KEEP_NAMES_ACROSS_MONTHS = false;

// 週の始まり(月曜)はタスク境界の AM4:00 を基準に算出する。
// 04:00より前はまだ前日で、前週として扱う。
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

LM.configureOtherTodoSlots = function (count) {
  const group = LM.TODO_GROUPS.find((g) => g.key === 'other');
  const parsedCount = Number(count);
  const slotCount = Number.isSafeInteger(parsedCount) && parsedCount > 0
    ? Math.max(LM.TODO_OTHER_DEFAULT_SLOTS, parsedCount)
    : LM.TODO_OTHER_DEFAULT_SLOTS;
  group.ids = Array.from({ length: slotCount }, (_, i) => `other${i + 1}`);
  return slotCount;
};

LM.defaultTodoReflected = function () {
  const r = {};
  LM.TODO_MAIN_IDS.forEach((id) => (r[id] = false));
  return r;
};

LM.defaultRoutineReflected = function () {
  const r = {};
  LM.TODO_ROUTINE_IDS.forEach((id) => (r[id] = false));
  return r;
};

// ルーティンの「月」もタスク境界の AM4:00 を基準とする。
LM.routineMonthKey = function (d) {
  return LM.todoDayKey(d).slice(0, 7);
};

LM.defaultTodoState = function () {
  return {
    dailyTasks: LM.defaultTodoTasks(),
    weeklyClears: 0,
    reflected: LM.defaultTodoReflected(),
    weekStartDate: LM.todoMondayKey(),
    dayKey: LM.todoDayKey(),
    reward: '',
    routineMonthKey: LM.routineMonthKey(),
    routineClears: 0,
    routineReflected: LM.defaultRoutineReflected(),
    routineReward: '',
    otherSlotCount: LM.TODO_OTHER_DEFAULT_SLOTS,
    taskEnteredAt: 0,
  };
};

// 今月のルーティン進捗: { count, required, remain, rate, daysInMonth, remainDays, routineCount }
LM.calcRoutineProgress = function (state, d) {
  d = d || new Date();
  const dayKey = LM.todoDayKey(d);
  const [y, m, day] = dayKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const required = Math.ceil(LM.TODO_ROUTINE_IDS.length * daysInMonth * LM.TODO_ROUTINE_RATE);
  const count = state.routineClears || 0;
  const remain = Math.max(0, required - count);
  const rate = required > 0 ? Math.min(100, Math.round((count / required) * 100)) : 0;
  const remainDays = daysInMonth - day + 1; // 今日を含む
  return { count, required, remain, rate, daysInMonth, remainDays };
};

LM.getTodoState = function () {
  let state = LM.get(LM.TODO_KEY, null);
  if (!state) state = LM.defaultTodoState();
  const savedOtherSlots = Number(state.otherSlotCount);
  const legacyOtherSlots = Object.keys(state.dailyTasks || {}).reduce((max, id) => {
    const match = /^other(\d+)$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, LM.TODO_OTHER_DEFAULT_SLOTS);
  state.otherSlotCount = LM.configureOtherTodoSlots(
    Number.isFinite(savedOtherSlots) && savedOtherSlots > 0 ? savedOtherSlots : legacyOtherSlots
  );
  if (!state.dailyTasks) state.dailyTasks = LM.defaultTodoTasks();
  LM.TODO_GROUPS.find((g) => g.key === 'other').ids.forEach((id) => {
    if (!state.dailyTasks[id]) state.dailyTasks[id] = { name: '', checked: false };
  });
  const needsTaskEntryMigration = !Object.prototype.hasOwnProperty.call(state, 'taskEnteredAt');
  if (!Number.isFinite(Number(state.taskEnteredAt))) state.taskEnteredAt = 0;
  if (typeof state.weeklyClears !== 'number') state.weeklyClears = 0;
  if (!state.reflected) state.reflected = LM.defaultTodoReflected();
  if (!state.weekStartDate) state.weekStartDate = LM.todoMondayKey();
  if (!state.dayKey) state.dayKey = LM.todoDayKey();
  if (typeof state.reward !== 'string') state.reward = '';
  if (typeof state.routineClears !== 'number') state.routineClears = 0;
  if (!state.routineReflected) state.routineReflected = LM.defaultRoutineReflected();
  if (typeof state.routineReward !== 'string') state.routineReward = '';
  if (!state.routineMonthKey) state.routineMonthKey = LM.routineMonthKey();

  const thisMonday = LM.todoMondayKey();
  if (state.weekStartDate !== thisMonday) {
    state.weekStartDate = thisMonday;
    state.weeklyClears = 0;
    state.reflected = LM.defaultTodoReflected();
    state.reward = '';
  }

  // 月が変わったら、ルーティンの達成数・ご褒美をリセット(名前は設定により引き継ぐか消す)
  const thisMonth = LM.routineMonthKey();
  if (state.routineMonthKey !== thisMonth) {
    state.routineMonthKey = thisMonth;
    state.routineClears = 0;
    state.routineReflected = LM.defaultRoutineReflected();
    state.routineReward = '';
    if (!LM.TODO_ROUTINE_KEEP_NAMES_ACROSS_MONTHS) {
      LM.TODO_ROUTINE_IDS.forEach((id) => {
        if (state.dailyTasks[id]) state.dailyTasks[id].name = '';
      });
    }
  }

  // AM4:00を過ぎたら日付が変わったとみなし、入力・チェックを自動リセット(週間記録は保持)
  // ただしルーティンの名前だけは翌日に引き継ぐ
  const today = LM.todoDayKey();
  if (state.dayKey !== today) {
    const routineNames = {};
    LM.TODO_ROUTINE_IDS.forEach((id) => {
      routineNames[id] = (state.dailyTasks[id] && state.dailyTasks[id].name) || '';
    });
    state.dayKey = today;
    state.dailyTasks = LM.defaultTodoTasks();
    LM.TODO_ROUTINE_IDS.forEach((id) => {
      state.dailyTasks[id].name = routineNames[id];
    });
    state.reflected = LM.defaultTodoReflected();
    state.routineReflected = LM.defaultRoutineReflected();
    state.taskEnteredAt = 0;
  }

  if (needsTaskEntryMigration && Object.values(state.dailyTasks).some((task) =>
    task && String(task.name || '').trim()
  )) {
    state.taskEnteredAt = LM.roundTodoEntryTime(Date.now());
  }

  LM.set(LM.TODO_KEY, state);
  return state;
};

// ユーザー操作によるタスクの変更を保存し、Firestoreへ少し遅らせて同期する(通知の判定に使われる)
LM.saveTodoState = function (state) {
  LM.set(LM.TODO_KEY, state);
  LM.syncFirebaseDebounced();
};

LM.setTodoTaskName = function (state, id, name, enteredAt) {
  const wasEmpty = Object.values(state.dailyTasks).every((task) => !String((task && task.name) || '').trim());
  state.dailyTasks[id].name = name;
  const hasTasks = Object.values(state.dailyTasks).some((task) => String((task && task.name) || '').trim());
  if (!hasTasks) {
    state.taskEnteredAt = 0;
  } else if (wasEmpty || !Number(state.taskEnteredAt)) {
    const timestamp = enteredAt || Date.now();
    const entered = new Date(timestamp);
    entered.setMinutes(0, 0, 0);
    if (new Date(timestamp).getMinutes() >= 30) entered.setHours(entered.getHours() + 1);
    state.taskEnteredAt = entered.getTime();
  }
};

// 予定・イベントの変更をFirestoreへ同期する(準備が間に合っていなければ待ってから送る)
LM.syncFirebase = async function () {
  if (!window.LMFirebase) {
    await new Promise((resolve) => window.addEventListener('lm-firebase-ready', resolve, { once: true }));
  }
  if (!window.LMFirebase) return false;
  const synced = await window.LMFirebase.syncData();
  if (synced) localStorage.removeItem('lm_shiftScheduleSyncPending');
  return synced;
};

LM.syncShiftSchedules();

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
// ルーティン(名前のあるもの)も、その日に初めてチェックした時だけ月間クリア数を+1する
LM.toggleTodoCheck = function (state, id, checked) {
  state.dailyTasks[id].checked = checked;
  if (LM.TODO_MAIN_IDS.includes(id) && checked && !state.reflected[id] && state.weeklyClears < LM.TODO_WEEK_TOTAL) {
    state.weeklyClears += 1;
    state.reflected[id] = true;
  }
  if (
    LM.TODO_ROUTINE_IDS.includes(id) &&
    checked &&
    !state.routineReflected[id] &&
    (state.dailyTasks[id].name || '').trim()
  ) {
    state.routineClears += 1;
    state.routineReflected[id] = true;
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

/* ---------- ナビゲーション(共通フッターボタン)描画 ----------
 * 【旧ボタン】今は使っていません。各ページは renderNav-menu.js を読み込むため、
 * この LM.renderNav はそちらの定義で上書きされ、画面には出ません(コードだけ残しています)。
 * ------------------------------------------------------------- */
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
    { href: './shift.html', label: '履修・シフト' },
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
