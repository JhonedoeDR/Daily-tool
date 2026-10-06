(function () {
  const PAGE_SIZE = 5;
  const form = document.getElementById('schedule-form');
  const scheduleList = document.getElementById('schedule-list');
  const scheduleFilters = [...document.querySelectorAll('[data-schedule-filter]')];
  const calendarGrid = document.getElementById('schedule-calendar-grid');
  const calendarTitle = document.getElementById('schedule-calendar-title');
  const fields = {
    name: document.getElementById('f-name'),
    date: document.getElementById('f-date'),
    start: document.getElementById('f-start'),
    place: document.getElementById('f-place'),
    travel: document.getElementById('f-travel'),
    prep: document.getElementById('f-prep'),
    arrive: document.getElementById('f-arrive'),
    memo: document.getElementById('f-memo'),
  };
  const belongingList = document.getElementById('f-belonging-list');
  const preview = document.getElementById('calc-preview');
  const formTitle = document.getElementById('form-title');
  const stepIndicator = document.getElementById('step-indicator');
  const cancelBtn = document.getElementById('cancel-edit');
  const steps = Array.from(document.querySelectorAll('.lm-step'));
  const formTabs = [...document.querySelectorAll('[data-form-tab]')];
  const schedulePanel = document.getElementById('tab-panel-schedule');
  const deadlinePanel = document.getElementById('tab-panel-deadline');
  const deadlineForm = document.getElementById('deadline-form');
  const deadlineFields = {
    name: document.getElementById('d-name'),
    date: document.getElementById('d-date'),
    time: document.getElementById('d-time'),
  };
  const deadlineTitle = document.getElementById('deadline-form-title');
  const deadlineCancelBtn = document.getElementById('deadline-cancel-edit');
  let editingDeadlineId = null;
  const deadlineNotifyList = document.getElementById('d-notify-list');
  renderDeadlineNotifyOptions();
  const presetPanel = document.getElementById('tab-panel-preset');
  const presetForm = document.getElementById('preset-form');
  const presetFields = {
    name: document.getElementById('p-name'),
    travel: document.getElementById('p-travel'),
    prep: document.getElementById('p-prep'),
    arrive: document.getElementById('p-arrive'),
  };
  const presetList = document.getElementById('preset-list');
  const ROUTE_PRESET_KEY = LM.KEYS.ROUTE_PRESETS || 'lm_routePresets';
  const presetTitle = document.getElementById('preset-form-title');
  const presetCancelBtn = document.getElementById('preset-cancel-edit');
  let editingPresetId = null;


  let editingId = null;
  let currentStep = 1;
  let activeFilter = 'all';
  let listPage = 0;
  let selectedCalendarDate = LM.todayStr();
  let shownCalendarMonth = new Date(`${selectedCalendarDate}T00:00:00`);
  let lastCalendarTapDate = '';
  let lastCalendarTapAt = 0;

  populateBelongingOptions();
  fields.date.value = LM.todayStr();
  goToStep(1, false);
  renderList();
  renderCalendar();
  scheduleList.addEventListener('click', onListClick);
  calendarGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    const date = button.dataset.date;
    selectedCalendarDate = date;
    renderCalendar();
    const now = Date.now();
    if (lastCalendarTapDate === date && now - lastCalendarTapAt <= 350) {
      lastCalendarTapDate = '';
      lastCalendarTapAt = 0;
      openCalendarAgenda(date);
      return;
    }
    lastCalendarTapDate = date;
    lastCalendarTapAt = now;
  });
  document.getElementById('schedule-calendar-prev').addEventListener('click', () => moveCalendarMonth(-1));
  document.getElementById('schedule-calendar-next').addEventListener('click', () => moveCalendarMonth(1));
  document.getElementById('schedule-calendar-today').addEventListener('click', () => {
    selectedCalendarDate = LM.todayStr();
    shownCalendarMonth = new Date(`${selectedCalendarDate}T00:00:00`);
    renderCalendar();
  });
  scheduleFilters.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.scheduleFilter;
      listPage = 0;
      scheduleFilters.forEach((filter) => {
        const active = filter === button;
        filter.classList.toggle('is-active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      renderList();
      renderCalendar();
    });
  });
  LM.renderNav(document.getElementById('nav-container'));

  // URLの ?id= があれば編集モードで開く
  const params = new URLSearchParams(location.search);
  const openId = params.get('id');
  if (openId) startEdit(openId);

  [fields.start, fields.travel, fields.prep, fields.arrive].forEach((el) => {
    el.addEventListener('input', updatePreview);
  });

  // 「次へ」ボタン
  document.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetStep = Number(btn.dataset.next);
      if (currentStep === 1 && !validateStep1()) return;
      goToStep(targetStep);
    });
  });

  // 「戻る」ボタン
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      goToStep(Number(btn.dataset.back));
    });
  });

  // 2段階目で「スキップして保存」(持ちもの・メモを入力せず確定)
  document.querySelector('[data-skip-save]').addEventListener('click', () => {
    if (!validateStep1()) {
      goToStep(1);
      return;
    }
    belongingList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    saveSchedule();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep1()) {
      goToStep(1);
      return;
    }
    saveSchedule();
  });

  cancelBtn.addEventListener('click', resetForm);

  function validateStep1() {
    if (!fields.name.value.trim() || !fields.date.value || !fields.start.value) {
      goToStep(1);
      fields.name.reportValidity();
      return false;
    }
    return true;
  }

  function goToStep(step, shouldScroll = true) {
    currentStep = step;
    steps.forEach((el) => {
      el.style.display = Number(el.dataset.step) === step ? '' : 'none';
    });
    stepIndicator.textContent = String(step);
    if (step === 2) updatePreview();
    if (shouldScroll) window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
  }

  function getSelectedBelongingIds() {
    return Array.from(belongingList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }

  function saveSchedule() {
    const schedules = LM.get(LM.KEYS.SCHEDULES, []);
    const data = {
      id: editingId || LM.uid(),
      name: fields.name.value.trim(),
      date: fields.date.value,
      start: fields.start.value,
      end: '',
      place: fields.place.value.trim(),
      travelMin: Number(fields.travel.value) || 0,
      prepMin: Number(fields.prep.value) || 0,
      arriveBeforeMin: Number(fields.arrive.value) || 0,
      belongingSetIds: getSelectedBelongingIds(),
      memo: fields.memo.value.trim(),
    };

    if (editingId) {
      const idx = schedules.findIndex((s) => s.id === editingId);
      if (idx !== -1) schedules[idx] = data;
    } else {
      schedules.push(data);
    }
    const ok = LM.set(LM.KEYS.SCHEDULES, schedules);
    if (!ok) return;
    LM.syncFirebase();
    resetForm();
    renderList();
    renderCalendar();
  }

  function startEdit(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === id);
    if (!schedule) return;
    if (schedule.kind === 'deadline') { startDeadlineEdit(id); return; }
    if (schedule.autoSource === 'shift') {
      LM.showToast('この予定は履修・シフト側で編集してください', 'error');
      return;
    }
    switchFormTab('schedule');
    editingId = id;
    fields.name.value = schedule.name;
    fields.date.value = schedule.date;
    fields.start.value = schedule.start;
    fields.place.value = schedule.place || '';
    fields.travel.value = schedule.travelMin || 0;
    fields.prep.value = schedule.prepMin || 0;
    fields.arrive.value = schedule.arriveBeforeMin || 0;
    fields.memo.value = schedule.memo || '';
    const selectedIds = schedule.belongingSetIds || (schedule.belongingSetId ? [schedule.belongingSetId] : []);
    belongingList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = selectedIds.includes(cb.value);
    });
    formTitle.childNodes[0].textContent = '予定を編集(';
    cancelBtn.style.display = 'inline-block';
    goToStep(1);
  }

  function resetForm() {
    editingId = null;
    form.reset();
    fields.date.value = LM.todayStr();
    fields.travel.value = 0;
    fields.prep.value = 0;
    fields.arrive.value = 0;
    belongingList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    formTitle.childNodes[0].textContent = '予定を登録(';
    cancelBtn.style.display = 'none';
    history.replaceState(null, '', location.pathname);
    goToStep(1);
  }

  function updatePreview() {
    if (!fields.start.value) {
      preview.textContent = '';
      return;
    }
    const result = LM.calcDeparture({
      start: fields.start.value,
      travelMin: Number(fields.travel.value) || 0,
      prepMin: Number(fields.prep.value) || 0,
      arriveBeforeMin: Number(fields.arrive.value) || 0,
    });
    preview.innerHTML = `準備開始 <strong>${result.prepStart}</strong> ・ 出発 <strong>${result.depart}</strong> ・ 到着目安 <strong>${result.arrive}</strong>`;
  }

  function populateBelongingOptions() {
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    if (sets.length === 0) {
      belongingList.innerHTML = '<p class="lm-empty">持ちものセットがまだありません</p>';
      return;
    }
    belongingList.innerHTML = '';
    sets.forEach((set) => {
      const label = document.createElement('label');
      label.className = 'lm-check-item';
      label.innerHTML = `<input type="checkbox" value="${set.id}" /><span>${escapeHtml(set.name)}</span>`;
      belongingList.appendChild(label);
    });
  }

  function renderList() {
    const allSchedules = LM.get(LM.KEYS.SCHEDULES, [])
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const schedules = allSchedules.filter((schedule) => activeFilter === 'all' || getScheduleCategory(schedule) === activeFilter);

    if (schedules.length === 0) {
      scheduleList.innerHTML = `<p class="lm-empty">${allSchedules.length ? 'この分類の予定はありません' : '登録されている予定はありません'}</p>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(schedules.length / PAGE_SIZE));
    listPage = Math.min(listPage, totalPages - 1);
    const pageItems = schedules.slice(listPage * PAGE_SIZE, listPage * PAGE_SIZE + PAGE_SIZE);
    scheduleList.replaceChildren();
    pageItems.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'lm-schedule-item';
      row.style.cursor = 'pointer';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      const linked = s.autoSource === 'shift';
      row.innerHTML = `
        <span data-confirm="${s.id}" style="flex:1;">
          <span class="lm-schedule-time">${LM.formatDateHeader(s.date).slice(0, -3)} ${s.start}</span>
          <span>${escapeHtml(s.name)}${linked ? '<small class="lm-schedule-source">履修・シフトから反映</small>' : ''}</span>
        </span>
        ${linked ? `<span style="display:flex; gap:6px;">
          <button type="button" data-route-settings="${s.id}" class="lm-btn secondary" style="padding:6px 10px; font-size:12px;">逆算設定</button>
        </span>` : `<span style="display:flex; gap:6px;">
          <button type="button" data-edit="${s.id}" class="lm-btn secondary" style="padding:6px 10px; font-size:12px;">編集</button>
          <button type="button" data-delete="${s.id}" class="lm-btn secondary" style="padding:6px 10px; font-size:12px;">削除</button>
        </span>`}
      `;
      scheduleList.appendChild(row);
    });

    if (schedules.length > PAGE_SIZE) {
      const pager = document.createElement('div');
      pager.className = 'lm-pager';
      pager.innerHTML = `
        <button type="button" data-page="-1" ${listPage === 0 ? 'disabled' : ''}>◀</button>
        <span>${listPage + 1}/${totalPages}</span>
        <button type="button" data-page="1" ${listPage >= totalPages - 1 ? 'disabled' : ''}>▶</button>
      `;
      const listAll = document.createElement('button');
      listAll.type = 'button';
      listAll.className = 'lm-btn secondary lm-list-all-btn';
      listAll.dataset.listAll = '1';
      listAll.textContent = '一覧表示';
      scheduleList.append(pager, listAll);
    }
  }

  function renderCalendar() {
    const year = shownCalendarMonth.getFullYear();
    const month = shownCalendarMonth.getMonth();
    calendarTitle.textContent = `${year}年${month + 1}月`;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const byDate = new Map();
    LM.get(LM.KEYS.SCHEDULES, [])
      .filter((schedule) => activeFilter === 'all' || getScheduleCategory(schedule) === activeFilter)
      .forEach((schedule) => {
        if (!byDate.has(schedule.date)) byDate.set(schedule.date, []);
        byDate.get(schedule.date).push(schedule);
      });

    calendarGrid.replaceChildren();
    ['日', '月', '火', '水', '木', '金', '土'].forEach((weekday) => {
      const heading = document.createElement('span');
      heading.className = 'hs-calendar-weekday';
      heading.textContent = weekday;
      calendarGrid.appendChild(heading);
    });
    for (let cell = 0; cell < cellCount; cell += 1) {
      const day = cell - firstWeekday + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hs-calendar-day';
      if (day < 1 || day > daysInMonth) {
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        calendarGrid.appendChild(button);
        continue;
      }
      const date = LM.scheduleDateKey(new Date(year, month, day));
      const schedules = byDate.get(date) || [];
      button.dataset.date = date;
      button.setAttribute('aria-pressed', String(date === selectedCalendarDate));
      if (date === LM.todayStr()) button.classList.add('is-today');
      const number = document.createElement('span');
      number.className = 'hs-calendar-number';
      number.textContent = String(day);
      button.appendChild(number);
      const markers = document.createElement('span');
      markers.className = 'hs-calendar-markers';
      schedules.slice(0, 4).forEach((schedule) => {
        const marker = document.createElement('span');
        marker.className = `sc-calendar-marker is-${getScheduleCategory(schedule)}`;
        marker.setAttribute('aria-hidden', 'true');
        markers.appendChild(marker);
      });
      button.appendChild(markers);
      const labels = schedules.map((schedule) => schedule.name || '予定');
      button.setAttribute('aria-label', `${date}${labels.length ? `、${labels.join('、')}` : '、予定なし'}`);
      calendarGrid.appendChild(button);
    }
  }

  function moveCalendarMonth(delta) {
    shownCalendarMonth = new Date(
      shownCalendarMonth.getFullYear(),
      shownCalendarMonth.getMonth() + delta,
      1
    );
    selectedCalendarDate = LM.scheduleDateKey(shownCalendarMonth);
    renderCalendar();
  }

  function openCalendarAgenda(date) {
    const content = document.createElement('div');
    const navigation = document.createElement('div');
    navigation.className = 'hs-agenda-popover-nav';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'lm-btn secondary';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', '前の日');
    const title = document.createElement('strong');
    title.className = 'hs-agenda-popover-date';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'lm-btn secondary';
    next.textContent = '›';
    next.setAttribute('aria-label', '次の日');
    navigation.append(previous, title, next);
    const list = document.createElement('div');
    list.className = 'sc-calendar-agenda-list';
    content.append(navigation, list);

    const showDate = (dateKey) => {
      selectedCalendarDate = dateKey;
      const selected = new Date(`${dateKey}T00:00:00`);
      shownCalendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      renderCalendar();
      openCalendarAgenda(dateKey);
    };
    previous.addEventListener('click', () => showDate(shiftCalendarDate(date, -1)));
    next.addEventListener('click', () => showDate(shiftCalendarDate(date, 1)));

    LM.openModal('予定', content);
    const overlay = document.querySelector('.lm-modal-overlay');
    const panel = overlay?.querySelector('.lm-modal');
    overlay?.classList.add('hs-agenda-overlay');
    const selected = new Date(`${date}T00:00:00`);
    title.textContent = `${selected.getMonth() + 1}月${selected.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][selected.getDay()]})`;
    const schedules = LM.get(LM.KEYS.SCHEDULES, [])
      .filter((schedule) => schedule.date === date &&
        (activeFilter === 'all' || getScheduleCategory(schedule) === activeFilter))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (schedules.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'lm-empty';
      empty.textContent = 'この日の予定はありません';
      list.appendChild(empty);
    }
    schedules.forEach((schedule) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `sc-calendar-agenda-item is-${getScheduleCategory(schedule)}`;
      const time = document.createElement('span');
      time.className = 'lm-schedule-time';
      time.textContent = schedule.start || '時刻未設定';
      const name = document.createElement('strong');
      name.textContent = schedule.name || '予定';
      row.append(time, name);
      row.addEventListener('click', () => showConfirm(schedule.id));
      list.appendChild(row);
    });
    let touchStart = null;
    panel?.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    panel?.addEventListener('touchend', (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
      showDate(shiftCalendarDate(date, deltaX < 0 ? 1 : -1));
    }, { passive: true });
  }

  function shiftCalendarDate(dateKey, delta) {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + delta);
    return LM.scheduleDateKey(date);
  }

  function getScheduleCategory(schedule) {
    if (schedule.kind === 'deadline') return 'deadline';
    if (schedule.autoSource !== 'shift') return 'other';
    return schedule.name === '学校' ? 'school' : 'work';
  }

  function openScheduleListModal() {
    const schedules = LM.get(LM.KEYS.SCHEDULES, [])
      .filter((schedule) => activeFilter === 'all' || getScheduleCategory(schedule) === activeFilter)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const wrap = document.createElement('div');
    schedules.forEach((schedule) => {
      const row = document.createElement('article');
      row.className = 'lm-schedule-item';
      const info = document.createElement('div');
      const date = document.createElement('span');
      date.className = 'lm-schedule-time';
      date.textContent = `${LM.formatDateHeader(schedule.date)} ${schedule.start}`;
      const name = document.createElement('strong');
      name.textContent = ` ${schedule.name}`;
      const category = document.createElement('div');
      category.className = 'lm-schedule-source';
      category.textContent = schedule.kind === 'deadline' ? '締切'
        : schedule.autoSource === 'shift'
        ? (getScheduleCategory(schedule) === 'school' ? '学校(履修・シフト)' : 'バイト(履修・シフト)')
        : 'その他(手入力)';
      info.append(date, name, category);
      const departure = document.createElement('div');
      departure.className = 'lm-schedule-departure';
      if (schedule.kind === 'deadline') {
        departure.textContent = `締切 ${schedule.start}`;
      } else {
        const result = LM.calcDeparture(schedule);
        departure.textContent = `準備開始 ${result.prepStart} ・ 出発 ${result.depart} ・ 到着目安 ${result.arrive}`;
      }
      row.append(info, departure);
      wrap.appendChild(row);
    });
    LM.openModal('登録済みの予定一覧', wrap);
  }

  function showConfirm(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === id);
    if (!schedule) return;
    if (schedule.kind === 'deadline') { showDeadlineConfirm(schedule); return; }
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    const selectedIds = schedule.belongingSetIds || (schedule.belongingSetId ? [schedule.belongingSetId] : []);
    const belongingNames = selectedIds
      .map((sid) => sets.find((s) => s.id === sid))
      .filter(Boolean)
      .map((s) => s.name);
    const r = LM.calcDeparture(schedule);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'font-size:14px; line-height:1.9;';
    wrap.innerHTML = `
      <div><span style="color:var(--text-soft);">日付</span> ${LM.formatDateHeader(schedule.date)}</div>
      <div><span style="color:var(--text-soft);">開始時刻</span> ${schedule.start}</div>
      <div><span style="color:var(--text-soft);">場所</span> ${escapeHtml(schedule.place) || '(未入力)'}</div>
      <div><span style="color:var(--text-soft);">移動時間</span> ${schedule.travelMin || 0}分</div>
      <div><span style="color:var(--text-soft);">準備時間</span> ${schedule.prepMin || 0}分</div>
      <div><span style="color:var(--text-soft);">到着希望</span> ${schedule.arriveBeforeMin || 0}分前</div>
      ${schedule.routePreset ? `<div><span style="color:var(--text-soft);">逆算プリセット</span> ${escapeHtml(schedule.routePreset)}</div>` : ''}
      <div style="margin:6px 0; padding:8px 10px; background:var(--accent-soft); border-radius:8px;">
        準備開始 <strong>${r.prepStart}</strong> ・ 出発 <strong>${r.depart}</strong> ・ 到着目安 <strong>${r.arrive}</strong>
      </div>
      <div><span style="color:var(--text-soft);">持ちものセット</span> ${belongingNames.length ? escapeHtml(belongingNames.join('、')) : '(なし)'}</div>
      <div><span style="color:var(--text-soft);">メモ</span> ${schedule.memo ? escapeHtml(schedule.memo) : '(なし)'}</div>
    `;
    LM.openModal(schedule.name, wrap);
  }

  function onListClick(e) {
    const pageButton = e.target.closest('[data-page]');
    if (pageButton) {
      listPage = Math.max(0, listPage + Number(pageButton.dataset.page));
      renderList();
      return;
    }
    if (e.target.closest('[data-list-all]')) {
      openScheduleListModal();
      return;
    }
    const routeSettingsId = e.target.closest('[data-route-settings]')?.dataset.routeSettings;
    const editId = e.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = e.target.closest('[data-delete]')?.dataset.delete;
    const confirmId = e.target.closest('[data-confirm]') ? e.target.closest('[data-confirm]').dataset.confirm : null;
    if (routeSettingsId) openLinkedRouteSettings(routeSettingsId);
    else if (editId) startEdit(editId);
    else if (deleteId) {
      if (!confirm('この予定を削除しますか?')) return;
      const schedules = LM.get(LM.KEYS.SCHEDULES, []).filter((s) => s.id !== deleteId);
      LM.set(LM.KEYS.SCHEDULES, schedules);
      LM.syncFirebase();
      renderList();
      renderCalendar();
    } else if (confirmId) {
      showConfirm(confirmId);
    }
  }

  function openLinkedRouteSettings(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((item) => item.id === id && item.autoSource === 'shift');
    if (!schedule) {
      LM.showToast('履修・シフトの連携予定が見つかりません', 'error');
      return;
    }

    const form = document.createElement('form');
    form.className = 'hs-edit-form';
    const presetField = document.createElement('div');
    presetField.className = 'lm-field';
    const presetLabel = document.createElement('label');
    presetLabel.htmlFor = 'linked-route-preset';
    presetLabel.textContent = '逆算プリセット';
    const preset = document.createElement('select');
    preset.id = presetLabel.htmlFor;
     [
      ['', 'プリセットなし'],
      ...getRoutePresets().map((item) => [`preset:${item.id}`, item.name]),
      ['custom', '個別設定'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      preset.appendChild(option);
    });
    presetField.append(presetLabel, preset);
    form.appendChild(presetField);

    const inputs = {};
    [
      ['移動時間(分)', 'travelMin', schedule.travelMin],
      ['準備時間(分)', 'prepMin', schedule.prepMin],
      ['何分前に到着したいか', 'arriveBeforeMin', schedule.arriveBeforeMin],
    ].forEach(([labelText, key, value]) => {
      const field = document.createElement('div');
      field.className = 'lm-field';
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.inputMode = 'numeric';
      input.value = String(Number(value) || 0);
      input.name = key;
      field.append(label, input);
      form.appendChild(field);
      inputs[key] = input;
    });

    const presetByName = {};
    const presetValues = {
      custom: { routePreset: '個別設定' },
      '': { routePreset: '' },
    };
    getRoutePresets().forEach((item) => {
      const key = `preset:${item.id}`;
      presetByName[item.name] = key;
      presetValues[key] = {
        routePreset: item.name,
        travelMin: item.travelMin,
        prepMin: item.prepMin,
        arriveBeforeMin: item.arriveBeforeMin,
      };
    });
    preset.value = presetByName[schedule.routePreset] ||
      (Number(schedule.travelMin) || Number(schedule.prepMin) || Number(schedule.arriveBeforeMin) ? 'custom' : '');
    const applyPreset = () => {
      const values = presetValues[preset.value];
      if (preset.value === 'custom') return;
      inputs.travelMin.value = values.travelMin || 0;
      inputs.prepMin.value = values.prepMin || 0;
      inputs.arriveBeforeMin.value = values.arriveBeforeMin || 0;
    };
    preset.addEventListener('change', applyPreset);
    Object.values(inputs).forEach((input) => {
      input.addEventListener('input', () => {
        if (preset.value !== 'custom') preset.value = 'custom';
      });
    });

    const actions = document.createElement('div');
    actions.className = 'hs-template-form-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'lm-btn secondary';
    cancel.textContent = 'キャンセル';
    cancel.addEventListener('click', LM.closeModal);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'lm-btn';
    save.textContent = '保存';
    actions.append(cancel, save);
    form.appendChild(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const shifts = LM.get(LM.KEYS.SHIFTS, []);
      const source = shifts.find((shift) => shift.id === schedule.sourceShiftId) ||
        findLinkedShiftSource(shifts, schedule);
      if (!source) {
        LM.showToast('元の履修・シフト予定が見つかりません', 'error');
        return;
      }
      const values = presetValues[preset.value];
      const sourceIndex = shifts.findIndex((shift) => shift.id === source.id);
      shifts[sourceIndex] = {
        ...source,
        routePreset: values.routePreset,
        travelMin: Math.max(0, Number(inputs.travelMin.value) || 0),
        prepMin: Math.max(0, Number(inputs.prepMin.value) || 0),
        arriveBeforeMin: Math.max(0, Number(inputs.arriveBeforeMin.value) || 0),
      };
      if (!LM.set(LM.KEYS.SHIFTS, shifts)) return;
      const syncResult = LM.syncShiftSchedules();
      if (syncResult === 'failed') {
        LM.showToast('逆算設定の保存に失敗しました', 'error');
        return;
      }
      if (syncResult === 'updated') LM.syncFirebase();
      LM.closeModal();
      renderList();
      LM.showToast('逆算設定を保存しました');
    });

    LM.openModal(`${schedule.name}の逆算設定`, form);
  }

  function findLinkedShiftSource(shifts, schedule) {
    const kind = schedule.name === '学校' ? 'class' : 'shift';
    const candidates = shifts
      .filter((shift) => shift.date === schedule.date && (shift.kind === 'class' ? 'class' : 'shift') === kind)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return candidates.find((shift) => shift.start === schedule.start) || candidates[0] || null;
  }

   /* ---------- 期限・締切 ---------- */
    function switchFormTab(tab) {
    schedulePanel.hidden = tab !== 'schedule';
    deadlinePanel.hidden = tab !== 'deadline';
    presetPanel.hidden = tab !== 'preset';
    formTabs.forEach((button) => {
      const active = button.dataset.formTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function saveDeadline() {
    const name = deadlineFields.name.value.trim();
    if (!name || !deadlineFields.date.value || !deadlineFields.time.value) {
      deadlineForm.reportValidity();
      return;
    }
    const schedules = LM.get(LM.KEYS.SCHEDULES, []);
    const data = {
      id: editingDeadlineId || LM.uid(),
      kind: 'deadline',
      name,
      date: deadlineFields.date.value,
      start: deadlineFields.time.value,
      end: '',
      place: '',
      travelMin: 0,
      prepMin: 0,
      arriveBeforeMin: 0,
      belongingSetIds: [],
      memo: '',
      notifyBefore: getSelectedDeadlineNotify(),
    };
    if (editingDeadlineId) {
      const idx = schedules.findIndex((s) => s.id === editingDeadlineId);
      if (idx !== -1) schedules[idx] = data;
      else schedules.push(data);
    } else {
      schedules.push(data);
    }
    if (!LM.set(LM.KEYS.SCHEDULES, schedules)) return;
    LM.syncFirebase();
    resetDeadlineForm();
    renderList();
    renderCalendar();
  }

  function startDeadlineEdit(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === id);
    if (!schedule) return;
    editingDeadlineId = id;
    deadlineFields.name.value = schedule.name;
    deadlineFields.date.value = schedule.date;
    deadlineFields.time.value = schedule.start;
    const selectedNotify = Array.isArray(schedule.notifyBefore) ? schedule.notifyBefore : [];
    deadlineNotifyList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = selectedNotify.includes(cb.value);
    });
    deadlineTitle.textContent = '締切を編集';
    deadlineCancelBtn.style.display = 'inline-block';
    switchFormTab('deadline');
    window.scrollTo({ top: deadlinePanel.offsetTop - 20, behavior: 'smooth' });
  }

  function resetDeadlineForm() {
    editingDeadlineId = null;
    deadlineForm.reset();
    deadlineFields.date.value = LM.todayStr();
    deadlineTitle.textContent = '締切を登録';
    deadlineCancelBtn.style.display = 'none';
    history.replaceState(null, '', location.pathname);
  }

    function showDeadlineConfirm(schedule) {
    const notifyLabels = (schedule.notifyBefore || [])
      .map((id) => (LM.DEADLINE_NOTIFY_OPTIONS.find((o) => o.id === id) || {}).label)
      .filter(Boolean);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'font-size:14px; line-height:1.9;';
    wrap.innerHTML = `
      <div><span style="color:var(--text-soft);">締切日</span> ${LM.formatDateHeader(schedule.date)}</div>
      <div><span style="color:var(--text-soft);">締切時刻</span> ${schedule.start}</div>
      <div><span style="color:var(--text-soft);">通知</span> ${notifyLabels.length ? notifyLabels.join('、') : '(なし)'}</div>
    `;
    LM.openModal(schedule.name, wrap);
  }

  formTabs.forEach((button) => {
    button.addEventListener('click', () => switchFormTab(button.dataset.formTab));
  });
  deadlineForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveDeadline();
  });
  deadlineCancelBtn.addEventListener('click', resetDeadlineForm);
  deadlineFields.date.value = LM.todayStr();

    /* ---------- 逆算プリセット ---------- */
  function getRoutePresets() {
    const presets = LM.get(ROUTE_PRESET_KEY, []);
    return Array.isArray(presets) ? presets : [];
  }

  function saveRoutePreset() {
    const name = presetFields.name.value.trim();
    if (!name) {
      presetFields.name.reportValidity();
      return;
    }
    const presets = getRoutePresets();
    if (name === '個別設定' || name === 'プリセットなし' ||
        presets.some((item) => item.name === name && item.id !== editingPresetId)) {
      LM.showToast('同じ名前のプリセットがあります', 'error');
      return;
    }
    const data = {
      id: editingPresetId || LM.uid(),
      name,
      travelMin: Math.max(0, Number(presetFields.travel.value) || 0),
      prepMin: Math.max(0, Number(presetFields.prep.value) || 0),
      arriveBeforeMin: Math.max(0, Number(presetFields.arrive.value) || 0),
    };
    const idx = editingPresetId ? presets.findIndex((item) => item.id === editingPresetId) : -1;
    if (idx !== -1) presets[idx] = data;
    else presets.push(data);
    if (!LM.set(ROUTE_PRESET_KEY, presets)) return;
    LM.syncFirebase();
    resetPresetForm();
    renderPresetList();
    LM.showToast('プリセットを保存しました');
  }

  function startPresetEdit(id) {
    const item = getRoutePresets().find((p) => p.id === id);
    if (!item) return;
    editingPresetId = id;
    presetFields.name.value = item.name;
    presetFields.travel.value = item.travelMin || 0;
    presetFields.prep.value = item.prepMin || 0;
    presetFields.arrive.value = item.arriveBeforeMin || 0;
    presetTitle.textContent = '逆算プリセットを編集';
    presetCancelBtn.style.display = 'inline-block';
    window.scrollTo({ top: presetPanel.offsetTop - 20, behavior: 'smooth' });
  }

  function resetPresetForm() {
    editingPresetId = null;
    presetForm.reset();
    presetFields.travel.value = 0;
    presetFields.prep.value = 0;
    presetFields.arrive.value = 0;
    presetTitle.textContent = '逆算プリセットを作成';
    presetCancelBtn.style.display = 'none';
  }

  function renderPresetList() {
    const presets = getRoutePresets();
    presetList.replaceChildren();
    if (presets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'lm-empty';
      empty.textContent = 'プリセットはまだありません';
      presetList.appendChild(empty);
      return;
    }
    presets.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'hs-template-row';
      const info = document.createElement('div');
      info.className = 'hs-template-name';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = `移動 ${item.travelMin}分 ・ 準備 ${item.prepMin}分 ・ 到着希望 ${item.arriveBeforeMin}分前`;
      info.append(name, detail);

      const actions = document.createElement('div');
      actions.className = 'hs-template-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'lm-btn secondary';
      edit.textContent = '編集';
      edit.addEventListener('click', () => startPresetEdit(item.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lm-btn secondary';
      remove.textContent = '削除';
      remove.addEventListener('click', () => {
        if (!confirm(`「${item.name}」を削除しますか?`)) return;
        LM.set(ROUTE_PRESET_KEY, getRoutePresets().filter((p) => p.id !== item.id));
        LM.syncFirebase();
        if (editingPresetId === item.id) resetPresetForm();
        renderPresetList();
      });
      actions.append(edit, remove);
      row.append(info, actions);
      presetList.appendChild(row);
    });
  }

  presetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveRoutePreset();
  });
  presetCancelBtn.addEventListener('click', resetPresetForm);
  renderPresetList();

    function renderDeadlineNotifyOptions() {
    deadlineNotifyList.replaceChildren();
    LM.DEADLINE_NOTIFY_OPTIONS.forEach((opt) => {
      const label = document.createElement('label');
      label.className = 'lm-check-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = opt.id;
      const text = document.createElement('span');
      text.textContent = opt.label;
      label.append(input, text);
      deadlineNotifyList.appendChild(label);
    });
  }

  function getSelectedDeadlineNotify() {
    return Array.from(deadlineNotifyList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }


  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  
  /* ---------- 日本の祝日(holidays-jp API・カレンダーに薄紫の印を付ける) ---------- */
(function () {
  const API_URL = 'https://holidays-jp.github.io/api/v1/date.json';
  const CACHE_KEY = 'lm_holidaysJp';
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const grid = document.getElementById('schedule-calendar-grid');
  if (!grid) return;
  let holidays = {};

  function loadCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cache && cache.data ? cache : null;
    } catch (e) {
      return null;
    }
  }

  // 去年以降だけ残して保存量を抑える
  function trim(data) {
    const minYear = new Date().getFullYear() - 1;
    const result = {};
    Object.entries(data || {}).forEach(([date, name]) => {
      if (Number(date.slice(0, 4)) >= minYear) result[date] = name;
    });
    return result;
  }

  function apply() {
    grid.querySelectorAll('[data-date]').forEach((button) => {
      const name = holidays[button.dataset.date];
      if (!name || button.classList.contains('is-holiday')) return;
      button.classList.add('is-holiday');
      button.title = name;
      button.setAttribute('aria-label', `${button.getAttribute('aria-label') || ''}、祝日(${name})`);
    });
  }

  async function refresh() {
    const cache = loadCache();
    if (cache) {
      holidays = cache.data;
      apply();
      if (Date.now() - cache.savedAt < CACHE_TTL_MS) return;
    }
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      holidays = trim(await res.json());
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: holidays }));
      apply();
    } catch (e) {
      console.error('holidays fetch failed', e);
    }
  }

  // カレンダーが再描画されるたびに祝日の印を付け直す(子要素の入れ替わりだけを監視するので、ループしない)
  new MutationObserver(apply).observe(grid, { childList: true });
    refresh();
  })();
})();
