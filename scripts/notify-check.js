/* =========================================================
   通知チェック(GitHub Actionsから5分おきに起動される)
   - 起動時、これから8分以内に来る通知予定を探す
   - 見つけたら「予約(重複防止)」→ 指定時刻ちょうどまで待つ → 最新の状態で再判定 → 送信
   対象: 予定の開始/準備開始、イベント終了間近、タスクの定期通知
   ========================================================= */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const LOOKAHEAD_MS = 8 * MIN_MS; // これより先の予定は次回以降の実行に任せる
const GRACE_MS = 4 * MIN_MS; // 時刻を少し過ぎていても送る猶予(実行が1回飛んだ時の保険)

// 締切の通知設定(js/core/app.js の LM.DEADLINE_NOTIFY_OPTIONS と同じ内容にしておく)
const DEADLINE_NOTIFY_OPTIONS = {
  '30m': { min: 30, label: '30分前' },
  '1h': { min: 60, label: '1時間前' },
  '3h': { min: 180, label: '3時間前' },
  '1d': { min: 1440, label: '前日' },
  '3d': { min: 4320, label: '3日前' },
  '1w': { min: 10080, label: '1週間前' },
};

function formatDateJa(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()]})`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 日付・時刻ユーティリティ(すべてJST基準) ---------- */
function jstDateStr(epochMs) {
  const d = new Date(epochMs + JST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 指定日(JST)の0:00のepochミリ秒
function jstMidnightEpoch(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
}

function clockToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  return Math.round((to - from) / 86400000);
}

function calcDepartMin(s) {
  const arriveMin = clockToMinutes(s.start) - (s.arriveBeforeMin || 0);
  return arriveMin - (s.travelMin || 0);
}

function calcPrepStartMin(s) {
  return calcDepartMin(s) - (s.prepMin || 0);
}

function minutesToClock(totalMin) {
  const h = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const m = ((totalMin % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundHour(epochMs) {
  return Math.round(epochMs / HOUR_MS) * HOUR_MS;
}

function todoManagerTasks(state) {
  return Array.isArray(state.todoManager)
    ? state.todoManager.filter((task) => task && typeof task === 'object')
    : [];
}

function isTaskActive(task, today) {
  if (!task || task.archivedAt || !String(task.name || '').trim() ||
      (task.startDate && task.startDate > today) || (task.endDate && task.endDate < today)) return false;
  const routineDays = Array.isArray(task.routineDays) ? task.routineDays : [];
  if (routineDays.length && task.routinePeriod === 'weekly') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    if (!routineDays.includes(weekday)) return false;
  }
  if (routineDays.length && task.routinePeriod === 'monthly' &&
      !routineDays.includes(Number(today.slice(8, 10)))) return false;
  return task &&
    (!task.startDate || task.startDate <= today) &&
    (!task.endDate || task.endDate >= today);
}

function isTaskDone(task, today, dayKey) {
  if (!task || !task.checked) return false;
  if (task.category !== 'routine') return true;
  if (task.routinePeriod === 'monthly') return task.checkedDay === today.slice(0, 7);
  if (task.routinePeriod === 'weekly') {
    const date = new Date(`${today}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000);
    return task.checkedDay === monday.toISOString().slice(0, 10);
  }
  return task.checkedDay === dayKey;
}

