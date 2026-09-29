/* ---------- ナビゲーション(右上メニュー)描画 ----------
 * app.js の末尾にある LM.renderNav 全体を、これに置き換える。
 * 各ページは今まで通り LM.renderNav(container) を呼ぶだけでよい。
 * 下部ボタンは廃止。CSSはここから注入するので style.css の変更は不要。
 */
LM.NAV_ITEMS = [
  { href: './index.html', label: '今日のページ' },
  { href: './schedule.html', label: '予定・逆算' },
  { href: './belongings.html', label: '持ちもの' },
  { href: './todo.html', label: 'タスク' },
  { href: './wishlist.html', label: 'WISHリスト' },
  { href: './time-calc.html', label: '時間計算' },
  { href: './event.html', label: 'イベント' },
  { href: './shift.html', label: '給与・シフト' },
  { href: 'https://jhonedoedr.github.io/MyBookLog/', label: 'よみもの記録', external: true },
];

LM.renderTopMenu = function () {
  if (document.getElementById('lm-menu-btn')) return;

  const style = document.createElement('style');
  style.textContent = `
  #lm-menu-btn { position:fixed; top:calc(env(safe-area-inset-top, 0px) + 8px); right:10px; z-index:900;
    width:40px; height:40px; border-radius:50%; border:1px solid var(--paper-line, #ddd);
    background:rgba(250,248,243,.92); font-size:20px; line-height:1; color:#333; }
  #lm-menu-overlay { position:fixed; inset:0; z-index:950; background:rgba(0,0,0,.3); display:none; }
  #lm-menu-overlay.open { display:block; }
  #lm-menu-panel { position:absolute; top:0; right:0; bottom:0; width:min(78vw, 300px);
    background:#faf8f3; padding:calc(env(safe-area-inset-top, 0px) + 12px) 0 calc(env(safe-area-inset-bottom, 0px) + 12px);
    overflow-y:auto; box-shadow:-2px 0 12px rgba(0,0,0,.15); }
  #lm-menu-panel .lm-menu-head { display:flex; justify-content:space-between; align-items:center; padding:0 16px 8px; color:var(--text-soft, #777); font-size:12px; }
  #lm-menu-panel .lm-menu-close { border:none; background:none; font-size:18px; padding:4px 8px; }
  #lm-menu-panel a { display:block; padding:13px 16px; color:inherit; text-decoration:none; border-bottom:1px solid var(--paper-line, #eee); font-size:15px; }
  #lm-menu-panel a.current { font-weight:bold; background:rgba(0,0,0,.05); }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'lm-menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'メニュー');
  btn.textContent = '☰';

  const overlay = document.createElement('div');
  overlay.id = 'lm-menu-overlay';
  const panel = document.createElement('nav');
  panel.id = 'lm-menu-panel';
  panel.innerHTML = '<div class="lm-menu-head"><span>メニュー</span><button type="button" class="lm-menu-close" aria-label="閉じる">✕</button></div>';

  const here = location.pathname.split('/').pop() || 'index.html';
  LM.NAV_ITEMS.forEach((it) => {
    const a = document.createElement('a');
    a.href = it.href;
    a.textContent = it.label + (it.external ? ' ↗' : '');
    if (!it.external && it.href.endsWith('/' + here)) a.classList.add('current');
    if (it.external) { a.target = '_blank'; a.rel = 'noopener'; }
    panel.appendChild(a);
  });

  const close = () => overlay.classList.remove('open');
  btn.addEventListener('click', () => overlay.classList.add('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  panel.querySelector('.lm-menu-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => { if (e.target.tagName === 'A') close(); });

  overlay.appendChild(panel);
  document.body.appendChild(btn);
  document.body.appendChild(overlay);
};

if (typeof LM.renderNav === 'function') {
  const navContainer = document.getElementById('nav-container');
  if (navContainer) {
    LM.renderNav(navContainer);
  }
}

LM.renderTopMenu();