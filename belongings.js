(function () {
  const PAGE_SIZE = 5;
  const setForm = document.getElementById('set-form');
  const setNameInput = document.getElementById('f-set-name');
  const setTagsInput = document.getElementById('f-set-tags');
  const listEl = document.getElementById('set-list');
  const tagFilterEl = document.getElementById('tag-filter');

  let page = 0;
  let activeTag = '__all__'; // '__all__' | '__none__' | タグ名
  const openSetIds = new Set();

  render();
  document.addEventListener('click', onGlobalClick);
  LM.renderNav(document.getElementById('nav-container'));

  setForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = setNameInput.value.trim();
    if (!name) return;
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    sets.push({ id: LM.uid(), name, items: [], tags: parseTags(setTagsInput.value) });
    LM.set(LM.KEYS.BELONGING_SETS, sets);
    setNameInput.value = '';
    setTagsInput.value = '';
    render();
  });

  function parseTags(text) {
    const tags = String(text || '')
      .split(/[,、，\s]+/)
      .map((t) => t.replace(/^[#＃]/, '').trim())
      .filter(Boolean);
    return [...new Set(tags)];
  }

  function getFilteredSets() {
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    if (activeTag === '__all__') return sets;
    if (activeTag === '__none__') return sets.filter((s) => !(s.tags && s.tags.length));
    return sets.filter((s) => (s.tags || []).includes(activeTag));
  }

  function renderTagFilter() {
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    const allTags = [...new Set(sets.flatMap((s) => s.tags || []))].sort((a, b) => a.localeCompare(b, 'ja'));
    if (activeTag !== '__all__' && activeTag !== '__none__' && !allTags.includes(activeTag)) activeTag = '__all__';
    const hasUntagged = sets.some((s) => !(s.tags && s.tags.length));
    const buttons = [{ key: '__all__', label: 'すべて' }]
      .concat(allTags.map((t) => ({ key: t, label: '#' + t })));
    if (allTags.length && hasUntagged) buttons.push({ key: '__none__', label: 'タグなし' });
    tagFilterEl.innerHTML = '';
    if (!allTags.length) return;
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lm-btn secondary' + (activeTag === b.key ? ' is-active' : '');
      btn.style.cssText = 'padding:4px 10px; font-size:12px;';
      btn.dataset.tagFilter = b.key;
      btn.setAttribute('aria-pressed', String(activeTag === b.key));
      btn.textContent = b.label;
      tagFilterEl.appendChild(btn);
    });
  }

  function render() {
    renderTagFilter();
    renderPaged(listEl, getFilteredSets(), false);
  }

  function renderPaged(container, sets, isModal) {
    container.innerHTML = '';
    if (sets.length === 0) {
      container.innerHTML = '<p class="lm-empty">セットはまだ登録されていません</p>';
      return;
    }

    let pageItems = sets;
    if (!isModal) {
      const totalPages = Math.max(1, Math.ceil(sets.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      pageItems = sets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    }

    pageItems.forEach((set) => container.appendChild(renderSetBox(set)));

    if (!isModal && sets.length > PAGE_SIZE) {
      const totalPages = Math.max(1, Math.ceil(sets.length / PAGE_SIZE));
      const pager = document.createElement('div');
      pager.className = 'lm-pager';
      pager.innerHTML = `
        <button type="button" data-prev="1" ${page === 0 ? 'disabled' : ''}>◀</button>
        <span>${page + 1}/${totalPages}</span>
        <button type="button" data-next="1" ${page >= totalPages - 1 ? 'disabled' : ''}>▶</button>
      `;
      container.appendChild(pager);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lm-btn secondary lm-list-all-btn';
      btn.dataset.listAll = '1';
      btn.textContent = '一覧表示';
      container.appendChild(btn);
    }
  }

  function renderSetBox(set) {
    const wrap = document.createElement('div');
    wrap.className = 'lm-collapsible' + (openSetIds.has(set.id) ? ' open' : '');
    const tags = set.tags || [];

    const itemsHtml = set.items
      .map(
        (it) => `
      <li class="lm-check-item" style="justify-content:space-between;">
        <span>${escapeHtml(it.name)}</span>
        <button type="button" data-remove-item="${set.id}:${it.id}" class="lm-btn secondary" style="padding:4px 8px; font-size:12px;">削除</button>
      </li>`
      )
      .join('');

    const headerTagsHtml = tags.length
      ? `<div style="font-size:11px; color:var(--text-soft); margin-top:2px;">${tags.map((t) => '#' + escapeHtml(t)).join(' ')}</div>`
      : '';
    const tagChipsHtml = tags
      .map(
        (t, i) => `
      <span style="display:inline-flex; align-items:center; gap:4px; padding:2px 4px 2px 8px; font-size:12px; background:var(--accent-soft); border:1px solid var(--paper-line); border-radius:999px;">
        #${escapeHtml(t)}
        <button type="button" data-remove-tag="${set.id}|${i}" aria-label="タグを外す" style="border:none; background:transparent; font-size:12px; padding:2px 4px; cursor:pointer; color:var(--text-soft);">✕</button>
      </span>`
      )
      .join('');

    wrap.innerHTML = `
      <div class="lm-collapsible-header" data-toggle-set="${set.id}">
        <div>
          <strong>${escapeHtml(set.name)}(${set.items.length})</strong>
          ${headerTagsHtml}
        </div>
        <span class="lm-collapsible-arrow">▶</span>
      </div>
      <div class="lm-collapsible-body">
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          ${tagChipsHtml || '<span class="lm-empty" style="margin:0;">タグなし</span>'}
        </div>
        <form data-add-tag="${set.id}" style="display:flex; gap:8px; margin-bottom:12px;">
          <input placeholder="タグを追加" style="flex:1; min-width:0; font-family:var(--font-body); font-size:16px; padding:8px 10px; border:1px solid var(--paper-line); border-radius:8px;" required />
          <button type="submit" class="lm-btn secondary" style="padding:8px 14px;">追加</button>
        </form>
        <ul class="lm-check-list">${itemsHtml || '<li class="lm-empty">まだ持ちものが登録されていません</li>'}</ul>
        <form data-add-item="${set.id}" style="display:flex; gap:8px; margin-top:8px;">
          <input placeholder="持ちものを追加" style="flex:1; min-width:0; font-family:var(--font-body); font-size:16px; padding:8px 10px; border:1px solid var(--paper-line); border-radius:8px;" required />
          <button type="submit" class="lm-btn secondary" style="padding:8px 14px;">追加</button>
        </form>
        <button type="button" data-delete-set="${set.id}" class="lm-btn secondary" style="margin-top:10px; padding:6px 10px; font-size:12px;">セット削除</button>
      </div>
    `;

    wrap.querySelector('.lm-collapsible-header').addEventListener('click', () => {
      wrap.classList.toggle('open');
      if (wrap.classList.contains('open')) openSetIds.add(set.id);
      else openSetIds.delete(set.id);
    });

    wrap.querySelector('form[data-add-item]').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
      const s = sets.find((x) => x.id === set.id);
      if (s) s.items.push({ id: LM.uid(), name });
      LM.set(LM.KEYS.BELONGING_SETS, sets);
      openSetIds.add(set.id);
      render();
    });

    wrap.querySelector('form[data-add-tag]').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const added = parseTags(input.value);
      if (!added.length) return;
      const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
      const s = sets.find((x) => x.id === set.id);
      if (s) s.tags = [...new Set([...(s.tags || []), ...added])];
      LM.set(LM.KEYS.BELONGING_SETS, sets);
      openSetIds.add(set.id);
      render();
    });

    return wrap;
  }

  function onGlobalClick(e) {
    const removeKey = e.target.dataset.removeItem;
    const deleteSetId = e.target.dataset.deleteSet;
    const prev = e.target.dataset.prev;
    const next = e.target.dataset.next;
    const listAll = e.target.dataset.listAll;
    const tagFilter = e.target.dataset.tagFilter;
    const removeTag = e.target.dataset.removeTag;

    if (tagFilter) {
      activeTag = tagFilter;
      page = 0;
      render();
      return;
    }

    if (removeTag) {
      const [setId, index] = removeTag.split('|');
      const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
      const set = sets.find((s) => s.id === setId);
      if (set) set.tags = (set.tags || []).filter((_, i) => i !== Number(index));
      LM.set(LM.KEYS.BELONGING_SETS, sets);
      openSetIds.add(setId);
      render();
      return;
    }

    if (removeKey) {
      const [setId, itemId] = removeKey.split(':');
      const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
      const set = sets.find((s) => s.id === setId);
      if (set) set.items = set.items.filter((it) => it.id !== itemId);
      LM.set(LM.KEYS.BELONGING_SETS, sets);
      render();
      LM.closeModal();
    }

    if (deleteSetId) {
      if (!confirm('このセットを削除しますか?(紐付けている予定からも解除されます)')) return;
      const sets = LM.get(LM.KEYS.BELONGING_SETS, []).filter((s) => s.id !== deleteSetId);
      LM.set(LM.KEYS.BELONGING_SETS, sets);

      const schedules = LM.get(LM.KEYS.SCHEDULES, []);
      schedules.forEach((s) => {
        if (s.belongingSetIds) s.belongingSetIds = s.belongingSetIds.filter((id) => id !== deleteSetId);
        if (s.belongingSetId === deleteSetId) s.belongingSetId = null;
      });
      LM.set(LM.KEYS.SCHEDULES, schedules);
      render();
      LM.closeModal();
    }

    if (prev) {
      page = Math.max(0, page - 1);
      render();
    }
    if (next) {
      page = page + 1;
      render();
    }
    if (listAll) {
      const wrap = document.createElement('div');
      renderPaged(wrap, getFilteredSets(), true);
      LM.openModal('セット 一覧', wrap);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
