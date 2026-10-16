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
 * lm_shifts        : 履修・シフト [{id, date, kind, name, location, start, end, breakMin, seriesId?, scheduleRegistered?, travelMin?, prepMin?, arriveBeforeMin?, routePreset?}]
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
  ROUTE_PRESETS: 'lm_routePresets',
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
    if (shift.scheduleRegistered !== true) return;
    const kind = shift.kind === 'class' ? 'class' : 'shift';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.date || '') ||
        shift.date < LM.todayStr() ||
        !/^\d{2}:\d{2}$/.test(shift.start || '')) return;
    const key = `${shift.date}:${kind}`;
    const current = earliestByDateAndKind.get(key);
    if (!current || shift.start < current.start) earliestByDateAndKind.set(key, shift);
  });
  
    // 学校の予定用: その日の全授業のセット + 常備 + 学校
  const allBelongingSets = LM.get(LM.KEYS.BELONGING_SETS, []);
  const setIdsByName = (name) => allBelongingSets.filter((s) => s.name === name).map((s) => s.id);
  const classSetIdsByDate = new Map();
  LM.get(LM.KEYS.SHIFTS, []).forEach((s) => {
    if (s.kind !== 'class' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return;
    if (!classSetIdsByDate.has(s.date)) classSetIdsByDate.set(s.date, new Set());
    const acc = classSetIdsByDate.get(s.date);
    (s.belongingSetIds || []).forEach((id) => acc.add(id));
    setIdsByName(s.name).forEach((id) => acc.add(id));
  });

  const projected = [...earliestByDateAndKind.entries()]
    .map(([key, shift]) => {
      const [date, kind] = key.split(':');
      return {
        id: `shift-projection-${kind}-${date}`,
        sourceShiftId: shift.id,
        date,
        name: kind === 'class' ? '学校' : 'バイト',
        start: shift.start,
        end: shift.end || '',
        place: shift.location || '',
        travelMin: Number(shift.travelMin) || 0,
        prepMin: Number(shift.prepMin) || 0,
        arriveBeforeMin: Number(shift.arriveBeforeMin) || 0,
                belongingSetIds: kind === 'class'
          ? [...new Set([
              ...(shift.belongingSetIds || []),
              ...(classSetIdsByDate.get(date) || []),
              ...setIdsByName('常備'),
              ...setIdsByName('学校'),
            ])]
          : (shift.belongingSetIds || []),
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
  const schedules = LM.get(LM.KEYS.SCHEDULES, []).filter((s) => s.date === today && s.kind !== 'deadline');
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
    LM.checkDeadlineNotify();

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

  try { LM.applyTomorrowTasks(); } catch (e) { console.error(e); }
  const taskState = LM.get(LM.TODO_KEY, null);
  const taskSummary = LM.summarizeAllTodoTasks(taskState, dayKey);
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
  const enteredAt = Number(taskState && taskState.taskEnteredAt) || LM.linkedTasksEnteredAt(dayKey);
  if (taskState && taskState.dayKey === dayKey && enteredAt > 0 &&
      taskSummary.entered > 0 && !taskSummary.mainComplete && taskSummary.unfinished > 0) {
    const roundedAt = LM.roundTodoEntryTime(enteredAt);
    const [year, month, day] = dayKey.split('-').map(Number);
    const resetAt = new Date(year, month - 1, day + 1, 4, 0, 0, 0).getTime();
    for (let at = roundedAt + 3 * 60 * 60 * 1000; at < resetAt; at += 3 * 60 * 60 * 1000) {
      if (Math.abs(at - now.getTime()) > 2 * 60 * 1000) continue;
      const key = `task-unfinished:${dayKey}:${at}`;
      if (LM._alreadyNotified(key)) continue;
      LM.notify('未達成のタスクがあります', [`未達成 ${taskSummary.unfinished}件`].concat(LM.buildDeadlineNoteLines()).join('\n'));
      LM._markNotified(key);
    }
  }

  // メインタスクを全て達成した後、その他に残っているタスクを19時と22時に通知
  [19, 22].forEach((hour) => {
    notifyAt(
      `task-other-unfinished:${dayKey}:${hour}`,
      hour,
      'その他に未達成のタスクがあります',
      [`未達成 ${taskSummary.otherUnfinished}件`].concat(LM.buildDeadlineNoteLines()).join('\n'),
      taskSummary.mainComplete && taskSummary.otherUnfinished > 0
    );
  });
};

/* ---------- 締切の通知(通知設定で選んだ「◯分前」に通知) ---------- */
LM.DEADLINE_NOTIFY_OPTIONS = [
  { id: '30m', label: '30分前', min: 30 },
  { id: '1h', label: '1時間前', min: 60 },
  { id: '3h', label: '3時間前', min: 180 },
  { id: '1d', label: '前日', min: 1440 },
  { id: '3d', label: '3日前', min: 4320 },
  { id: '1w', label: '1週間前', min: 10080 },
];

LM.checkDeadlineNotify = function () {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  LM.get(LM.KEYS.SCHEDULES, []).forEach((s) => {
    if (s.kind !== 'deadline' || !s.date || !s.start || !Array.isArray(s.notifyBefore)) return;
    const dueAt = new Date(`${s.date}T${s.start}:00`).getTime();
    s.notifyBefore.forEach((id) => {
      const opt = LM.DEADLINE_NOTIFY_OPTIONS.find((o) => o.id === id);
      if (!opt) return;
      const at = dueAt - opt.min * 60 * 1000;
      if (Math.abs(at - now) > 2 * 60 * 1000) return;
      const key = `deadline:${s.id}:${id}:${s.date}:${s.start}`;
      if (LM._alreadyNotified(key)) return;
      LM.notify('締切が近づいています', `${s.name}(${LM.formatDateHeader(s.date)} ${s.start}・締切の${opt.label})`);
      LM._markNotified(key);
    });
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

/* =========================================================
   締切・タスク連携(追加ブロック)
   既存の関数・変数は変更していない。データは lm_deadlineTasks に分離。
   [{id, deadlineId, title, category, done, doneAt, prereqIds, manualShown, visibleSince,
     deadlineName, deadlineDate, createdAt}]
   ========================================================= */
LM.KEYS.DEADLINE_TASKS = 'lm_deadlineTasks';

LM.getDeadlineTasks = function () {
  const list = LM.get(LM.KEYS.DEADLINE_TASKS, []);
  return Array.isArray(list) ? list : [];
};

// 保存したら、少し遅らせてFirestoreへ同期する(外部通知が最新の達成状況を見られるように)
LM.saveDeadlineTasks = function (tasks) {
  const ok = LM.set(LM.KEYS.DEADLINE_TASKS, tasks);
  if (ok) LM.syncFirebaseDebounced();
  return ok;
};

// 締切の名前・日付のスナップショットを更新し、完了後7日たった孤児タスクを削除して返す
LM.refreshDeadlineTaskLinks = function () {
  const byId = new Map(LM.get(LM.KEYS.SCHEDULES, [])
    .filter((s) => s.kind === 'deadline').map((s) => [s.id, s]));
  const today = LM.todoDayKey();
  let changed = false;
  const tasks = LM.getDeadlineTasks().filter((t) => {
    if (byId.has(t.deadlineId)) return true;
    if (t.done && t.doneAt && Date.now() - t.doneAt > 7 * 86400000) { changed = true; return false; }
    return true;
  });
  tasks.forEach((t) => {
    const s = byId.get(t.deadlineId);
    if (s && (t.deadlineName !== s.name || t.deadlineDate !== s.date)) {
      t.deadlineName = s.name;
      t.deadlineDate = s.date;
      changed = true;
    }
    // 表示条件を満たし始めた日を記録(先行条件クリア日だけ枠を一時的に増やすため)
    const visible = LM.isDeadlineTaskVisible(t, tasks);
    if (visible && !t.visibleSince) { t.visibleSince = today; changed = true; }
    else if (!visible && t.visibleSince) { t.visibleSince = ''; changed = true; }
  });
  if (changed) LM.saveDeadlineTasks(tasks);
  return tasks;
};

// 表示用: 「締切名・あと◯日」または孤児の理由
LM.describeDeadlineTask = function (task) {
  const s = LM.get(LM.KEYS.SCHEDULES, []).find((x) => x.id === task.deadlineId && x.kind === 'deadline');
  const today = LM.todayStr();
  if (s) {
    const d = LM.daysBetween(today, s.date);
    return { orphan: false, text: `${s.name}・${d > 0 ? `あと${d}日` : '今日'}` };
  }
  const expired = task.deadlineDate && task.deadlineDate < today;
  return { orphan: true, text: `${task.deadlineName || '締切'}・${expired ? '期限切れ' : '締切削除済み'}` };
};

// 表示条件: 手動表示、または先行タスクが全て達成(存在しない先行は達成扱い)
LM.isDeadlineTaskVisible = function (task, all) {
  if (task.manualShown) return true;
  return (task.prereqIds || []).every((pid) => {
    const p = all.find((x) => x.id === pid);
    return !p || p.done;
  });
};

// idに(直接・間接に)依存しているタスクのid集合(循環防止用)
LM._dlDependents = function (id, all) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    all.forEach((t) => {
      if (!out.has(t.id) && (t.prereqIds || []).some((p) => p === id || out.has(p))) {
        out.add(t.id);
        grew = true;
      }
    });
  }
  return out;
};

LM.addDeadlineTask = function (deadlineId, title, category, prereqIds) {
  const name = String(title || '').trim();
  if (!name) return null;
  const tasks = LM.getDeadlineTasks();
  const dl = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === deadlineId && s.kind === 'deadline');
  const task = {
    id: LM.uid(),
    deadlineId,
    title: name,
    category: LM.TODO_GROUPS.some((g) => g.key === category) ? category : 'main',
    done: false,
    doneAt: 0,
    prereqIds: (prereqIds || []).filter((pid) => tasks.some((t) => t.id === pid && t.deadlineId === deadlineId)),
    manualShown: false,
    visibleSince: '',
    deadlineName: dl ? dl.name : '',
    deadlineDate: dl ? dl.date : '',
    createdAt: Date.now(),
  };
  tasks.push(task);
  LM.saveDeadlineTasks(tasks);
  return task;
};

// 達成状態の変更。既存の toggleTodoCheck は通さないので週間・ルーティン集計は変わらない
LM.toggleDeadlineTask = function (id, done) {
  const tasks = LM.getDeadlineTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) return false;
  t.done = !!done;
  t.doneAt = done ? Date.now() : 0;
  return LM.saveDeadlineTasks(tasks);
};

LM.setDeadlineTaskManualShown = function (id, shown) {
  const tasks = LM.getDeadlineTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) return false;
  t.manualShown = !!shown;
  return LM.saveDeadlineTasks(tasks);
};

LM.setDeadlineTaskPrereqs = function (id, ids) {
  const tasks = LM.getDeadlineTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) return false;
  const dep = LM._dlDependents(id, tasks);
  t.prereqIds = (ids || []).filter((pid) => pid !== id && !dep.has(pid) &&
    tasks.some((o) => o.id === pid && o.deadlineId === t.deadlineId));
  return LM.saveDeadlineTasks(tasks);
};

