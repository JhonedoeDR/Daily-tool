/* ---------- 共通ナビゲーション: 下部固定メニュー(全ページ共通) ----------
 * 各ページは今まで通り LM.renderNav(container) を呼ぶだけでよい(app.js の後に読み込むこと)。
 * 下部メニュー・HOME長押しメニュー・バックアップをここに集約している。
 * 見た目の基本は style.css の「新HOME」ブロック(.hm-nav / .hm-more など)を使い、
 * このファイルからは全ページ共通で必要な分だけCSSを追加する。
 *
 * 廃止したもの:
 *  ・右上の☰メニュー(コードごと削除)
 *  ・旧「← 今日のページに戻る」ボタン(各HTMLには残してあり、下のCSSで表示しないだけ)
 *  ・app.js の旧ナビボタン(LM.renderNav の旧版。ここで上書きされるため動かない)
 */
LM.NAV_ITEMS = [
  { href: './index.html', label: '今日のページ' },
  { href: './schedule.html', label: '予定・逆算' },
  { href: './belongings.html', label: '持ちもの' },
  { href: './todo.html', label: 'タスク' },
  { href: './wishlist.html', label: 'WISHリスト' },
  { href: './time-calc.html', label: '時間計算' },
  { href: './event.html', label: 'イベント' },
  { href: './shift.html', label: '履修・シフト' },
  { href: 'https://jhonedoedr.github.io/MyBookLog/', label: 'よみもの記録', external: true },
];

LM.HOME_URL = './index.html';
LM.LONG_PRESS_MS = 500;

