(function () {
  const PAGE_SIZE = 5;
  const form = document.getElementById('schedule-form');
  const scheduleList = document.getElementById('schedule-list');
  const scheduleFilters = [...document.querySelectorAll('[data-schedule-filter]')];
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

  let editingId = null;
  let currentStep = 1;
  let activeFilter = 'all';
  let listPage = 0;

  populateBelongingOptions();
  fields.date.value = LM.todayStr();
  goToStep(1);
  renderList();
  scheduleList.addEventListener('click', onListClick);
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

  function goToStep(step) {
    currentStep = step;
    steps.forEach((el) => {
      el.style.display = Number(el.dataset.step) === step ? '' : 'none';
    });
    stepIndicator.textContent = String(step);
    if (step === 2) updatePreview();
    window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
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
  }

  function startEdit(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === id);
    if (!schedule) return;
    if (schedule.autoSource === 'shift') {
      LM.showToast('この予定は履修・シフト側で編集してください', 'error');
      return;
    }
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

  function getScheduleCategory(schedule) {
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
      category.textContent = schedule.autoSource === 'shift'
        ? (getScheduleCategory(schedule) === 'school' ? '学校(履修・シフト)' : 'バイト(履修・シフト)')
        : 'その他(手入力)';
      info.append(date, name, category);
      const departure = document.createElement('div');
      departure.className = 'lm-schedule-departure';
      const result = LM.calcDeparture(schedule);
      departure.textContent = `準備開始 ${result.prepStart} ・ 出発 ${result.depart} ・ 到着目安 ${result.arrive}`;
      row.append(info, departure);
      wrap.appendChild(row);
    });
    LM.openModal('登録済みの予定一覧', wrap);
  }

  function showConfirm(id) {
    const schedule = LM.get(LM.KEYS.SCHEDULES, []).find((s) => s.id === id);
    if (!schedule) return;
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
      ['car', '車'],
      ['itsukaichi', '五日市'],
      ['nishihiroshima', '西広島'],
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

    const presetByName = { 車: 'car', 五日市: 'itsukaichi', 西広島: 'nishihiroshima' };
    preset.value = presetByName[schedule.routePreset] ||
      (Number(schedule.travelMin) || Number(schedule.prepMin) || Number(schedule.arriveBeforeMin) ? 'custom' : '');
    const presetValues = {
      car: { routePreset: '車', travelMin: 20, prepMin: 40, arriveBeforeMin: 10 },
      itsukaichi: { routePreset: '五日市', travelMin: 70, prepMin: 30, arriveBeforeMin: 10 },
      nishihiroshima: { routePreset: '西広島', travelMin: 45, prepMin: 40, arriveBeforeMin: 10 },
      custom: { routePreset: '個別設定' },
      '': { routePreset: '' },
    };
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
