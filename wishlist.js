(function () {
  // 種類ごとの基本状態。種類・状態の増減はここだけ直せばよい。
  const TYPES = {
    '本': [['unpurchased', '未購入'], ['purchased', '購入済み'], ['lent', '貸出']],
    '映像･作品': [['want', '未視聴'], ['done', '視聴済み']],
    'ゲーム': [['unpurchased', '未購入'],['undownload','未DL'], ['purchased', '購入済み']],
    '生活雑貨': [['unpurchased', '未購入'], ['purchased', '購入済み']],
    'その他': [['unpurchased', '未購入'], ['purchased', '購入済み']],
  };
  const ALL = 'すべて';
  const CATS = Object.keys(TYPES);

  const $ = (id) => document.getElementById(id);
  const form = $('item-form');
  const fields = {
    name: $('f-name'), price: $('f-price'), url: $('f-url'),
    plan: $('f-plan'), memo: $('f-memo'),
  };
  let current = ALL;
  let editingId = null;
  let formCategory = null;

  // 旧データの移行(status/checks の付与、欲しい度の削除)
  function load() {
    const items = LM.get(LM.KEYS.WISHLIST, []);
    let changed = false;
    items.forEach((it) => {
      if (!TYPES[it.category]) { it.category = 'その他'; changed = true; }
      if (!it.status) { it.status = it.purchased ? 'purchased' : 'unpurchased'; changed = true; }
      if (!TYPES[it.category].some(([id]) => id === it.status)) { it.status = TYPES[it.category][0][0]; changed = true; }
      if (!it.checks) { it.checks = {}; changed = true; }
      if ('desire' in it) { delete it.desire; changed = true; }
    });
    if (changed) LM.set(LM.KEYS.WISHLIST, items);
    return items;
  }
  function save(items) { LM.set(LM.KEYS.WISHLIST, items); }
  function statusLabel(cat, id) {
    const s = TYPES[cat].find(([sid]) => sid === id);
    return s ? s[1] : id;
  }

  function render() {
    const items = load();
    renderTabs();
    const shown = current === ALL ? items : items.filter((it) => it.category === current);
    renderTotals(shown);
    const list = $('list');
    list.innerHTML = '';
    if (!shown.length) list.innerHTML = '<p class="lm-empty">まだ何も登録されていません</p>';

    if (current === ALL) {
      CATS.forEach((cat) => {
        const g = shown.filter((it) => it.category === cat);
        if (g.length) appendGroup(list, `${cat}(${g.length})`, g, false);
      });
    } else {
      TYPES[current].forEach(([sid, label]) => {
        const g = shown.filter((it) => it.status === sid);
        if (g.length) appendGroup(list, `${label}(${g.length})`, g, false);
      });
    }

    const addArea = $('add-area');
    addArea.innerHTML = current === ALL ? '' :
      `<button type="button" class="lm-btn" data-add="1">${current}を追加する</button>`;
  }

  function renderTabs() {
    $('tabs').innerHTML = [ALL, ...CATS].map((t) =>
      `<button type="button" class="wl-tab${t === current ? ' active' : ''}" data-tab="${t}">${t}</button>`
    ).join('');
  }

  function renderTotals(shown) {
    const open = shown.filter((it) => it.status === 'unpurchased');
    const total = open.reduce((s, it) => s + (it.price || 0), 0);
    const plan = open.filter((it) => it.planThisMonth).reduce((s, it) => s + (it.price || 0), 0);
    $('totals').innerHTML =
      `<span>未購入合計 ¥${total.toLocaleString()}</span><span>今月買うもの合計 ¥${plan.toLocaleString()}</span>`;
  }

  function appendGroup(container, title, items) {
    const t = document.createElement('div');
    t.className = 'wl-group-title';
    t.textContent = title;
    container.appendChild(t);
    items.forEach((it) => container.appendChild(rowEl(it)));
  }

  function rowEl(it) {
    const row = document.createElement('div');
    row.className = 'wl-row';
    const opts = TYPES[it.category].map(([id, l]) =>
      `<option value="${id}"${id === it.status ? ' selected' : ''}>${l}</option>`).join('');
    const subs = [];
    if (current === ALL) subs.push(`${escapeHtml(it.category)}:${escapeHtml(statusLabel(it.category, it.status))}`);
    if (it.planThisMonth) subs.push('今月買う予定');
    if (it.url) subs.push(`<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">リンク</a>`);
    const badge = it.checks && it.checks.lent ? '<span class="wl-badge">貸出済</span>' : '';
    row.innerHTML = `
      <div class="wl-row-main"><strong>${escapeHtml(it.name)}</strong>${it.price ? `<span>¥${it.price.toLocaleString()}</span>` : ''}</div>
      <div class="wl-row-sub">${badge}${subs.join(' ・ ')}</div>
      <div class="wl-row-actions">
        <select data-status="${it.id}">${opts}</select>
        <button type="button" data-edit="${it.id}" class="lm-btn secondary" style="padding:2px 8px; font-size:12px;">編集</button>
        <button type="button" data-delete="${it.id}" class="lm-btn secondary" style="padding:2px 8px; font-size:12px;">削除</button>
      </div>`;
    return row;
  }

  // 状態変更。貸出から移す時は「貸出済」のチェックを残す。
  function setStatus(id, status) {
    const items = load();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (it.status === 'lent' && status !== 'lent') it.checks.lent = true;
    it.status = status;
    it.purchased = status === 'purchased';
    save(items);
    render();
  }

  function openForm(cat, item) {
    formCategory = cat;
    editingId = item ? item.id : null;
    form.reset();
    if (item) {
      fields.name.value = item.name;
      fields.price.value = item.price || '';
      fields.url.value = item.url || '';
      fields.plan.checked = !!item.planThisMonth;
      fields.memo.value = item.memo || '';
    }
    $('form-title').textContent = item ? `${cat}を編集` : `${cat}を追加`;
    $('form-section').hidden = false;
    $('form-section').scrollIntoView({ behavior: 'smooth' });
  }
  function closeForm() {
    editingId = null;
    formCategory = null;
    form.reset();
    $('form-section').hidden = true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const items = load();
    const old = editingId ? items.find((it) => it.id === editingId) : null;
    const status = old ? old.status : TYPES[formCategory][0][0];
    const data = {
      id: old ? old.id : LM.uid(),
      name: fields.name.value.trim(),
      category: formCategory,
      price: Number(fields.price.value) || 0,
      url: fields.url.value.trim(),
      planThisMonth: fields.plan.checked,
      memo: fields.memo.value.trim(),
      status,
      purchased: status === 'purchased',
      checks: old ? old.checks : {},
    };
    if (old) items[items.indexOf(old)] = data; else items.push(data);
    save(items);
    closeForm();
    render();
  });
  $('cancel-edit').addEventListener('click', closeForm);

  document.addEventListener('click', (e) => {
    const d = e.target.dataset;
    if (d.tab) { current = d.tab; closeForm(); render(); }
    if (d.add) openForm(current);
    if (d.edit) {
      const it = load().find((x) => x.id === d.edit);
      if (it) openForm(it.category, it);
    }
    if (d.delete) {
      if (!confirm('削除しますか?')) return;
      save(load().filter((it) => it.id !== d.delete));
      render();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.status) setStatus(e.target.dataset.status, e.target.value);
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  render();
  LM.renderNav($('nav-container'));
})();