LM.deleteDeadlineTask = function (id) {
  const tasks = LM.getDeadlineTasks().filter((t) => t.id !== id);
  tasks.forEach((t) => {
    if ((t.prereqIds || []).includes(id)) t.prereqIds = t.prereqIds.filter((p) => p !== id);
  });
  return LM.saveDeadlineTasks(tasks);
};

// ホーム用: 直近の締切(今日以降)と、進捗・表示条件を満たす未完了タスク
LM.getDeadlineOverview = function (limit) {
  const today = LM.todayStr();
  const all = LM.refreshDeadlineTaskLinks();
  return LM.get(LM.KEYS.SCHEDULES, [])
    .filter((s) => s.kind === 'deadline' && s.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, limit || 3)
    .map((s) => {
      const mine = all.filter((t) => t.deadlineId === s.id);
      return {
        deadline: s,
        remainDays: LM.daysBetween(today, s.date),
        total: mine.length,
        done: mine.filter((t) => t.done).length,
        pending: mine.filter((t) => !t.done && LM.isDeadlineTaskVisible(t, all)),
      };
    });
};

/* ---------- UI部品 ---------- */
LM._dlEl = function (tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

LM._dlEnsureStyle = function () {}; // 見た目は style.css の dl- 系クラスに移した

// 並び順: 締切が近い順 → 作成順
LM._dlCompare = function (a, b) {
  return (a.deadlineDate || '9999-99-99').localeCompare(b.deadlineDate || '9999-99-99') ||
    (a.createdAt || 0) - (b.createdAt || 0);
};

// 今日のタスク一覧に出す連携タスク(表示条件を満たし、未達成、または今日達成したもの)
LM.getActiveDeadlineTasks = function () {
  const all = LM.refreshDeadlineTaskLinks();
  const today = LM.todoDayKey();
  const alive = new Set(LM.get(LM.KEYS.SCHEDULES, [])
    .filter((s) => s.kind === 'deadline').map((s) => s.id));
  return all
    .filter((t) => LM.isDeadlineTaskVisible(t, all) &&
      (!t.done || (t.doneAt && LM.taskDayKey(new Date(t.doneAt)) === today)))
    .map((t) => Object.assign({}, t, { orphan: !alive.has(t.deadlineId) }))
    .sort(LM._dlCompare);
};

// メイン分の配置: 空いているメイン枠を、締切が近い順に前から使う。
// 枠が足りない場合は、(1)7日以内の締切でメインにタスクがある締切が2つ以上ある時の7日以内のタスク、
// (2)今日先行条件をクリアしたタスク、だけ追加行にする。それ以外は枠待ち。期限切れ・削除済みは追加行
LM.getLinkedMainPlan = function () {
  const state = LM.getTodoState();
  const today = LM.todoDayKey();
  const todayStr = LM.todayStr();
  const freeIdx = [];
  LM.TODO_MAIN_IDS.forEach((id, i) => {
    const task = state.dailyTasks[id];
    if (!String((task && task.name) || '').trim()) freeIdx.push(i);
  });
  const active = LM.getActiveDeadlineTasks().filter((t) => t.category === 'main');
  const isUrgent = (t) => !t.orphan && t.deadlineDate &&
    LM.daysBetween(todayStr, t.deadlineDate) <= 7;
  const urgentMode = new Set(active.filter(isUrgent).map((t) => t.deadlineId)).size >= 2;
  const slots = {};
  const extra = [];
  const orphans = [];
  const queued = new Set();
  active.forEach((t) => {
    if (t.orphan) orphans.push(t);
    else if (freeIdx.length) slots[freeIdx.shift()] = t;
    else if (urgentMode && isUrgent(t)) extra.push(t);
    else if (t.visibleSince === today && (t.prereqIds || []).length > 0) extra.push(t);
    else queued.add(t.id);
  });
  const extras = extra.concat(orphans);
  const shown = Object.keys(slots).map(Number).sort((a, b) => a - b)
    .map((i) => slots[i]).concat(extras);
  return { slots, extra: extras, queued, shown };
};

// 締切タスクがメイン枠を占める分のタイトル(最大3件)。when: 'today'(反映時) / 'tomorrow'(明日のタスク入力時)
LM.getMainLockTitles = function (when) {
  const all = LM.refreshDeadlineTaskLinks();
  const alive = new Set(LM.get(LM.KEYS.SCHEDULES, [])
    .filter((s) => s.kind === 'deadline').map((s) => s.id));
  const list = when === 'tomorrow'
    ? all.filter((t) => !t.done && LM.isDeadlineTaskVisible(t, all))
    : LM.getActiveDeadlineTasks();
  return list
    .filter((t) => t.category === 'main' && alive.has(t.deadlineId))
    .sort(LM._dlCompare)
    .slice(0, 3)
    .map((t) => t.title);
};

// 締切の詳細・編集に「関連タスク」を追加する(wrap内だけを再描画し、モーダルは作り直さない)
// opts.flat: true なら追加フォームを折りたたまずに出す(アコーディオン内で使う時)
LM.appendDeadlineTaskPanel = function (wrap, schedule, opts) {
  opts = opts || {};
  const box = LM._dlEl('div', 'dl-panel');
  wrap.appendChild(box);
  let openPrereqId = null;
  let addOpen = false;
  const labelOf = (key) => {
    const g = LM.TODO_GROUPS.find((x) => x.key === key);
    return g ? g.label : key;
  };

  function checkItem(text, checked, pid) {
    const label = LM._dlEl('label', 'lm-check-item');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.dataset.pid = pid;
    label.append(input, LM._dlEl('span', '', text));
    return { label, input };
  }

  function actionBtn(text, cls, handler) {
    const b = LM._dlEl('button', 'dl-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  }

  function render() {
    const all = LM.refreshDeadlineTaskLinks();
    const plan = LM.getLinkedMainPlan();
    const mine = all.filter((t) => t.deadlineId === schedule.id);
    const doneCount = mine.filter((t) => t.done).length;
    box.replaceChildren();

    const head = LM._dlEl('div', 'dl-head');
    head.append(LM._dlEl('span', '', '関連タスク'), LM._dlEl('span', 'dl-head-count', `${doneCount}/${mine.length}`));
    box.appendChild(head);

    if (mine.length === 0) {
      box.appendChild(LM._dlEl('p', 'lm-empty', '関連タスクはまだありません'));
    } else {
      const track = LM._dlEl('div', 'lm-progress-track');
      const fill = LM._dlEl('div', 'lm-progress-fill');
      fill.style.width = `${Math.round((doneCount / mine.length) * 100)}%`;
      track.appendChild(fill);
      box.appendChild(track);
    }

    mine.forEach((t) => {
      const visible = LM.isDeadlineTaskVisible(t, all);
      const prereqs = t.prereqIds || [];
      const row = LM._dlEl('div', 'dl-row' + (t.done ? ' is-done' : '') + (!visible ? ' is-waiting' : ''));

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.addEventListener('change', () => { LM.toggleDeadlineTask(t.id, cb.checked); render(); });

      const meta = LM._dlEl('div', 'dl-meta');
      meta.appendChild(LM._dlEl('span', 'dl-badge', labelOf(t.category)));
      if (prereqs.length) meta.appendChild(LM._dlEl('span', 'dl-badge', `先行${prereqs.length}件`));
      if (t.manualShown) meta.appendChild(LM._dlEl('span', 'dl-badge is-on', '手動表示中'));
      else if (!visible) meta.appendChild(LM._dlEl('span', 'dl-badge is-wait', '待機中'));
      if (visible && plan.queued.has(t.id)) meta.appendChild(LM._dlEl('span', 'dl-badge is-wait', '枠待ち'));

      const actions = LM._dlEl('div', 'dl-actions');
      actions.appendChild(actionBtn('先行条件', '', () => {
        openPrereqId = openPrereqId === t.id ? null : t.id;
        render();
      }));
      if (t.manualShown || !visible) {
        actions.appendChild(actionBtn(t.manualShown ? '待機に戻す' : '手動で表示', '', () => {
          LM.setDeadlineTaskManualShown(t.id, !t.manualShown);
          render();
        }));
      }
      actions.appendChild(actionBtn('削除', 'is-danger', () => {
        if (!confirm('このタスクを削除しますか?')) return;
        LM.deleteDeadlineTask(t.id);
        render();
      }));

      row.append(cb, LM._dlEl('span', 'dl-title', t.title), meta, actions);
      box.appendChild(row);

      if (openPrereqId === t.id) {
        const dep = LM._dlDependents(t.id, all);
        const cands = mine.filter((o) => o.id !== t.id && !dep.has(o.id));
        const pr = LM._dlEl('div', 'dl-prereq');
        if (cands.length === 0) {
          pr.appendChild(LM._dlEl('div', 'dl-prereq-title', '先行にできるタスクがありません'));
        } else {
          pr.appendChild(LM._dlEl('div', 'dl-prereq-title', '先行タスク(全て達成すると表示)'));
          const list = LM._dlEl('div', 'lm-check-list');
          cands.forEach((o) => {
            const { label, input } = checkItem(o.title, prereqs.includes(o.id), o.id);
            input.addEventListener('change', () => {
              const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.pid);
              LM.setDeadlineTaskPrereqs(t.id, ids);
              render();
            });
            list.appendChild(label);
          });
          pr.appendChild(list);
        }
        box.appendChild(pr);
      }
    });

    // 追加フォーム(flatでなければ折りたたみ。追加後も開いたままにする)
    const flat = !!opts.flat;
    const details = LM._dlEl(flat ? 'div' : 'details', flat ? 'dl-add' : 'hs-add-details dl-add');
    if (!flat) {
      details.open = addOpen;
      details.addEventListener('toggle', () => { addOpen = details.open; });
      details.appendChild(LM._dlEl('summary', 'lm-btn secondary', '＋ タスクを追加'));
    }
    const form = LM._dlEl('div', 'dl-add-form');

    const nameField = LM._dlEl('div', 'lm-field');
    nameField.appendChild(LM._dlEl('label', '', 'タスク名'));
    const input = document.createElement('input');
    input.type = 'text';
    nameField.appendChild(input);

    const catField = LM._dlEl('div', 'lm-field');
    catField.appendChild(LM._dlEl('label', '', '分類'));
    const sel = document.createElement('select');
    LM.TODO_GROUPS.forEach((g) => {
      const o = document.createElement('option');
      o.value = g.key;
      o.textContent = g.label;
      sel.appendChild(o);
    });
    catField.appendChild(sel);
    form.append(nameField, catField);

    const preList = LM._dlEl('div', 'lm-check-list');
    if (mine.length) {
      const preField = LM._dlEl('div', 'lm-field');
      preField.appendChild(LM._dlEl('label', '', '先行タスク(任意・全て達成すると表示)'));
      mine.forEach((o) => preList.appendChild(checkItem(o.title, false, o.id).label));
      preField.appendChild(preList);
      form.appendChild(preField);
    }

    const btn = LM._dlEl('button', 'lm-btn', '追加');
    btn.type = 'button';
    const submit = () => {
      const ids = [...preList.querySelectorAll('input:checked')].map((i) => i.dataset.pid);
      if (!LM.addDeadlineTask(schedule.id, input.value, sel.value, ids)) {
        input.focus();
        return;
      }
      addOpen = true;
      render();
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
    });
    form.appendChild(btn);
    details.appendChild(form);
    box.appendChild(details);
  }
  render();
};

// 締切の新規作成フォーム用: 保存前のタスクを一時的に持ち、締切の保存時にまとめて登録する
// 編集中の締切では showExisting で実データの管理画面に切り替える
LM.createDeadlineTaskDraft = function (container, onChange) {
  let drafts = [];
  const labelOf = (key) => {
    const g = LM.TODO_GROUPS.find((x) => x.key === key);
    return g ? g.label : key;
  };
  const notify = (n) => { if (onChange) onChange(n); };

  function render() {
    container.replaceChildren();
    if (drafts.length === 0) {
      container.appendChild(LM._dlEl('p', 'lm-empty', '追加するタスクはまだありません'));
    }
    drafts.forEach((d) => {
      const row = LM._dlEl('div', 'dl-draft-row');
      row.appendChild(LM._dlEl('span', 'dl-draft-title', d.title));
      row.appendChild(LM._dlEl('span', 'dl-badge', labelOf(d.category)));
      if (d.prereqIds.length) row.appendChild(LM._dlEl('span', 'dl-badge', `先行${d.prereqIds.length}件`));
      const del = LM._dlEl('button', 'dl-btn is-danger', '削除');
      del.type = 'button';
      del.addEventListener('click', () => {
        drafts = drafts.filter((x) => x.id !== d.id);
        drafts.forEach((x) => { x.prereqIds = x.prereqIds.filter((p) => p !== d.id); });
        render();
        notify(drafts.length);
      });
      row.appendChild(del);
      container.appendChild(row);
    });

    const form = LM._dlEl('div', 'dl-add-form');
    const nameField = LM._dlEl('div', 'lm-field');
    nameField.appendChild(LM._dlEl('label', '', 'タスク名'));
    const input = document.createElement('input');
    input.type = 'text';
    nameField.appendChild(input);

    const catField = LM._dlEl('div', 'lm-field');
    catField.appendChild(LM._dlEl('label', '', '分類'));
    const sel = document.createElement('select');
    LM.TODO_GROUPS.forEach((g) => {
      const o = document.createElement('option');
      o.value = g.key;
      o.textContent = g.label;
      sel.appendChild(o);
    });
    catField.appendChild(sel);
    form.append(nameField, catField);

    const preList = LM._dlEl('div', 'lm-check-list');
    if (drafts.length) {
      const preField = LM._dlEl('div', 'lm-field');
      preField.appendChild(LM._dlEl('label', '', '先行タスク(任意・全て達成すると表示)'));
      drafts.forEach((o) => {
        const label = LM._dlEl('label', 'lm-check-item');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.pid = o.id;
        label.append(cb, LM._dlEl('span', '', o.title));
        preList.appendChild(label);
      });
      preField.appendChild(preList);
      form.appendChild(preField);
    }

    const btn = LM._dlEl('button', 'lm-btn', '追加');
    btn.type = 'button';
    const submit = () => {
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      const ids = [...preList.querySelectorAll('input:checked')].map((i) => i.dataset.pid);
      drafts.push({ id: LM.uid(), title, category: sel.value, prereqIds: ids });
      render();
      notify(drafts.length);
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      // フォームの送信(保存)を防ぐ
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
    });
    form.appendChild(btn);
    container.appendChild(form);
  }

  render();
  return {
    // 締切の保存後に呼ぶ。先行条件は一時IDから実IDへ置き換えて登録する
    commit(deadlineId) {
      const idMap = new Map();
      drafts.forEach((d) => {
        const t = LM.addDeadlineTask(deadlineId, d.title, d.category,
          d.prereqIds.map((p) => idMap.get(p)).filter(Boolean));
        if (t) idMap.set(d.id, t.id);
      });
      const n = drafts.length;
      drafts = [];
      return n;
    },
    reset() { drafts = []; render(); notify(0); },
    showExisting(schedule) {
      drafts = [];
      container.replaceChildren();
      LM.appendDeadlineTaskPanel(container, schedule, { flat: true });
      notify(0);
    },
  };
};

