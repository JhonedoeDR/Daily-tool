(function () {
  // 種類ごとの基本状態。種類・状態の増減はここだけ直せばよい。
  const TYPES = {
    '本': [
      ['unpurchased', '未購入'],
      ['purchased', '購入済み'],
      ['lent', '貸出']
    ],
    '映像･作品': [
      ['want', '未視聴'],
      ['done', '視聴済み']
    ],
    'ゲーム': [
      ['unpurchased', '未購入'],
      ['undownload', '未DL'],
      ['purchased', '購入済み']
    ],
    '生活雑貨': [
      ['unpurchased', '未購入'],
      ['purchased', '購入済み']
    ],
    'その他': [
      ['unpurchased', '未購入'],
      ['purchased', '購入済み']
    ],
  };

  const ALL = 'すべて';
  const CATS = Object.keys(TYPES);
  const PAGE_SIZE = 4;

  const $ = (id) => document.getElementById(id);

  const form = $('item-form');

  const fields = {
    name: $('f-name'),
    price: $('f-price'),
    url: $('f-url'),
    plan: $('f-plan'),
    memo: $('f-memo'),
    status: $('f-status'),
  };

  let current = ALL;
  let editingId = null;
  let formCategory = null;

  // カテゴリごとの「未購入類」ページ番号
  const pages = {};

  // 「未購入類」に入れる状態
  // 表示名が「未」で始まるものを自動的に対象にする。
  function isUnpurchasedLike(cat, status) {
    return statusLabel(cat, status).startsWith('未');
  }

  function load() {
    const items = LM.get(LM.KEYS.WISHLIST, []);
    let changed = false;

    items.forEach((it) => {
      if (!TYPES[it.category]) {
        it.category = 'その他';
        changed = true;
      }

      if (!it.status) {
        it.status = it.purchased ? 'purchased' : TYPES[it.category][0][0];
        changed = true;
      }

      if (!TYPES[it.category].some(([id]) => id === it.status)) {
        it.status = TYPES[it.category][0][0];
        changed = true;
      }

      if (!it.checks) {
        it.checks = {};
        changed = true;
      }

      if ('desire' in it) {
        delete it.desire;
        changed = true;
      }
    });

    if (changed) LM.set(LM.KEYS.WISHLIST, items);

    return items;
  }

  function save(items) {
    LM.set(LM.KEYS.WISHLIST, items);
  }

  function statusLabel(cat, id) {
    const s = TYPES[cat].find(([sid]) => sid === id);
    return s ? s[1] : id;
  }

  function render() {
    const items = load();

    renderTabs();

    const shown =
      current === ALL
        ? items
        : items.filter((it) => it.category === current);

    renderTotals(shown);

    const list = $('list');
    list.innerHTML = '';

    if (!shown.length) {
      list.innerHTML =
        '<p class="lm-empty">まだ何も登録されていません</p>';
    }

    if (current === ALL) {
      CATS.forEach((cat) => {
        const g = shown.filter((it) => it.category === cat);

        if (g.length) {
          appendAllCategoryGroup(
            list,
            `${cat}(${g.length})`,
            g
          );
        }
      });
    } else {
      renderCategoryGroups(list, current, shown);
    }

    const addArea = $('add-area');

    addArea.innerHTML =
      current === ALL
        ? ''
        : `<button type="button" class="lm-btn" data-add="1">${escapeHtml(current)}を追加する</button>`;
  }

  function renderTabs() {
    $('tabs').innerHTML = [ALL, ...CATS]
      .map((t) =>
        `<button type="button" class="wl-tab${t === current ? ' active' : ''}" data-tab="${escapeHtml(t)}">${escapeHtml(t)}</button>`
      )
      .join('');
  }

  function renderTotals(shown) {
    const open = shown.filter((it) => isUnpurchasedLike(it.category, it.status));

    const total = open.reduce(
      (s, it) => s + (it.price || 0),
      0
    );

    const plan = open
      .filter((it) => it.planThisMonth)
      .reduce((s, it) => s + (it.price || 0), 0);

    $('totals').innerHTML =
      `<span>未購入類合計 ¥${total.toLocaleString()}</span>` +
      `<span>今月買うもの合計 ¥${plan.toLocaleString()}</span>`;
  }

  // 「すべて」ではカテゴリごとにまとめる。
  function appendAllCategoryGroup(container, title, items) {
    const t = document.createElement('div');
    t.className = 'wl-group-title';
    t.textContent = title;
    container.appendChild(t);

    items.forEach((it) => {
      container.appendChild(rowEl(it));
    });
  }

  // カテゴリタブ内の表示。
  // 「未～」は全部まとめて1グループにする。
  // それ以外は状態ごとに表示する。
  function renderCategoryGroups(container, cat, items) {
    const unpurchasedLike = items.filter((it) =>
      isUnpurchasedLike(cat, it.status)
    );

    const otherGroups = TYPES[cat]
      .filter(([sid]) =>
        !unpurchasedLike.some((it) => it.status === sid)
      )
      .map(([sid, label]) => ({
        sid,
        label,
        items: items.filter((it) => it.status === sid)
      }))
      .filter((g) => g.items.length);

    if (unpurchasedLike.length) {
      appendPagedGroup(
        container,
        `未購入類(${unpurchasedLike.length})`,
        unpurchasedLike,
        cat
      );
    }

    otherGroups.forEach((g) => {
      appendSimpleGroup(
        container,
        `${g.label}(${g.items.length})`,
        g.items
      );
    });
  }

  function appendSimpleGroup(container, title, items) {
    const t = document.createElement('div');
    t.className = 'wl-group-title';
    t.textContent = title;
    container.appendChild(t);

    items.forEach((it) => {
      container.appendChild(rowEl(it));
    });
  }

  function appendPagedGroup(container, title, items, cat) {
    const page = pages[cat] || 1;
    const pageCount = Math.max(
      1,
      Math.ceil(items.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);
    pages[cat] = safePage;

    const start = (safePage - 1) * PAGE_SIZE;
    const visible = items.slice(start, start + PAGE_SIZE);

    const t = document.createElement('div');
    t.className = 'wl-group-title';
    t.textContent = title;
    container.appendChild(t);

    visible.forEach((it) => {
      container.appendChild(rowEl(it));
    });

    if (items.length > PAGE_SIZE) {
      const pager = document.createElement('div');
      pager.className = 'wl-pager';

      pager.innerHTML = `
        <button type="button" class="lm-btn secondary" data-page-prev="${escapeHtml(cat)}">
          ◀
        </button>
        <span>${safePage}/${pageCount}</span>
        <button type="button" class="lm-btn secondary" data-page-next="${escapeHtml(cat)}">
          ▶
        </button>
        <button type="button" class="lm-btn secondary" data-page-all="${escapeHtml(cat)}">
          全表示
        </button>
      `;

      container.appendChild(pager);
    }
  }

  function rowEl(it) {
    const row = document.createElement('div');
    row.className = 'wl-row';

    const opts = TYPES[it.category]
      .map(
        ([id, label]) =>
          `<option value="${escapeHtml(id)}"${
            id === it.status ? ' selected' : ''
          }>${escapeHtml(label)}</option>`
      )
      .join('');

    const subs = [];

    if (current === ALL) {
      subs.push(
        `${escapeHtml(it.category)}:${escapeHtml(
          statusLabel(it.category, it.status)
        )}`
      );
    }

    if (it.planThisMonth) {
      subs.push('今月買う予定');
    }

    if (it.url) {
      subs.push(
        `<a class="wl-link-chip" href="${escapeHtml(
          it.url
        )}" target="_blank" rel="noopener">リンク</a>`
      );
    }

    const badge =
      it.checks && it.checks.lent
        ? '<span class="wl-badge">貸出済</span>'
        : '';

    const memo =
      it.memo && it.memo.trim()
        ? `<div class="wl-row-memo">${escapeHtml(it.memo)}</div>`
        : '';

    row.innerHTML = `
      <div class="wl-row-main">
        <strong>${escapeHtml(it.name)}</strong>
        ${
          it.price
            ? `<span>¥${it.price.toLocaleString()}</span>`
            : ''
        }
      </div>

      <div class="wl-row-sub">
        ${badge}${subs.join(' ・ ')}
      </div>

      ${memo}

      <div class="wl-row-actions">
        <select data-status="${escapeHtml(it.id)}">
          ${opts}
        </select>

        <button
          type="button"
          data-edit="${escapeHtml(it.id)}"
          class="lm-btn secondary"
          style="padding:2px 8px; font-size:12px;"
        >
          編集
        </button>

        <button
          type="button"
          data-delete="${escapeHtml(it.id)}"
          class="lm-btn secondary"
          style="padding:2px 8px; font-size:12px;"
        >
          削除
        </button>
      </div>
    `;

    return row;
  }

  function setStatus(id, status) {
    const items = load();
    const it = items.find((x) => x.id === id);

    if (!it) return;

    if (it.status === 'lent' && status !== 'lent') {
      it.checks.lent = true;
    }

    it.status = status;
    it.purchased = status === 'purchased';

    save(items);
    render();
  }

  function openForm(cat, item) {
    formCategory = cat;
    editingId = item ? item.id : null;

    form.reset();

    // 属性選択肢を現在のカテゴリに合わせる
    if (fields.status) {
      fields.status.innerHTML = TYPES[cat]
        .map(
          ([id, label]) =>
            `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`
        )
        .join('');
    }

    if (item) {
      fields.name.value = item.name;
      fields.price.value = item.price || '';
      fields.url.value = item.url || '';
      fields.plan.checked = !!item.planThisMonth;
      fields.memo.value = item.memo || '';

      if (fields.status) {
        fields.status.value = item.status;
      }
    } else {
      // 新規追加時はカテゴリの最初の状態
      if (fields.status) {
        fields.status.value = TYPES[cat][0][0];
      }
    }

    $('form-title').textContent =
      item ? `${cat}を編集` : `${cat}を追加`;

    $('form-section').hidden = false;

    $('form-section').scrollIntoView({
      behavior: 'smooth'
    });
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

    const old = editingId
      ? items.find((it) => it.id === editingId)
      : null;

    const status =
      fields.status?.value ||
      old?.status ||
      TYPES[formCategory][0][0];

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

    if (old) {
      items[items.indexOf(old)] = data;
    } else {
      items.push(data);
    }

    save(items);
    closeForm();
    render();
  });

  $('cancel-edit').addEventListener('click', closeForm);

  document.addEventListener('click', (e) => {
    const d = e.target.dataset;

    if (d.tab) {
      current = d.tab;
      closeForm();
      render();
      return;
    }

    if (d.add) {
      openForm(current);
      return;
    }

    if (d.edit) {
      const it = load().find((x) => x.id === d.edit);
      if (it) openForm(it.category, it);
      return;
    }

    if (d.delete) {
      if (!confirm('削除しますか?')) return;

      save(
        load().filter((it) => it.id !== d.delete)
      );

      render();
      return;
    }

    // ページャー
    if (d.pagePrev) {
      pages[d.pagePrev] = Math.max(
        1,
        (pages[d.pagePrev] || 1) - 1
      );
      render();
      return;
    }

    if (d.pageNext) {
      const items = load().filter(
        (it) =>
          it.category === d.pageNext &&
          isUnpurchasedLike(
            d.pageNext,
            it.status
          )
      );

      const pageCount = Math.max(
        1,
        Math.ceil(items.length / PAGE_SIZE)
      );

      pages[d.pageNext] = Math.min(
        pageCount,
        (pages[d.pageNext] || 1) + 1
      );

      render();
      return;
    }

    if (d.pageAll) {
      // 0 を「全表示」として扱う
      pages[d.pageAll] = 0;
      renderAllPage(d.pageAll);
      return;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.status) {
      setStatus(
        e.target.dataset.status,
        e.target.value
      );
    }
  });

  function renderAllPage(cat) {
    const items = load();
    const shown = items.filter(
      (it) => it.category === cat
    );

    const list = $('list');
    list.innerHTML = '';

    renderCategoryGroupsAll(list, cat, shown);

    renderTabs();
    renderTotals(shown);

    const addArea = $('add-area');

    addArea.innerHTML =
      `<button type="button" class="lm-btn" data-add="1">${escapeHtml(cat)}を追加する</button>`;
  }

  function renderCategoryGroupsAll(container, cat, items) {
    const unpurchasedLike = items.filter((it) =>
      isUnpurchasedLike(cat, it.status)
    );

    const others = TYPES[cat]
      .filter(([sid]) =>
        !unpurchasedLike.some((it) => it.status === sid)
      )
      .map(([sid, label]) => ({
        label,
        items: items.filter((it) => it.status === sid)
      }))
      .filter((g) => g.items.length);

    if (unpurchasedLike.length) {
      appendSimpleGroup(
        container,
        `未購入類(${unpurchasedLike.length})`,
        unpurchasedLike
      );
    }

    others.forEach((g) => {
      appendSimpleGroup(
        container,
        `${g.label}(${g.items.length})`,
        g.items
      );
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent =
      str == null ? '' : String(str);
    return div.innerHTML;
  }

  render();

  LM.renderNav($('nav-container'));
})();