LM.renderNav = function () {
  if (document.querySelector('.hm-nav')) return;

  /* ---- 全ページ共通で追加するCSS ---- */
  const style = document.createElement('style');
  style.textContent = `
    /* 下部メニューに隠れないよう、ページ下に余白を作る */
    .lm-page.hm-nav-pad { padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }
    /* 旧「戻る」ボタン: HTMLには残しているが、表示も操作もしない */
    .lm-back-link { display: none !important; }
    /* モーダルとトーストは下部メニューより前に出す */
    .lm-modal-overlay { z-index: 1100; }
    .lm-toast { z-index: 1200; }
    /* 今いるページ */
    .hm-nav-item[aria-current='page'] { color: var(--accent); }
    .hm-nav-item[aria-current='page'] span { font-weight: 700; }
  `;
  document.head.appendChild(style);

  const here = location.pathname.split('/').pop() || 'index.html';
  const isHome = here === 'index.html';
  const cur = (file) => (here === file ? ' aria-current="page"' : '');

  /* ---- 下部固定メニュー ---- */
  const nav = document.createElement('nav');
  nav.className = 'hm-nav';
  nav.setAttribute('aria-label', 'メインメニュー');
  nav.innerHTML = `
    <span class="hm-hump" aria-hidden="true"></span>

    <a class="hm-nav-item" href="./schedule.html"${cur('schedule.html')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3.5v3M15 3.5v3"/></svg>
      <span>予定逆算</span>
    </a>

    <a class="hm-nav-item" href="./todo.html"${cur('todo.html')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>
      <span>タスク</span>
    </a>

    <button type="button" class="hm-home" id="hm-home" aria-label="HOME"${isHome ? ' aria-current="page"' : ''}>
      <span class="hm-home-disc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l-8 8h4.5v7.5h7V12H20z"/></svg>
      </span>
      <span>HOME</span>
    </button>

    <a class="hm-nav-item" href="./time-calc.html"${cur('time-calc.html')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
      <span>時間計算</span>
    </a>

    <a class="hm-nav-item" href="./event.html"${cur('event.html')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6"/></svg>
      <span>イベント</span>
    </a>
  `;

  /* ---- HOME長押しで出る「その他の機能」メニュー ---- */
  const more = document.createElement('div');
  more.className = 'hm-more';
  more.id = 'hm-more';
  more.setAttribute('aria-hidden', 'true');
  more.innerHTML = `
    <div class="hm-more-panel" role="menu" aria-label="その他の機能">
      <div class="hm-more-grid">
        <a class="hm-more-item" role="menuitem" href="./wishlist.html" title="WISHリスト">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6l5.4 11.2 12.2 1.6-8.9 8.5 2.3 12.1L24 33.4 12.9 39.4l2.3-12.1-8.9-8.5 12.2-1.6z"/></svg>
          <span>WISH</span>
        </a>
        <a class="hm-more-item" role="menuitem" href="./belongings.html" title="持ちもの">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11a6 6 0 0112 0"/><rect x="11" y="11" width="26" height="30" rx="8"/><rect x="17" y="24" width="14" height="11" rx="3"/><path d="M11 22c-3 1-4 4-4 8M37 22c3 1 4 4 4 8"/></svg>
          <span>BELONGING</span>
        </a>
        <a class="hm-more-item" role="menuitem" href="./shift.html" title="履修・シフト">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="13" width="38" height="22" rx="3"/><circle cx="24" cy="24" r="6"/><path d="M11 19v2M37 27v2"/></svg>
          <span>CLASS / SHIFT</span>
        </a>
        <a class="hm-more-item" role="menuitem" href="https://jhonedoedr.github.io/MyBookLog/" target="_blank" rel="noopener" title="よみもの記録">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 12c-4-3-10-4-17-3v27c7-1 13 0 17 3 4-3 10-4 17-3V9c-7-1-13 0-17 3z"/><path d="M24 12v27M11 16h8M11 22h8M29 16h8M29 22h8"/></svg>
          <span>BOOKLOG</span>
        </a>
        <button type="button" class="hm-more-item" role="menuitem" data-more="backup" title="バックアップ">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="6"/><path d="M21 6h6l1 5 3 1.5 4.5-2.6 4.2 4.2-2.6 4.5L38.5 21l5 1v6l-5 1-1.5 3 2.6 4.5-4.2 4.2-4.5-2.6L27 37l-1 5h-6l-1-5-3-1.5-4.5 2.6-4.2-4.2 2.6-4.5L9.5 29l-5-1v-6l5-1 1.5-3-2.6-4.5 4.2-4.2 4.5 2.6L20 11z"/></svg>
          <span>BACKUP</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(nav);
  document.body.appendChild(more);
  const page = document.querySelector('.lm-page');
  if (page) page.classList.add('hm-nav-pad');

  /* ---- HOMEボタン: タップ=HOMEへ / 長押し=その他メニュー ---- */
  const btn = nav.querySelector('#hm-home');
  let moreOpen = false;
  let holdTimer = null;
  let held = false;
  let sx = 0;
  let sy = 0;

  const openMore = () => {
    moreOpen = true;
    more.classList.add('open');
    more.setAttribute('aria-hidden', 'false');
  };
  const closeMore = () => {
    moreOpen = false;
    more.classList.remove('open');
    more.setAttribute('aria-hidden', 'true');
  };
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
    }, LM.LONG_PRESS_MS);
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
    if (isHome) window.scrollTo({ top: 0, behavior: 'smooth' });
    else location.href = LM.HOME_URL;
  });

  more.addEventListener('click', (e) => {
    if (e.target === more) { closeMore(); return; }
    const item = e.target.closest('.hm-more-item');
    if (!item) return;
    closeMore(); // リンクの移動はそのまま行う
    if (item.dataset.more === 'backup') LM.openBackupModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
  window.addEventListener('pageshow', closeMore);
};

/* ---------- バックアップの保存/復元(BACKUPから開く。どのページからでも使える) ---------- */
LM.openBackupModal = function () {
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="lm-empty" style="margin-bottom:10px;">端末側の事情でデータが消えることがあるため、時々バックアップの保存をおすすめします</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="lm-btn secondary" data-bk="export">バックアップを保存</button>
      <label class="lm-btn secondary" style="cursor:pointer;">
        バックアップから復元
        <input type="file" data-bk="import" accept="application/json" style="display:none;" />
      </label>
    </div>
  `;

  box.querySelector('[data-bk="export"]').addEventListener('click', () => {
    try {
      const data = LM.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `生活管理バックアップ_${LM.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      LM.showToast('バックアップを保存しました');
    } catch (err) {
      console.error(err);
      LM.showToast('保存できませんでした', 'error');
    }
  });

  box.querySelector('[data-bk="import"]').addEventListener('change', (e) => {
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

  LM.openModal('データのバックアップ', box);
};