// タスクページの連携タスクの1行
LM._dlTodoRow = function (t, rerender) {
  const info = LM.describeDeadlineTask(t);
  const row = LM._dlEl('div', 'lm-todo-row' + (t.done ? ' is-checked' : ''));
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = t.done;
  cb.addEventListener('change', () => {
    LM.toggleDeadlineTask(t.id, cb.checked);
    rerender(); // 先行条件のクリアで後続タスクが現れるため再描画する
  });
  const label = LM._dlEl('div', 'dl-todo-label');
  label.append(
    LM._dlEl('span', 'dl-todo-title', t.title),
    LM._dlEl('span', 'dl-todo-meta' + (info.orphan ? ' is-orphan' : ''), info.text)
  );
  row.append(cb, label);
  if (info.orphan) {
    const rm = LM._dlEl('button', 'lm-todo-slot-remove', '-');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'この連携タスクを削除');
    rm.addEventListener('click', () => {
      if (!confirm('この連携タスクを削除しますか?')) return;
      LM.deleteDeadlineTask(t.id);
      rerender();
    });
    row.appendChild(rm);
  }
  return row;
};

// タスクページの各グループに連携タスクを出す
// 空いている枠の行を連携タスクに差し替え、埋まっていれば行を足す(メインは上のルールで配置)
LM.appendLinkedTodoRows = function (groupEl, groupKey, rerender) {
  const rows = [...groupEl.querySelectorAll(':scope > .lm-todo-row')];
  if (groupKey === 'main') {
    const plan = LM.getLinkedMainPlan();
    Object.keys(plan.slots).forEach((i) => {
      const row = LM._dlTodoRow(plan.slots[i], rerender);
      if (rows[Number(i)]) rows[Number(i)].replaceWith(row);
      else groupEl.appendChild(row);
    });
    plan.extra.forEach((t) => groupEl.appendChild(LM._dlTodoRow(t, rerender)));
    return;
  }
  // メイン以外: 明日のタスク(すでに枠に入っている)を優先し、空き枠に入れる。なければ行を足す
  const isEmptyRow = (row) => {
    const input = row.querySelector('input[type="text"]');
    return !!input && input.value.trim() === '';
  };
  const free = rows.filter(isEmptyRow);
  LM.getActiveDeadlineTasks()
    .filter((t) => t.category === groupKey)
    .forEach((t) => {
      const row = LM._dlTodoRow(t, rerender);
      const slot = free.shift();
      if (slot) slot.replaceWith(row);
      else groupEl.appendChild(row);
    });
};

