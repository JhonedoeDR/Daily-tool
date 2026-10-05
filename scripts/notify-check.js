/* =========================================================
   通知チェック(GitHub Actionsから5分おきに起動される)
   - 起動時、これから8分以内に来る通知予定を探す
   - 見つけたら「予約(重複防止)」→ 指定時刻ちょうどまで待つ → 最新の状態で再判定 → 送信
   対象: 予定の開始/準備開始、イベント終了間近、タスク(7時/12時/19時)
   ========================================================= */
/* =========================================================
   通知チェック(GitHub Actionsから5分おきに起動される)
   - 起動時、これから8分以内に来る通知予定を探す
   - 見つけたら「予約(重複防止)」→ 指定時刻ちょうどまで待つ → 最新の状態で再判定 → 送信
   対象: 予定の開始/準備開始、イベント終了間近、タスク(7時/12時/19時)
   ========================================================= */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const LOOKAHEAD_MS = 8 * MIN_MS; // これより先の予定は次回以降の実行に任せる
const GRACE_MS = 4 * MIN_MS; // 時刻を少し過ぎていても送る猶予(実行が1回飛んだ時の保険)

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

/* ---------- タスクの集計(タスクの「1日」はAM4:00区切り、メイン/その他で分けて集計) ---------- */
function summarizeTasks(state, dayKey) {
  const todo = state.todo;
  // 端末側が今日(4時以降)にまだ開かれていない=リセット済み扱いで、未入力とみなす
  if (!todo || todo.dayKey !== dayKey) {
    return { mainEntered: 0, mainUnfinished: 0, otherEntered: 0, otherUnfinished: 0, enteredAt: null };
  }
  let mainEntered = 0;
  let mainUnfinished = 0;
  let otherEntered = 0;
  let otherUnfinished = 0;
  Object.entries(todo.dailyTasks || {}).forEach(([id, t]) => {
    if (!t || !String(t.name || '').trim()) return;
    if (id.startsWith('main')) {
      mainEntered += 1;
      if (!t.checked) mainUnfinished += 1;
    } else {
      otherEntered += 1;
      if (!t.checked) otherUnfinished += 1;
    }
  });
  return { mainEntered, mainUnfinished, otherEntered, otherUnfinished, enteredAt: todo.enteredAt || null };
}

// JSTで「分を四捨五入」して時刻ちょうどにする(例 9:40→10:00, 9:20→9:00)
function roundToHourJst(epochMs) {
  const localMs = epochMs + JST_OFFSET_MS;
  let hourMs = Math.floor(localMs / HOUR_MS) * HOUR_MS;
  if (localMs - hourMs >= 30 * MIN_MS) hourMs += HOUR_MS;
  return hourMs - JST_OFFSET_MS;
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
    .filter((s) => s.date === today && s.start)
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

  // タスク: AM7:00〜PM9:00、3時間ごとに未入力なら通知(メインタスクが1つでも入力されたら以降は出ない)
  for (let h = 7; h <= 21; h += 3) {
    items.push({
      key: `task-empty:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) =>
        summarizeTasks(st, dayKey).mainEntered === 0
          ? { title: 'タスクが入力されていません', body: '今日のタスクを入力しましょう' }
          : null,
    });
  }

  // タスク: 入力時刻(分は四捨五入)から3時間ごと、AM4:00のリセットまで。メインタスクが全て達成されたら停止
  {
    const snapshot = summarizeTasks(state, dayKey);
    if (snapshot.enteredAt) {
      const dayStart = jstMidnightEpoch(dayKey) + 4 * HOUR_MS; // この「タスクの日」が始まったAM4:00
      const resetAt = dayStart + 24 * HOUR_MS; // 次のAM4:00(リセット時刻)
      let t = roundToHourJst(snapshot.enteredAt);
      while (t < dayStart) t += 3 * HOUR_MS;
      for (; t < resetAt; t += 3 * HOUR_MS) {
        const hoursFromStart = Math.round((t - dayStart) / HOUR_MS);
        items.push({
          key: `task-unfinished:${dayKey}:${hoursFromStart}`,
          at: t,
          build: (st) => {
            const s = summarizeTasks(st, dayKey);
            if (s.mainUnfinished === 0) return null;
            return { title: '未達成のタスクがあります', body: `未達成 ${s.mainUnfinished + s.otherUnfinished}件` };
          },
        });
      }
    }
  }

  // タスク: その他(優先・プラス・スキマ・ルーティンなど、メイン以外)が残っていれば19時・22時に通知
  [19, 22].forEach((h) => {
    items.push({
      key: `task-other-remain:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        const s = summarizeTasks(st, dayKey);
        return s.otherUnfinished > 0
          ? { title: '未達成のタスクが残っています', body: `その他のタスク 未達成 ${s.otherUnfinished}件` }
          : null;
      },
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

module.exports = { jstDateStr, jstMidnightEpoch, summarizeTasks, buildItems, selectDue, calcPrepStartMin, roundToHourJst };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const LOOKAHEAD_MS = 8 * MIN_MS; // これより先の予定は次回以降の実行に任せる
const GRACE_MS = 4 * MIN_MS; // 時刻を少し過ぎていても送る猶予(実行が1回飛んだ時の保険)

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
function summarizeTasks(state, dayKey) {
  const todo = state.todo;
  // 端末側が今日(4時以降)にまだ開かれていない=リセット済み扱いで、未入力とみなす
  if (!todo || todo.dayKey !== dayKey) return { entered: 0, unfinished: 0 };
  let entered = 0;
  let unfinished = 0;
  Object.values(todo.dailyTasks || {}).forEach((t) => {
    if (t && String(t.name || '').trim()) {
      entered += 1;
      if (!t.checked) unfinished += 1;
    }
  });
  return { entered, unfinished };
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
    .filter((s) => s.date === today && s.start)
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

  // タスク: 7時に未入力なら通知
  items.push({
    key: `task-empty:${dayKey}`,
    at: midnight + 7 * HOUR_MS,
    build: (st) =>
      summarizeTasks(st, dayKey).entered === 0
        ? { title: 'タスクが入力されていません', body: '今日のタスクを入力しましょう' }
        : null,
  });

  // タスク: 12時と19時に、入力済みで未達成が残っていれば通知
  [12, 19].forEach((h) => {
    items.push({
      key: `task-unfinished:${dayKey}:${h}`,
      at: midnight + h * HOUR_MS,
      build: (st) => {
        const s = summarizeTasks(st, dayKey);
        return s.entered > 0 && s.unfinished > 0
          ? { title: '未達成のタスクがあります', body: `未達成 ${s.unfinished}件` }
          : null;
      },
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

module.exports = { jstDateStr, jstMidnightEpoch, summarizeTasks, buildItems, selectDue, calcPrepStartMin };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
