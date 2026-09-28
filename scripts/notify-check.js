const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function jstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9(日本時間)
}

function todayStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clockToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function calcPrepStartMin(s) {
  const arriveMin = clockToMinutes(s.start) - (s.arriveBeforeMin || 0);
  const departMin = arriveMin - (s.travelMin || 0);
  return departMin - (s.prepMin || 0);
}

function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  return Math.round((to - from) / 86400000);
}

async function main() {
  const ref = db.collection('notify').doc('state');
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('notify/state がまだありません');
    return;
  }
  const data = snap.data();
  const tokens = data.tokens || [];
  if (tokens.length === 0) {
    console.log('登録されたトークンがありません');
    return;
  }

  const now = jstNow();
  const today = todayStr(now);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const notifiedKeys = new Set(data.notifiedKeys || []);
  const messages = [];

  (data.schedules || [])
    .filter((s) => s.date === today)
    .forEach((s) => {
      const startMin = clockToMinutes(s.start);
      if (Math.abs(startMin - nowMin) <= 5) {
        const key = `start:${s.id}:${today}`;
        if (!notifiedKeys.has(key)) {
          messages.push({ title: 'まもなく予定の時間です', body: `${s.name}(${s.start}〜)` });
          notifiedKeys.add(key);
        }
      }
      if ((s.prepMin || 0) + (s.travelMin || 0) + (s.arriveBeforeMin || 0) > 0) {
        const prepStartMin = calcPrepStartMin(s);
        if (Math.abs(prepStartMin - nowMin) <= 5) {
          const key = `prep:${s.id}:${today}`;
          if (!notifiedKeys.has(key)) {
            messages.push({ title: '準備を始める時間です', body: `${s.name}の準備開始時刻です` });
            notifiedKeys.add(key);
          }
        }
      }
    });

  (data.events || [])
    .filter((ev) => ev.end >= today)
    .forEach((ev) => {
      const remainDays = daysBetween(today, ev.end);
      if (remainDays <= 3) {
        const key = `event:${ev.id}:${today}`;
        if (!notifiedKeys.has(key)) {
          messages.push({ title: 'イベント終了が近づいています', body: `${ev.name}(残り${remainDays}日)` });
          notifiedKeys.add(key);
        }
      }
    });

  if (messages.length === 0) {
    console.log('該当する通知はありません');
    return;
  }

  // data-onlyメッセージで送る(表示はService Worker側で1回だけ行う。二重表示防止)
  const invalidTokens = new Set();
  for (const msg of messages) {
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: msg.title, body: msg.body },
        webpush: { headers: { Urgency: 'high', TTL: '300' } },
      });
      console.log(`「${msg.title}」 成功:${res.successCount} 失敗:${res.failureCount}`);
      res.responses.forEach((r, i) => {
        if (r.success) {
          console.log(`  token[${i}] OK`);
        } else {
          const code = r.error && r.error.code;
          console.log(`  token[${i}] NG: ${code} / ${r.error && r.error.message}`);
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.add(tokens[i]);
          }
        }
      });
    } catch (e) {
      console.error('送信失敗', e);
    }
  }

  // 無効になったトークンはFirestoreから取り除く
  const update = { notifiedKeys: Array.from(notifiedKeys).slice(-500) };
  if (invalidTokens.size > 0) {
    update.tokens = tokens.filter((t) => !invalidTokens.has(t));
    console.log(`無効なトークンを${invalidTokens.size}件削除しました`);
  }
  await ref.set(update, { merge: true });
  console.log(`${messages.length}件の通知を処理しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