function taskReminderBody(tasks, includeCategory) {
  const sorted = [...tasks].sort((a, b) => {
    if (a.endDate && !b.endDate) return -1;
    if (!a.endDate && b.endDate) return 1;
    if (a.endDate && b.endDate && a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
    return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
  });
  const first = sorted[0];
  if (!first) return '';
  const category = ({ main: 'メイン', routine: 'ルーティン', other: 'その他' })[first.category] || 'その他';
  const label = includeCategory ? `${category} の ${first.name}` : first.name;
  return `「${label}」${sorted.length > 1 ? `ほか${sorted.length - 1}つ` : ''}`;
}

/* ---------- 通知予定の一覧を作る ----------
   各要素: { key(重複防止用), at(送信したい時刻のepochミリ秒), build(最新state) => {title, body} | null } */
function buildItems(state, nowMs) {
  const items = [];
  const today = jstDateStr(nowMs);
  const dayKey = jstDateStr(nowMs - 4 * HOUR_MS); // AM4:00区切りの「タスクの日」
  const midnight = jstMidnightEpoch(today);

  // 予定: 開始時刻と準備開始時刻
  (state.schedules || [])
    .filter((s) => s.date === today && s.start && s.kind !== 'deadline')
    .forEach((s) => {
      items.push({
        key: `start:${s.id}:${today}`,
        at: midnight + clockToMinutes(s.start) * MIN_MS,
        build: (st) => {
          const cur = (st.schedules || []).find((x) => x.id === s.id);
          return cur ? { title: 'まもなく予定の時間です', body: `${cur.name}(${cur.start}〜)` } : null;
        },
      });
      if ((s.prepMin || 0) + (s.travelMin || 0) + (s.arriveBeforeMin || 0) > 0) {
        items.push({
          key: `prep:${s.id}:${today}`,
          at: midnight + calcPrepStartMin(s) * MIN_MS,
          build: (st) => {
            const cur = (st.schedules || []).find((x) => x.id === s.id);
            if (!cur) return null;
            const departClock = minutesToClock(calcDepartMin(cur));
            return { title: '準備を始める時間です', body: `${cur.name}の準備開始時刻です(出発時刻は${departClock}です)` };
          },
        });
      }
    });

  // イベント: 終了3日前以内(従来どおり、その日の最初の実行で1回だけ)
  (state.events || [])
    .filter((ev) => ev.end >= today)
    .forEach((ev) => {
      if (daysBetween(today, ev.end) > 3) return;
      items.push({
        key: `event:${ev.id}:${today}`,
        at: nowMs,
        build: (st) => {
          const cur = (st.events || []).find((x) => x.id === ev.id);
          if (!cur) return null;
          const remain = daysBetween(jstDateStr(Date.now()), cur.end);
          return remain >= 0 ? { title: 'イベント終了が近づいています', body: `${cur.name}(残り${remain}日)` } : null;
        },
      });
    });

  const managerTasks = todoManagerTasks(state);
  const currentManagerTasks = managerTasks.filter((task) => isTaskActive(task, today));
  const mainTasks = currentManagerTasks.filter((task) => task.category === 'main');
  const unfinishedMain = mainTasks.filter((task) => !isTaskDone(task, today, dayKey));

  // メインタスクがひとつもない間だけ、未入力通知を続ける。
  [7, 10, 13, 16, 19].forEach((h) => {
    items.push({
      key: `task-empty:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        const tasks = todoManagerTasks(st);
        const hasMain = tasks.some((task) => task.category === 'main' && !task.archivedAt &&
          (!task.endDate || task.endDate >= today));
        return !hasMain
          ? { title: 'メインタスクが入力されていません', body: '今日のメインタスクを入力しましょう' }
          : null;
      },
    });
  });

  if (unfinishedMain.length) {
    const taskDayStart = jstMidnightEpoch(dayKey) + 4 * HOUR_MS;
    const resetAt = taskDayStart + 24 * HOUR_MS;
    const createdAt = unfinishedMain.map((task) => Number(task.createdAt) || 0).filter(Boolean);
    const reminderBase = Math.max(taskDayStart, createdAt.length ? roundHour(Math.min(...createdAt)) : taskDayStart);
    for (let at = reminderBase + 3 * HOUR_MS; at < resetAt; at += 3 * HOUR_MS) {
      const reminderAt = at;
      items.push({
        key: `task-unfinished:${dayKey}:${reminderAt}`,
        at: reminderAt,
        build: (st) => {
          const current = todoManagerTasks(st).filter((task) => isTaskActive(task, today) &&
            task.category === 'main' && !isTaskDone(task, today, dayKey));
          if (!current.length) return null;
          return { title: 'メインタスクが未達成です', body: taskReminderBody(current, false) };
        },
      });
    }
  }

  // メインが完了済み、またはメイン以外だけが登録されている場合は1日3回通知する。
  [7, 12, 19].forEach((h) => {
    items.push({
      key: `task-other-unfinished:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        const tasks = todoManagerTasks(st).filter((task) => isTaskActive(task, today));
        const unfinishedPrimary = tasks.some((task) => task.category === 'main' &&
          !isTaskDone(task, today, dayKey));
        const unfinished = tasks.filter((task) => task.category !== 'main' &&
          !isTaskDone(task, today, dayKey));
        return !unfinishedPrimary && unfinished.length
          ? { title: 'タスクが未達成です', body: taskReminderBody(unfinished, true) }
          : null;
      },
    });
  });

  managerTasks.forEach((task) => {
    if (!task || !task.id || !task.name || isTaskDone(task, today, dayKey) ||
        !isTaskActive(task, today)) return;
    const notifications = task.notifications || {};
    const weekdays = Array.isArray(notifications.weekdays) ? notifications.weekdays : [];
    const times = Array.isArray(notifications.times) ? notifications.times : [];
    const weekday = new Date(nowMs + JST_OFFSET_MS).getUTCDay();
    if (weekdays.includes(weekday)) {
      times.forEach((time) => {
        if (!/^([01]\d|2[0-3]):00$/.test(time)) return;
        const at = midnight + clockToMinutes(time) * MIN_MS;
        items.push({
          key: `todo-task-weekly:${task.id}:${today}:${time}`,
          at,
          build: (st) => {
            const current = todoManagerTasks(st).find((item) => item.id === task.id);
            const currentNotifications = current && current.notifications || {};
            const currentWeekdays = Array.isArray(currentNotifications.weekdays) ? currentNotifications.weekdays : [];
            const currentTimes = Array.isArray(currentNotifications.times) ? currentNotifications.times : [];
            return current && isTaskActive(current, today) && !isTaskDone(current, today, dayKey) &&
              currentWeekdays.includes(weekday) && currentTimes.includes(time)
              ? { title: 'タスクの通知', body: current.name }
              : null;
          },
        });
      });
    }
    (Array.isArray(notifications.custom) ? notifications.custom : [])
      .filter((item) => item && item.date === today && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || ''))
      .forEach((item) => {
        const at = midnight + clockToMinutes(item.time) * MIN_MS;
        items.push({
          key: `todo-task-custom:${task.id}:${item.date}:${item.time}`,
          at,
          build: (st) => {
            const current = todoManagerTasks(st).find((entry) => entry.id === task.id);
            const currentCustom = current && current.notifications && current.notifications.custom;
            return current && isTaskActive(current, today) && !isTaskDone(current, today, dayKey) &&
              Array.isArray(currentCustom) && currentCustom.some((notification) =>
                notification && notification.date === item.date && notification.time === item.time)
              ? { title: 'タスクの通知', body: current.name }
              : null;
          },
        });
      });
  });
  
    // 締切: 通知設定で選んだ「◯分前」に通知(未来の日付の締切も対象)
  (state.schedules || [])
    .filter((s) => s.kind === 'deadline' && s.date && s.start && Array.isArray(s.notifyBefore))
    .forEach((s) => {
      const dueAt = jstMidnightEpoch(s.date) + clockToMinutes(s.start) * MIN_MS;
      s.notifyBefore.forEach((id) => {
        const opt = DEADLINE_NOTIFY_OPTIONS[id];
        if (!opt) return;
        items.push({
          key: `deadline:${s.id}:${id}:${s.date}:${s.start}`,
          at: dueAt - opt.min * MIN_MS,
          build: (st) => {
            const cur = (st.schedules || []).find((x) => x.id === s.id);
            if (!cur || cur.kind !== 'deadline') return null;
            // 削除・日時変更・通知設定の解除があれば送らない(変更後は別のキーで改めて予約される)
            if (cur.date !== s.date || cur.start !== s.start) return null;
            if (!Array.isArray(cur.notifyBefore) || !cur.notifyBefore.includes(id)) return null;
            return {
              title: '締切が近づいています',
              body: `${cur.name}(${formatDateJa(cur.date)} ${cur.start}・締切の${opt.label})`,
            };
          },
        });
      });
    });

  // ゲームのログイン忘れ: 指定時刻ごとに、その日のログイン記録がないゲームだけ通知
  (state.gameReminders || []).forEach((game) => {
    if (!game || game.notifyEnabled !== true || !game.id || !game.name) return;
    const reminderTimes = [...new Set((Array.isArray(game.reminderTimes) ? game.reminderTimes : [game.reminderTime || ''])
      .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))];
    if (!reminderTimes.length || game.lastLoginDate === today) return;
    reminderTimes.forEach((reminderTime) => {
      const at = midnight + clockToMinutes(reminderTime) * MIN_MS;
      items.push({
        key: `game-login:${game.id}:${today}:${reminderTime}`,
        at,
        build: (st) => {
          const current = (st.gameReminders || []).find((g) => g && g.id === game.id && g.notifyEnabled === true);
          const currentTimes = current
            ? (Array.isArray(current.reminderTimes) ? current.reminderTimes : [current.reminderTime || ''])
            : [];
          if (!current || !currentTimes.includes(reminderTime) || current.lastLoginDate === today) return null;
          return { title: 'ゲームのログイン確認', body: `「${current.name}」の今日のログインがまだ記録されていません` };
        },
      });
    });
  });

  return items;
}

