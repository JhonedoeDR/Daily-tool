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

// 締切の通知設定(app.js の LM.DEADLINE_NOTIFY_OPTIONS と同じ内容にしておく)
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

/* ---------- タスクの集計(タスクの「1日」はAM4:00区切り) ---------- */
// 端末が今日(4時以降)にまだ開かれていなくても、「明日のタスク」で入力済みの分があれば
// それを今日のタスクとして扱う(アプリを開いた時の自動入力と同じ結果になる)
function effectiveTodo(state, dayKey) {
  const todo = state.todo;
  if (todo && todo.dayKey === dayKey) {
    const pending = state.tomorrowTasks;
    // 端末側で自動入力が済む前に同期された場合も、空いている枠には明日のタスクを入れる
    if (pending && pending.forDay === dayKey && pending.tasks) {
      const tasks = Object.assign({}, todo.dailyTasks || {});
      let added = false;
      Object.keys(pending.tasks).forEach((id) => {
        const name = String(pending.tasks[id] || '').trim();
        if (!name || (tasks[id] && String(tasks[id].name || '').trim())) return;
        tasks[id] = { name, checked: false };
        added = true;
      });
      if (added) {
        const enteredAt = Number(todo.taskEnteredAt) > 0 ? Number(todo.taskEnteredAt) : jstMidnightEpoch(dayKey) + 4 * HOUR_MS;
        return Object.assign({}, todo, { dailyTasks: tasks, taskEnteredAt: enteredAt });
      }
    }
    return todo;
  }
  const pending = state.tomorrowTasks;
  {
    const tasks = {};
    // ルーティンは名前が翌日に引き継がれる(同じ月の間だけ)ので、前日の端末の名前を持ってくる
    const old = state.todo && state.todo.dailyTasks;
    if (old && String(state.todo.dayKey || '').slice(0, 7) === dayKey.slice(0, 7)) {
      ['rt1', 'rt2', 'rt3'].forEach((id) => {
        const name = String((old[id] && old[id].name) || '').trim();
        if (name) tasks[id] = { name, checked: false };
      });
    }
    if (pending && pending.forDay === dayKey && pending.tasks) {
      Object.keys(pending.tasks).forEach((id) => {
        const name = String(pending.tasks[id] || '').trim();
        if (name) tasks[id] = { name, checked: false };
      });
    }
    if (Object.keys(tasks).length === 0) return null;
    return { dayKey, dailyTasks: tasks, taskEnteredAt: jstMidnightEpoch(dayKey) + 4 * HOUR_MS };
  }
  return null;
}

function summarizeTasks(state, dayKey) {
  const todo = effectiveTodo(state, dayKey);
  if (!todo) {
    return { entered: 0, mainEntered: 0, mainUnfinished: 0, mainComplete: false, otherUnfinished: 0, unfinished: 0 };
  }
  const tasks = todo.dailyTasks || {};
  const entered = Object.values(tasks).filter((task) => task && String(task.name || '').trim()).length;
  const mainTasks = ['main1', 'main2', 'main3']
    .map((id) => tasks[id])
    .filter((task) => task && String(task.name || '').trim());
  const mainEntered = mainTasks.length;
  const mainUnfinished = mainTasks.filter((task) => !task.checked).length;
  const otherUnfinished = Object.entries(tasks)
    .filter(([id, task]) => !/^main\d+$/.test(id) && task && String(task.name || '').trim() && !task.checked)
    .length;
  return {
    entered,
    mainEntered,
    mainUnfinished,
    mainComplete: mainEntered > 0 && mainUnfinished === 0,
    otherUnfinished,
    unfinished: mainUnfinished + otherUnfinished,
  };
}

/* ---------- 未達成のタスク通知に添える、締切の文(近い順に最大2件) ----------
   アプリ側が同期する todo.unfinishedDeadlineIds(未達成の締切タスクがある締切のid)を使う */