/* ---------- 通知まわり(締切タスクの集計・明日のタスクの自動入力・サブ文章) ---------- */
LM.TOMORROW_KEY = 'lm_tomorrowTasks';

// 明日のタスクの自動入力。AM4:00以降、どのページを最初に開いても反映する(タスクページに限らない)
LM.applyTomorrowTasks = function () {
  const pending = LM.get(LM.TOMORROW_KEY, null);
  if (!pending || !pending.forDay) return false;
  const state = LM.getTodoState(); // AM4:00のリセット判定を先に済ませる
  if (pending.forDay > state.dayKey) return false; // まだ先の日の分は残す
  let applied = false;
  if (pending.forDay === state.dayKey) {
    const slots = Math.max(1, Number(pending.otherSlotCount) || 1);
    if (slots > state.otherSlotCount) state.otherSlotCount = LM.configureOtherTodoSlots(slots);
    LM.TODO_GROUPS.forEach((g) => g.ids.forEach((id) => {
      if (!state.dailyTasks[id]) state.dailyTasks[id] = { name: '', checked: false };
    }));
    const locked = new Set(LM.TODO_MAIN_IDS.slice(0, LM.getMainLockTitles('today').length));
    const tasks = pending.tasks || {};
    Object.keys(tasks).forEach((id) => {
      if (locked.has(id)) return; // 締切タスクが占める枠には反映しない
      const name = String(tasks[id] || '').trim();
      if (!name || !state.dailyTasks[id]) return;
      if (String(state.dailyTasks[id].name || '').trim()) return; // 既にある内容は上書きしない
      LM.setTodoTaskName(state, id, name);
      applied = true;
    });
    LM.saveTodoState(state);
  }
  localStorage.removeItem(LM.TOMORROW_KEY); // 反映済み・期限切れはここで消す
  return applied;
};

