(function () {
  'use strict';

  const KEY = 'lm_todoManager';
  const $ = (id) => document.getElementById(id);
  const form = $('todo-create-form');
  if (!form) return;

  LM.renderNav(document.getElementById('nav-container'));

  let data;
  let createTab = 'main';
  let editingId = null;
  let pageIndex = 0;
  let sortDescending = false;
  let archiveMode = false;
  const selectedTaskIds = new Set();
  let customNotifications = [];
  const pageSize = 5;
  const dayMs = 24 * 60 * 60 * 1000;
  data = load();
  save();

  function uid() {
    return 'tm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }
  function routinePeriodKey(period, date = new Date()) {
    if (period === 'weekly') return LM.todoMondayKey(date);
    if (period === 'monthly') return LM.routineMonthKey(date);
    return LM.todoDayKey(date);
  }
  function normalizeNotifications(value) {
    const notify = value && typeof value === 'object' ? value : {};
    const validTimes = (Array.isArray(notify.times) ? notify.times : [])
      .filter(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
    const custom = (Array.isArray(notify.custom) ? notify.custom : [])
      .filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || ''))
      .map(item => ({ date: item.date, time: item.time }));
    return {
      weekdays: [...new Set((Array.isArray(notify.weekdays) ? notify.weekdays : [])
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))],
      times: [...new Set(validTimes)],
      custom: [...new Map(custom.map(item => [`${item.date}:${item.time}`, item])).values()]
    };
  }
  function taskExpired(task, today = todayKey()) {
    return !!task.endDate && task.endDate < today;
  }
  function archiveExpiredTasks() {
    let changed = false;
    const now = Date.now();
    const expiredIds = new Set();
    data.tasks.forEach(task => {
      if (!task.archivedAt && taskExpired(task)) {
        const [year, month, day] = task.endDate.split('-').map(Number);
        task.archivedAt = new Date(year, month - 1, day + 1).getTime();
        changed = true;
      }
      if (task.archivedAt && now - task.archivedAt >= 7 * dayMs) {
        expiredIds.add(task.id);
        changed = true;
      }
    });
    if (expiredIds.size) {
      data.tasks = data.tasks.filter(task => !expiredIds.has(task.id));
      data.tasks.forEach(task => {
        task.linkedTaskIds = task.linkedTaskIds.filter(id => !expiredIds.has(id));
        expiredIds.forEach(id => delete task.linkGroups[id]);
      });
      expiredIds.forEach(id => selectedTaskIds.delete(id));
    }
    return changed;
  }
  function safeLinkUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Array.isArray(raw.tasks)) return {
        version: 1, tasks: raw.tasks.map(normalizeTask), legacyMigrated: !!raw.legacyMigrated,
        weeklyCounted: raw.weeklyCounted && typeof raw.weeklyCounted === 'object' ? raw.weeklyCounted : {},
        routineCounted: raw.routineCounted && typeof raw.routineCounted === 'object' ? raw.routineCounted : {}
      };
    } catch (e) { console.warn('Todo manager data could not be read', e); }
    return { version: 1, tasks: [], legacyMigrated: false, weeklyCounted: {}, routineCounted: {} };
  }
  function normalizeTask(t) {
    const task = t && typeof t === 'object' ? t : {};
    const category = ['main', 'routine', 'other'].includes(task.category) ? task.category : 'other';
    const routinePeriod = ['daily', 'weekdays', 'weekly', 'monthly'].includes(task.routinePeriod)
      ? task.routinePeriod : 'daily';
    const checkedAt = Number(task.checkedAt) || 0;
    const checkedDay = String(task.checkedDay || (checkedAt && category === 'routine'
      ? routinePeriodKey(routinePeriod, new Date(checkedAt)) : ''));
    return {
      id: String(task.id || uid()), category,
      name: String(task.name || ''), startDate: String(task.startDate || ''), endDate: String(task.endDate || ''),
      checked: !!task.checked && (category !== 'routine' || checkedDay === routinePeriodKey(routinePeriod)),
      checkedAt, checkedDay,
      createdAt: Number(task.createdAt) || 0,
      archivedAt: Number(task.archivedAt) || 0,
      notifications: normalizeNotifications(task.notifications),
      routinePeriod,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(s => ({
        id: String(s && s.id || uid()), name: String(s && s.name || ''), checked: !!(s && s.checked)
      })) : [],
      links: Array.isArray(task.links) ? task.links.map(l => ({
        url: safeLinkUrl(String(l && l.url || '')), label: String(l && l.label || '')
      })) : [],
      linkedTaskIds: Array.isArray(task.linkedTaskIds) ? task.linkedTaskIds.map(String) : [],
      linkMode: ['all', 'sequence', 'custom'].includes(task.linkMode) ? task.linkMode : 'all',
      linkGroups: task.linkGroups && typeof task.linkGroups === 'object' ? task.linkGroups : {}
    };
  }
  function save() {
    archiveExpiredTasks();
    const currentMonth = todayKey().slice(0, 7);
    data.weeklyCounted = Object.fromEntries(Object.entries(data.weeklyCounted)
      .filter(([week]) => week === weekKey()));
    data.routineCounted = Object.fromEntries(Object.entries(data.routineCounted)
      .filter(([period]) => period.startsWith(currentMonth) || period === weekKey()));
    const saved = LM.set(KEY, data);
    if (saved && LM.syncFirebaseDebounced) LM.syncFirebaseDebounced();
    return saved;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function todayKey() {
    return window.LM && LM.todoDayKey ? LM.todoDayKey() : new Date().toISOString().slice(0, 10);
  }
  function weekKey() {
    return window.LM && LM.todoMondayKey ? LM.todoMondayKey() : todayKey();
  }
  function categoryLabel(c) { return c === 'main' ? 'メイン' : c === 'routine' ? 'ルーティン' : 'その他'; }
  function routinePeriodLabel(period) {
    return ({ daily: '毎日', weekdays: '平日', weekly: '毎週', monthly: '毎月' })[period] || '毎日';
  }
  function visibleLinkedIds(parent, byId) {
    const ids = parent.linkedTaskIds.filter(id => byId.has(id));
    if (parent.linkMode === 'all') return ids;
    const groups = ids.map((id, index) => ({
      id, group: parent.linkMode === 'sequence' ? index + 1 : Math.max(1, Number(parent.linkGroups[id]) || 1)
    }));
    const current = groups.reduce((min, x) => {
      const t = byId.get(x.id);
      return t && !t.checked ? Math.min(min, x.group) : min;
    }, Infinity);
    return groups.filter(x => x.group === current).map(x => x.id);
  }
  function linkedAncestors(taskId) {
    const parents = new Map();
    data.tasks.forEach(task => task.linkedTaskIds.forEach(id => {
      const list = parents.get(id) || [];
      list.push(task.id);
      parents.set(id, list);
    }));
    const ancestors = new Set();
    const queue = [...(parents.get(taskId) || [])];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor];
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      queue.push(...(parents.get(id) || []));
    }
    return ancestors;
  }
  function linkedCycleIds(byId) {
    const adjacency = new Map(data.tasks.map(task => [
      task.id, task.linkedTaskIds.filter(id => byId.has(id))
    ]));
    const state = new Map();
    const path = [];
    const pathIndexes = new Map();
    const cycleIds = new Set();
    data.tasks.forEach(task => {
      if (state.has(task.id)) return;
      const stack = [{ id: task.id, childIndex: 0 }];
      state.set(task.id, 1);
      pathIndexes.set(task.id, path.length);
      path.push(task.id);
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const children = adjacency.get(frame.id);
        if (frame.childIndex >= children.length) {
          stack.pop();
          state.set(frame.id, 2);
          path.pop();
          pathIndexes.delete(frame.id);
          continue;
        }
        const childId = children[frame.childIndex];
        frame.childIndex += 1;
        if (state.get(childId) === 1) {
          const cycleStart = pathIndexes.get(childId);
          path.slice(cycleStart).forEach(id => cycleIds.add(id));
        } else if (!state.has(childId)) {
          state.set(childId, 1);
          pathIndexes.set(childId, path.length);
          path.push(childId);
          stack.push({ id: childId, childIndex: 0 });
        }
      }
    });
    return cycleIds;
  }
  function allVisibleIds() {
    const referenced = new Set(data.tasks.flatMap(task => task.linkedTaskIds));
    const byId = new Map(data.tasks.map(task => [task.id, task]));
    const visible = new Set();
    const queue = data.tasks.filter(task => !referenced.has(task.id));
    linkedCycleIds(byId).forEach(id => queue.push(byId.get(id)));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const parent = queue[cursor];
      if (visible.has(parent.id)) continue;
      visible.add(parent.id);
      const childIds = parent.linkMode === 'all'
        ? parent.linkedTaskIds
        : visibleLinkedIds(parent, byId);
      childIds.forEach(id => {
        const child = byId.get(id);
        if (child && !visible.has(child.id)) queue.push(child);
      });
    }
    return [...visible];
  }

  function resetForm() {
    editingId = null;
    $('todo-edit-id').value = '';
    $('todo-task-name').value = '';
    $('todo-start-date').value = '';
    $('todo-end-date').value = '';
    $('todo-start-date').setCustomValidity('');
    $('todo-end-date').setCustomValidity('');
    $('todo-link-mode').value = 'all';
    $('todo-routine-period-select').value = 'daily';
    $('todo-subtasks').innerHTML = '';
    $('todo-links').innerHTML = '';
    setNotificationEditor({});
    $('todo-advanced').open = false;
    $('todo-save-button').textContent = 'タスクを追加';
    $('todo-cancel-edit').textContent = '閉じる';
    renderLinkedChoices();
    renderCustomGroups();
  }
  function setCreateTab(tab) {
    createTab = tab;
    form.setAttribute('aria-labelledby', `todo-tab-${tab}`);
    document.querySelectorAll('[data-create-tab]').forEach(b => {
      const active = b.dataset.createTab === tab;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $('todo-form-heading').textContent = categoryLabel(tab) + 'タスクを追加';
    $('todo-date-fields').hidden = false;
    $('todo-routine-period').hidden = tab !== 'routine';
    $('todo-linked-field').hidden = tab === 'routine';
    $('todo-end-date-field').hidden = false;
    resetForm();
  }
  function addSubtask(name = '', checked = false, id = uid()) {
    const row = document.createElement('div');
    row.className = 'todo-editor-row';
    row.dataset.id = id;
    row.innerHTML = `<input type="checkbox" aria-label="項目の達成" ${checked ? 'checked' : ''}><input type="text" maxlength="200" placeholder="項目の名前" value="${esc(name)}"><button type="button" class="lm-todo-slot-remove" aria-label="項目を削除">−</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('todo-subtasks').appendChild(row);
  }
  function addLink(url = '', label = '') {
    const row = document.createElement('div');
    row.className = 'todo-editor-row todo-link-row';
    row.innerHTML = `<input type="url" placeholder="https://..." value="${esc(url)}"><input type="text" placeholder="リンク名（任意）" value="${esc(label)}"><button type="button" class="lm-todo-slot-remove" aria-label="リンクを削除">−</button>`;
    row.querySelector('input[type=url]').addEventListener('input', event => event.currentTarget.setCustomValidity(''));
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('todo-links').appendChild(row);
  }
  function setupNotificationOptions() {
    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
    weekdayNames.forEach((name, day) => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" name="todo-notify-weekday" value="${day}"><span>${name}</span>`;
      $('todo-weekly-days').appendChild(label);
    });
    for (let hour = 0; hour < 24; hour += 1) {
      const time = `${String(hour).padStart(2, '0')}:00`;
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" name="todo-notify-time" value="${time}"><span>${time}</span>`;
      $('todo-weekly-times').appendChild(label);
    }
  }
  function renderCustomNotifications() {
    const list = $('todo-custom-notifications');
    list.replaceChildren();
    customNotifications.forEach((item, index) => {
      const row = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${item.date} ${item.time}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lm-btn secondary';
      remove.textContent = '削除';
      remove.setAttribute('aria-label', `${item.date} ${item.time}の通知を削除`);
      remove.addEventListener('click', () => {
        customNotifications.splice(index, 1);
        renderCustomNotifications();
      });
      row.append(text, remove);
      list.appendChild(row);
    });
  }
  function setNotificationEditor(notifications) {
    const notify = normalizeNotifications(notifications);
    document.querySelectorAll('[name="todo-notify-weekday"]').forEach(input => {
      input.checked = notify.weekdays.includes(Number(input.value));
    });
    document.querySelectorAll('[name="todo-notify-time"]').forEach(input => {
      input.checked = notify.times.includes(input.value);
    });
    customNotifications = notify.custom;
    renderCustomNotifications();
  }
  function readNotificationEditor() {
    return normalizeNotifications({
      weekdays: [...document.querySelectorAll('[name="todo-notify-weekday"]:checked')].map(input => Number(input.value)),
      times: [...document.querySelectorAll('[name="todo-notify-time"]:checked')].map(input => input.value),
      custom: customNotifications
    });
  }
  function renderLinkedChoices(selected = [], groups = {}) {
    const box = $('todo-linked-list');
    box.innerHTML = '';
    const ancestors = editingId ? linkedAncestors(editingId) : new Set();
    const candidates = data.tasks.filter(t => t.category !== 'routine' && t.id !== editingId && !ancestors.has(t.id));
    if (!candidates.length) {
      box.innerHTML = '<p class="todo-help">紐付けできるメイン・その他タスクがありません。</p>';
      return;
    }
    candidates.forEach(t => {
      const row = document.createElement('label');
      row.className = 'todo-linked-choice';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = t.id; cb.checked = selected.includes(t.id);
      const name = document.createElement('span'); name.textContent = t.name;
      const num = document.createElement('input');
      num.type = 'number'; num.min = '1'; num.step = '1'; num.value = groups[t.id] || 1;
      num.className = 'todo-group-number'; num.setAttribute('aria-label', t.name + 'の表示グループ');
      num.hidden = $('todo-link-mode').value !== 'custom';
      cb.addEventListener('change', renderCustomGroups);
      row.append(cb, name, num); box.appendChild(row);
    });
  }
  function renderCustomGroups() {
    const mode = $('todo-link-mode').value;
    document.querySelectorAll('.todo-linked-choice').forEach(row => {
      const selected = row.querySelector('input[type=checkbox]').checked;
      row.querySelector('.todo-group-number').hidden = mode !== 'custom' || !selected;
    });
  }
  function editTask(task) {
    editingId = task.id;
    $('todo-edit-id').value = task.id;
    createTab = task.category;
    form.setAttribute('aria-labelledby', `todo-tab-${createTab}`);
    document.querySelectorAll('[data-create-tab]').forEach(b => {
      const active = b.dataset.createTab === createTab;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $('todo-form-heading').textContent = categoryLabel(createTab) + 'タスクを編集';
    $('todo-date-fields').hidden = false;
    $('todo-routine-period').hidden = createTab !== 'routine';
    $('todo-linked-field').hidden = createTab === 'routine';
    $('todo-end-date-field').hidden = false;
    $('todo-task-name').value = task.name;
    $('todo-start-date').value = task.startDate;
    $('todo-end-date').value = task.endDate;
    $('todo-routine-period-select').value = task.routinePeriod;
    $('todo-subtasks').innerHTML = '';
    task.subtasks.forEach(s => addSubtask(s.name, s.checked, s.id));
    $('todo-links').innerHTML = '';
    task.links.forEach(l => addLink(l.url, l.label));
    $('todo-link-mode').value = task.linkMode;
    renderLinkedChoices(task.linkedTaskIds, task.linkGroups);
    renderCustomGroups();
    setNotificationEditor(task.notifications);
    $('todo-save-button').textContent = '変更を保存';
    $('todo-cancel-edit').textContent = '編集をやめる';
    $('todo-advanced').open = true;
    $('todo-create-dialog').showModal();
    $('todo-task-name').focus();
  }
  function formTask() {
    const name = $('todo-task-name').value.trim();
    if (!name) return null;
    const startDate = $('todo-start-date');
    const endDate = $('todo-end-date');
    endDate.setCustomValidity('');
    if (startDate.value && endDate.value && startDate.value > endDate.value) {
      endDate.setCustomValidity('期限は開始日以降に設定してください。');
      endDate.reportValidity();
      return null;
    }
    const linkRows = [...$('todo-links').children];
    for (const row of linkRows) {
      const input = row.querySelector('input[type=url]');
      input.setCustomValidity('');
      if (input.value.trim() && !safeLinkUrl(input.value.trim())) {
        input.setCustomValidity('リンクにはhttpまたはhttpsのURLを入力してください。');
        input.reportValidity();
        return null;
      }
    }
    const subtasks = [...$('todo-subtasks').children].map(row => ({
      id: row.dataset.id || uid(), checked: row.querySelector('input[type=checkbox]').checked,
      name: row.querySelector('input[type=text]').value.trim()
    })).filter(s => s.name);
    const links = linkRows.map(row => ({
      url: row.querySelector('input[type=url]').value.trim(),
      label: row.querySelectorAll('input')[1].value.trim()
    })).map(link => ({ ...link, url: safeLinkUrl(link.url) })).filter(l => l.url);
    const selected = [...$('todo-linked-list').querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
    const linkGroups = {};
    $('todo-linked-list').querySelectorAll('.todo-linked-choice').forEach(row => {
      const id = row.querySelector('input[type=checkbox]').value;
      linkGroups[id] = Math.max(1, Number(row.querySelector('.todo-group-number').value) || 1);
    });
    return {
      id: editingId || uid(), category: createTab, name,
      createdAt: editingId
        ? (data.tasks.find(t => t.id === editingId)?.createdAt || Date.now())
        : Date.now(),
      startDate: $('todo-start-date').value,
      endDate: $('todo-end-date').value,
      routinePeriod: createTab === 'routine' ? $('todo-routine-period-select').value : 'daily',
      subtasks, links,
      notifications: readNotificationEditor(),
      linkedTaskIds: createTab === 'routine' ? [] : selected,
      linkMode: $('todo-link-mode').value, linkGroups,
      checked: editingId
        ? !!data.tasks.find(t => t.id === editingId)?.checked &&
          (createTab !== 'routine' || data.tasks.find(t => t.id === editingId)?.checkedDay === routinePeriodKey($('todo-routine-period-select').value))
        : false,
      checkedAt: editingId ? (data.tasks.find(t => t.id === editingId)?.checkedAt || 0) : 0,
      checkedDay: editingId ? (data.tasks.find(t => t.id === editingId)?.checkedDay || '') : ''
    };
  }
  function toggleTask(task, checked) {
    if (task.checked === checked) return;
    if (checked && task.category === 'routine' && task.routinePeriod === 'weekdays') {
      const [year, month, day] = todayKey().split('-').map(Number);
      const weekday = new Date(year, month - 1, day).getDay();
      if (weekday === 0 || weekday === 6) return render();
    }
    task.checked = checked;
    task.checkedAt = checked ? Date.now() : 0;
    if (task.category === 'routine' && checked) task.checkedDay = routinePeriodKey(task.routinePeriod);
    if (checked && task.category === 'main') {
      const wk = weekKey();
      const counted = data.weeklyCounted[wk] || (data.weeklyCounted[wk] = {});
      counted[task.id] = true;
    }
    if (checked && task.category === 'routine') {
      const period = routinePeriodKey(task.routinePeriod);
      const counted = data.routineCounted[period] || (data.routineCounted[period] = {});
      counted[task.id] = true;
    }
    save();
    render();
    updateProgressDisplays();
  }
  function updateProgressDisplays() {
    const weeklyTotal = Math.min(LM.TODO_WEEK_TOTAL,
      Object.values(data.weeklyCounted[weekKey()] || {}).filter(Boolean).length);
    const weeklyCount = $('weekly-count');
    if (weeklyCount) weeklyCount.textContent = `${weeklyTotal} / ${LM.TODO_WEEK_TOTAL}`;
    if ($('weekly-grid')) {
      $('weekly-grid').innerHTML = '';
      for (let i = 1; i <= LM.TODO_WEEK_TOTAL; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'lm-week-cell' + (i <= weeklyTotal ? ' is-filled' : '');
        $('weekly-grid').appendChild(cell);
      }
    }
    if ($('reward-box')) $('reward-box').style.display = weeklyTotal >= LM.TODO_WEEK_TOTAL ? 'block' : 'none';
    const dayKey = LM.todoDayKey();
    const [year, month, day] = dayKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const routineSlots = Math.max(3, data.tasks.filter(t => t.category === 'routine' && !t.archivedAt).length);
    const required = Math.ceil(routineSlots * daysInMonth * LM.TODO_ROUTINE_RATE);
    const currentMonth = dayKey.slice(0, 7);
    const routineCount = Object.entries(data.routineCounted)
      .filter(([period]) => period.startsWith(currentMonth) || period === weekKey())
      .reduce((sum, [, counted]) => sum + Object.values(counted || {}).filter(Boolean).length, 0);
    const remain = Math.max(0, required - routineCount);
    const rate = required > 0 ? Math.min(100, Math.round(routineCount / required * 100)) : 0;
    if ($('routine-progress')) {
      $('routine-progress').innerHTML = `<div class="lm-event-top"><span>今月のルーティン</span><span>${rate}%</span></div><div class="lm-progress-track"><div class="lm-progress-fill" style="width:${rate}%"></div></div><div class="lm-event-remain">${routineCount} / ${required}回 ・ 残り${remain}回 ・ 月末まで${daysInMonth - day + 1}日</div>`;
    }
    if ($('routine-reward-box')) $('routine-reward-box').style.display = routineCount >= required ? 'block' : 'none';
  }
  function filteredTasks() {
    const categories = new Set([...document.querySelectorAll('[name="todo-category-filter"]:checked')].map(input => input.value));
    const deadline = document.querySelector('[name="todo-deadline-filter"]:checked')?.value || 'all';
    const sort = $('todo-sort').value;
    const visible = new Set(allVisibleIds());
    let list = data.tasks.filter(task => archiveMode
      ? !!task.archivedAt
      : !task.archivedAt && visible.has(task.id) && categories.has(task.category));
    if (!archiveMode && deadline === 'yes') list = list.filter(task => !!task.endDate);
    if (!archiveMode && deadline === 'no') list = list.filter(task => !task.endDate);
    const started = task => !task.startDate || task.startDate <= todayKey();
    list.sort((a, b) => {
      if (started(a) !== started(b)) return started(a) ? -1 : 1;
      if (sort === 'deadline') {
        if (!a.endDate && b.endDate) return 1;
        if (a.endDate && !b.endDate) return -1;
        if (a.endDate && b.endDate && a.endDate !== b.endDate) {
          return a.endDate.localeCompare(b.endDate) * (sortDescending ? -1 : 1);
        }
        return a.name.localeCompare(b.name, 'ja') * (sortDescending ? -1 : 1);
      }
      return a.name.localeCompare(b.name, 'ja') * (sortDescending ? -1 : 1);
    });
    return list;
  }
  function linkedTaskProgress(task) {
    const linkedIds = new Set(task.linkedTaskIds);
    const linkedTasks = new Map(data.tasks.filter(item => linkedIds.has(item.id)).map(item => [item.id, item]));
    return {
      completed: [...linkedIds].filter(id => linkedTasks.get(id)?.checked).length,
      total: linkedIds.size
    };
  }
  function appendLinkIcon(container) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'todo-link-icon');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10.6 13.4a1 1 0 0 0 1.4 1.4l4.6-4.6a3 3 0 0 0-4.2-4.2l-2.6 2.6m4.2 2a1 1 0 0 0-1.4-1.4L8 13.8a3 3 0 0 0 4.2 4.2l2.6-2.6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    icon.appendChild(path);
    container.appendChild(icon);
  }
  function deleteTask(task) {
    data.tasks = data.tasks.filter(item => item.id !== task.id);
    selectedTaskIds.delete(task.id);
    data.tasks.forEach(item => {
      item.linkedTaskIds = item.linkedTaskIds.filter(id => id !== task.id);
      delete item.linkGroups[task.id];
    });
    if (editingId === task.id) resetForm();
    save();
    render();
    updateProgressDisplays();
  }
  function openTaskDetails(task) {
    const content = document.createElement('div');
    content.className = 'todo-detail';

    const heading = document.createElement('div');
    heading.className = 'todo-detail-heading';
    const completeLabel = document.createElement('label');
    completeLabel.className = 'todo-detail-complete';
    const complete = document.createElement('input');
    complete.type = 'checkbox';
    complete.checked = task.checked;
    complete.disabled = archiveMode;
    complete.setAttribute('aria-label', `${task.name}を完了`);
    const title = document.createElement('span');
    title.textContent = task.name;
    completeLabel.append(complete, title);
    heading.appendChild(completeLabel);
    const category = document.createElement('span');
    category.className = 'todo-category';
    category.textContent = categoryLabel(task.category);
    heading.appendChild(category);
    content.appendChild(heading);

    const period = task.category === 'routine' ? routinePeriodLabel(task.routinePeriod) : '';
    const metadata = document.createElement('p');
    metadata.className = 'todo-detail-meta';
    metadata.textContent = task.endDate
      ? `期限・終了日 ${task.endDate}${task.startDate ? ` ・ 開始日 ${task.startDate}` : ''}`
      : task.startDate ? `開始日 ${task.startDate}${period ? ` ・ ${period}` : ''}`
        : period || '期限なし';
    content.appendChild(metadata);

    complete.addEventListener('change', () => toggleTask(task, complete.checked));
    if (task.category === 'routine' && task.routinePeriod === 'weekdays') {
      const [year, month, day] = todayKey().split('-').map(Number);
      const weekday = new Date(year, month - 1, day).getDay();
      if (weekday === 0 || weekday === 6) {
        complete.disabled = true;
        complete.title = '平日に実施できます';
      }
    }

    if (task.subtasks.length) {
      const subtasks = document.createElement('section');
      subtasks.className = 'todo-detail-section';
      const subheading = document.createElement('h3');
      subheading.textContent = 'チェックボックス小要素';
      subtasks.appendChild(subheading);
      task.subtasks.forEach(subtask => {
        const label = document.createElement('label');
        label.className = 'todo-card-subtask';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = subtask.checked;
        checkbox.disabled = archiveMode;
        checkbox.addEventListener('change', () => {
          subtask.checked = checkbox.checked;
          save();
        });
        const name = document.createElement('span');
        name.textContent = subtask.name;
        label.append(checkbox, name);
        subtasks.appendChild(label);
      });
      content.appendChild(subtasks);
    }

    if (task.links.length) {
      const links = document.createElement('section');
      links.className = 'todo-detail-section';
      const linkHeading = document.createElement('h3');
      linkHeading.textContent = 'リンク';
      links.appendChild(linkHeading);
      task.links.forEach(link => {
        const anchor = document.createElement('a');
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = link.label || link.url;
        links.appendChild(anchor);
      });
      content.appendChild(links);
    }

    if (task.linkedTaskIds.length) {
      const linked = document.createElement('section');
      linked.className = 'todo-detail-section';
      const linkedHeading = document.createElement('h3');
      const progress = linkedTaskProgress(task);
      linkedHeading.textContent = `紐付けタスク ${progress.completed}/${progress.total}`;
      linked.appendChild(linkedHeading);
      const mode = document.createElement('p');
      mode.className = 'todo-detail-meta';
      mode.textContent = `表示方法：${({ all: 'すべて表示', sequence: '順次表示', custom: 'カスタム表示' })[task.linkMode]}`;
      linked.appendChild(mode);
      task.linkedTaskIds.forEach(id => {
        const linkedTask = data.tasks.find(item => item.id === id);
        if (!linkedTask) return;
        const row = document.createElement('div');
        row.className = 'todo-detail-linked-task';
        row.textContent = `${linkedTask.checked ? '✓' : '○'} ${linkedTask.name}`;
        linked.appendChild(row);
      });
      content.appendChild(linked);
    }

    const actions = document.createElement('div');
    actions.className = 'todo-card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'lm-btn secondary';
    edit.textContent = '編集';
    edit.addEventListener('click', () => {
      LM.closeModal();
      editTask(task);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lm-btn secondary';
    remove.textContent = archiveMode ? 'ストレージから削除' : '削除';
    remove.addEventListener('click', () => {
      const message = archiveMode
        ? `「${task.name}」をストレージから削除しますか？この操作は取り消せません。`
        : `「${task.name}」を削除しますか？紐付け先からも選択対象がなくなります。`;
      if (!confirm(message)) return;
      LM.closeModal();
      deleteTask(task);
    });
    if (!archiveMode) actions.appendChild(edit);
    actions.appendChild(remove);
    content.appendChild(actions);
    LM.openModal(task.name, content);
    document.querySelector('.lm-modal')?.classList.add('todo-detail-modal');
  }
  function renderPager(total) {
    const pageCount = Math.ceil(total / pageSize);
    pageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
    const status = pageCount ? `${pageIndex + 1} / ${pageCount} ページ・${total}件` : '0件';
    const currentStatus = $('todo-page-status');
    currentStatus.textContent = status;
    document.querySelectorAll('.todo-page-status-copy').forEach(element => { element.textContent = status; });
    document.querySelectorAll('.todo-page-button[data-page-delta]').forEach(button => {
      button.disabled = Number(button.dataset.pageDelta) < 0 ? pageIndex === 0 : pageIndex >= pageCount - 1;
    });
  }
  function renderBulkActions(list) {
    const availableIds = new Set(list.map(task => task.id));
    [...selectedTaskIds].forEach(id => {
      if (!availableIds.has(id)) selectedTaskIds.delete(id);
    });
    const panel = $('todo-bulk-actions');
    const count = selectedTaskIds.size;
    panel.hidden = list.length === 0;
    $('todo-selection-count').textContent = `${count}件選択中`;
    $('todo-bulk-delete').disabled = count === 0;
    $('todo-bulk-delete').textContent = archiveMode ? '選択したタスクをストレージから削除' : '選択したタスクを削除';
    $('todo-new-task').hidden = archiveMode;
    $('todo-archive-toggle').setAttribute('aria-pressed', String(archiveMode));
    $('todo-archive-toggle').setAttribute('aria-label', archiveMode ? 'タスク一覧に戻る' : 'ストレージを表示');
    $('todo-archive-toggle').title = archiveMode ? 'タスク一覧' : 'ストレージ';
    $('todo-list-mode').textContent = archiveMode ? 'ストレージ' : 'タスク一覧';
  }
  function render() {
    const box = $('todo-task-list');
    box.innerHTML = '';
    const list = filteredTasks();
    renderBulkActions(list);
    renderPager(list.length);
    if (!list.length) {
      box.innerHTML = archiveMode
        ? '<p class="todo-help">ストレージに保管されたタスクはありません。</p>'
        : '<p class="todo-help">表示できるタスクがありません。タスクを追加するか、フィルターを変更してください。</p>';
      return;
    }
    list.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).forEach(task => {
      const card = document.createElement('article');
      const notStarted = !archiveMode && task.startDate && task.startDate > todayKey();
      card.className = 'todo-task-card' + (task.checked ? ' is-checked' : '') + (notStarted ? ' is-not-started' : '');
      const top = document.createElement('div');
      top.className = 'todo-task-top';
      const select = document.createElement('input');
      select.type = 'checkbox';
      select.className = 'todo-select-checkbox';
      select.checked = selectedTaskIds.has(task.id);
      select.setAttribute('aria-label', `${task.name}を選択`);
      select.addEventListener('change', () => {
        if (select.checked) selectedTaskIds.add(task.id);
        else selectedTaskIds.delete(task.id);
        renderBulkActions(list);
      });
      top.appendChild(select);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = task.checked;
      cb.disabled = archiveMode;
      const [year, month, day] = todayKey().split('-').map(Number);
      const weekday = new Date(year, month - 1, day).getDay();
      if (task.category === 'routine' && task.routinePeriod === 'weekdays' && (weekday === 0 || weekday === 6)) {
        cb.disabled = true;
        cb.title = '平日に実施できます';
      }
      cb.setAttribute('aria-label', task.name + 'を完了');
      cb.addEventListener('change', () => toggleTask(task, cb.checked));
      const summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'todo-task-summary';
      summary.setAttribute('aria-label', `${task.name}の詳細を表示`);
      const title = document.createElement('span');
      title.className = 'todo-task-title';
      title.textContent = task.name;
      summary.appendChild(title);
      if (task.links.length) {
        const linkIcon = document.createElement('span');
        linkIcon.className = 'todo-task-link-indicator';
        linkIcon.setAttribute('aria-label', 'リンクあり');
        linkIcon.title = 'リンクあり';
        appendLinkIcon(linkIcon);
        summary.appendChild(linkIcon);
      }
      summary.addEventListener('click', () => openTaskDetails(task));
      top.append(cb, summary);
      card.appendChild(top);

      const meta = document.createElement('div');
      meta.className = 'todo-task-meta';
      const deadline = document.createElement('span');
      deadline.className = 'todo-task-deadline';
      deadline.textContent = task.endDate
        ? `期限・終了日 ${task.endDate}`
        : task.category === 'routine' ? routinePeriodLabel(task.routinePeriod) : '期限なし';
      meta.appendChild(deadline);
      if (task.linkedTaskIds.length) {
        const progress = linkedTaskProgress(task);
        const linked = document.createElement('span');
        linked.className = 'todo-task-linked-progress';
        linked.textContent = `紐付けタスク ${progress.completed}/${progress.total}`;
        meta.appendChild(linked);
      }
      card.appendChild(meta);
      box.appendChild(card);
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const task = formTask();
    if (!task) return;
    const index = data.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) data.tasks[index] = task;
    else {
      data.tasks.push(task);
      pageIndex = 0;
    }
    save(); resetForm(); $('todo-create-dialog').close(); render(); updateProgressDisplays();
  });
  $('todo-new-task').addEventListener('click', () => {
    resetForm();
    $('todo-form-heading').textContent = categoryLabel(createTab) + 'タスクを追加';
    $('todo-create-dialog').showModal();
  });
  document.querySelectorAll('[data-create-tab]').forEach(b => b.addEventListener('click', () => setCreateTab(b.dataset.createTab)));
  $('todo-cancel-edit').addEventListener('click', () => {
    resetForm();
    $('todo-create-dialog').close();
  });
  $('todo-add-subtask').addEventListener('click', () => addSubtask());
  $('todo-add-link').addEventListener('click', () => addLink());
  $('todo-link-mode').addEventListener('change', renderCustomGroups);
  $('todo-add-custom-notification').addEventListener('click', () => {
    const date = $('todo-custom-date').value;
    const time = $('todo-custom-time').value;
    if (!date || !time) {
      $('todo-custom-date').setCustomValidity(date ? '' : '通知日を選択してください。');
      $('todo-custom-time').setCustomValidity(time ? '' : '通知時刻を選択してください。');
      $('todo-custom-date').reportValidity();
      $('todo-custom-time').reportValidity();
      return;
    }
    $('todo-custom-date').setCustomValidity('');
    $('todo-custom-time').setCustomValidity('');
    customNotifications = normalizeNotifications({ custom: [...customNotifications, { date, time }] }).custom;
    renderCustomNotifications();
  });
  $('todo-custom-date').addEventListener('input', () => $('todo-custom-date').setCustomValidity(''));
  $('todo-custom-time').addEventListener('input', () => $('todo-custom-time').setCustomValidity(''));
  $('todo-start-date').addEventListener('input', () => $('todo-end-date').setCustomValidity(''));
  $('todo-end-date').addEventListener('input', () => $('todo-end-date').setCustomValidity(''));
  document.querySelectorAll('[name="todo-category-filter"], [name="todo-deadline-filter"]').forEach(input => {
    input.addEventListener('change', () => {
      pageIndex = 0;
      render();
    });
  });
  $('todo-sort').addEventListener('change', () => {
    pageIndex = 0;
    render();
  });
  $('todo-filter-toggle').addEventListener('click', () => {
    const button = $('todo-filter-toggle');
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? 'フィルターを隠す' : 'フィルターを表示');
    $('todo-filter-panel').hidden = !expanded;
  });
  $('todo-sort-direction').addEventListener('click', () => {
    sortDescending = !sortDescending;
    const button = $('todo-sort-direction');
    const path = button.querySelector('path');
    const label = sortDescending ? '降順' : '昇順';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(sortDescending));
    button.title = label;
    path.setAttribute('d', sortDescending
      ? 'M12 5v14m-6-6 6 6 6-6'
      : 'M12 19V5m-6 6 6-6 6 6');
    pageIndex = 0;
    render();
  });
  $('todo-archive-toggle').addEventListener('click', () => {
    archiveMode = !archiveMode;
    selectedTaskIds.clear();
    pageIndex = 0;
    render();
  });
  $('todo-bulk-delete').addEventListener('click', () => {
    const selected = data.tasks.filter(task => selectedTaskIds.has(task.id));
    if (!selected.length) return;
    const message = archiveMode
      ? `選択した${selected.length}件をストレージから削除しますか？この操作は取り消せません。`
      : `選択した${selected.length}件のタスクを削除しますか？`;
    if (!confirm(message)) return;
    const ids = new Set(selected.map(task => task.id));
    data.tasks = data.tasks.filter(task => !ids.has(task.id));
    data.tasks.forEach(task => {
      task.linkedTaskIds = task.linkedTaskIds.filter(id => !ids.has(id));
      ids.forEach(id => delete task.linkGroups[id]);
    });
    selectedTaskIds.clear();
    if (editingId && ids.has(editingId)) resetForm();
    save();
    render();
    updateProgressDisplays();
  });
  document.querySelectorAll('.todo-page-button[data-page-delta]').forEach(button => {
    button.addEventListener('click', () => {
      pageIndex = Math.max(0, pageIndex + Number(button.dataset.pageDelta));
      render();
    });
  });
  setupNotificationOptions();
  archiveExpiredTasks();
  setCreateTab('main');
  render();
  updateProgressDisplays();
  let observedDay = todayKey();
  setInterval(() => {
    const expired = archiveExpiredTasks();
    const currentDay = todayKey();
    if (expired || currentDay !== observedDay) {
      observedDay = currentDay;
      save();
      render();
      updateProgressDisplays();
    }
  }, 60 * 1000);
})();