function buildDeadlineNoteLines(st, nowMs) {
  const ids = (st.todo && Array.isArray(st.todo.unfinishedDeadlineIds)) ? st.todo.unfinishedDeadlineIds : [];
  if (ids.length === 0) return [];
  const today = jstDateStr(nowMs);
  const list = ids
    .map((id) => (st.schedules || []).find((s) => s.id === id && s.kind === 'deadline'))
    .filter((s) => s && s.date && s.date >= today);
  const lines = list.slice(0, 2).map((s) => {
    const d = daysBetween(today, s.date);
    if (d <= 0) return `「${s.name}」の締切は今日の${s.start}です`;
    if (d === 1) return `「${s.name}」の締切は明日の${s.start}です`;
    return `「${s.name}」の締切まで、あと${d}日です`;
  });
  if (list.length > 2) lines.push(`ほか${list.length - 2}件の締切にも、未達成のタスクがあります`);
  return lines;
}

function roundHour(epochMs) {
  return Math.round(epochMs / HOUR_MS) * HOUR_MS;
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

  // メインタスク未入力: 7時から21時まで3時間ごと(7, 10, 13, 16, 19時)
  [7, 10, 13, 16, 19].forEach((h) => {
    items.push({
      key: `task-empty:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        // メイン以外(ルーティン含む)だけでも入力済みなら、未入力扱いにしない(未達成の通知に任せる)
        return summarizeTasks(st, dayKey).entered === 0
          ? { title: 'メインタスクが入力されていません', body: '今日のメインタスクを入力しましょう' }
          : null;
      },
    });
  });

  const todo = effectiveTodo(state, dayKey);
  const summary = summarizeTasks(state, dayKey);
  if (todo && summary.entered > 0 && !summary.mainComplete && summary.unfinished > 0) {
    // 入力時刻の記録がない(ルーティンの自動引き継ぎだけ等)日は、その日のAM4:00を起点にする
    const enteredAt = Number(todo.taskEnteredAt) > 0
      ? roundHour(Number(todo.taskEnteredAt))
      : jstMidnightEpoch(dayKey) + 4 * HOUR_MS;
    const resetAt = jstMidnightEpoch(dayKey) + 24 * HOUR_MS + 4 * HOUR_MS;
    for (let at = enteredAt + 3 * HOUR_MS; at < resetAt; at += 3 * HOUR_MS) {
      const reminderAt = at;
      items.push({
        key: `task-unfinished:${dayKey}:${reminderAt}`,
        at: reminderAt,
        build: (st) => {
          const current = summarizeTasks(st, dayKey);
          if (current.entered === 0 || current.mainComplete || current.unfinished === 0) return null;
          const lines = [`未達成 ${current.unfinished}件`];
          if (current.mainEntered === 0) lines.push('メインタスクは未入力です');
          return { title: '未達成のタスクがあります', body: [...lines, ...buildDeadlineNoteLines(st, Date.now())].join('\n') };
        },
      });
    }
  }

  // メインタスクを全て達成した後、その他に残っているタスクを19時と22時に通知
  [19, 22].forEach((h) => {
    items.push({
      key: `task-other-unfinished:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        const current = summarizeTasks(st, dayKey);
        return current.mainComplete && current.otherUnfinished > 0
          ? { title: 'その他に未達成のタスクがあります', body: [`未達成 ${current.otherUnfinished}件`, ...buildDeadlineNoteLines(st, Date.now())].join('\n') }
          : null;
      },
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
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
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
      const res = await admin.messaging().sendEachForMulticast({
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
    await stateRef.update({ tokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens) });
    console.log(`無効なトークンを${invalidTokens.size}件削除しました`);
  }
}

module.exports = { effectiveTodo, jstDateStr, jstMidnightEpoch, summarizeTasks, roundHour, buildItems, selectDue, calcPrepStartMin, buildDeadlineNoteLines };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
