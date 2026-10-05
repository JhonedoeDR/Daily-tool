(function () {
  const PAGE_SIZE = 2;
  const form = document.getElementById('event-form');
  const fields = {
    name: document.getElementById('f-name'),
    start: document.getElementById('f-start'),
    end: document.getElementById('f-end'),
    target: document.getElementById('f-target'),
    current: document.getElementById('f-current'),
    unit: document.getElementById('f-unit'),
  };
  const formTitle = document.getElementById('form-title');
  const cancelBtn = document.getElementById('cancel-edit');
  const ongoingEl = document.getElementById('ongoing-list');
  const endedEl = document.getElementById('ended-list');

  let editingId = null;
  const today = LM.todayStr();
  const page = { ongoing: 0, ended: 0 };

  render();
  document.addEventListener('click', onGlobalClick);
  LM.renderNav(document.getElementById('nav-container'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const events = LM.get(LM.KEYS.EVENTS, []);
    const data = {
      id: editingId || LM.uid(),
      name: fields.name.value.trim(),
      start: fields.start.value,
      end: fields.end.value,
      target: Number(fields.target.value) || 0,
      current: Number(fields.current.value) || 0,
      unit: fields.unit.value.trim(),
    };

    if (editingId) {
      const idx = events.findIndex((ev) => ev.id === editingId);
      if (idx !== -1) events[idx] = data;
    } else {
      events.push(data);
    }
    LM.set(LM.KEYS.EVENTS, events);
    LM.syncFirebase();
    resetForm();
    render();
  });

  cancelBtn.addEventListener('click', resetForm);

  function onGlobalClick(e) {
    if (!(e.target instanceof Element)) return;
    const action = e.target.closest(
      '[data-edit], [data-delete], [data-update-current], [data-prev], [data-next], [data-list-all]'
    );
    if (!action) return;

    const {
      edit: editId,
      delete: deleteId,
      updateCurrent: updateId,
      prev: prevKind,
      next: nextKind,
      listAll: listAllKind,
    } = action.dataset;

    if (editId) startEdit(editId);

    if (deleteId) {
      if (!confirm('このイベントを削除しますか?')) return;
      const events = LM.get(LM.KEYS.EVENTS, []).filter((ev) => ev.id !== deleteId);
      LM.set(LM.KEYS.EVENTS, events);
      LM.syncFirebase();
      render();
    }

    if (updateId) {
      const input = action.parentElement.querySelector('input[data-current-input]');
      if (!input || input.dataset.currentInput !== updateId) return;
      const events = LM.get(LM.KEYS.EVENTS, []);
      const ev = events.find((e2) => e2.id === updateId);
      if (ev) ev.current = Number(input.value) || 0;
      LM.set(LM.KEYS.EVENTS, events);
      LM.syncFirebase();
      render();
    }

    if (prevKind) {
      page[prevKind] = Math.max(0, page[prevKind] - 1);
      render();
    }
    if (nextKind) {
      page[nextKind] = page[nextKind] + 1;
      render();
    }
    if (listAllKind) {
      openListAllModal(listAllKind);
    }
  }

  function startEdit(id) {
    const ev = LM.get(LM.KEYS.EVENTS, []).find((e2) => e2.id === id);
    if (!ev) return;
    editingId = id;
    fields.name.value = ev.name;
    fields.start.value = ev.start;
    fields.end.value = ev.end;
    fields.target.value = ev.target;
    fields.current.value = ev.current;
    fields.unit.value = ev.unit || '';
    formTitle.textContent = 'イベントを編集';
    cancelBtn.style.display = 'inline-block';
    LM.closeModal();
    form.scrollIntoView({ behavior: 'smooth' });
  }

  function resetForm() {
    editingId = null;
    form.reset();
    fields.current.value = 0;
    formTitle.textContent = 'イベントを登録';
    cancelBtn.style.display = 'none';
  }

  function getOngoing() {
    // 現在進行中(開始済み)のものを先頭、次に開始前のものを開始日順で
    return LM.get(LM.KEYS.EVENTS, [])
      .filter((ev) => ev.end >= today)
      .sort((a, b) => {
        const aActive = a.start <= today ? 0 : 1;
        const bActive = b.start <= today ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return aActive === 0
          ? a.end.localeCompare(b.end)
          : a.start.localeCompare(b.start);
      });
  }

  function getEnded() {
    return LM.get(LM.KEYS.EVENTS, [])
      .filter((ev) => ev.end < today)
      .sort((a, b) => b.end.localeCompare(a.end));
  }

  function render() {
    renderPaged(ongoingEl, getOngoing(), '開催中のイベントはありません', 'ongoing', true);
    renderPaged(endedEl, getEnded(), '終了したイベントはありません', 'ended', false);
  }

  function renderPaged(container, events, emptyText, kind, showProgress) {
    container.innerHTML = '';
    if (events.length === 0) {
      container.innerHTML = `<p class="lm-empty">${emptyText}</p>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
    if (page[kind] >= totalPages) page[kind] = totalPages - 1;
    const pageItems = events.slice(page[kind] * PAGE_SIZE, page[kind] * PAGE_SIZE + PAGE_SIZE);

    pageItems.forEach((ev) => container.appendChild(renderEventBox(ev, showProgress)));

    if (events.length > PAGE_SIZE) {
      const pager = document.createElement('div');
      pager.className = 'lm-pager';
      pager.innerHTML = `
        <button type="button" data-prev="${kind}" ${page[kind] === 0 ? 'disabled' : ''}>◀</button>
        <span>${page[kind] + 1}/${totalPages}</span>
        <button type="button" data-next="${kind}" ${page[kind] >= totalPages - 1 ? 'disabled' : ''}>▶</button>
      `;
      container.appendChild(pager);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lm-btn secondary lm-list-all-btn';
      btn.dataset.listAll = kind;
      btn.textContent = '一覧表示';
      container.appendChild(btn);
    }
  }

  function openListAllModal(kind) {
    const events = kind === 'ongoing' ? getOngoing() : getEnded();
    const wrap = document.createElement('div');
    events.forEach((ev) => wrap.appendChild(renderEventBox(ev, kind === 'ongoing')));
    LM.openModal(kind === 'ongoing' ? '開催中 一覧' : '終了 一覧', wrap);
  }

  function renderEventBox(ev, showProgress) {
    const box = document.createElement('div');
    box.style.padding = '10px 0';
    box.style.borderBottom = '1px solid var(--paper-line)';

    let progressHtml = '';
    if (showProgress) {
      const { remain, remainDays, perDay, rate } = LM.calcEventProgress(ev, today);
      progressHtml = `
        <div class="lm-progress-track" style="margin:6px 0;">
          <div class="lm-progress-fill" style="width:${rate}%"></div>
        </div>
        <div class="lm-event-remain">残り${remainDays}日 ・ 残り${remain.toLocaleString()}${escapeHtml(ev.unit)} ・ 1日あたり${perDay.toLocaleString()}${escapeHtml(ev.unit)}必要</div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
          <input type="number" inputmode="numeric" pattern="[0-9]*" data-current-input="${escapeHtml(ev.id)}" value="${escapeHtml(ev.current)}" style="width:100px; font-family:var(--font-body); font-size:16px; padding:6px 8px; border:1px solid var(--paper-line); border-radius:6px;" />
          <button type="button" data-update-current="${escapeHtml(ev.id)}" class="lm-btn secondary" style="padding:6px 10px; font-size:12px;">現在値を更新</button>
        </div>
      `;
    }

    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <strong>${escapeHtml(ev.name)}</strong>
        <span style="font-size:12px; color:var(--text-soft);">${escapeHtml(ev.start)}〜${escapeHtml(ev.end)}</span>
      </div>
      <div style="font-size:13px; color:var(--text-soft); margin:2px 0;">${formatNumber(ev.current)} / ${formatNumber(ev.target)}${escapeHtml(ev.unit)}</div>
      ${progressHtml}
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button type="button" data-edit="${escapeHtml(ev.id)}" class="lm-btn secondary" style="padding:4px 10px; font-size:12px;">編集</button>
        <button type="button" data-delete="${escapeHtml(ev.id)}" class="lm-btn secondary" style="padding:4px 10px; font-size:12px;">削除</button>
      </div>
    `;
    return box;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    const number = Number(value);
    return (Number.isFinite(number) ? number : 0).toLocaleString();
  }
})();
