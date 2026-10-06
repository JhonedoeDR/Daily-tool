(function () {
  const wageInput = document.getElementById('f-wage');
  const transportInput = document.getElementById('f-transport');
  const templateForm = document.getElementById('template-form');
  const templateList = document.getElementById('template-list');
  const templateToggle = document.getElementById('template-toggle');
  const templateKind = document.getElementById('template-kind');
  const templateName = document.getElementById('template-name');
  const templateBelongingList = document.getElementById('template-belonging-list');
  const templateSave = document.getElementById('template-save');
  const templateCancel = document.getElementById('template-cancel');
  const addForm = document.getElementById('add-plan-form');
  const addDetails = document.getElementById('add-plan-details');
  const addTemplate = document.getElementById('add-template');
  const addTemplateChips = document.getElementById('add-template-chips');
  const classPeriodField = document.getElementById('class-period-field');
  const classPeriodOptions = document.getElementById('class-period-options');
  const classPeriodHelp = document.getElementById('class-period-help');
  const manualTimeField = document.getElementById('manual-time-field');
  const placeSelectedDate = document.getElementById('place-selected-date');
  const addStartTime = document.getElementById('add-start-time');
  const addEndTime = document.getElementById('add-end-time');
  const addLocation = document.getElementById('add-location');
  const addBreak = document.getElementById('add-break');
  const addPreview = document.getElementById('add-preview');
  const addInstruction = document.getElementById('add-instruction');
  const addUndo = document.getElementById('add-undo');
  const classSubjectFilter = document.getElementById('class-subject-filter');
  const classSectionFilter = document.getElementById('class-section-filter');
  const templateUnitCapacity = document.getElementById('template-unit-capacity');
  const templateAttendanceRequired = document.getElementById('template-attendance-required');
  const templateClassFields = document.getElementById('template-class-fields');
  const templateSkipSectionList = document.getElementById('template-skip-section-list');
  const templateSkipSectionLegend = document.getElementById('template-skip-section-legend');
  const classEntryTypeField = document.getElementById('class-entry-type-field');
  const classEntryType = document.getElementById('class-entry-type');
  const calendarGrid = document.getElementById('calendar-grid');
  const calendarTitle = document.getElementById('calendar-title');
  const selectedDateLabel = document.getElementById('selected-date-label');
  const dayList = document.getElementById('day-list');
  const timetableRegister = document.getElementById('timetable-register');
  const monthLabel = document.getElementById('month-label');
  const monthSummary = document.getElementById('month-summary');
  const classRegistrationFilter = document.getElementById('class-registration-filter');
  const templatePager = document.getElementById('template-pager');
  const templateListAll = document.getElementById('template-list-all');
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const TEMPLATES_PER_PAGE = 5;

  let selectedDate = LM.todayStr();
  let shownMonth = new Date(`${selectedDate}T00:00:00`);
  let templatePage = 0;
  let editingTemplateId = null;
  let activeSubjectFilter = '';
  let activeSectionFilter = '';
  let activeRegistrationFilter = '';
  let addUndoId = null;
  let addUndoIds = [];
  let placementDate = '';
  let renderedAddTemplateId = '';
  let activeAgendaList = null;
  let activeAgendaDate = '';
  let lastCalendarTapDate = '';
  let lastCalendarTapAt = 0;

  migrateLegacySkippedSections();
  loadWageSettings();
  renderTemplates();
  renderAll();
  updateAddForm();
  updatePreview();
  LM.renderNav(document.getElementById('nav-container'));

  wageInput.addEventListener('input', saveWageSettings);
  transportInput.addEventListener('input', saveWageSettings);
  templateToggle.addEventListener('click', () => {
    templateForm.hidden = !templateForm.hidden;
    templateToggle.setAttribute('aria-expanded', String(!templateForm.hidden));
    if (!templateForm.hidden) {
      editingTemplateId = null;
      templateForm.reset();
      templateUnitCapacity.value = '';
      templateSave.textContent = 'テンプレートを保存';
      templateCancel.hidden = true;
      populateTemplateBelongings([]);
      populateSkippedSections([]);
      updateTemplateKindFields();
      templateName.focus();
    }
  });
  templateCancel.addEventListener('click', closeTemplateForm);
  addDetails.addEventListener('toggle', () => {
    const summary = addDetails.querySelector('summary');
    summary.textContent = addDetails.open ? '閉じる' : '＋ 予定を追加';
    document.querySelector('.hs-page').classList.toggle('is-adding-plan', addDetails.open);
    if (!addDetails.open) resetAddMode();
    else updateAddForm();
  });
  document.getElementById('cancel-add-mode').addEventListener('click', () => {
    addDetails.open = false;
  });
  placeSelectedDate.addEventListener('click', addPlanToSelectedDate);
  timetableRegister.addEventListener('click', openTimetableRegistration);
  addUndo.addEventListener('click', (event) => {
    if (!event.target.closest('[data-undo-add]') || !addUndoId) return;
    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const removeIds = new Set(addUndoIds);
    const updatedShifts = shifts.filter((item) => !removeIds.has(item.id));
    if (updatedShifts.length === shifts.length) {
      LM.showToast('取り消す予定が見つかりません', 'error');
      addUndo.hidden = true;
      addUndoId = null;
      addUndoIds = [];
      return;
    }
    if (!LM.set(LM.KEYS.SHIFTS, updatedShifts)) return;
    addUndoId = null;
    addUndoIds = [];
    addUndo.hidden = true;
    syncLinkedSchedules();
    renderAll();
    LM.showToast('予定の追加を取り消しました');
  });
  classSubjectFilter.addEventListener('change', () => {
    activeSubjectFilter = classSubjectFilter.value;
    activeSectionFilter = '';
    renderAll();
  });
  classRegistrationFilter.addEventListener('change', () => {
    activeRegistrationFilter = classRegistrationFilter.value;
    renderAll();
  });
  classSectionFilter.addEventListener('change', () => {
    activeSectionFilter = classSectionFilter.value;
    renderAll();
  });
  templateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = templateName.value.trim();
    if (!name) {
      templateName.focus();
      return;
    }
    if (templateKind.value === 'class' &&
        (!Number.isInteger(Number(templateUnitCapacity.value)) || Number(templateUnitCapacity.value) < 1)) {
      templateUnitCapacity.focus();
      return;
    }
    if (templateKind.value === 'class' &&
        Number(templateUnitCapacity.value) > 1000) {
      LM.showToast('区分ごとの授業数は1000以下で入力してください', 'error');
      templateUnitCapacity.focus();
      return;
    }
    if (templateKind.value === 'class' &&
        (!Number.isInteger(Number(templateAttendanceRequired.value)) ||
         Number(templateAttendanceRequired.value) < 1 ||
         Number(templateAttendanceRequired.value) > 1000)) {
      LM.showToast('必要出席日数は1〜1000で入力してください', 'error');
      templateAttendanceRequired.focus();
      return;
    }
    const templates = getTemplates();
    const data = {
      kind: templateKind.value,
      name,
      ...(templateKind.value === 'class' ? { unitCapacity: Number(templateUnitCapacity.value) || 1 } : {}),
      ...(templateKind.value === 'class' ? {
        attendanceRequired: Number(templateAttendanceRequired.value),
      } : {}),
      ...(templateKind.value === 'class' ? {
        skippedSectionsByYear: {
          ...(templates.find((item) => item.id === editingTemplateId)?.skippedSectionsByYear || {}),
          [getAcademicYearKey(selectedDate)]: getSelectedSkippedSections(),
        },
      } : {}),
      belongingSetIds: [...templateBelongingList.querySelectorAll('input:checked')].map((input) => input.value),
    };
    const wasEditing = Boolean(editingTemplateId);
    const updated = wasEditing
      ? templates.map((template) => template.id === editingTemplateId ? { ...template, ...data } : template)
      : templates.concat({ id: LM.uid(), ...data });
    if (!LM.set(LM.KEYS.SHIFT_TEMPLATES, updated)) return;
    closeTemplateForm();
    renderTemplates();
    if (!wasEditing) {
      const template = updated[updated.length - 1];
      addTemplate.value = template.id;
      classEntryType.value = 'class';
      updateAddForm();
      addDetails.open = true;
    }
    LM.showToast(wasEditing ? '予定テンプレートを更新しました' : '予定テンプレートを登録しました');
  });
  templateList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-template], [data-edit-template], [data-delete-template]');
    if (!button) return;
    if (button.dataset.addTemplate) {
      addTemplate.value = button.dataset.addTemplate;
      classEntryType.value = 'class';
      updateAddForm();
      addDetails.open = true;
      return;
    }
    if (button.dataset.editTemplate) {
      startTemplateEdit(button.dataset.editTemplate);
      return;
    }
    const id = button.dataset.deleteTemplate;
    if (!confirm('このテンプレートを削除しますか? 登録済みの予定は削除されません。')) return;
    if (!LM.set(LM.KEYS.SHIFT_TEMPLATES, getTemplates().filter((item) => item.id !== id))) return;
    renderTemplates();
    updateAddForm();
  });

  addTemplate.addEventListener('change', () => {
    classEntryType.value = 'class';
    updateAddForm();
  });
  addTemplateChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-template-chip]');
    if (!chip) return;
    if (addTemplate.value !== chip.dataset.templateChip) {
      classEntryType.value = 'class';
      classPeriodOptions.replaceChildren();
    }
    addTemplate.value = chip.dataset.templateChip;
    updateAddForm();
  });
  classEntryType.addEventListener('change', () => {
    renderPlacementPeriods();
    updatePlacementButton();
    calendarGrid.querySelectorAll('[data-date]').forEach((button) => setPlacementDateStyle(button, button.dataset.date));
  });
  templatePager.addEventListener('click', (event) => {
    const button = event.target.closest('[data-template-page]');
    if (!button) return;
    templatePage += Number(button.dataset.templatePage);
    renderTemplates();
  });
  templateListAll.addEventListener('click', () => {
    openTemplateListModal();
  });
  templateKind.addEventListener('change', updateTemplateKindFields);
  addForm.addEventListener('input', () => {
    updatePreview();
    updatePlacementButton();
  });
  addForm.addEventListener('submit', (event) => event.preventDefault());

  document.getElementById('calendar-prev').addEventListener('click', () => moveMonth(-1));
  document.getElementById('calendar-next').addEventListener('click', () => moveMonth(1));
  document.getElementById('today-button').addEventListener('click', goToToday);
  calendarGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (button) handleDateTap(button.dataset.date);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#day-list, .hs-agenda-popover-list')) return;
    const button = event.target.closest('[data-toggle-attendance-group], [data-toggle-attendance], [data-toggle-schedule-group], [data-toggle-schedule], [data-edit-group], [data-edit-id], [data-delete-group], [data-delete-id], [data-delete-series]');
    if (!button) return;
    if (button.dataset.toggleAttendanceGroup) {
      toggleAttendanceGroup(JSON.parse(button.dataset.toggleAttendanceGroup));
      return;
    }
    if (button.dataset.toggleAttendance) {
      toggleAttendance(button.dataset.toggleAttendance);
      return;
    }
    if (button.dataset.toggleScheduleGroup) {
      openSchedulePeriodPicker(JSON.parse(button.dataset.toggleScheduleGroup));
      return;
    }
    if (button.dataset.toggleSchedule) {
      toggleScheduleRegistration(button.dataset.toggleSchedule);
      return;
    }
    if (button.dataset.editGroup) {
      startShiftEdit(JSON.parse(button.dataset.editGroup));
      return;
    }
    if (button.dataset.editId) {
      startShiftEdit(button.dataset.editId);
      return;
    }
    if (button.dataset.deleteGroup) {
      const ids = new Set(JSON.parse(button.dataset.deleteGroup));
      if (!confirm('この科目の予定をすべて削除しますか?')) return;
      if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).filter((item) => !ids.has(item.id)))) return;
      if (!syncLinkedSchedules()) return;
      renderAll();
      return;
    }
    const seriesId = button.dataset.deleteSeries;
    if (seriesId) {
      if (!confirm('このくり返し予定をすべて削除しますか?')) return;
      if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).filter((item) => item.seriesId !== seriesId))) return;
    } else {
      const id = button.dataset.deleteId;
      if (!confirm('この予定を削除しますか?')) return;
      if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).filter((item) => item.id !== id))) return;
    }
    syncLinkedSchedules();
    renderAll();
  });

  function toggleScheduleRegistration(id) {
    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const index = shifts.findIndex((item) => item.id === id);
    if (index === -1) {
      LM.showToast('登録する予定が見つかりません', 'error');
      return;
    }
    const registered = shifts[index].scheduleRegistered === true;
    if (!registered && !/^\d{2}:\d{2}$/.test(shifts[index].start || '')) {
      LM.showToast('予定逆算に反映するには、開始時刻を設定してください', 'error');
      return;
    }
    shifts[index] = { ...shifts[index], scheduleRegistered: !registered };
    if (!LM.set(LM.KEYS.SHIFTS, shifts)) return;
    if (!syncLinkedSchedules()) return;
    renderAll();
    const kind = shifts[index].kind === 'class' ? '履修' : '予定逆算';
    LM.showToast(registered ? `${kind}登録を解除しました` : `${kind}に登録しました`);
  }

  function openSchedulePeriodPicker(ids) {
    const idSet = new Set(ids);
    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const entries = shifts
      .filter((item) => idSet.has(item.id) && item.kind === 'class')
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (entries.length < 2) {
      if (entries[0]) toggleScheduleRegistration(entries[0].id);
      return;
    }
    const form = document.createElement('form');
    const prompt = document.createElement('p');
    const isExam = entries[0].isExam === true;
    prompt.textContent = `${isExam ? '試験' : '履修'}登録する時限を選択してください。複数選択できます。`;
    const options = document.createElement('div');
    options.className = 'hs-schedule-period-picker';
    entries.forEach((item) => {
      const label = document.createElement('label');
      label.className = 'lm-check-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.id;
      checkbox.checked = item.scheduleRegistered === true;
      const text = document.createElement('span');
      text.textContent = `${item.periodNumber ? `${item.periodNumber}限目 ` : ''}${item.start || '時間未設定'}${item.end ? `〜${item.end}` : ''}`;
      label.append(checkbox, text);
      options.appendChild(label);
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
    save.textContent = '選択を保存';
    actions.append(cancel, save);
    form.append(prompt, options, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const selectedIds = new Set([...options.querySelectorAll('input:checked')].map((input) => input.value));
      const current = LM.get(LM.KEYS.SHIFTS, []);
      const updated = current.map((item) => idSet.has(item.id)
        ? { ...item, scheduleRegistered: selectedIds.has(item.id) }
        : item);
      if (!LM.set(LM.KEYS.SHIFTS, updated)) return;
      if (!syncLinkedSchedules()) return;
      LM.closeModal();
      renderAll();
      LM.showToast(selectedIds.size
        ? `${isExam ? '試験' : '履修'}登録する時限を更新しました`
        : `${isExam ? '試験' : '履修'}登録を解除しました`);
    });
    LM.openModal(`${isExam ? '試験' : '履修'}登録する時限`, form);
  }

  function toggleAttendance(id) {
    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const index = shifts.findIndex((item) => item.id === id && item.kind === 'class' && !item.isExam);
    if (index === -1) {
      LM.showToast('出席を記録する授業が見つかりません', 'error');
      return;
    }
    shifts[index] = { ...shifts[index], attended: shifts[index].attended !== true };
    if (!LM.set(LM.KEYS.SHIFTS, shifts)) return;
    LM.syncFirebase();
    renderTemplates();
    renderAll();
  }

  function toggleAttendanceGroup(ids) {
    const idSet = new Set(ids);
    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const entries = shifts.filter((item) =>
      idSet.has(item.id) && item.kind === 'class' && !item.isExam
    );
    if (entries.length === 0) {
      LM.showToast('出席を記録する授業が見つかりません', 'error');
      return;
    }
    const markAttended = entries.some((item) => item.attended !== true);
    const updated = shifts.map((item) => idSet.has(item.id) && item.kind === 'class' && !item.isExam
      ? { ...item, attended: markAttended }
      : item);
    if (!LM.set(LM.KEYS.SHIFTS, updated)) return;
    LM.syncFirebase();
    renderTemplates();
    renderAll();
  }

  function getAttendanceProgress(template) {
    const entries = LM.get(LM.KEYS.SHIFTS, []).filter((item) =>
      item.kind === 'class' &&
      !item.isExam &&
      getTemplateKey(item) === template.id
    );
    const attended = entries.filter((item) => item.attended === true).length;
    const required = Math.max(0, Number(template.attendanceRequired) || 0);
    return { attended, required, remaining: Math.max(0, required - attended) };
  }

  function getTemplates() {
    return LM.get(LM.KEYS.SHIFT_TEMPLATES, []);
  }

  function populateTemplateBelongings(selectedIds) {
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    templateBelongingList.replaceChildren();
    if (sets.length === 0) {
      templateBelongingList.innerHTML = '<p class="lm-empty">持ちものセットはまだ登録されていません</p>';
      return;
    }
    sets.forEach((set) => {
      const label = document.createElement('label');
      label.className = 'lm-check-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = set.id;
      checkbox.checked = selectedIds.includes(set.id);
      const text = document.createElement('span');
      text.textContent = set.name;
      label.append(checkbox, text);
      templateBelongingList.appendChild(label);
    });
  }

  function populateSkippedSections(selectedSections) {
    const academicYear = getAcademicYearKey(selectedDate);
    templateSkipSectionLegend.textContent = `実施しない区分をスキップ（${academicYear}年度）`;
    templateSkipSectionList.replaceChildren();
    for (let section = 1; section <= 16; section += 1) {
      const label = document.createElement('label');
      label.className = 'hs-skip-section';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(section);
      checkbox.checked = selectedSections.includes(section);
      const text = document.createElement('span');
      text.textContent = `区分${section}`;
      label.append(checkbox, text);
      templateSkipSectionList.appendChild(label);
    }
  }

  function getSelectedSkippedSections() {
    return [...templateSkipSectionList.querySelectorAll('input:checked')]
      .map((input) => Number(input.value));
  }

  function getAcademicYearKey(dateKey) {
    const [year, month] = dateKey.split('-').map(Number);
    return String(month >= 4 ? year : year - 1);
  }

  function getSkippedSections(template, dateKey) {
    return template?.skippedSectionsByYear?.[getAcademicYearKey(dateKey)] || [];
  }

  function migrateLegacySkippedSections() {
    const templates = getTemplates();
    let changed = false;
    const currentYear = getAcademicYearKey(LM.todayStr());
    const migrated = templates.map((template) => {
      const { skippedSections, examMode, ...current } = template;
      if (Array.isArray(skippedSections)) {
        current.skippedSectionsByYear = {
          ...(current.skippedSectionsByYear || {}),
          [currentYear]: current.skippedSectionsByYear?.[currentYear] || skippedSections,
        };
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(template, 'examMode')) changed = true;
      return current;
    });
    if (changed) LM.set(LM.KEYS.SHIFT_TEMPLATES, migrated);
  }

  function startTemplateEdit(id) {
    const template = getTemplates().find((item) => item.id === id);
    if (!template) return;
    editingTemplateId = id;
    templateKind.value = template.kind;
    templateName.value = template.name;
    templateUnitCapacity.value = String(template.unitCapacity || 1);
    templateAttendanceRequired.value = String(template.attendanceRequired || '');
    populateSkippedSections(getSkippedSections(template, selectedDate));
    updateTemplateKindFields();
    populateTemplateBelongings(template.belongingSetIds || []);
    templateSave.textContent = '変更を保存';
    templateCancel.hidden = false;
    templateForm.hidden = false;
    templateToggle.setAttribute('aria-expanded', 'true');
    templateName.focus();
  }

  function closeTemplateForm() {
    editingTemplateId = null;
    templateForm.reset();
    templateForm.hidden = true;
    templateToggle.setAttribute('aria-expanded', 'false');
    templateSave.textContent = 'テンプレートを保存';
    templateCancel.hidden = true;
    templateUnitCapacity.value = '';
    templateAttendanceRequired.value = '';
    populateSkippedSections([]);
    updateTemplateKindFields();
    populateTemplateBelongings([]);
  }

  function openTemplateListModal() {
    const wrap = document.createElement('div');
    getTemplates().forEach((template) => {
      const row = document.createElement('div');
      row.className = 'hs-template-modal-row';
      const title = document.createElement('strong');
      title.textContent = template.name;
      const type = document.createElement('span');
      type.textContent = template.kind === 'class' ? '授業・履修' : 'アルバイトのシフト';
      row.append(title, type);
      if (template.kind === 'class') {
        const capacity = document.createElement('small');
        const skippedSections = getSkippedSections(template, selectedDate);
        const attendance = getAttendanceProgress(template);
        capacity.textContent = `区分ごと${template.unitCapacity || 1}回 ・ 出席${attendance.attended}/${attendance.required}（残り${attendance.remaining}）${skippedSections.length ? `・今年度スキップ${skippedSections.join('・')}` : ''}`;
        row.appendChild(capacity);
      }
      const belongings = (template.belongingSetIds || [])
        .map((id) => LM.get(LM.KEYS.BELONGING_SETS, []).find((set) => set.id === id)?.name)
        .filter(Boolean);
      const sets = document.createElement('small');
      sets.textContent = belongings.length ? `持ちもの: ${belongings.join('、')}` : '持ちものセットなし';
      row.appendChild(sets);
      wrap.appendChild(row);
    });
    LM.openModal('予定テンプレート一覧', wrap);
  }

  function renderTemplates() {
    const templates = getTemplates();
    templateList.replaceChildren();
    if (templates.length === 0) {
      templateList.innerHTML = '<p class="lm-empty">テンプレートはありません。「予定を登録」から作成してください。</p>';
    }
    const pageCount = Math.max(1, Math.ceil(templates.length / TEMPLATES_PER_PAGE));
    templatePage = Math.min(templatePage, pageCount - 1);
    const visibleTemplates = templates.slice(templatePage * TEMPLATES_PER_PAGE, (templatePage + 1) * TEMPLATES_PER_PAGE);
    visibleTemplates.forEach((template) => {
      const row = document.createElement('div');
      row.className = 'hs-template-row';
      const name = document.createElement('div');
      name.className = 'hs-template-name';
      const title = document.createElement('strong');
      title.textContent = template.name;
      const kind = document.createElement('span');
      if (template.kind === 'class') {
        const attendance = getAttendanceProgress(template);
        kind.textContent = `授業・履修 ・ 区分ごと${template.unitCapacity || 1}回 ・ 出席${attendance.attended}/${attendance.required}（残り${attendance.remaining}）`;
      } else {
        kind.textContent = 'アルバイトのシフト';
      }
      name.append(title, kind);

      const actions = document.createElement('div');
      actions.className = 'hs-template-actions';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'lm-btn';
      add.dataset.addTemplate = template.id;
      add.textContent = '予定を追加';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'lm-btn secondary';
      edit.dataset.editTemplate = template.id;
      edit.textContent = '編集';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lm-btn secondary';
      remove.dataset.deleteTemplate = template.id;
      remove.textContent = '削除';
      actions.append(add, edit, remove);
      row.append(name, actions);
      templateList.appendChild(row);
    });
    templatePager.replaceChildren();
    templatePager.hidden = templates.length <= TEMPLATES_PER_PAGE;
    if (!templatePager.hidden) {
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'lm-btn secondary';
      previous.dataset.templatePage = '-1';
      previous.textContent = '‹';
      previous.disabled = templatePage === 0;
      const position = document.createElement('span');
      position.textContent = `${templatePage + 1} / ${pageCount}`;
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'lm-btn secondary';
      next.dataset.templatePage = '1';
      next.textContent = '›';
      next.disabled = templatePage >= pageCount - 1;
      templatePager.append(previous, position, next);
    }
    templateListAll.hidden = templates.length <= TEMPLATES_PER_PAGE;
    updateAddForm();
    renderClassFilters();
  }

  function updateAddForm() {
    const templates = getTemplates();
    if (!templates.some((template) => template.id === addTemplate.value)) addTemplate.value = '';
    if (renderedAddTemplateId !== addTemplate.value) {
      renderedAddTemplateId = addTemplate.value;
      placementDate = '';
      classPeriodOptions.replaceChildren();
    }
    addTemplateChips.replaceChildren();
    if (templates.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'lm-empty';
      empty.textContent = '先に予定テンプレートを登録してください';
      addTemplateChips.appendChild(empty);
    }
    templates.forEach((template) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'hs-template-chip';
      chip.dataset.templateChip = template.id;
      chip.setAttribute('aria-pressed', String(template.id === addTemplate.value));
      const eventCount = LM.get(LM.KEYS.SHIFTS, []).filter((item) =>
        item.templateId === template.id || (!item.templateId && item.name === template.name && item.kind === template.kind)
      ).length;
      chip.textContent = `${template.name} (${eventCount})`;
      addTemplateChips.appendChild(chip);
    });
    const template = templates.find((item) => item.id === addTemplate.value);
    document.querySelector('.hs-add-shift-only').hidden = !template || template.kind === 'class';
    classPeriodField.hidden = !template || template.kind !== 'class';
    manualTimeField.hidden = Boolean(template && template.kind === 'class');
    classEntryTypeField.hidden = !template || template.kind !== 'class';
    if (!classEntryTypeField.hidden && !['class', 'exam'].includes(classEntryType.value)) {
      classEntryType.value = 'class';
    }
    addInstruction.textContent = template
      ? `選択中: ${template.name}。日付を選び、時限を確認して登録してください。`
      : 'テンプレートを選んだあと、登録したい日付をタップしてください。';
    calendarGrid.querySelectorAll('[data-date]').forEach((button) => {
      setPlacementDateStyle(button, button.dataset.date);
    });
    renderDayList();
    renderPlacementPeriods();
    updatePreview();
    updatePlacementButton();
    document.querySelector('.hs-page').classList.toggle('is-adding-plan', addDetails.open);
  }

  function updateTemplateKindFields() {
    const isClass = templateKind.value === 'class';
    templateClassFields.hidden = !isClass;
    templateUnitCapacity.required = isClass;
    templateAttendanceRequired.required = isClass;
  }

  function resetAddMode() {
    addTemplate.value = '';
    classEntryType.value = 'class';
    addStartTime.value = '';
    addEndTime.value = '';
    addLocation.value = '';
    addBreak.value = '0';
    placementDate = '';
    addUndoId = null;
    addUndoIds = [];
    addUndo.hidden = true;
    placeSelectedDate.disabled = true;
    placeSelectedDate.textContent = '日付を選択してください';
    classPeriodOptions.replaceChildren();
    updateAddForm();
    renderPlacementPeriods();
  }

  function isPlacementModeReady() {
    return addDetails.open && Boolean(addTemplate.value);
  }

  function handleDateTap(date) {
    if (isPlacementModeReady()) {
      if (placementDate !== date) classPeriodOptions.replaceChildren();
      placementDate = date;
      selectDate(date);
      renderPlacementPeriods();
      updatePlacementButton();
      return;
    }
    selectDate(date);
    const now = Date.now();
    if (lastCalendarTapDate === date && now - lastCalendarTapAt <= 350) {
      lastCalendarTapDate = '';
      lastCalendarTapAt = 0;
      openAgendaPopover(date);
      return;
    }
    lastCalendarTapDate = date;
    lastCalendarTapAt = now;
  }

  function renderPlacementPeriods(container = classPeriodOptions, date = placementDate, selectedPeriods = []) {
    const retainedPeriods = container === classPeriodOptions
      ? [...container.querySelectorAll('input:checked')].map((input) => Number(input.value))
      : [];
    container.replaceChildren();
    if (!date) {
      classPeriodHelp.textContent = '日付を選択すると、その曜日の時限が表示されます。';
      updatePlacementButton();
      return;
    }
    const periods = getPeriodsForDate(date);
    if (periods.length === 0) {
      classPeriodHelp.textContent = 'この曜日に選択できる授業時限はありません。';
      updatePlacementButton();
      return;
    }
    classPeriodHelp.textContent = `${formatShortDate(date)}の時限を選択してください。`;
    periods.forEach((period) => {
      const label = document.createElement('label');
      label.className = 'hs-period-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(period.number);
      checkbox.checked = selectedPeriods.includes(period.number) || retainedPeriods.includes(period.number);
      checkbox.dataset.periodStart = period.start;
      checkbox.dataset.periodEnd = period.end;
      checkbox.addEventListener('change', updatePlacementButton);
      const text = document.createElement('span');
      text.textContent = `${period.number}限目 ${period.start}〜${period.end}`;
      label.append(checkbox, text);
      container.appendChild(label);
    });
    updatePlacementButton();
  }

  function updatePlacementButton() {
    const template = getTemplates().find((item) => item.id === addTemplate.value);
    const isClass = template?.kind === 'class';
    const selectedPeriods = [...classPeriodOptions.querySelectorAll('input:checked')];
    const hasDate = Boolean(placementDate);
    const manualTimeValid = isClass || Boolean(addStartTime.value) === Boolean(addEndTime.value);
    placeSelectedDate.disabled = !isPlacementModeReady() || !hasDate ||
      (isClass && selectedPeriods.length === 0) || !manualTimeValid;
    placeSelectedDate.textContent = hasDate
      ? `${formatShortDate(placementDate)}に${isClass ? `${selectedPeriods.length}限を` : ''}登録`
      : '日付を選択してください';
  }

  function getPeriodsForDate(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    const day = date.getDay();
    const times = day === 4
      ? [['17:20', '18:10'], ['18:20', '19:10'], ['19:20', '20:10'], ['20:20', '21:10']]
      : day >= 0 && day <= 3
        ? [['08:50', '09:40'], ['09:50', '10:40'], ['10:50', '11:40'], ['11:50', '12:40'], ['13:40', '14:30'], ['14:40', '15:30'], ['15:40', '16:30']]
        : [];
    return times.map(([start, end], index) => ({ number: index + 1, start, end }));
  }

  function addPlanToSelectedDate() {
    const date = placementDate;
    const template = getTemplates().find((item) => item.id === addTemplate.value);
    if (!template) {
      LM.showToast('先に予定テンプレートを選択してください', 'error');
      return;
    }
    if (!date) {
      LM.showToast('カレンダーから日付を選択してください', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      LM.showToast('登録する日付を確認できませんでした', 'error');
      return;
    }
    const isClass = template.kind === 'class';
    const selectedPeriods = [...classPeriodOptions.querySelectorAll('input:checked')].map((input) => ({
      number: Number(input.value),
      start: input.dataset.periodStart,
      end: input.dataset.periodEnd,
    }));
    if (isClass && selectedPeriods.length === 0) {
      LM.showToast('登録する時限を1つ以上選択してください', 'error');
      return;
    }
    if (Boolean(addStartTime.value) !== Boolean(addEndTime.value)) {
      LM.showToast('開始時刻と終了時刻は両方入力するか、両方空欄にしてください', 'error');
      return;
    }

    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const isExam = template.kind === 'class' && classEntryType.value === 'exam';
    if (template.kind === 'class') {
      const conflict = selectedPeriods.some((period) => shifts.some((item) =>
        item.kind === 'class' &&
        getTemplateKey(item) === template.id &&
        item.date === date &&
        Boolean(item.isExam) === isExam &&
        Number(item.periodNumber) === period.number
      ));
      if (conflict) {
        LM.showToast(isExam ? '選択した時限に、この科目の試験がすでに登録されています' : '選択した時限に、この科目はすでに登録されています', 'error');
        return;
      }
      const term = getSchoolTerm(date);
      if (term && !isExam) {
        const skippedSections = getSkippedSections(template, date);
        const availableSections = Array.from(
          { length: term.lastSection - term.firstSection + 1 },
          (_, index) => term.firstSection + index
        ).filter((section) => !skippedSections.includes(section));
        const count = shifts.filter((item) =>
          item.kind === 'class' &&
          !item.isExam &&
          getTemplateKey(item) === template.id &&
          getSchoolTerm(item.date)?.key === term.key
        ).length;
        if (count + selectedPeriods.filter((period) => !shifts.some((item) =>
          item.kind === 'class' && !item.isExam && getTemplateKey(item) === template.id &&
          item.date === date && Number(item.periodNumber) === period.number
        )).length > (Number(template.unitCapacity) || 1) * availableSections.length) {
          LM.showToast(`${term.label}の実施区分はすべて登録済みです`, 'error');
          return;
        }
      }
    }

    const entries = isClass ? selectedPeriods : [{
      number: null,
      start: addStartTime.value,
      end: addEndTime.value,
    }];
    const records = entries.map((entry) => ({
      id: LM.uid(),
      templateId: template.id,
      date,
      kind: template.kind,
      ...(isExam ? { isExam: true } : {}),
      ...(entry.number ? { periodNumber: entry.number } : {}),
      name: template.name,
      location: addLocation.value.trim(),
      start: entry.start,
      end: entry.end,
      breakMin: template.kind === 'class' ? 0 : Math.max(0, Number(addBreak.value) || 0),
      belongingSetIds: template.belongingSetIds || [],
    }));
    if (!LM.set(LM.KEYS.SHIFTS, shifts.concat(records))) return;
    const schedulesSynced = syncLinkedSchedules();
    activeSubjectFilter = template.kind === 'class' ? template.id : '';
    activeSectionFilter = '';
    selectedDate = date;
    shownMonth = new Date(`${date}T00:00:00`);
    addUndoIds = records.map((item) => item.id);
    addUndoId = addUndoIds[0];
    addUndo.replaceChildren();
    const message = document.createElement('span');
    message.textContent = `${template.name}${isExam ? 'の試験' : ''}を${formatShortDate(date)}に${records.length}件追加しました。`;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'lm-btn secondary';
    undo.dataset.undoAdd = 'true';
    undo.textContent = '取り消す';
    addUndo.append(message, undo);
    addUndo.hidden = false;
    renderAll();
    if (schedulesSynced) {
      LM.showToast('予定を追加しました。予定逆算への登録は各予定のボタンから行えます');
    }
  }

  function formatShortDate(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function getSchoolTerm(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return null;
    const [year, month] = dateKey.split('-').map(Number);
    if (month >= 4 && month <= 8) {
      return { key: `spring-${year}`, label: `${year}年前期`, firstSection: 1, lastSection: 8 };
    }
    if (month >= 9) {
      return { key: `fall-${year}`, label: `${year}年後期`, firstSection: 9, lastSection: 16 };
    }
    if (month <= 2) {
      return { key: `fall-${year - 1}`, label: `${year - 1}年後期`, firstSection: 9, lastSection: 16 };
    }
    return null;
  }

  function getTemplateKey(item) {
    if (item.templateId) return item.templateId;
    const matchingTemplate = getTemplates().find((template) => template.kind === item.kind && template.name === item.name);
    return matchingTemplate?.id || `legacy:${item.name || ''}`;
  }

  function getClassUnitInfo(item, allShifts = LM.get(LM.KEYS.SHIFTS, [])) {
    if (item.kind !== 'class') return null;
    const term = getSchoolTerm(item.date);
    if (!term) return { term: null, section: null };
    if (item.isExam) return { term, section: 'exam' };
    const template = getTemplates().find((entry) => entry.id === item.templateId);
    const capacity = Math.max(1, Number(template?.unitCapacity) || 1);
    const skippedSections = getSkippedSections(template, item.date);
    const availableSections = Array.from(
      { length: term.lastSection - term.firstSection + 1 },
      (_, index) => term.firstSection + index
    ).filter((section) => !skippedSections.includes(section));
    const key = getTemplateKey(item);
    const ordered = allShifts
      .filter((entry) =>
        entry.kind === 'class' &&
        !entry.isExam &&
        getTemplateKey(entry) === key &&
        getSchoolTerm(entry.date)?.key === term.key
      )
      .sort((a, b) => (a.date + (a.start || '') + a.id).localeCompare(b.date + (b.start || '') + b.id));
    const index = ordered.findIndex((entry) => entry.id === item.id);
    if (index < 0) return { term, section: null };
    const section = availableSections[Math.floor(index / capacity)] || null;
    return { term, section, capacity };
  }

  function renderClassFilters() {
    const templates = getTemplates().filter((template) => template.kind === 'class');
    if (!templates.some((template) => template.id === activeSubjectFilter)) activeSubjectFilter = '';
    classSubjectFilter.replaceChildren();
    const allSubjects = document.createElement('option');
    allSubjects.value = '';
    allSubjects.textContent = 'すべて';
    classSubjectFilter.appendChild(allSubjects);
    templates.forEach((template) => {
      const option = document.createElement('option');
      option.value = template.id;
      const count = LM.get(LM.KEYS.SHIFTS, []).filter((item) =>
        item.templateId === template.id || (!item.templateId && item.name === template.name && item.kind === 'class')
      ).length;
      option.textContent = `${template.name} (${count})`;
      classSubjectFilter.appendChild(option);
    });
    classSubjectFilter.value = activeSubjectFilter;
    classRegistrationFilter.value = activeRegistrationFilter;

    const term = getSchoolTerm(selectedDate);
    const selectedTemplate = templates.find((entry) => entry.id === activeSubjectFilter);
    classSectionFilter.replaceChildren();
    const allSections = document.createElement('option');
    allSections.value = '';
    allSections.textContent = 'すべて';
    classSectionFilter.appendChild(allSections);
    if (term) {
      for (let section = term.firstSection; section <= term.lastSection; section += 1) {
        if (getSkippedSections(selectedTemplate, selectedDate).includes(section)) continue;
        const option = document.createElement('option');
        option.value = String(section);
        const sectionCount = LM.get(LM.KEYS.SHIFTS, []).filter((item) => {
          const matchesSubject = !activeSubjectFilter || item.templateId === activeSubjectFilter ||
            (!item.templateId && item.name === selectedTemplate?.name);
          return item.kind === 'class' &&
            !item.isExam &&
            matchesSubject &&
            getSchoolTerm(item.date)?.key === term.key &&
            getClassUnitInfo(item)?.section === section;
        }).length;
        option.textContent = `区分${section} (${sectionCount})`;
        classSectionFilter.appendChild(option);
      }
      const examCount = LM.get(LM.KEYS.SHIFTS, []).filter((item) => {
        const matchesSubject = !activeSubjectFilter || item.templateId === activeSubjectFilter ||
          (!item.templateId && item.name === selectedTemplate?.name);
        return item.kind === 'class' &&
          item.isExam &&
          getSchoolTerm(item.date)?.key === term.key &&
          matchesSubject;
      }).length;
      const examOption = document.createElement('option');
      examOption.value = 'exam';
      examOption.textContent = `試験 (${examCount})`;
      classSectionFilter.appendChild(examOption);
    }
    if (!term) activeSectionFilter = '';
    if (![...classSectionFilter.options].some((option) => option.value === activeSectionFilter)) {
      activeSectionFilter = '';
    }
    classSectionFilter.value = activeSectionFilter;
    classSectionFilter.disabled = !term;
  }

  function filterAgendaEvents(events) {
    return events.filter((item) => {
      if (item.kind !== 'class') return true;
      const selectedTemplate = getTemplates().find((template) => template.id === activeSubjectFilter);
      const matchesSubject = !activeSubjectFilter || item.templateId === activeSubjectFilter ||
        (!item.templateId && item.name === selectedTemplate?.name);
      if (!matchesSubject) return false;
      if (activeRegistrationFilter === 'registered' && item.scheduleRegistered !== true) return false;
      if (activeRegistrationFilter === 'unregistered' && item.scheduleRegistered === true) return false;
      if (!activeSectionFilter) return true;
      if (activeSectionFilter === 'exam') return item.isExam === true;
      return String(getClassUnitInfo(item)?.section || '') === activeSectionFilter;
    });
  }

  function setPlacementDateStyle(button, date) {
    const active = isPlacementModeReady();
    button.classList.toggle('is-placement-target', active);
    if (active) {
      const template = getTemplates().find((item) => item.id === addTemplate.value);
      const type = classEntryType.value === 'exam' ? 'の試験' : '';
      button.setAttribute('aria-label', `${formatShortDate(date)}、${template?.name || '予定'}${type}を登録`);
    } else button.removeAttribute('aria-label');
  }

  function addClassUnitLabel(item) {
    const unit = getClassUnitInfo(item);
    if (!unit || !unit.term) return '区分対象期間外';
    if (unit.section === 'exam') return '試験';
    return unit.section ? `区分${unit.section}` : '区分上限超過';
  }

  function moveMonth(delta) {
    shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1);
    const today = new Date(`${LM.todayStr()}T00:00:00`);
    selectedDate = shownMonth.getFullYear() === today.getFullYear() && shownMonth.getMonth() === today.getMonth()
      ? LM.todayStr()
      : LM.scheduleDateKey(shownMonth);
    renderAll();
  }

  function goToToday() {
    selectedDate = LM.todayStr();
    shownMonth = new Date(`${selectedDate}T00:00:00`);
    renderAll();
  }

  function selectDate(date) {
    selectedDate = date;
    const selected = new Date(`${date}T00:00:00`);
    if (selected.getMonth() !== shownMonth.getMonth() || selected.getFullYear() !== shownMonth.getFullYear()) {
      shownMonth = selected;
      renderAll();
      return;
    }
    renderDayList();
    renderCalendarSelection();
  }

  function openAgendaPopover(dateKey) {
    const content = document.createElement('div');
    const navigation = document.createElement('div');
    navigation.className = 'hs-agenda-popover-nav';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'lm-btn secondary';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', '前の日');
    const dateLabel = document.createElement('strong');
    dateLabel.className = 'hs-agenda-popover-date';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'lm-btn secondary';
    next.textContent = '›';
    next.setAttribute('aria-label', '次の日');
    navigation.append(previous, dateLabel, next);
    const list = document.createElement('div');
    list.className = 'hs-agenda-popover-list';
    content.append(navigation, list);

    const openDate = (targetDate) => {
      selectedDate = targetDate;
      const selected = new Date(`${targetDate}T00:00:00`);
      shownMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      renderAll();
      openAgendaPopover(targetDate);
    };
    previous.addEventListener('click', () => openDate(shiftDateKey(dateKey, -1)));
    next.addEventListener('click', () => openDate(shiftDateKey(dateKey, 1)));

    LM.openModal('予定', content);
    const overlay = document.querySelector('.lm-modal-overlay');
    const panel = overlay?.querySelector('.lm-modal');
    overlay?.classList.add('hs-agenda-overlay');
    activeAgendaDate = dateKey;
    activeAgendaList = list;
    const renderDateLabel = () => {
      const selected = new Date(`${activeAgendaDate}T00:00:00`);
      dateLabel.textContent = `${selected.getMonth() + 1}月${selected.getDate()}日(${WEEKDAYS[selected.getDay()]})`;
    };
    renderDateLabel();
    renderDayList(list, dateKey);
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
      openDate(shiftDateKey(activeAgendaDate, deltaX < 0 ? 1 : -1));
    }, { passive: true });
  }

  function shiftDateKey(dateKey, delta) {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + delta);
    return LM.scheduleDateKey(date);
  }

  function openTimetableRegistration() {
    const periods = getPeriodsForDate(selectedDate);
    if (periods.length === 0) {
      LM.showToast('選択した日は授業時限を登録できません', 'error');
      return;
    }
    const templates = getTemplates().filter((template) => template.kind === 'class');
    if (templates.length === 0) {
      LM.showToast('先に授業テンプレートを登録してください', 'error');
      return;
    }
    const form = document.createElement('form');
    form.className = 'hs-timetable-form';
    const intro = document.createElement('p');
    intro.className = 'lm-empty';
    intro.textContent = `${formatShortDate(selectedDate)}の各時限に授業テンプレートを割り当てます。空欄の時限は登録されません。`;
    form.appendChild(intro);
    const existingShifts = LM.get(LM.KEYS.SHIFTS, []);
    periods.forEach((period) => {
      const row = document.createElement('div');
      row.className = 'hs-timetable-row';
      const periodLabel = document.createElement('div');
      periodLabel.className = 'hs-timetable-period';
      const label = document.createElement('strong');
      const select = document.createElement('select');
      select.dataset.periodNumber = String(period.number);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '登録しない';
      select.appendChild(empty);
      const existing = existingShifts.find((item) =>
        item.kind === 'class' &&
        item.date === selectedDate &&
        Number(item.periodNumber) === period.number
      );
      templates.forEach((template) => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.appendChild(option);
      });
      if (existing && !existing.isExam) {
        const currentTemplate = templates.find((template) => getTemplateKey(existing) === template.id);
        if (currentTemplate) select.value = currentTemplate.id;
      }
      label.textContent = `${period.number}限目`;
      const time = document.createElement('small');
      time.textContent = `${period.start}〜${period.end}`;
      periodLabel.append(label, time);
      row.append(periodLabel, select);
      form.appendChild(row);
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
    save.textContent = 'この日の時間割を登録';
    actions.append(cancel, save);
    form.appendChild(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const assignments = [...form.querySelectorAll('select[data-period-number]')]
        .filter((select) => select.value)
        .map((select) => ({
          period: periods.find((period) => period.number === Number(select.dataset.periodNumber)),
          template: templates.find((template) => template.id === select.value),
        }))
        .filter((assignment) => assignment.period && assignment.template);
      if (assignments.length === 0) {
        LM.showToast('登録する時限を選択してください', 'error');
        return;
      }

      const shifts = LM.get(LM.KEYS.SHIFTS, []);
      const additions = [];
      for (const { period, template } of assignments) {
        const occupied = shifts.find((item) =>
          item.kind === 'class' &&
          item.date === selectedDate &&
          Number(item.periodNumber) === period.number
        );
        if (occupied) {
          if (getTemplateKey(occupied) === template.id && !occupied.isExam) continue;
          LM.showToast(`${period.number}限目にはすでに別の授業または試験が登録されています`, 'error');
          return;
        }
        additions.push({
          id: LM.uid(),
          templateId: template.id,
          date: selectedDate,
          kind: 'class',
          periodNumber: period.number,
          name: template.name,
          location: '',
          start: period.start,
          end: period.end,
          breakMin: 0,
          belongingSetIds: template.belongingSetIds || [],
        });
      }
      const term = getSchoolTerm(selectedDate);
      if (term) {
        const additionsByTemplate = new Map();
        additions.forEach((item) => additionsByTemplate.set(
          item.templateId,
          (additionsByTemplate.get(item.templateId) || 0) + 1
        ));
        for (const [templateId, count] of additionsByTemplate) {
          const template = templates.find((item) => item.id === templateId);
          const skippedSections = getSkippedSections(template, selectedDate);
          const sectionCount = Array.from(
            { length: term.lastSection - term.firstSection + 1 },
            (_, index) => term.firstSection + index
          ).filter((section) => !skippedSections.includes(section)).length;
          const existingCount = shifts.filter((item) =>
            item.kind === 'class' &&
            !item.isExam &&
            getTemplateKey(item) === templateId &&
            getSchoolTerm(item.date)?.key === term.key
          ).length;
          if (existingCount + count > (Number(template.unitCapacity) || 1) * sectionCount) {
            LM.showToast(`${template.name}は${term.label}の実施区分上限に達しています`, 'error');
            return;
          }
        }
      }
      if (additions.length === 0) {
        LM.showToast('選択した時間割はすでに登録されています');
        LM.closeModal();
        return;
      }
      if (!LM.set(LM.KEYS.SHIFTS, shifts.concat(additions))) return;
      const schedulesSynced = syncLinkedSchedules();
      addUndoIds = additions.map((item) => item.id);
      addUndoId = addUndoIds[0];
      addUndo.replaceChildren();
      const message = document.createElement('span');
      message.textContent = `${formatShortDate(selectedDate)}の時間割を${additions.length}件登録しました。`;
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'lm-btn secondary';
      undo.dataset.undoAdd = 'true';
      undo.textContent = '取り消す';
      addUndo.append(message, undo);
      addUndo.hidden = false;
      LM.closeModal();
      activeSubjectFilter = '';
      activeSectionFilter = '';
      renderAll();
      if (schedulesSynced) LM.showToast('この日の時間割を登録しました。履修登録は各予定のボタンから行えます');
    });
    LM.openModal('時間割を登録する', form);
  }

  function renderAll() {
    renderClassFilters();
    renderCalendar();
    renderDayList();
    if (activeAgendaList?.isConnected) renderDayList(activeAgendaList, activeAgendaDate);
    renderMonthSummary();
  }

  function renderCalendar() {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    calendarTitle.textContent = `${year}年${month + 1}月`;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const byDate = groupByDate(groupClassEvents(filterAgendaEvents(LM.get(LM.KEYS.SHIFTS, []))));
    calendarGrid.replaceChildren();
    WEEKDAYS.forEach((weekday) => {
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
      const key = LM.scheduleDateKey(new Date(year, month, day));
      const events = byDate.get(key) || [];
      button.dataset.date = key;
      button.setAttribute('aria-pressed', String(key === selectedDate));
      setPlacementDateStyle(button, key);
      if (key === LM.todayStr()) button.classList.add('is-today');
      const number = document.createElement('span');
      number.className = 'hs-calendar-number';
      number.textContent = String(day);
      button.appendChild(number);
      const markers = document.createElement('span');
      markers.className = 'hs-calendar-markers';
      events.slice(0, 4).forEach((item) => {
        const marker = document.createElement('span');
        const registered = item.kind === 'class' &&
          (item.entries || [item]).some((entry) => entry.scheduleRegistered === true);
        marker.className = `hs-calendar-marker${item.kind === 'class' ? ' is-class' : ' is-shift'}${item.isExam ? ' is-exam' : ''}${registered ? ' is-registered' : ''}`;
        marker.setAttribute('aria-hidden', 'true');
        markers.appendChild(marker);
      });
      button.appendChild(markers);
      const descriptions = events.map((item) => item.name || (item.kind === 'class' ? '授業' : 'シフト'));
      button.setAttribute('aria-label', `${formatShortDate(key)}${events.length ? `、${descriptions.join('、')}` : '、予定なし'}`);
      calendarGrid.appendChild(button);
    }
    renderCalendarSelection();
  }

  function renderCalendarSelection() {
    calendarGrid.querySelectorAll('[data-date]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.date === selectedDate));
    });
  }

  function renderDayList(container = dayList, dateKey = selectedDate) {
    const allEvents = LM.get(LM.KEYS.SHIFTS, []);
    const events = groupClassEvents(filterAgendaEvents(groupByDate(allEvents).get(dateKey) || []))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const date = new Date(`${dateKey}T00:00:00`);
    const placementHint = isPlacementModeReady() ? ' ・ 日付をタップして予定を追加' : '';
    selectedDateLabel.textContent = `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})${placementHint}`;
    container.replaceChildren();
    if (events.length === 0) {
      const hasEvents = (groupByDate(allEvents).get(dateKey) || []).length > 0;
      container.innerHTML = `<p class="lm-empty">${hasEvents ? 'フィルターに一致する予定はありません' : 'この日の予定はありません'}</p>`;
      return;
    }
    events.forEach((item) => {
      const entries = item.entries || [item];
      const isClass = item.kind === 'class';
      const row = document.createElement('article');
      row.className = `hs-day-item${isClass ? ' is-class' : ''}${item.isExam ? ' is-exam' : ''}${entries.length > 1 ? ' has-multiple-periods' : ''}`;
      const detail = document.createElement('div');
      detail.className = 'hs-day-detail';
      const title = document.createElement('strong');
      title.textContent = item.name || (isClass ? '授業' : 'シフト');
      detail.appendChild(title);
      if (isClass) {
        const periods = document.createElement('div');
        periods.className = 'hs-day-period-list';
        entries.forEach((entry) => {
          const periodInfo = document.createElement('span');
          periodInfo.className = 'hs-day-period';
          const section = addClassUnitLabel(entry);
          periodInfo.textContent = `${entry.periodNumber ? `${entry.periodNumber}限目 ` : ''}${entry.start && entry.end ? `${entry.start}〜${entry.end}` : '時間未設定'}${entry.isExam ? '' : ` ・ ${section}`}`;
          periods.appendChild(periodInfo);
        });
        detail.appendChild(periods);
      } else {
        const time = document.createElement('span');
        time.textContent = item.start && item.end ? `${item.start}〜${item.end}` : '時間未設定';
        detail.appendChild(time);
      }
      if (item.location) {
        const location = document.createElement('span');
        location.className = 'hs-day-location';
        location.textContent = item.location;
        detail.appendChild(location);
      }
      if (item.routePreset) {
        const route = document.createElement('span');
        route.className = 'hs-day-route';
        route.textContent = `逆算: ${item.routePreset}`;
        detail.appendChild(route);
      }
      if (item.kind !== 'class') {
        const payLabel = document.createElement('span');
        payLabel.className = 'hs-day-pay';
        payLabel.textContent = item.start && item.end
          ? `見込み ¥${calculatePay(item).toLocaleString()}`
          : '時間未設定のため給与未計算';
        detail.appendChild(payLabel);
      }
      row.appendChild(detail);
      const actions = document.createElement('div');
      actions.className = 'hs-day-actions';
      if (isClass && !item.isExam) {
        const attended = entries.every((entry) => entry.attended === true);
        const attendance = document.createElement('button');
        attendance.type = 'button';
        attendance.className = `lm-btn secondary hs-attendance${attended ? ' is-attended' : ''}`;
        attendance.dataset.toggleAttendanceGroup = JSON.stringify(entries.map((entry) => entry.id));
        attendance.setAttribute('aria-pressed', String(attended));
        attendance.textContent = attended ? '出席済み' : '出席を記録';
        actions.appendChild(attendance);
      }
      const registeredCount = entries.filter((entry) => entry.scheduleRegistered === true).length;
      const registered = registeredCount === entries.length;
      const register = document.createElement('button');
      register.type = 'button';
      register.className = `lm-btn secondary hs-register${registered ? ' is-registered' : ''}`;
      if (isClass) register.dataset.toggleScheduleGroup = JSON.stringify(entries.map((entry) => entry.id));
      else register.dataset.toggleSchedule = item.id;
      register.textContent = isClass
        ? (item.isExam
          ? (entries.length > 1
            ? '試験の時限を選択'
            : (registered ? '試験の登録を解除' : '試験を登録'))
          : (entries.length > 1
            ? '履修登録する時限を選択'
            : (registered ? '履修登録を解除' : '履修登録する')))
        : (registered ? '逆算登録を解除' : '予定逆算に登録');
      register.setAttribute('aria-pressed', String(registered));
      actions.appendChild(register);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'lm-btn secondary hs-edit';
      if (isClass) edit.dataset.editGroup = JSON.stringify(entries.map((entry) => entry.id));
      else edit.dataset.editId = item.id;
      edit.textContent = '編集';
      actions.appendChild(edit);
      const isShiftSeries = item.kind !== 'class' && item.seriesId;
      const remove = createDeleteButton(isClass ? '' : item.id, isShiftSeries ? 'この日だけ削除' : '削除');
      if (isClass) remove.dataset.deleteGroup = JSON.stringify(entries.map((entry) => entry.id));
      actions.appendChild(remove);
      if (isShiftSeries) {
        const removeSeries = createDeleteButton('', '全期間を削除');
        removeSeries.dataset.deleteSeries = item.seriesId;
        actions.appendChild(removeSeries);
      }
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  function createDeleteButton(id, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lm-btn secondary hs-delete';
    if (id) button.dataset.deleteId = id;
    button.textContent = label;
    return button;
  }

  function startShiftEdit(ids) {
    const editIds = new Set(Array.isArray(ids) ? ids : [ids]);
    const originalEntries = LM.get(LM.KEYS.SHIFTS, [])
      .filter((shift) => editIds.has(shift.id))
      .sort((a, b) => Number(a.periodNumber) - Number(b.periodNumber));
    const item = originalEntries[0];
    if (!item) return;

    const form = document.createElement('form');
    form.className = 'hs-edit-form';
    const fields = {};
    const addField = (labelText, name, type, value, attributes = {}) => {
      const field = document.createElement('div');
      field.className = 'lm-field';
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.name = name;
      input.type = type;
      input.value = value ?? '';
      Object.entries(attributes).forEach(([key, attributeValue]) => {
        input.setAttribute(key, attributeValue);
      });
      label.htmlFor = `shift-edit-${name}`;
      input.id = label.htmlFor;
      field.append(label, input);
      form.appendChild(field);
      fields[name] = input;
      return input;
    };

    addField('予定の名前', 'name', 'text', item.name, { maxlength: '60', required: '' });
    const dateInput = addField('日付', 'date', 'date', item.date, { required: '' });
    let periodOptions = null;
    if (item.kind === 'class') {
      const field = document.createElement('div');
      field.className = 'lm-field hs-edit-period-field';
      const label = document.createElement('span');
      label.className = 'hs-field-label';
      label.textContent = '授業時限（複数選択可）';
      periodOptions = document.createElement('div');
      periodOptions.className = 'hs-period-options';
      const help = document.createElement('small');
      help.textContent = '選択した時限ごとに予定を作成します。';
      field.append(label, periodOptions, help);
      form.appendChild(field);
      const updatePeriods = (selectedPeriods = []) => {
        const periods = getPeriodsForDate(dateInput.value);
        periodOptions.replaceChildren();
        if (periods.length === 0) {
          const unavailable = document.createElement('span');
          unavailable.className = 'lm-empty';
          unavailable.textContent = 'この曜日は時限を選べません';
          periodOptions.appendChild(unavailable);
          return;
        }
        periods.forEach((period) => {
          const optionLabel = document.createElement('label');
          optionLabel.className = 'hs-period-option';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = 'periods';
          checkbox.value = String(period.number);
          checkbox.checked = selectedPeriods.includes(period.number);
          const text = document.createElement('span');
          text.textContent = `${period.number}限目 ${period.start}〜${period.end}`;
          optionLabel.append(checkbox, text);
          periodOptions.appendChild(optionLabel);
        });
      };
      updatePeriods(originalEntries.map((entry) => Number(entry.periodNumber)).filter(Number.isFinite));
      dateInput.addEventListener('change', () => updatePeriods());
    } else {
      addField('開始時刻(任意)', 'start', 'time', item.start);
      addField('終了時刻(任意)', 'end', 'time', item.end);
    }
    addField('場所(任意)', 'location', 'text', item.location, { maxlength: '80' });

    const belongingField = document.createElement('fieldset');
    belongingField.className = 'lm-field hs-edit-belongings';
    const belongingLegend = document.createElement('legend');
    belongingLegend.textContent = '持ちものセット(任意・複数選択可)';
    const belongingList = document.createElement('div');
    belongingList.className = 'lm-check-list';
    const sets = LM.get(LM.KEYS.BELONGING_SETS, []);
    if (sets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'lm-empty';
      empty.textContent = '持ちものセットはまだ登録されていません';
      belongingList.appendChild(empty);
    } else {
      sets.forEach((set) => {
        const label = document.createElement('label');
        label.className = 'lm-check-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = set.id;
        checkbox.checked = (item.belongingSetIds || []).includes(set.id);
        const text = document.createElement('span');
        text.textContent = set.name;
        label.append(checkbox, text);
        belongingList.appendChild(label);
      });
    }
    belongingField.append(belongingLegend, belongingList);
    form.appendChild(belongingField);

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
    save.textContent = '変更を保存';
    actions.append(cancel, save);
    form.appendChild(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!fields.name.value.trim()) {
        LM.showToast('予定の名前を入力してください', 'error');
        fields.name.focus();
        return;
      }
      if (item.kind !== 'class' && Boolean(fields.start.value) !== Boolean(fields.end.value)) {
        LM.showToast('開始時刻と終了時刻は両方入力するか、両方空欄にしてください', 'error');
        return;
      }
      const selectedPeriods = item.kind === 'class'
        ? [...periodOptions.querySelectorAll('input:checked')]
          .map((input) => getPeriodsForDate(fields.date.value)
            .find((period) => String(period.number) === input.value))
          .filter(Boolean)
        : [];
      if (item.kind === 'class' && selectedPeriods.length === 0) {
        LM.showToast('授業時限を1つ以上選択してください', 'error');
        return;
      }
      const shifts = LM.get(LM.KEYS.SHIFTS, []);
      const matchingEntries = shifts.filter((shift) => editIds.has(shift.id));
      const firstIndex = shifts.findIndex((shift) => editIds.has(shift.id));
      if (matchingEntries.length === 0 || firstIndex === -1) {
        LM.showToast('編集する予定が見つかりません', 'error');
        LM.closeModal();
        return;
      }
      const conflict = selectedPeriods.find((period) => shifts.some((shift) =>
        !editIds.has(shift.id) &&
        shift.kind === 'class' &&
        getTemplateKey(shift) === getTemplateKey(item) &&
        shift.date === fields.date.value &&
        Boolean(shift.isExam) === Boolean(item.isExam) &&
        Number(shift.periodNumber) === period.number
      ));
      if (conflict) {
        LM.showToast('この科目の予定は、選択した時限にすでに登録されています', 'error');
        return;
      }
      const commonUpdates = {
        name: fields.name.value.trim(),
        date: fields.date.value,
        location: fields.location.value.trim(),
        belongingSetIds: [...belongingList.querySelectorAll('input:checked')].map((input) => input.value),
      };
      if (item.kind === 'class') {
        const updatedEntries = selectedPeriods.map((period) => {
          const existing = matchingEntries.find((entry) => Number(entry.periodNumber) === period.number);
          return {
            ...(existing || matchingEntries[0]),
            ...commonUpdates,
            ...(existing ? {} : { id: LM.uid(), attended: false, scheduleRegistered: false }),
            periodNumber: period.number,
            start: period.start,
            end: period.end,
          };
        });
        const remaining = shifts.filter((shift) => !editIds.has(shift.id));
        remaining.splice(Math.min(firstIndex, remaining.length), 0, ...updatedEntries);
        shifts.splice(0, shifts.length, ...remaining);
      } else {
        const index = shifts.findIndex((shift) => shift.id === item.id);
        shifts[index] = {
          ...shifts[index],
          ...commonUpdates,
          start: fields.start.value,
          end: fields.end.value,
        };
      }
      if (!LM.set(LM.KEYS.SHIFTS, shifts)) return;
      selectedDate = fields.date.value;
      shownMonth = new Date(`${selectedDate}T00:00:00`);
      LM.closeModal();
      if (!syncLinkedSchedules()) return;
      LM.syncFirebase();
      renderAll();
    });
    LM.openModal('予定を編集', form);
  }

  function renderMonthSummary() {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
    monthLabel.textContent = `${month + 1}月`;
    const shifts = LM.get(LM.KEYS.SHIFTS, []).filter((item) =>
      item.date.startsWith(ym) && item.kind !== 'class'
    );
    const wageSettings = getWageSettings();
    if (shifts.length === 0) {
      monthSummary.innerHTML = '<span class="lm-empty">今月のシフトはまだありません</span>';
      return;
    }
    const totalPay = shifts.reduce((sum, item) => sum + calculatePay(item, wageSettings), 0);
    const totalTransport = shifts.length * (wageSettings.transportFee || 0);
    monthSummary.innerHTML = `
      <span>勤務日数 ${shifts.length}日</span>
      <span class="lm-shift-pay">給与合計 ¥${totalPay.toLocaleString()}</span>
      <span>交通費合計 ¥${totalTransport.toLocaleString()}</span>
    `;
  }

  function updatePreview() {
    const template = getTemplates().find((item) => item.id === addTemplate.value);
    if (!template || template.kind === 'class') {
      addPreview.textContent = '';
      return;
    }
    if (!addStartTime.value || !addEndTime.value) {
      addPreview.textContent = '時間未設定の勤務は給与見込みに含まれません';
      return;
    }
    const wage = getWageSettings();
    const pay = calculatePay({
      start: addStartTime.value,
      end: addEndTime.value,
      breakMin: Number(addBreak.value) || 0,
    }, wage);
    addPreview.textContent = `見込み給与(1回分): ¥${pay.toLocaleString()}`;
  }

  function groupByDate(items) {
    const grouped = new Map();
    items.forEach((item) => {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    });
    return grouped;
  }

  function groupClassEvents(items) {
    const groups = new Map();
    const result = [];
    items.forEach((item) => {
      if (item.kind !== 'class') {
        result.push({ ...item, entries: [item] });
        return;
      }
      const key = JSON.stringify([item.date, getTemplateKey(item), Boolean(item.isExam)]);
      if (!groups.has(key)) {
        const group = { ...item, entries: [] };
        groups.set(key, group);
        result.push(group);
      }
      groups.get(key).entries.push(item);
    });
    result.forEach((group) => {
      if (group.kind === 'class') {
        group.entries.sort((a, b) =>
          (a.start || '').localeCompare(b.start || '') || Number(a.periodNumber) - Number(b.periodNumber)
        );
        group.start = group.entries[0]?.start || '';
      }
    });
    return result;
  }

  function loadWageSettings() {
    const settings = getWageSettings();
    wageInput.value = settings.hourlyWage || '';
    transportInput.value = settings.transportFee || '';
  }

  function saveWageSettings() {
    if (!LM.set(LM.KEYS.WAGE_SETTINGS, {
      hourlyWage: Math.max(0, Number(wageInput.value) || 0),
      transportFee: Math.max(0, Number(transportInput.value) || 0),
    })) return;
    renderDayList();
    renderMonthSummary();
    updatePreview();
  }

  function getWageSettings() {
    return LM.get(LM.KEYS.WAGE_SETTINGS, { hourlyWage: 0, transportFee: 0 });
  }

  function calculatePay(item, wageSettings) {
    if (!item.start || !item.end) return 0;
    return LM.calcShiftPay(item, wageSettings || getWageSettings()).pay;
  }

  function syncLinkedSchedules() {
    const result = LM.syncShiftSchedules();
    if (result === 'updated') LM.syncFirebase();
    if (result === 'failed') {
      LM.showToast('予定逆算への反映に失敗しました', 'error');
      return false;
    }
    return true;
  }
})();