// 今日のタスク一覧に出ている締切タスク(期限切れ・削除済みは除く)
LM.getShownDeadlineTasks = function () {
  const mainShown = LM.getLinkedMainPlan().shown;
  const others = LM.getActiveDeadlineTasks().filter((t) => t.category !== 'main');
  return mainShown.concat(others).filter((t) => !t.orphan);
};

// 固定枠のタスクに、締切タスクも加えた集計(通知の判定に使う)
LM.summarizeAllTodoTasks = function (state, dayKey) {
  const base = LM.summarizeTodoTasks(state, dayKey);
  const shown = LM.getShownDeadlineTasks();
  if (shown.length === 0) return base;
  const main = shown.filter((t) => t.category === 'main');
  const other = shown.filter((t) => t.category !== 'main');
  const mainEntered = base.mainEntered + main.length;
  const mainUnfinished = base.mainUnfinished + main.filter((t) => !t.done).length;
  const otherUnfinished = base.otherUnfinished + other.filter((t) => !t.done).length;
  return {
    entered: base.entered + main.length + other.length,
    mainEntered,
    mainUnfinished,
    mainComplete: mainEntered > 0 && mainUnfinished === 0,
    otherUnfinished,
    unfinished: mainUnfinished + otherUnfinished,
  };
};

