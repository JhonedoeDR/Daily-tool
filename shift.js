(function () {
  const wageInput = document.getElementById('f-wage');
  const transportInput = document.getElementById('f-transport');
  const shiftForm = document.getElementById('shift-form');
  const kindInput = document.getElementById('f-kind');
  const repeatInput = document.getElementById('f-repeat');
  const nameInput = document.getElementById('f-name');
  const locationInput = document.getElementById('f-location');
  const dateInput = document.getElementById('f-date');
  const repeatUntilInput = document.getElementById('f-repeat-until');
  const weekdayInputs = [...document.querySelectorAll('input[name="weekday"]')];
  const startInput = document.getElementById('f-start');
  const endInput = document.getElementById('f-end');
  const breakInput = document.getElementById('f-break');
  const preview = document.getElementById('calc-preview');
  const calendarGrid = document.getElementById('calendar-grid');
  const calendarTitle = document.getElementById('calendar-title');
  const selectedDateLabel = document.getElementById('selected-date-label');
  const dayList = document.getElementById('day-list');
  const monthLabel = document.getElementById('month-label');
  const monthSummary = document.getElementById('month-summary');
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  let selectedDate = LM.todayStr();
  let shownMonth = new Date(`${selectedDate}T00:00:00`);

  loadWageSettings();
  dateInput.value = selectedDate;
  repeatUntilInput.value = LM.scheduleDateKey(new Date(
    shownMonth.getFullYear(),
    shownMonth.getMonth() + 2,
    shownMonth.getDate()
  ));
  renderAll();
  updateFormMode();
  updatePreview();
  LM.renderNav(document.getElementById('nav-container'));

  wageInput.addEventListener('input', saveWageSettings);
  transportInput.addEventListener('input', saveWageSettings);
  repeatInput.addEventListener('change', updateFormMode);
  kindInput.addEventListener('change', () => {
    updateFormMode();
    updatePreview();
  });
  [startInput, endInput, breakInput].forEach((el) => el.addEventListener('input', updatePreview));

  document.getElementById('calendar-prev').addEventListener('click', () => moveMonth(-1));
  document.getElementById('calendar-next').addEventListener('click', () => moveMonth(1));

  shiftForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    if (repeatInput.value === 'weekly' && repeatUntilInput.value < dateInput.value) {
      LM.showToast('終了日は開始日以降の日付にしてください', 'error');
      return;
    }
    const weekdays = weekdayInputs.filter((input) => input.checked).map((input) => Number(input.value));
    if (repeatInput.value === 'weekly' && weekdays.length === 0) {
      LM.showToast('くり返す曜日を1つ以上選んでください', 'error');
      return;
    }

    const dates = repeatInput.value === 'weekly'
      ? getWeeklyDates(dateInput.value, repeatUntilInput.value, weekdays)
      : [dateInput.value];
    if (dates.length > 400) {
      LM.showToast('一度に登録できるのは400件までです。期間を分けて登録してください', 'error');
      return;
    }
    if (dates.length === 0) {
      LM.showToast('指定した期間に該当する曜日がありません', 'error');
      return;
    }

    const shifts = LM.get(LM.KEYS.SHIFTS, []);
    const seriesId = repeatInput.value === 'weekly' ? LM.uid() : null;
    const records = dates.map((date) => ({
      id: LM.uid(),
      ...(seriesId ? { seriesId } : {}),
      date,
      kind: kindInput.value,
      name,
      location: locationInput.value.trim(),
      start: startInput.value,
      end: endInput.value,
      breakMin: kindInput.value === 'shift' ? Math.max(0, Number(breakInput.value) || 0) : 0,
    }));
    if (!LM.set(LM.KEYS.SHIFTS, shifts.concat(records))) return;

    selectedDate = dates[0];
    shownMonth = new Date(`${selectedDate}T00:00:00`);
    renderAll();
    shiftForm.reset();
    dateInput.value = selectedDate;
    repeatUntilInput.value = LM.scheduleDateKey(new Date(
      shownMonth.getFullYear(),
      shownMonth.getMonth() + 2,
      shownMonth.getDate()
    ));
    breakInput.value = '0';
    updateFormMode();
    updatePreview();
    LM.showToast(`${records.length}件登録しました`);
  });

  dayList.addEventListener('click', (e) => {
    const button = e.target.closest('[data-delete-id], [data-delete-series]');
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

  function updateFormMode() {
    const weekly = repeatInput.value === 'weekly';
    document.querySelectorAll('.hs-weekly-only').forEach((el) => { el.hidden = !weekly; });
    repeatUntilInput.required = weekly;
    document.querySelectorAll('.hs-shift-only').forEach((el) => {
      el.hidden = kindInput.value !== 'shift';
    });
  }

  function moveMonth(delta) {
    shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1);
    selectedDate = LM.scheduleDateKey(shownMonth);
    renderAll();
  }

  function renderAll() {
    renderCalendar();
    renderDayList();
    renderMonthSummary();
  }

  function renderCalendar() {
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const byDate = groupByDate(LM.get(LM.KEYS.SHIFTS, []));

    calendarTitle.textContent = `${year}年${month + 1}月`;
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
      button.setAttribute('aria-pressed', key === selectedDate ? 'true' : 'false');
      if (key === LM.todayStr()) button.classList.add('is-today');
      button.innerHTML = `<span class="hs-calendar-number">${day}</span>`;
      events.slice(0, 2).forEach((event) => {
        const chip = document.createElement('span');
        chip.className = `hs-calendar-chip${event.kind === 'class' ? ' is-class' : ''}`;
        chip.textContent = event.name || (event.kind === 'class' ? '授業' : 'シフト');
        button.appendChild(chip);
      });
      if (events.length > 2) {
        const more = document.createElement('span');
        more.className = 'hs-calendar-more';
        more.textContent = `+${events.length - 2}件`;
        button.appendChild(more);
      }
      button.addEventListener('click', () => {
        selectedDate = key;
        renderCalendar();
        renderDayList();
      });
      calendarGrid.appendChild(button);
    }
  }

  function renderDayList() {
    const events = (groupByDate(LM.get(LM.KEYS.SHIFTS, [])).get(selectedDate) || [])
      .sort((a, b) => a.start.localeCompare(b.start));
    const date = new Date(`${selectedDate}T00:00:00`);
    selectedDateLabel.textContent = `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})`;
    dayList.replaceChildren();

    if (events.length === 0) {
      dayList.innerHTML = '<p class="lm-empty">この日の予定はありません</p>';
      return;
    }

    events.forEach((event) => {
      const row = document.createElement('article');
      row.className = `hs-day-item${event.kind === 'class' ? ' is-class' : ''}`;
      const detail = document.createElement('div');
      detail.className = 'hs-day-detail';
      const title = document.createElement('strong');
      title.textContent = event.name || (event.kind === 'class' ? '授業' : 'シフト');
      const time = document.createElement('span');
      time.textContent = `${event.start}〜${event.end}`;
      detail.append(title, time);
      if (event.location) {
        const location = document.createElement('span');
        location.className = 'hs-day-location';
        location.textContent = event.location;
        detail.appendChild(location);
      }
      if (event.kind !== 'class') {
        const wage = getWageSettings();
        const { pay } = LM.calcShiftPay(event, wage);
        const payLabel = document.createElement('span');
        payLabel.className = 'hs-day-pay';
        payLabel.textContent = `見込み ¥${pay.toLocaleString()}`;
        detail.appendChild(payLabel);
      }
      row.appendChild(detail);

      const actions = document.createElement('div');
      actions.className = 'hs-day-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lm-btn secondary hs-delete';
      remove.dataset.deleteId = event.id;
      remove.textContent = event.seriesId ? 'この日だけ削除' : '削除';
      actions.appendChild(remove);
      if (event.seriesId) {
        const removeSeries = document.createElement('button');
        removeSeries.type = 'button';
        removeSeries.className = 'lm-btn secondary hs-delete';
        removeSeries.dataset.deleteSeries = event.seriesId;
        removeSeries.textContent = '全期間を削除';
        actions.appendChild(removeSeries);
      }
      row.appendChild(actions);
      dayList.appendChild(row);
    });
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

    const totalPay = shifts.reduce((sum, item) => sum + LM.calcShiftPay(item, wageSettings).pay, 0);
    const totalTransport = shifts.length * (wageSettings.transportFee || 0);
    monthSummary.innerHTML = `
      <span>勤務日数 ${shifts.length}日</span>
      <span class="lm-shift-pay">給与合計 ¥${totalPay.toLocaleString()}</span>
      <span>交通費合計 ¥${totalTransport.toLocaleString()}</span>
    `;
  }

  function groupByDate(items) {
    const grouped = new Map();
    items.forEach((item) => {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    });
    return grouped;
  }

  function getWeeklyDates(from, until, weekdays) {
    const date = new Date(`${from}T00:00:00`);
    const end = new Date(`${until}T00:00:00`);
    const dates = [];
    while (date <= end && dates.length <= 400) {
      if (weekdays.includes(date.getDay())) {
        dates.push(LM.scheduleDateKey(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return dates;
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
  }

  function getWageSettings() {
    return LM.get(LM.KEYS.WAGE_SETTINGS, { hourlyWage: 0, transportFee: 0 });
  }

  function updatePreview() {
    if (kindInput.value !== 'shift' || !startInput.value || !endInput.value) {
      preview.textContent = '';
      return;
    }
    const { workMin, pay } = LM.calcShiftPay(
      { start: startInput.value, end: endInput.value, breakMin: Number(breakInput.value) || 0 },
      getWageSettings()
    );
    const h = Math.floor(workMin / 60);
    const m = workMin % 60;
    preview.innerHTML = `実働 <strong>${h}時間${m}分</strong> ・ 見込み給与 <strong>¥${pay.toLocaleString()}</strong>(1回分)`;
  }
})();
