(function () {
  const wageInput = document.getElementById('f-wage');
  const transportInput = document.getElementById('f-transport');
  const templateForm = document.getElementById('template-form');
  const templateList = document.getElementById('template-list');
  const templateToggle = document.getElementById('template-toggle');
  const templateKind = document.getElementById('template-kind');
  const templateName = document.getElementById('template-name');
  const addForm = document.getElementById('add-plan-form');
  const addDetails = document.getElementById('add-plan-details');
  const addTemplate = document.getElementById('add-template');
  const addRepeat = document.getElementById('add-repeat');
  const addStartDate = document.getElementById('add-start-date');
  const addUntilDate = document.getElementById('add-until-date');
  const addStartTime = document.getElementById('add-start-time');
  const addEndTime = document.getElementById('add-end-time');
  const addLocation = document.getElementById('add-location');
  const addBreak = document.getElementById('add-break');
  const addPreview = document.getElementById('add-preview');
  const weekdayRows = [...document.querySelectorAll('.hs-weekday-schedule > label')];
  const calendarGrid = document.getElementById('calendar-grid');
  const dateStrip = document.getElementById('date-strip');
  const calendarTitle = document.getElementById('calendar-title');
  const selectedDateLabel = document.getElementById('selected-date-label');
  const dayList = document.getElementById('day-list');
  const monthLabel = document.getElementById('month-label');
  const monthSummary = document.getElementById('month-summary');
  const calendarToggle = document.getElementById('calendar-toggle');
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  let selectedDate = LM.todayStr();
  let shownMonth = new Date(`${selectedDate}T00:00:00`);
  let scrollTimer;

  loadWageSettings();
  document.getElementById('add-start-date').value = selectedDate;
  document.getElementById('add-until-date').value = LM.scheduleDateKey(new Date(
    shownMonth.getFullYear(),
    shownMonth.getMonth() + 3,
    shownMonth.getDate()
  ));
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
    if (!templateForm.hidden) templateName.focus();
  });
  templateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = templateName.value.trim();
    if (!name) {
      templateName.focus();
      return;
    }
    const templates = getTemplates();
    const template = {
      id: LM.uid(),
      kind: templateKind.value,
      name,
    };
    if (!LM.set(LM.KEYS.SHIFT_TEMPLATES, templates.concat(template))) return;
    templateForm.reset();
    templateForm.hidden = true;
    templateToggle.setAttribute('aria-expanded', 'false');
    renderTemplates();
    addTemplate.value = template.id;
    updateAddForm();
    addDetails.open = true;
    LM.showToast('予定テンプレートを登録しました');
  });
  templateList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-template], [data-delete-template]');
    if (!button) return;
    if (button.dataset.addTemplate) {
      addTemplate.value = button.dataset.addTemplate;
      updateAddForm();
      addDetails.open = true;
      addStartDate.value = selectedDate;
      addStartDate.focus();
      return;
    }
    const id = button.dataset.deleteTemplate;
    if (!confirm('このテンプレートを削除しますか? 登録済みの予定は削除されません。')) return;
    if (!LM.set(LM.KEYS.SHIFT_TEMPLATES, getTemplates().filter((item) => item.id !== id))) return;
    renderTemplates();
    updateAddForm();
  });

  addTemplate.addEventListener('change', updateAddForm);
  addRepeat.addEventListener('change', updateAddForm);
  addForm.addEventListener('input', updatePreview);
  weekdayRows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      row.querySelectorAll('input[type="time"]').forEach((input) => {
        input.disabled = !checkbox.checked;
      });
      updatePreview();
    });
  });
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addPlansToCalendar();
  });

  document.getElementById('calendar-prev').addEventListener('click', () => moveMonth(-1));
  document.getElementById('calendar-next').addEventListener('click', () => moveMonth(1));
  document.getElementById('today-button').addEventListener('click', goToToday);
  calendarToggle.addEventListener('click', () => {
    const showCalendar = calendarGrid.hidden;
    calendarGrid.hidden = !showCalendar;
    dateStrip.hidden = showCalendar;
    calendarToggle.textContent = showCalendar ? '日付スライダー' : 'カレンダー';
    calendarToggle.setAttribute('aria-pressed', String(showCalendar));
    if (!showCalendar) updateDateStripSelection(true);
  });
  calendarGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (button) selectDate(button.dataset.date, false);
  });
  dateStrip.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (button) selectDate(button.dataset.date, true);
  });
  dateStrip.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(selectCenteredDate, 100);
  }, { passive: true });

  dayList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-id], [data-delete-series]');
    if (!button) return;
    const seriesId = button.dataset.deleteSeries;
    if (seriesId) {
      if (!confirm('このくり返し予定をすべて削除しますか?')) return;
      if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).filter((item) => item.seriesId !== seriesId))) return;
    } else {
      const id = button.dataset.deleteId;
      if (!confirm('この予定を削除しますか?')) return;
      if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).filter((item) => item.id !== id))) return;
    }
    renderAll();
  });

  function getTemplates() {
    return LM.get(LM.KEYS.SHIFT_TEMPLATES, []);
  }

  function renderTemplates() {
    const templates = getTemplates();
    templateList.replaceChildren();
    if (templates.length === 0) {
      templateList.innerHTML = '<p class="lm-empty">テンプレートはありません。「予定を登録」から作成してください。</p>';
    }
    templates.forEach((template) => {
      const row = document.createElement('div');
      row.className = 'hs-template-row';
      const name = document.createElement('div');
      name.className = 'hs-template-name';
      const title = document.createElement('strong');
      title.textContent = template.name;
      const kind = document.createElement('span');
      kind.textContent = template.kind === 'class' ? '授業・履修' : 'アルバイトのシフト';
      name.append(title, kind);

      const actions = document.createElement('div');
      actions.className = 'hs-template-actions';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'lm-btn';
      add.dataset.addTemplate = template.id;
      add.textContent = '予定を追加';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lm-btn secondary';
      remove.dataset.deleteTemplate = template.id;
      remove.textContent = '削除';
      actions.append(add, remove);
      row.append(name, actions);
      templateList.appendChild(row);
    });
    updateAddForm();
  }

  function updateAddForm() {
    const templates = getTemplates();
    const currentId = addTemplate.value;
    addTemplate.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = templates.length ? '選択してください' : '先にテンプレートを登録してください';
    addTemplate.appendChild(placeholder);
    templates.forEach((template) => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = `${template.name} (${template.kind === 'class' ? '授業' : 'シフト'})`;
      addTemplate.appendChild(option);
    });
    if (templates.some((template) => template.id === currentId)) addTemplate.value = currentId;
    const weekly = addRepeat.value === 'weekly';
    document.querySelectorAll('.hs-repeat-fields').forEach((field) => { field.hidden = !weekly; });
    document.querySelectorAll('.hs-once-fields').forEach((field) => { field.hidden = weekly; });
    addUntilDate.required = weekly;
    const template = templates.find((item) => item.id === addTemplate.value);
    document.querySelector('.hs-add-shift-only').hidden = !template || template.kind === 'class';
    addForm.querySelector('button[type="submit"]').disabled = templates.length === 0;
    weekdayRows.forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      row.querySelectorAll('input[type="time"]').forEach((input) => {
        input.disabled = !checkbox.checked;
      });
    });
    updatePreview();
  }

  function addPlansToCalendar() {
    const template = getTemplates().find((item) => item.id === addTemplate.value);
    if (!template) {
      LM.showToast('予定テンプレートを選択してください', 'error');
      return;
    }
    if (!addStartDate.value) {
      LM.showToast('開始日を選択してください', 'error');
      return;
    }
    const weekly = addRepeat.value === 'weekly';
    if (weekly && (!addUntilDate.value || addUntilDate.value < addStartDate.value)) {
      LM.showToast('終了日は開始日以降の日付にしてください', 'error');
      return;
    }

    const occurrences = [];
    if (weekly) {
      const weekdays = weekdayRows
        .filter((row) => row.querySelector('input[type="checkbox"]').checked)
        .map((row) => ({
          day: Number(row.querySelector('input[type="checkbox"]').value),
          start: row.querySelector('[data-weekday-start]').value,
          end: row.querySelector('[data-weekday-end]').value,
        }));
      if (weekdays.length === 0) {
        LM.showToast('曜日を1つ以上選んでください', 'error');
        return;
      }
      if (weekdays.some((day) => Boolean(day.start) !== Boolean(day.end))) {
        LM.showToast('開始時刻と終了時刻は両方入力するか、両方空欄にしてください', 'error');
        return;
      }
      const byWeekday = new Map(weekdays.map((day) => [day.day, day]));
      const date = new Date(`${addStartDate.value}T00:00:00`);
      const until = new Date(`${addUntilDate.value}T00:00:00`);
      while (date <= until && occurrences.length <= 400) {
        const schedule = byWeekday.get(date.getDay());
        if (schedule) {
          occurrences.push({
            date: LM.scheduleDateKey(date),
            start: schedule.start,
            end: schedule.end,
          });
        }
        date.setDate(date.getDate() + 1);
      }
    } else {
      if (Boolean(addStartTime.value) !== Boolean(addEndTime.value)) {
        LM.showToast('開始時刻と終了時刻は両方入力するか、両方空欄にしてください', 'error');
        return;
      }
      occurrences.push({
        date: addStartDate.value,
        start: addStartTime.value,
        end: addEndTime.value,
      });
    }

    if (occurrences.length > 400) {
      LM.showToast('一度に登録できるのは400件までです。期間を分けてください', 'error');
      return;
    }
    if (occurrences.length === 0) {
      LM.showToast('指定した曜日に該当する日がありません', 'error');
      return;
    }

    const seriesId = weekly ? LM.uid() : null;
    const breakMin = template.kind === 'class' ? 0 : Math.max(0, Number(addBreak.value) || 0);
    const records = occurrences.map((item) => ({
      id: LM.uid(),
      ...(seriesId ? { seriesId } : {}),
      templateId: template.id,
      date: item.date,
      kind: template.kind,
      name: template.name,
      location: addLocation.value.trim(),
      start: item.start,
      end: item.end,
      breakMin,
    }));
    if (!LM.set(LM.KEYS.SHIFTS, LM.get(LM.KEYS.SHIFTS, []).concat(records))) return;
    selectedDate = records[0].date;
    shownMonth = new Date(`${selectedDate}T00:00:00`);
    addStartDate.value = selectedDate;
    renderAll();
    addDetails.open = false;
    addRepeat.value = 'once';
    addUntilDate.value = '';
    addStartTime.value = '';
    addEndTime.value = '';
    addLocation.value = '';
    addBreak.value = '0';
    weekdayRows.forEach((row) => {
      row.querySelector('input[type="checkbox"]').checked = false;
      row.querySelectorAll('input[type="time"]').forEach((input) => {
        input.value = '';
        input.disabled = true;
      });
    });
    updateAddForm();
    LM.showToast(`${records.length}件カレンダーに追加しました`);
  }

  function moveMonth(delta) {
    shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1);
    const today = new Date(`${LM.todayStr()}T00:00:00`);
    selectedDate = shownMonth.getFullYear() === today.getFullYear() && shownMonth.getMonth() === today.getMonth()
      ? LM.todayStr()
      : LM.scheduleDateKey(shownMonth);
    updateAddDateDefaults();
    renderAll();
  }

  function goToToday() {
    selectedDate = LM.todayStr();
    shownMonth = new Date(`${selectedDate}T00:00:00`);
    updateAddDateDefaults();
    renderAll();
  }

  function selectDate(date, center) {
    selectedDate = date;
    updateAddDateDefaults();
    const selected = new Date(`${date}T00:00:00`);
    if (selected.getMonth() !== shownMonth.getMonth() || selected.getFullYear() !== shownMonth.getFullYear()) {
      shownMonth = selected;
      renderAll();
      return;
    }
    renderDayList();
    renderCalendarSelection();
    updateDateStripSelection(center);
  }

  function selectCenteredDate() {
    const centerX = dateStrip.getBoundingClientRect().left + dateStrip.clientWidth / 2;
    const buttons = [...dateStrip.querySelectorAll('[data-date]')];
    if (buttons.length === 0) return;
    const closest = buttons.reduce((best, button) => {
      const center = button.getBoundingClientRect().left + button.offsetWidth / 2;
      const distance = Math.abs(center - centerX);
      return distance < best.distance ? { button, distance } : best;
    }, { button: buttons[0], distance: Infinity }).button;
    if (closest.dataset.date !== selectedDate) selectDate(closest.dataset.date, false);
  }

  function updateDateStripSelection(center) {
    dateStrip.querySelectorAll('[data-date]').forEach((button) => {
      const active = button.dataset.date === selectedDate;
      button.setAttribute('aria-pressed', String(active));
      if (active && center) {
        const stripLeft = dateStrip.getBoundingClientRect().left;
        const buttonLeft = button.getBoundingClientRect().left;
        const left = dateStrip.scrollLeft + buttonLeft - stripLeft
          - (dateStrip.clientWidth - button.offsetWidth) / 2;
        dateStrip.scrollTo({ left, behavior: 'smooth' });
      }
    });
  }

  function updateAddDateDefaults() {
    addStartDate.value = selectedDate;
    if (addUntilDate.value < selectedDate) {
      const date = new Date(`${selectedDate}T00:00:00`);
      addUntilDate.value = LM.scheduleDateKey(new Date(date.getFullYear(), date.getMonth() + 3, date.getDate()));
    }
  }

  function renderAll() {
    renderDateStrip();
    renderCalendar();
    renderDayList();
    renderMonthSummary();
  }

  function renderDateStrip() {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    calendarTitle.textContent = `${year}年${month + 1}月`;
    dateStrip.replaceChildren();
    for (let day = 1; day <= days; day += 1) {
      const date = LM.scheduleDateKey(new Date(year, month, day));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hs-date-chip';
      button.dataset.date = date;
      button.setAttribute('aria-pressed', String(date === selectedDate));
      const dateObj = new Date(`${date}T00:00:00`);
      const weekday = document.createElement('span');
      weekday.textContent = WEEKDAYS[dateObj.getDay()];
      const dayNumber = document.createElement('strong');
      dayNumber.textContent = String(day);
      button.append(weekday, dayNumber);
      if (date === LM.todayStr()) button.classList.add('is-today');
      dateStrip.appendChild(button);
    }
    requestAnimationFrame(() => updateDateStripSelection(true));
  }

  function renderCalendar() {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const byDate = groupByDate(LM.get(LM.KEYS.SHIFTS, []));
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
      if (key === LM.todayStr()) button.classList.add('is-today');
      const number = document.createElement('span');
      number.className = 'hs-calendar-number';
      number.textContent = String(day);
      button.appendChild(number);
      events.slice(0, 2).forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `hs-calendar-chip${item.kind === 'class' ? ' is-class' : ''}`;
        chip.textContent = item.name || (item.kind === 'class' ? '授業' : 'シフト');
        button.appendChild(chip);
      });
      if (events.length > 2) {
        const more = document.createElement('span');
        more.className = 'hs-calendar-more';
        more.textContent = `+${events.length - 2}件`;
        button.appendChild(more);
      }
      calendarGrid.appendChild(button);
    }
    renderCalendarSelection();
  }

  function renderCalendarSelection() {
    calendarGrid.querySelectorAll('[data-date]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.date === selectedDate));
    });
  }

  function renderDayList() {
    const events = (groupByDate(LM.get(LM.KEYS.SHIFTS, [])).get(selectedDate) || [])
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const date = new Date(`${selectedDate}T00:00:00`);
    selectedDateLabel.textContent = `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})`;
    dayList.replaceChildren();
    if (events.length === 0) {
      dayList.innerHTML = '<p class="lm-empty">この日の予定はありません</p>';
      return;
    }
    events.forEach((item) => {
      const row = document.createElement('article');
      row.className = `hs-day-item${item.kind === 'class' ? ' is-class' : ''}`;
      const detail = document.createElement('div');
      detail.className = 'hs-day-detail';
      const title = document.createElement('strong');
      title.textContent = item.name || (item.kind === 'class' ? '授業' : 'シフト');
      const time = document.createElement('span');
      time.textContent = item.start && item.end ? `${item.start}〜${item.end}` : '時間未設定';
      detail.append(title, time);
      if (item.location) {
        const location = document.createElement('span');
        location.className = 'hs-day-location';
        location.textContent = item.location;
        detail.appendChild(location);
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
      actions.appendChild(createDeleteButton(item.id, item.seriesId ? 'この日だけ削除' : '削除'));
      if (item.seriesId) {
        const removeSeries = createDeleteButton('', '全期間を削除');
        removeSeries.dataset.deleteSeries = item.seriesId;
        actions.appendChild(removeSeries);
      }
      row.appendChild(actions);
      dayList.appendChild(row);
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
    const shiftTimes = addRepeat.value === 'weekly'
      ? weekdayRows
        .filter((row) => row.querySelector('input[type="checkbox"]').checked)
        .map((row) => ({
          start: row.querySelector('[data-weekday-start]').value,
          end: row.querySelector('[data-weekday-end]').value,
        }))
      : [{ start: addStartTime.value, end: addEndTime.value }];
    if (!shiftTimes.some((item) => item.start && item.end)) {
      addPreview.textContent = '時間未設定の勤務は給与見込みに含まれません';
      return;
    }
    const shifts = shiftTimes
      .filter((item) => item.start && item.end)
      .map((item) => ({ ...item, breakMin: Number(addBreak.value) || 0 }));
    const wage = getWageSettings();
    const pay = shifts.reduce((sum, item) => sum + calculatePay(item, wage), 0);
    const period = addRepeat.value === 'weekly' ? '週あたり' : '1回分';
    const countLabel = addRepeat.value === 'weekly' ? `${shifts.length}曜日分` : '勤務分';
    addPreview.textContent = `見込み給与(${countLabel}): ¥${pay.toLocaleString()} / ${period}`;
  }

  function groupByDate(items) {
    const grouped = new Map();
    items.forEach((item) => {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    });
    return grouped;
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
})();
