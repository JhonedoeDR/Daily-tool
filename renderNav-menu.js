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

LM.renderTopMenu();