// 今回の実行で扱う対象(窓の範囲内のものだけ、時刻順)
function selectDue(items, nowMs) {
  return items
    .filter((it) => it.at - nowMs >= -GRACE_MS && it.at - nowMs <= LOOKAHEAD_MS)
    .sort((a, b) => a.at - b.at);
}

/* ---------- Firebase関連(実行時のみ読み込む) ---------- */
async function main() {
  const { cert, initializeApp } = require('firebase-admin/app');
  const { FieldValue, getFirestore } = require('firebase-admin/firestore');
  const { getMessaging } = require('firebase-admin/messaging');
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const stateRef = db.collection('notify').doc('state');

  const snap = await stateRef.get();
  if (!snap.exists) {
    console.log('notify/state がまだありません');
    return;
  }
  const state = snap.data();
  if ((state.tokens || []).length === 0) {
    console.log('登録されたトークンがありません');
    return;
  }

  const nowMs = Date.now();
  const due = selectDue(buildItems(state, nowMs), nowMs);
  if (due.length === 0) {
    console.log('該当する通知はありません');
    return;
  }

  // 先に予約する(別の実行と重なっても二重送信しないため)
  const claimedItems = [];
  for (const it of due) {
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(stateRef);
      const keys = (s.exists && s.data().notifiedKeys) || [];
      if (keys.includes(it.key)) return false;
      tx.set(stateRef, { notifiedKeys: [...keys, it.key].slice(-500) }, { merge: true });
      return true;
    });
    if (ok) claimedItems.push(it);
    else console.log(`スキップ(送信済み/他の実行が担当): ${it.key}`);
  }

  const invalidTokens = new Set();
  for (const it of claimedItems) {
    const waitMs = it.at - Date.now();
    if (waitMs > 0) {
      console.log(`待機 ${Math.round(waitMs / 1000)}秒: ${it.key}`);
      await sleep(waitMs);
    }

    // 待っている間に状態が変わったかもしれないので、最新で再判定する
    const fresh = (await stateRef.get()).data() || {};
    const msg = it.build(fresh);
    if (!msg) {
      console.log(`条件を満たさないため送信しません: ${it.key}`);
      continue;
    }
    const tokens = fresh.tokens || [];
    if (tokens.length === 0) continue;

    try {
      // data-onlyで送る(表示はService Worker側で1回だけ行う)
      const res = await getMessaging().sendEachForMulticast({
        tokens,
        data: { title: msg.title, body: msg.body },
        webpush: { headers: { Urgency: 'high', TTL: '300' } },
      });
      console.log(`送信「${msg.title}」 成功:${res.successCount} 失敗:${res.failureCount}`);
      res.responses.forEach((r, i) => {
        if (r.success) return;
        const code = r.error && r.error.code;
        console.log(`  token[${i}] NG: ${code} / ${r.error && r.error.message}`);
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          invalidTokens.add(tokens[i]);
        }
      });
    } catch (e) {
      console.error('送信失敗', e);
    }
  }

  // 無効になったトークンだけを安全に取り除く(他の端末の登録と競合しないようarrayRemove)
  if (invalidTokens.size > 0) {
    await stateRef.update({ tokens: FieldValue.arrayRemove(...invalidTokens) });
    console.log(`無効なトークンを${invalidTokens.size}件削除しました`);
  }
}

module.exports = { jstDateStr, jstMidnightEpoch, roundHour, buildItems, selectDue, calcPrepStartMin };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
