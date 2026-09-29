(function () {
  // 種類ごとの基本状態
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

  let selectedCategories = new Set();
  let selectedStatuses = new Set();
  let filterOpen = null;

  // カテゴリごとの「未購入類」ページ
  const pages = {};

  // 「未購入類」に入れる状態
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
        it.status = it.purchased
          ? 'purchased'
          : TYPES[it.category][0][0];
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

    if (changed) {
      LM.set(LM.KEYS.WISHLIST, items);
    }

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
    
    if (current === ALL) {
     renderFilters();
  }

    const shown =
  current === ALL
    ? items.filter((it) => {
        const categoryMatch =
          selectedCategories.size === 0 ||
          selectedCategories.has(it.category);

        const statusMatch =
          selectedStatuses.size === 0 ||
          selectedStatuses.has(
            statusLabel(it.category, it.status)
          );

        return categoryMatch && statusMatch;
      })
    : items.filter(
        (it) => it.category === current
      );

    renderTotals(shown);

    const list = $('list');
    list.innerHTML = '';

    if (!shown.length) {
      list.innerHTML =
        '<p class="lm-empty">まだ何も登録されていません</p>';
    }

    if (current === ALL) {
  CATS.forEach((cat) => {
    const group = shown.filter(
      (it) => it.category === cat
    );

    if (group.length) {
      renderCategoryGroups(
        list,
        cat,
        group
      );
    }
  });
 } else {
   renderCategoryGroups(
     list,
     current,
     shown
   );
 }

    const addArea = $('add-area');

    addArea.innerHTML =
      current === ALL
        ? ''
        : `<button type="button" class="lm-btn" data-add="1">${escapeHtml(current)}を追加する</button>`;
  }

  function renderTabs() {
    $('tabs').innerHTML = [ALL, ...CATS]
      .map(
        (t) =>
          `<button type="button" class="wl-tab${t === current ? ' active' : ''}" data-tab="${escapeHtml(t)}">${escapeHtml(t)}</button>`
      )
      .join('');
  }
  
  function renderFilters() {
  const container = $('filters');
  container.innerHTML = '';
  container.className = 'wl-filters';

  const categorySelected =
    selectedCategories.size > 0;

  const statusSelected =
    selectedStatuses.size > 0;

  const categoryOptions = CATS.map((cat) => `
    <button
      type="button"
      class="wl-filter-option${selectedCategories.has(cat) ? ' active' : ''}"
      data-filter-category="${escapeHtml(cat)}"
    >
      ${selectedCategories.has(cat) ? '✓ ' : ''}${escapeHtml(cat)}
    </button>
  `).join('');

  const statusOptions = [
    ...new Set(
      CATS.flatMap((cat) =>
        TYPES[cat].map(([, label]) => label)
      )
    )
  ].map((label) => `
    <button
      type="button"
      class="wl-filter-option${selectedStatuses.has(label) ? ' active' : ''}"
      data-filter-status="${escapeHtml(label)}"
    >
      ${selectedStatuses.has(label) ? '✓ ' : ''}${escapeHtml(label)}
    </button>
  `).join('');

  container.innerHTML = `
    <div class="wl-filter">
      <button
        type="button"
        class="wl-filter-trigger${categorySelected ? ' active' : ''}"
        data-filter-toggle="category"
      >
        種類${categorySelected ? ` ${selectedCategories.size}選択` : ''} ▾
      </button>

      <div class="wl-filter-options${filterOpen === 'category' ? ' open' : ''}">
        ${categoryOptions}
      </div>
    </div>

    <div class="wl-filter">
      <button
        type="button"
        class="wl-filter-trigger${statusSelected ? ' active' : ''}"
        data-filter-toggle="status"
      >
        属性${statusSelected ? ` ${selectedStatuses.size}選択` : ''} ▾
      </button>

      <div class="wl-filter-options${filterOpen === 'status' ? ' open' : ''}">
        ${statusOptions}
      </div>
    </div>
  `;

  $('tabs').appendChild(container);
}

  function renderTotals(shown) {
    const open = shown.filter((it) =>
      isUnpurchasedLike(it.category, it.status)
    );

    const total = open.reduce(
      (sum, it) => sum + (it.price || 0),
      0
    );

    const plan = open
      .filter((it) => it.planThisMonth)
      .reduce(
        (sum, it) => sum + (it.price || 0),
        0
      );

    $('totals').innerHTML =
      `<span>未購入など合計 ¥${total.toLocaleString()}</span>` +
      `<span>今月買うもの合計 ¥${plan.toLocaleString()}</span>`;
  }

  // 「未購入など」と、それ以外の状態を表示
  function renderCategoryGroups(container, cat, items) {
    const unpurchasedLike = items.filter((it) =>
      isUnpurchasedLike(cat, it.status)
    );

    const otherGroups = TYPES[cat]
      .filter(([sid]) =>
        !unpurchasedLike.some(
          (it) => it.status === sid
        )
      )
      .map(([sid, label]) => ({
        sid,
        label,
        items: items.filter(
          (it) => it.status === sid
        )
      }))
      .filter((group) => group.items.length);

    if (unpurchasedLike.length) {
      appendPagedGroup(
        container,
        `未購入など(${unpurchasedLike.length})`,
        unpurchasedLike,
        cat
      );
    }

    otherGroups.forEach((group) => {
      appendSimpleGroup(
        container,
        `${group.label}(${group.items.length})`,
        group.items
      );
    });
  }

  function appendSimpleGroup(container, title, items) {
    const titleEl = document.createElement('div');
    titleEl.className = 'wl-group-title';
    titleEl.textContent = title;
    container.appendChild(titleEl);

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

    const start =
      (safePage - 1) * PAGE_SIZE;

    const visible = items.slice(
      start,
      start + PAGE_SIZE
    );

    const titleEl = document.createElement('div');
    titleEl.className = 'wl-group-title';
    titleEl.textContent = title;
    container.appendChild(titleEl);

    visible.forEach((it) => {
      container.appendChild(rowEl(it));
    });

    if (items.length > PAGE_SIZE) {
      const pager = document.createElement('div');
      pager.className = 'wl-pager';

      pager.innerHTML = `
        <button
          type="button"
          class="lm-btn secondary"
          data-page-prev="${escapeHtml(cat)}"
        >◀</button>

        <span>${safePage}/${pageCount}</span>

        <button
          type="button"
          class="lm-btn secondary"
          data-page-next="${escapeHtml(cat)}"
        >▶</button>

        <button
         type="button"
         class="lm-btn secondary lm-list-all-btn"
         data-page-all="${escapeHtml(cat)}"
        >全表示</button>
      `;

      container.appendChild(pager);
    }
  }

  // アイテム詳細
  function showDetail(id) {
    const it = load().find(
      (item) => item.id === id
    );

    if (!it) return;

    const wrap = document.createElement('div');
    wrap.className = 'wl-detail';

    const details = [
      `種類：${escapeHtml(it.category)}`,
      `状態：${escapeHtml(
        statusLabel(it.category, it.status)
      )}`,
      it.price
        ? `価格：¥${it.price.toLocaleString()}`
        : '',
      it.planThisMonth
        ? '今月買う予定：はい'
        : '',
      it.url
        ? `リンク：<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a>`
        : '',
      it.memo
        ? `メモ：<br>${escapeHtml(it.memo).replace(/\n/g, '<br>')}`
        : 'メモ：なし'
    ].filter(Boolean);

    wrap.innerHTML = details
      .map((text) => `<div>${text}</div>`)
      .join('');

    LM.openModal(it.name, wrap);
  }

  // 一覧の1行
  function rowEl(it) {
    const row = document.createElement('div');

    row.className = 'wl-row';
    row.dataset.detail = it.id;

    const opts = TYPES[it.category]
      .map(
        ([id, label]) =>
          `<option value="${escapeHtml(id)}"${
            id === it.status
              ? ' selected'
              : ''
          }>${escapeHtml(label)}</option>`
      )
      .join('');

    const subs = [];

    if (current === ALL) {
      subs.push(
        `${escapeHtml(it.category)}:${escapeHtml(
          statusLabel(
            it.category,
            it.status
          )
        )}`
      );
    }

    if (it.planThisMonth) {
      subs.push('今月買う予定');
    }

    if (it.url) {
      subs.push(
        `<a class="wl-link-chip" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">リンク</a>`
      );
    }

    const badge =
      it.checks && it.checks.lent
        ? '<span class="wl-badge">貸出済</span>'
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

      <div class="wl-row-actions">
        <select data-status="${escapeHtml(it.id)}">
          ${opts}
        </select>

        <button
          type="button"
          data-edit="${escapeHtml(it.id)}"
          class="lm-btn secondary"
          style="padding:2px 8px; font-size:12px;"
        >編集</button>

        <button
          type="button"
          data-delete="${escapeHtml(it.id)}"
          class="lm-btn secondary"
          style="padding:2px 8px; font-size:12px;"
        >削除</button>
      </div>
    `;

    return row;
  }

  // 状態変更
  function setStatus(id, status) {
    const items = load();

    const it = items.find(
      (item) => item.id === id
    );

    if (!it) return;

    if (
      it.status === 'lent' &&
      status !== 'lent'
    ) {
      it.checks.lent = true;
    }

    it.status = status;
    it.purchased = status === 'purchased';

    save(items);
    render();
  }

  // 追加・編集フォーム
  function openForm(cat, item) {
    formCategory = cat;
    editingId = item
      ? item.id
      : null;

    form.reset();

    if (fields.status) {
      fields.status.innerHTML =
        TYPES[cat]
          .map(
            ([id, label]) =>
              `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`
          )
          .join('');
    }

    if (item) {
      fields.name.value =
        item.name;

      fields.price.value =
        item.price || '';

      fields.url.value =
        item.url || '';

      fields.plan.checked =
        !!item.planThisMonth;

      fields.memo.value =
        item.memo || '';

      if (fields.status) {
        fields.status.value =
          item.status;
      }
    } else {
      if (fields.status) {
        fields.status.value =
          TYPES[cat][0][0];
      }
    }

    $('form-title').textContent =
      item
        ? `${cat}を編集`
        : `${cat}を追加`;

    $('form-section').hidden =
      false;

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

  // フォーム送信
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const items = load();

    const old = editingId
      ? items.find(
          (it) => it.id === editingId
        )
      : null;

    const status =
      fields.status?.value ||
      old?.status ||
      TYPES[formCategory][0][0];

    const data = {
      id: old
        ? old.id
        : LM.uid(),

      name:
        fields.name.value.trim(),

      category:
        formCategory,

      price:
        Number(fields.price.value) || 0,

      url:
        fields.url.value.trim(),

      planThisMonth:
        fields.plan.checked,

      memo:
        fields.memo.value.trim(),

      status,

      purchased:
        status === 'purchased',

      checks:
        old
          ? old.checks
          : {},
    };

    if (old) {
      items[items.indexOf(old)] =
        data;
    } else {
      items.push(data);
    }

    save(items);
    closeForm();
    render();
  });

  $('cancel-edit')
    .addEventListener(
      'click',
      closeForm
    );

  // クリック処理
  document.addEventListener(
    'click',
    (e) => {
      const d = e.target.dataset;

      // タブ
      if (d.tab) {
   current = d.tab;

  if (current === ALL) {
    selectedCategories.clear();
    selectedStatuses.clear();
    filterOpen = null;
  }

  closeForm();
  render();
  return;
}
      
      if (d.filterToggle) {
  filterOpen =
    filterOpen === d.filterToggle
      ? null
      : d.filterToggle;

  render();
  return;
 }

 if (d.filterCategory) {
  if (
    selectedCategories.has(
      d.filterCategory
    )
  ) {
    selectedCategories.delete(
      d.filterCategory
    );
  } else {
    selectedCategories.add(
      d.filterCategory
    );
  }

  filterOpen = 'category';
  render();
  return;
 }

 if (d.filterStatus) {
  if (
    selectedStatuses.has(
      d.filterStatus
    )
  ) {
    selectedStatuses.delete(
      d.filterStatus
    );
  } else {
    selectedStatuses.add(
      d.filterStatus
    );
  }

  filterOpen = 'status';
  render();
  return;
 }

      // 追加
      if (d.add) {
        openForm(current);
        return;
      }

      // 編集
      if (d.edit) {
        const it = load().find(
          (item) => item.id === d.edit
        );

        if (it) {
          openForm(
            it.category,
            it
          );
        }

        return;
      }

      // 削除
      if (d.delete) {
        if (
          !confirm(
            '削除しますか?'
          )
        ) {
          return;
        }

        save(
          load().filter(
            (it) =>
              it.id !== d.delete
          )
        );

        render();
        return;
      }

      // 前のページ
      if (d.pagePrev) {
        pages[d.pagePrev] =
          Math.max(
            1,
            (pages[d.pagePrev] || 1) - 1
          );

        render();
        return;
      }

      // 次のページ
      if (d.pageNext) {
        const items =
          load().filter(
            (it) =>
              it.category ===
                d.pageNext &&
              isUnpurchasedLike(
                d.pageNext,
                it.status
              )
          );

        const pageCount =
          Math.max(
            1,
            Math.ceil(
              items.length /
                PAGE_SIZE
            )
          );

        pages[d.pageNext] =
          Math.min(
            pageCount,
            (pages[d.pageNext] || 1) + 1
          );

        render();
        return;
      }

      // 全表示
      if (d.pageAll) {
        renderAllPage(
          d.pageAll
        );
        return;
      }

      // ボタン・セレクト・リンクを
      // 押した場合は詳細を開かない
      if (
        e.target.closest(
          'button, select, a'
        )
      ) {
        return;
      }

      // 行を押したら詳細
      const row =
        e.target.closest(
          '[data-detail]'
        );

      if (row) {
        showDetail(
          row.dataset.detail
        );
      }
    }
  );

  // 状態セレクト変更
  document.addEventListener(
    'change',
    (e) => {
      if (
        e.target.dataset.status
      ) {
        setStatus(
          e.target.dataset.status,
          e.target.value
        );
      }
    }
  );

  // 「全表示」
  function renderAllPage(cat) {
    const items = load();

    const shown =
      items.filter(
        (it) =>
          it.category === cat
      );

    const list = $('list');

    list.innerHTML = '';

    renderCategoryGroupsAll(
      list,
      cat,
      shown
    );

    renderTabs();
    renderTotals(shown);

    $('add-area').innerHTML =
      `<button type="button" class="lm-btn" data-add="1">${escapeHtml(cat)}を追加する</button>`;
  }

  function renderCategoryGroupsAll(
    container,
    cat,
    items
  ) {
    const unpurchasedLike =
      items.filter((it) =>
        isUnpurchasedLike(
          cat,
          it.status
        )
      );

    const others =
      TYPES[cat]
        .filter(
          ([sid]) =>
            !unpurchasedLike.some(
              (it) =>
                it.status === sid
            )
        )
        .map(
          ([sid, label]) => ({
            label,
            items:
              items.filter(
                (it) =>
                  it.status ===
                  sid
              )
          })
        )
        .filter(
          (group) =>
            group.items.length
        );

    if (unpurchasedLike.length) {
      appendSimpleGroup(
        container,
        `未購入など(${unpurchasedLike.length})`,
        unpurchasedLike
      );
    }

    others.forEach(
      (group) => {
        appendSimpleGroup(
          container,
          `${group.label}(${group.items.length})`,
          group.items
        );
      }
    );
  }

  function escapeHtml(str) {
    const div =
      document.createElement(
        'div'
      );

    div.textContent =
      str == null
        ? ''
        : String(str);

    return div.innerHTML;
  }

  render();

  LM.renderNav(
    $('nav-container')
  );
})();