// 締切タスクだけがある日の「入力時刻」の代わり(その日のAM4:00)。未達成通知の起点に使う
LM.linkedTasksEnteredAt = function (dayKey) {
  if (LM.getShownDeadlineTasks().length === 0) return 0;
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 4, 0, 0, 0).getTime();
};

// 未達成の締切タスクがある締切を、近い順に返す
LM.getUnfinishedDeadlines = function () {
  const ids = new Set(LM.getShownDeadlineTasks().filter((t) => !t.done).map((t) => t.deadlineId));
  return LM.get(LM.KEYS.SCHEDULES, [])
    .filter((s) => s.kind === 'deadline' && ids.has(s.id))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
};

// 通知のサブ文章(近い順に最大2件)
LM.buildDeadlineNoteLines = function () {
  const today = LM.todayStr();
  const list = LM.getUnfinishedDeadlines();
  const lines = list.slice(0, 2).map((s) => {
    const d = LM.daysBetween(today, s.date);
    if (d <= 0) return `「${s.name}」の締切は今日の${s.start}です`;
    if (d === 1) return `「${s.name}」の締切は明日の${s.start}です`;
    return `「${s.name}」の締切まで、あと${d}日です`;
  });
  if (list.length > 2) lines.push(`ほか${list.length - 2}件の締切にも、未達成のタスクがあります`);
  return lines;
};

