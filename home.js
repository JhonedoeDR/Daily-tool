(function () {
  const today = LM.todayStr();

  /* ---------- 上部の円形UI(STEP 1: 見た目と切り替えのみ。中身の接続はSTEP 2以降) ----------
   * 順番は共有文書の機能一覧どおり。初期表示は手描き案に合わせてイベント(仮)。 */
  const CIRCLE_MODES = [
    { key: 'schedule', title: 'SCHEDULE', label: '予定逆算' },
    { key: 'task', title: 'TASKS', label: 'タスク' },
    { key: 'timecalc', title: 'TIME CALC', label: '時間計算' },
    { key: 'event', title: 'EVENTS', label: 'イベント' },
    { key: 'wish', title: 'WISH', label: 'ウィッシュリスト' },
  ];
  const DEFAULT_CIRCLE_MODE = 'event';

  // 右カラムの基本順(手描き案どおり)。表示があるものを先に並べる既存の挙動は右カラム内で維持
  const SIDE_ORDER = ['schedule', 'event', 'belongings', 'shift'];

  const SVGNS = 'http://www.w3.org/2000/svg';
  const RING_R = 76;
  const RING_LEN = 2 * Math.PI * RING_R;
  const WISH_CATEGORIES = [
    { name: '本', color: 'var(--accent)' },
    { name: '映像･作品', color: 'var(--accent-soft)' },
    { name: 'ゲーム', color: 'var(--accent-soft)' },
    { name: '生活雑貨', color: '#4a9db9' },
    { name: 'その他', color: 'var(--paper-line)' },
  ];

  // タイマー(円形カウントダウン)。時刻は「終了する時刻」を保存して計算するので、
  // 画面を閉じても・タイマーの回数がずれても正確に残り時間が分かる
  const TIMER_KEY = 'lm_homeTimer';
  const TIMER_STEP_MIN = 5;
  const TIMER_MIN = 5;
  const TIMER_MAX = 180;
  let currentMode = DEFAULT_CIRCLE_MODE;
  const timer = loadTimer();
  const LONG_PRESS_MS = 500;
  let moreOpen = false;

  const hasContent = {};
  let refreshCircle = function () {};

  setupCircle();
  hasContent.event = renderEvents();
  hasContent.task = renderTasks();
  hasContent.schedule = renderSchedules();
  hasContent.belongings = renderBelongings();
  hasContent.shift = renderShift();
  reorderSections();
  setupTaskLink();
  renderNotifyBanner();
  setupBackup();
  LM.renderNav(document.getElementById('nav-container'));
  setupHomeButton();
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshHomeData();
  });
  window.addEventListener('storage', (e) => {
    const dataKeys = [LM.KEYS.EVENTS, LM.KEYS.SCHEDULES, LM.KEYS.WISHLIST, LM.TODO_KEY];
    if (e.key === null || dataKeys.includes(e.key)) refreshHomeData();
  });

  function refreshHomeData() {
    hasContent.event = renderEvents();
    hasContent.task = renderTasks();
    hasContent.schedule = renderSchedules();
    hasContent.belongings = renderBelongings();
    hasContent.shift = renderShift();
    reorderSections();
    refreshCircle();
  }

  /* ---------- 円の切り替え(左右矢印・ドット・横スワイプ) ---------- */
  function setupCircle() {
    const hero = document.getElementById('hm-hero');
    const titleEl = document.getElementById('hm-mode-title');
    const circle = document.getElementById('hm-circle');
    const dotsEl = document.getElementById('hm-dots');
    let index = CIRCLE_MODES.findIndex((m) => m.key === DEFAULT_CIRCLE_MODE);
    if (index < 0) index = 0;

    CIRCLE_MODES.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hm-dot';
      b.setAttribute('aria-label', m.label);
      b.addEventListener('click', () => show(i, i > index ? 1 : -1));
      dotsEl.appendChild(b);
    });

    function show(i, dir) {
      const n = CIRCLE_MODES.length;
      index = ((i % n) + n) % n;
      const mode = CIRCLE_MODES[index];
      titleEl.textContent = mode.title;
      circle.dataset.mode = mode.key;
      currentMode = mode.key;
      renderCircleContent(mode.key);
      [...dotsEl.children].forEach((d, k) => d.setAttribute('aria-current', k === index ? 'true' : 'false'));
      if (dir) {
        hero.classList.remove('is-next', 'is-prev');
        void hero.offsetWidth; // アニメーションを再生し直す
        hero.classList.add(dir > 0 ? 'is-next' : 'is-prev');
      }
    }

    document.getElementById('hm-prev').addEventListener('click', () => show(index - 1, -1));
    document.getElementById('hm-next').addEventListener('click', () => show(index + 1, 1));

    // 横スワイプ: 縦スクロールと競合しないよう、横方向が十分大きい時だけ反応する
    let sx = 0;
    let sy = 0;
    let tracking = false;
    hero.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    hero.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const dir = dx < 0 ? 1 : -1; // 左スワイプ=次
        show(index + dir, dir);
      }
    }, { passive: true });
    hero.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });

    refreshCircle = function () { renderCircleContent(CIRCLE_MODES[index].key); };
    // 予定逆算の針は時間で動くので、表示中だけ30秒ごとに描き直す
    setInterval(() => { if (CIRCLE_MODES[index].key === 'schedule') refreshCircle(); }, 30000);

    // タイマー: 円の中央をタップで 開始/一時停止/再開、下のボタンで時間調整・リセット
    document.getElementById('hm-inner').addEventListener('click', () => {
      if (currentMode === 'timecalc') toggleTimer();
    });
    document.getElementById('hm-caption').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tc]');
      if (!btn || currentMode !== 'timecalc') return;
      if (btn.dataset.tc === 'dec') adjustTimer(-TIMER_STEP_MIN);
      if (btn.dataset.tc === 'inc') adjustTimer(TIMER_STEP_MIN);
      if (btn.dataset.tc === 'reset') resetTimer();
    });
    setInterval(() => {
      const finished = checkTimerFinish();
      if (currentMode !== 'timecalc') return;
      if (finished) { refreshCircle(); return; }
      if (timer.status === 'running') {
        // 残り時間と弧だけ更新(下のボタンは作り直さない)
        const r = modeTimeCalc();
        document.getElementById('hm-ring-dyn').replaceChildren(...(r.ring || []));
        document.getElementById('hm-inner').innerHTML = r.inner;
      }
    }, 250);

    show(index, 0);
  }

  /* ---------- 円の中身(STEP 2: 既存データを読むだけで、データは書き換えない) ---------- */
  function svgEl(name, attrs, styles) {
    const el = document.createElementNS(SVGNS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    Object.entries(styles || {}).forEach(([k, v]) => { el.style[k] = v; });
    return el;
  }

  // リング上の弧(fromとtoは0〜1、真上が0)
  function ringArc(from, to, color) {
    const len = Math.max(0, (to - from) * RING_LEN);
    return svgEl('circle', {
      cx: 100, cy: 100, r: RING_R, 'stroke-width': 40, fill: 'none',
      'stroke-dasharray': `${len} ${RING_LEN - len}`,
      'stroke-dashoffset': -from * RING_LEN,
      transform: 'rotate(-90 100 100)',
    }, { stroke: color });
  }

  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [100 + r * Math.sin(rad), 100 - r * Math.cos(rad)];
  }

  function renderCircleContent(key) {
    const build = {
      schedule: modeSchedule,
      task: modeTask,
      timecalc: modeTimeCalc,
      event: modeEvent,
      wish: modeWish,
    }[key];
    const r = build();
    document.getElementById('hm-ring-dyn').replaceChildren(...(r.ring || []));
    document.getElementById('hm-inner').innerHTML = r.inner;
    document.getElementById('hm-caption').innerHTML = r.caption || '';
  }

  function innerHtml(sub, big, note, note2) {
    return `<span class="hm-dow">${escapeHtml(sub)}</span>
      <span class="hm-date">${escapeHtml(big)}</span>
      ${note ? `<span class="hm-note">${escapeHtml(note)}</span>` : ''}
      ${note2 ? `<span class="hm-note">${escapeHtml(note2)}</span>` : ''}`;
  }

  // タスク: メインタスクの達成数(既存のメインタスク基準)
  function modeTask() {
    const state = LM.getTodoState();
    const main = LM.TODO_MAIN_IDS.map((id) => state.dailyTasks[id]).filter((t) => t.name.trim());
    const done = main.filter((t) => t.checked).length;
    if (main.length === 0) return { inner: innerHtml('メイン', '—', '未登録') };
    return {
      ring: [ringArc(0, done / main.length, 'var(--accent)')],
      inner: innerHtml('メイン', `${done}/${main.length}`, '達成'),
    };
  }

  // イベント: 終了日が一番近いイベントの達成率(現在値÷目標。既存カードの%と同じ値)
  function modeEvent() {
    const events = LM.get(LM.KEYS.EVENTS, [])
      .filter((ev) => ev.end >= today)
      .sort((a, b) => a.end.localeCompare(b.end));
    if (events.length === 0) return { inner: innerHtml('イベント', '—', '開催中なし') };
    const ev = events[0];
    const p = LM.calcEventProgress(ev, today);
    return {
      ring: [ringArc(0, p.rate / 100, 'var(--accent)')],
      inner: innerHtml(ev.name, `${p.rate}%`, `残り${p.remainDays}日`),
      caption: events.length > 1 ? `ほか${events.length - 1}件` : '',
    };
  }

  // 予定逆算: 12時間の文字盤に、今の時刻の針と一番近い予定の印を出す
  function modeSchedule() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = polar(i % 3 === 0 ? 84 : 88, i * 30);
      const [x2, y2] = polar(93, i * 30);
      ring.push(svgEl('line', { x1, y1, x2, y2, 'stroke-width': i % 3 === 0 ? 2.5 : 1.5, 'stroke-linecap': 'round' }, { stroke: 'var(--text-soft)' }));
    }
    const dial = (min) => ((min % 720) / 720) * 360;

    const list = LM.get(LM.KEYS.SCHEDULES, [])
      .filter((s) => s.date === today)
      .sort((a, b) => a.start.localeCompare(b.start));
    const next = list.find((s) => LM.clockToMinutes(s.end || s.start) >= nowMin);

    if (next) {
      const [mx, my] = polar(RING_R, dial(LM.clockToMinutes(next.start)));
      ring.push(svgEl('circle', { cx: mx, cy: my, r: 9, 'stroke-width': 2.5 }, { fill: 'var(--accent-soft)', stroke: 'var(--accent)' }));
    }
    const [hx1, hy1] = polar(60, dial(nowMin));
    const [hx2, hy2] = polar(82, dial(nowMin));
    ring.push(svgEl('line', { x1: hx1, y1: hy1, x2: hx2, y2: hy2, 'stroke-width': 5, 'stroke-linecap': 'round' }, { stroke: 'var(--accent)' }));

    if (list.length === 0) return { ring, inner: innerHtml('今日の予定', '—', 'なし') };
    if (!next) return { ring, inner: innerHtml('今日の予定', '終了', '') };

    const started = LM.clockToMinutes(next.start) <= nowMin;
    let dep = '';
    if (next.prepMin || next.travelMin || next.arriveBeforeMin) {
      const d = LM.calcDeparture(next);
      dep = `準備 ${d.prepStart} 出発 ${d.depart}`;
    }
    return { ring, inner: innerHtml(started ? '進行中' : '次の予定', next.start, next.name, dep) };
  }

  // 時間計算: 円形カウントダウンのタイマー
  function modeTimeCalc() {
    const ms = timerRemainingMs();
    const totalMs = timer.status === 'idle' ? timer.durationMin * 60000 : timer.totalMs;
    const frac = timer.status === 'idle' ? 1 : totalMs > 0 ? Math.min(1, ms / totalMs) : 0;
    const sub = { idle: 'タイマー', running: '残り', paused: '一時停止中', done: 'タイマー' }[timer.status];
    const note = { idle: 'タップで開始', running: 'タップで一時停止', paused: 'タップで再開', done: '終了' }[timer.status];

    let caption;
    if (timer.status === 'idle') {
      caption = `<button type="button" class="hm-tc-btn" data-tc="dec" ${timer.durationMin <= TIMER_MIN ? 'disabled' : ''}>−${TIMER_STEP_MIN}分</button>
        <button type="button" class="hm-tc-btn" data-tc="inc" ${timer.durationMin >= TIMER_MAX ? 'disabled' : ''}>+${TIMER_STEP_MIN}分</button>`;
    } else {
      caption = '<button type="button" class="hm-tc-btn" data-tc="reset">リセット</button>';
    }
    return {
      ring: frac > 0 ? [ringArc(0, frac, 'var(--accent)')] : [],
      inner: innerHtml(sub, formatClock(ms), note),
      caption,
    };
  }

  function clampTimerMin(v) {
    const n = Math.round(Number(v) || 25);
    return Math.min(TIMER_MAX, Math.max(TIMER_MIN, n));
  }

  function loadTimer() {
    const saved = LM.get(TIMER_KEY, null) || {};
    const t = {
      durationMin: clampTimerMin(saved.durationMin || 25),
      status: ['idle', 'running', 'paused', 'done'].includes(saved.status) ? saved.status : 'idle',
      endAt: Number(saved.endAt) || 0,
      remainingMs: Number(saved.remainingMs) || 0,
      totalMs: Number(saved.totalMs) || 0,
    };
    if (t.status === 'running' && t.endAt <= Date.now()) { t.status = 'done'; t.remainingMs = 0; }
    if (t.status === 'paused' && t.remainingMs <= 0) t.status = 'idle';
    if (t.status !== 'idle' && t.totalMs <= 0) t.status = 'idle';
    return t;
  }

  function saveTimer() {
    LM.set(TIMER_KEY, timer);
  }

  function timerRemainingMs() {
    if (timer.status === 'running') return Math.max(0, timer.endAt - Date.now());
    if (timer.status === 'paused') return timer.remainingMs;
    if (timer.status === 'done') return 0;
    return timer.durationMin * 60000;
  }

  function toggleTimer() {
    const now = Date.now();
    if (timer.status === 'idle') {
      timer.totalMs = timer.durationMin * 60000;
      timer.endAt = now + timer.totalMs;
      timer.status = 'running';
    } else if (timer.status === 'running') {
      timer.remainingMs = Math.max(0, timer.endAt - now);
      timer.status = 'paused';
    } else if (timer.status === 'paused') {
      timer.endAt = now + timer.remainingMs;
      timer.status = 'running';
    } else {
      timer.status = 'idle';
    }
    saveTimer();
    refreshCircle();
  }

  function resetTimer() {
    timer.status = 'idle';
    timer.remainingMs = 0;
    saveTimer();
    refreshCircle();
  }

  function adjustTimer(deltaMin) {
    if (timer.status !== 'idle') return;
    timer.durationMin = clampTimerMin(timer.durationMin + deltaMin);
    saveTimer();
    refreshCircle();
  }

  // 走っているタイマーが終わっていたら「終了」にする。変わった時だけtrueを返す
  function checkTimerFinish() {
    if (timer.status !== 'running' || Date.now() < timer.endAt) return false;
    const late = Date.now() - timer.endAt;
    timer.status = 'done';
    timer.remainingMs = 0;
    saveTimer();
    if (late < 5000) LM.notify('タイマー終了', `${Math.round(timer.totalMs / 60000)}分が経過しました`);
    return true;
  }

  function formatClock(ms) {
    const sec = Math.ceil(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
  }

  // ウィッシュリスト: 未購入・未視聴など、まだ完了していないアイテムの種類比
  function modeWish() {
    const items = LM.get(LM.KEYS.WISHLIST, []).filter((it) =>
      typeof it.status === 'string'
        ? ['unpurchased', 'undownload', 'want'].includes(it.status)
        : !it.purchased
    );
    const counts = WISH_CATEGORIES.map(() => 0);
    items.forEach((it) => {
      let i = WISH_CATEGORIES.findIndex((c) => c.name === it.category);
      if (i < 0) i = WISH_CATEGORIES.length - 1; // 想定外の種類は「その他」に含める
      counts[i] += 1;
    });
    const total = items.length;
    if (total === 0) return { inner: innerHtml('未購入', '0', '件') };

    const ring = [];
    let acc = 0;
    const gap = total > 1 ? 0.006 : 0;
    counts.forEach((n, i) => {
      if (n === 0) return;
      const from = acc / total;
      acc += n;
      ring.push(ringArc(from + gap / 2, acc / total - gap / 2, WISH_CATEGORIES[i].color));
    });
    const caption = WISH_CATEGORIES
      .map((c, i) => (counts[i] ? `<span><i style="background:${c.color}"></i>${escapeHtml(c.name)} ${counts[i]}</span>` : ''))
      .join('');
    return { ring, inner: innerHtml('未購入', String(total), '件'), caption };
  }

  /* ---------- 下部メニューのHOME
   * タップ: 一番上へ戻る(メニューが開いていれば閉じる)
   * 長押し: 「その他の機能」メニューを開く ---------- */
  function setupHomeButton() {
    const btn = document.getElementById('hm-home');
    const more = document.getElementById('hm-more');
    let holdTimer = null;
    let held = false;
    let sx = 0;
    let sy = 0;

    const cancelHold = () => {
      clearTimeout(holdTimer);
      btn.classList.remove('is-pressing');
    };

    btn.addEventListener('pointerdown', (e) => {
      held = false;
      sx = e.clientX;
      sy = e.clientY;
      btn.classList.add('is-pressing');
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        held = true;
        btn.classList.remove('is-pressing');
        openMore();
      }, LONG_PRESS_MS);
    });
    // 指が動いたら(スクロールなど)長押しとは見なさない
    btn.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancelHold();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, cancelHold));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());

    btn.addEventListener('click', () => {
      if (held) { held = false; return; } // 長押しで開いた直後の「離した指」はタップとして扱わない
      if (moreOpen) { closeMore(); return; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // メニューの外側をタップ / Escape / 戻るで戻ってきた時に閉じる
    more.addEventListener('click', (e) => {
      if (e.target === more) { closeMore(); return; }
      const item = e.target.closest('.hm-more-item');
      if (!item) return;
      if (item.dataset.more === 'backup') {
        closeMore();
        openBackupModal();
      } else {
        closeMore(); // リンクの移動はそのまま行う
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
    window.addEventListener('pageshow', closeMore);
  }

  function openMore() {
    const more = document.getElementById('hm-more');
    moreOpen = true;
    more.classList.add('open');
    more.setAttribute('aria-hidden', 'false');
  }

  function closeMore() {
    const more = document.getElementById('hm-more');
    moreOpen = false;
    more.classList.remove('open');
    more.setAttribute('aria-hidden', 'true');
  }

  // BACKUP: 保存/復元の本体(#export-btn / #import-input)を操作する。処理はsetupBackupのまま
  function openBackupModal() {
    const box = document.createElement('div');
    box.innerHTML = `
      <p class="lm-empty" style="margin-bottom:10px;">端末側の事情でデータが消えることがあるため、時々バックアップの保存をおすすめします</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="lm-btn secondary" data-bk="export">バックアップを保存</button>
        <button type="button" class="lm-btn secondary" data-bk="import">バックアップから復元</button>
      </div>
    `;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bk]');
      if (!b) return;
      document.getElementById(b.dataset.bk === 'export' ? 'export-btn' : 'import-input').click();
    });
    LM.openModal('データのバックアップ', box);
  }

  /* ---------- セクションの並び替え(右カラム内で、表示があるものを先に) ---------- */
  function reorderSections() {
    const col = document.getElementById('hm-col-right');
    const sorted = [...SIDE_ORDER].sort((a, b) => {
      const ah = hasContent[a] ? 0 : 1;
      const bh = hasContent[b] ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return SIDE_ORDER.indexOf(a) - SIDE_ORDER.indexOf(b);
    });
    sorted.forEach((key) => {
      const el = document.querySelector(`[data-section="${key}"]`);
      col.appendChild(el);
    });
  }

  /* ---------- 今日の予定 ---------- */
  function renderSchedules() {
    const el = document.getElementById('schedule-list');
    const schedules = LM.get(LM.KEYS.SCHEDULES, [])
      .filter((s) => s.date === today)
      .sort((a, b) => a.start.localeCompare(b.start));

    if (schedules.length === 0) {
      el.innerHTML = '<p class="lm-empty">今日の予定はありません</p>';
      return false;
    }

    el.innerHTML = '';
    schedules.forEach((s) => {
      const row = document.createElement('a');
      row.className = 'lm-schedule-item';
      row.href = `./schedule.html?id=${encodeURIComponent(s.id)}`;
      const departureHtml = renderDepartureLine(s);
      row.innerHTML = `
        <span class="lm-schedule-time">${s.start}</span>
        <span>
          <div>${escapeHtml(s.name)}</div>
          ${departureHtml}
        </span>
      `;
      el.appendChild(row);
    });
    return true;
  }

  function renderDepartureLine(s) {
    const r = LM.calcDeparture(s);
    return `<div class="lm-schedule-departure">準備開始 <strong>${r.prepStart}</strong> ・ 出発 <strong>${r.depart}</strong></div>`;
  }

  /* ---------- 今日の持ちもの(カード+モーダル) ---------- */
  function renderBelongings() {
    const el = document.getElementById('belongings-list');
    const countEl = document.getElementById('belongings-count');
    const schedules = LM.get(LM.KEYS.SCHEDULES, []).filter((s) => s.date === today);
    const setIds = [...new Set(schedules.flatMap((s) => s.belongingSetIds || (s.belongingSetId ? [s.belongingSetId] : [])))];
    const allSets = LM.get(LM.KEYS.BELONGING_SETS, []);
    const sets = setIds.map((id) => allSets.find((s) => s.id === id)).filter(Boolean);

    if (sets.length === 0) {
      countEl.textContent = '';
      el.innerHTML = '<p class="lm-empty">今日呼び出す持ちものセットはありません</p>';
      return false;
    }

    const checks = LM.get(LM.KEYS.DAILY_CHECKS, {});
    const todayCheck = checks[today] || { checkedItemIds: [] };
    const checkedSet = new Set(todayCheck.checkedItemIds);

    let totalItems = 0;
    let totalChecked = 0;

    el.innerHTML = '';
    sets.forEach((set) => {
      const checkedCount = set.items.filter((it) => checkedSet.has(it.id)).length;
      totalItems += set.items.length;
      totalChecked += checkedCount;

      const card = document.createElement('div');
      card.className = 'lm-card';
      card.innerHTML = `
        <span class="lm-card-title">${escapeHtml(set.name)}</span>
        <span class="lm-card-count">${checkedCount}/${set.items.length}</span>
      `;
      card.addEventListener('click', () => openBelongingModal(set));
      el.appendChild(card);
    });

    countEl.textContent = `${totalChecked}/${totalItems}`;
    return true;
  }

  function openBelongingModal(set) {
    const checks = LM.get(LM.KEYS.DAILY_CHECKS, {});
    const entry = checks[today] || { checkedItemIds: [] };
    const checkedSet = new Set(entry.checkedItemIds);

    const ul = document.createElement('ul');
    ul.className = 'lm-check-list';

    if (set.items.length === 0) {
      ul.innerHTML = '<li class="lm-empty">持ちものが登録されていません</li>';
    } else {
      set.items.forEach((it) => {
        const li = document.createElement('li');
        li.className = 'lm-check-item' + (checkedSet.has(it.id) ? ' done' : '');
        li.innerHTML = `
          <input type="checkbox" ${checkedSet.has(it.id) ? 'checked' : ''} data-item-id="${it.id}" />
          <span>${escapeHtml(it.name)}</span>
        `;
        ul.appendChild(li);
      });
    }

    ul.addEventListener('change', (e) => {
      const checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;
      const itemId = checkbox.dataset.itemId;
      const checks2 = LM.get(LM.KEYS.DAILY_CHECKS, {});
      const entry2 = checks2[today] || { checkedItemIds: [] };
      const idSet = new Set(entry2.checkedItemIds);
      if (checkbox.checked) idSet.add(itemId);
      else idSet.delete(itemId);
      entry2.checkedItemIds = [...idSet];
      checks2[today] = entry2;
      LM.set(LM.KEYS.DAILY_CHECKS, checks2);
      checkbox.closest('li').classList.toggle('done', checkbox.checked);
      renderBelongings();
    });

    LM.openModal(set.name, ul);
  }

  /* ---------- 今日のタスク(メインタスク+ほかの件数) ---------- */
  function renderTasks() {
    const el = document.getElementById('tasks-list');
    const state = LM.getTodoState();

    const mainTasks = LM.TODO_MAIN_IDS.map((id) => ({ id, ...state.dailyTasks[id] })).filter((t) => t.name.trim());
    const otherIds = LM.TODO_GROUPS.filter((g) => !g.isMain).flatMap((g) => g.ids);
    const otherCount = otherIds.filter((id) => (state.dailyTasks[id].name || '').trim()).length;

    if (mainTasks.length === 0 && otherCount === 0) {
      el.innerHTML = '<p class="lm-empty">今日のタスクはまだ登録されていません</p>';
      return false;
    }

    el.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'lm-check-list';
    mainTasks.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'lm-check-item' + (t.checked ? ' done' : '');
      li.innerHTML = `
        <input type="checkbox" ${t.checked ? 'checked' : ''} data-todo-id="${t.id}" />
        <span>${escapeHtml(t.name)}</span>
      `;
      ul.appendChild(li);
    });
    el.appendChild(ul);

    if (otherCount > 0) {
      const otherEl = document.createElement('div');
      otherEl.style.cssText = 'text-align:right; font-size:12px; color:var(--text-soft); margin-top:6px;';
      otherEl.textContent = `ほか${otherCount}`;
      el.appendChild(otherEl);
    }

    ul.addEventListener('change', (e) => {
      const checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;
      const id = checkbox.dataset.todoId;
      const s = LM.getTodoState();
      LM.toggleTodoCheck(s, id, checkbox.checked);
      hasContent.task = renderTasks();
      refreshCircle();
    });

    return true;
  }

  /* ---------- タスクセクションをタップでタスクページへ ---------- */
  function setupTaskLink() {
    const section = document.querySelector('[data-section="task"]');
    section.style.cursor = 'pointer';
    section.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      location.href = './todo.html';
    });
  }

  /* ---------- 今日の勤務 ---------- */
  function renderShift() {
    const el = document.getElementById('shift-box');
    const shift = LM.get(LM.KEYS.SHIFTS, []).find((s) => s.date === today);

    if (!shift) {
      el.innerHTML = '<p class="lm-empty">今日の勤務はありません</p>';
      return false;
    }

    const wageSettings = LM.get(LM.KEYS.WAGE_SETTINGS, { hourlyWage: 0, transportFee: 0 });
    const { workMin, pay } = LM.calcShiftPay(shift, wageSettings);
    const h = Math.floor(workMin / 60);
    const m = workMin % 60;

    el.innerHTML = `
      <div class="lm-shift-box">
        <span>勤務時間 ${shift.start}〜${shift.end}(休憩${shift.breakMin || 0}分)</span>
        <span>実働 ${h}時間${m}分</span>
        <span class="lm-shift-pay">見込み給与 ¥${pay.toLocaleString()}</span>
      </div>
    `;
    return true;
  }

  /* ---------- 今日のイベント(タップでイベントページへ) ---------- */
  function renderEvents() {
    const el = document.getElementById('events-list');
    const events = LM.get(LM.KEYS.EVENTS, []).filter((ev) => ev.end >= today);

    if (events.length === 0) {
      el.innerHTML = '<p class="lm-empty">開催中のイベントはありません</p>';
      return false;
    }

    el.innerHTML = '';
    events.forEach((ev) => {
      const { remain, remainDays, perDay, rate } = LM.calcEventProgress(ev, today);
      const box = document.createElement('a');
      box.href = './event.html';
      box.className = 'lm-event';
      box.style.display = 'block';
      box.style.textDecoration = 'none';
      box.style.color = 'inherit';
      box.innerHTML = `
        <div class="lm-event-top">
          <span>${escapeHtml(ev.name)}</span>
          <span>${rate}%</span>
        </div>
        <div class="lm-progress-track">
          <div class="lm-progress-fill" style="width:${rate}%"></div>
        </div>
        <div class="lm-event-remain">残り${remainDays}日 ・ 残り${remain.toLocaleString()}${escapeHtml(ev.unit || '')} ・ 1日あたり${perDay.toLocaleString()}${escapeHtml(ev.unit || '')}必要</div>
      `;
      el.appendChild(box);
    });
    return true;
  }

  /* ---------- 通知の状態表示・登録ボタン ---------- */
  function renderNotifyBanner() {
    const el = document.getElementById('notify-banner');

    if (!('Notification' in window)) {
      el.innerHTML = '<p class="lm-empty">この端末は通知に対応していません</p>';
      return;
    }
    if (Notification.permission === 'denied') {
      el.innerHTML = '<p class="lm-empty">通知がブロックされています(端末の設定から許可できます)</p>';
      return;
    }
    if (Notification.permission === 'granted') {
      LM.startNotificationLoop();
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
          <span class="lm-empty" style="margin:0;">通知:有効</span>
          <button type="button" id="resync-notify" class="lm-btn secondary" style="font-size:12px; padding:6px 12px;">アプリ外通知を登録し直す</button>
        </div>
      `;
      document.getElementById('resync-notify').addEventListener('click', () => registerFirebase(true));
      return;
    }
    el.innerHTML = '<button type="button" id="enable-notify" class="lm-btn secondary" style="margin-bottom:8px;">通知を有効にする(アプリ外通知)</button>';
    document.getElementById('enable-notify').addEventListener('click', async () => {
      const result = await LM.requestNotificationPermission();
      renderNotifyBanner();
      if (result === 'granted') {
        LM.startNotificationLoop();
        registerFirebase(true);
      }
    });
  }

  // FCMトークン登録+データ同期。showFeedback=trueの時は結果をトーストで表示
  async function registerFirebase(showFeedback) {
    if (!window.LMFirebase) {
      await new Promise((resolve) => window.addEventListener('lm-firebase-ready', resolve, { once: true }));
    }
    try {
      const token = await window.LMFirebase.registerToken();
      await window.LMFirebase.syncData();
      if (showFeedback) {
        if (token) LM.showToast('アプリ外通知を登録しました');
        else LM.showToast('登録に失敗しました(トークン取得不可)', 'error');
      }
    } catch (e) {
      console.error(e);
      if (showFeedback) LM.showToast('登録に失敗しました', 'error');
    }
  }

  /* ---------- バックアップの保存/復元 ---------- */
  function setupBackup() {
    document.getElementById('export-btn').addEventListener('click', () => {
      try {
        const data = LM.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `生活管理バックアップ_${today}.json`;
        a.click();
        URL.revokeObjectURL(url);
        LM.showToast('バックアップを保存しました');
      } catch (err) {
        console.error(err);
        LM.showToast('保存できませんでした', 'error');
      }
    });

    document.getElementById('import-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!confirm('現在のデータに上書きして復元しますか?')) return;
          LM.importAllData(data);
          alert('復元しました');
          location.reload();
        } catch (err) {
          alert('復元に失敗しました。ファイルが正しいか確認してください。');
        }
      };
      reader.readAsText(file);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