// 外部通知用: 同期するデータの中で、締切タスクを空いている枠に入れる(端末内のデータは変えない)
LM.mergeLinkedTasksForSync = function (todo) {
  try {
    if (!todo || todo.dayKey !== LM.todoDayKey()) return;
    const plan = LM.getLinkedMainPlan();
    LM.TODO_MAIN_IDS.forEach((id, i) => {
      const t = plan.slots[i];
      if (t) todo.dailyTasks[id] = { name: t.title, checked: t.done };
    });
    LM.getActiveDeadlineTasks().filter((t) => !t.orphan && t.category !== 'main').forEach((t) => {
      const group = LM.TODO_GROUPS.find((g) => g.key === t.category);
      if (!group) return;
      const id = group.ids.find((gid) => !String((todo.dailyTasks[gid] && todo.dailyTasks[gid].name) || '').trim());
      if (id) todo.dailyTasks[id] = { name: t.title, checked: t.done };
    });
    if (!Number(todo.taskEnteredAt)) todo.taskEnteredAt = LM.linkedTasksEnteredAt(todo.dayKey);
    // 外部通知のサブ文章用: 未達成の締切タスクがある締切のid(近い順)
    todo.unfinishedDeadlineIds = LM.getUnfinishedDeadlines().map((s) => s.id);
  } catch (e) {
    console.error('mergeLinkedTasksForSync failed', e);
  }
};

// ページを開いた時: 明日のタスクを反映し、日付が変わった最初の1回は状態を同期する
try {
  LM.applyTomorrowTasks();
  const syncDay = LM.todoDayKey();
  if (localStorage.getItem('lm_taskSyncDay') !== syncDay) {
    localStorage.setItem('lm_taskSyncDay', syncDay);
    LM.getTodoState();
    LM.syncFirebaseDebounced(3000);
  }
} catch (e) {
  console.error('task startup failed', e);
}
