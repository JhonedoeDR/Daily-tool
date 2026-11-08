(function () {
  'use strict';

  const KEY = 'lm_todoManager';
  const $ = (id) => document.getElementById(id);
  const form = $('todo-create-form');
  if (!form) return;

  let data = load();
  save();
  let createTab = 'main';
  let editingId = null;

  function uid() {
    return 'tm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
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
    return {
      id: String(t.id || uid()), category: ['main', 'routine', 'other'].includes(t.category) ? t.category : 'other',
      name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''),
      checked: !!t.checked, checkedAt: Number(t.checkedAt) || 0, checkedDay: String(t.checkedDay || ''),
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => ({ id: String(s.id || uid()), name: String(s.name || ''), checked: !!s.checked })) : [],
      links: Array.isArray(t.links) ? t.links.map(l => ({ url: String(l.url || ''), label: String(l.label || '') })) : [],
      linkedTaskIds: Array.isArray(t.linkedTaskIds) ? t.linkedTaskIds.map(String) : [],
      linkMode: ['all', 'sequence', 'custom'].includes(t.linkMode) ? t.linkMode : 'all',
      linkGroups: t.linkGroups && typeof t.linkGroups === 'object' ? t.linkGroups : {}
    };
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
    try { if (window.LM && LM.syncFirebaseDebounced) LM.syncFirebaseDebounced(); } catch (_) {}
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
  function categoryLabel(c) { return c === 'main' ? 'ã¡ã¤ã³' : c === 'routine' ? 'ã«ã¼ãã£ã³' : 'ãã®ä»'; }
  function visibleLinkedIds(parent) {
    const ids = parent.linkedTaskIds.filter(id => data.tasks.some(t => t.id === id));
    if (parent.linkMode === 'all') return ids;
    const groups = ids.map(id => ({ id, group: parent.linkMode === 'sequence' ? ids.indexOf(id) + 1 : Math.max(1, Number(parent.linkGroups[id]) || 1) }));
    const current = groups.reduce((min, x) => {
      const t = data.tasks.find(y => y.id === x.id);
      return t && !t.checked ? Math.min(min, x.group) : min;
    }, Infinity);
    return groups.filter(x => x.group === current).map(x => x.id);
  }
  function allVisibleIds() {
    const hidden = new Set();
    data.tasks.forEach(parent => {
      if (!parent.linkedTaskIds.length || parent.linkMode === 'all') return;
      const allowed = new Set(visibleLinkedIds(parent));
      parent.linkedTaskIds.forEach(id => { if (!allowed.has(id)) hidden.add(id); });
    });
    // è¤æ°ã®è¦ªããåç§ããã¦ããå ´åãããããã®è¦ªãè¡¨ç¤ºãè¨±å¯ããã°è¡¨ç¤ºãã
    const referenced = new Set(data.tasks.flatMap(t => t.linkedTaskIds));
    data.tasks.forEach(t => {
      if (referenced.has(t.id)) {
        const permitted = data.tasks.some(p => p.linkedTaskIds.includes(t.id) && visibleLinkedIds(p).includes(t.id));
        if (permitted) hidden.delete(t.id);
      }
    });
    return data.tasks.filter(t => !hidden.has(t.id)).map(t => t.id);
  }

  function resetForm() {
    editingId = null;
    $('todo-edit-id').value = '';
    $('todo-task-name').value = '';
    $('todo-start-date').value = '';
    $('todo-end-date').value = '';
    $('todo-link-mode').value = 'all';
    $('todo-subtasks').innerHTML = '';
    $('todo-links').innerHTML = '';
    $('todo-advanced').open = false;
    $('todo-save-button').textContent = 'ã¿ã¹ã¯ãè¿½å ';
    $('todo-cancel-edit').hidden = true;
    renderLinkedChoices();
    renderCustomGroups();
  }
  function setCreateTab(tab) {
    createTab = tab;
    document.querySelectorAll('[data-create-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.createTab === tab));
    $('todo-form-heading').textContent = categoryLabel(tab) + 'ã¿ã¹ã¯ãè¿½å ';
    $('todo-date-fields').hidden = tab === 'routine';
    $('todo-linked-field').hidden = tab === 'routine';
    $('todo-end-date-field').hidden = tab === 'routine';
    resetForm();
  }
  function addSubtask(name = '', checked = false) {
    const row = document.createElement('div');
    row.className = 'todo-editor-row';
    row.innerHTML = `<input type="checkbox" aria-label="å°è¦ç´ ã®éæ" ${checked ? 'checked' : ''}><input type="text" maxlength="200" placeholder="å°è¦ç´ ã®åå" value="${esc(name)}"><button type="button" class="lm-todo-slot-remove" aria-label="å°è¦ç´ ãåé¤">â</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('todo-subtasks').appendChild(row);
  }
  function addLink(url = '', label = '') {
    const row = document.createElement('div');
    row.className = 'todo-editor-row todo-link-row';
    row.innerHTML = `<input type="url" placeholder="https://..." value="${esc(url)}"><input type="text" placeholder="ãªã³ã¯åï¼ä»»æï¼" value="${esc(label)}"><button type="button" class="lm-todo-slot-remove" aria-label="ãªã³ã¯ãåé¤">â</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('todo-links').appendChild(row);
  }
  function renderLinkedChoices(selected = [], groups = {}) {
    const box = $('todo-linked-list');
    box.innerHTML = '';
    const candidates = data.tasks.filter(t => t.category !== 'routine' && t.id !== editingId);
    if (!candidates.length) {
      box.innerHTML = '<p class="todo-help">ç´ä»ãã§ããã¡ã¤ã³ã»ãã®ä»ã¿ã¹ã¯ãããã¾ããã</p>';
      return;
    }
    candidates.forEach(t => {
      const row = document.createElement('label');
      row.className = 'todo-linked-choice';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = t.id; cb.checked = selected.includes(t.id);
      const name = document.createElement('span'); name.textContent = t.name;
      const num = document.createElement('input');
      num.type = 'number'; num.min = '1'; num.max = '99'; num.value = groups[t.id] || 1;
      num.className = 'todo-group-number'; num.setAttribute('aria-label', t.name + 'ã®è¡¨ç¤ºã°ã«ã¼ã');
      num.hidden = $('todo-link-mode').value !== 'custom';
      cb.addEventListener('change', renderCustomGroups);
      row.append(cb, name, num); box.appendChild(row);
    });
  }
  function renderCustomGroups() {
    const mode = $('todo-link-mode').value;
    $('todo-custom-groups').hidden = mode !== 'custom';
    document.querySelectorAll('.todo-group-number').forEach(n => { n.hidden = mode !== 'custom'; });
  }
  function editTask(task) {
    editingId = task.id;
    $('todo-edit-id').value = task.id;
    createTab = task.category;
    document.querySelectorAll('[data-create-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.createTab === createTab));
    $('todo-form-heading').textContent = categoryLabel(createTab) + 'ã¿ã¹ã¯ãç·¨é';
    $('todo-date-fields').hidden = createTab === 'routine';
    $('todo-linked-field').hidden = createTab === 'routine';
    $('todo-end-date-field').hidden = createTab === 'routine';
    $('todo-task-name').value = task.name;
    $('todo-start-date').value = task.startDate;
    $('todo-end-date').value = task.endDate;
    $('todo-subtasks').innerHTML = '';
    task.subtasks.forEach(s => addSubtask(s.name, s.checked));
    $('todo-links').innerHTML = '';
    task.links.forEach(l => addLink(l.url, l.label));
    $('todo-link-mode').value = task.linkMode;
    renderLinkedChoices(task.linkedTaskIds, task.linkGroups);
    renderCustomGroups();
    $('todo-save-button').textContent = 'å¤æ´ãä¿å­';
    $('todo-cancel-edit').hidden = false;
    $('todo-advanced').open = true;
    $('todo-task-name').focus();
  }
  function formTask() {
    const name = $('todo-task-name').value.trim();
    if (!name) return null;
    const subtasks = [...$('todo-subtasks').children].map(row => ({
      id: uid(), checked: row.querySelector('input[type=checkbox]').checked,
      name: row.querySelector('input[type=text]').value.trim()
    })).filter(s => s.name);
    const links = [...$('todo-links').children].map(row => ({
      url: row.querySelector('input[type=url]').value.trim(),
      label: row.querySelectorAll('input')[1].value.trim()
    })).filter(l => l.url);
    const selected = [...$('todo-linked-list').querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
    const linkGroups = {};
    $('todo-linked-list').querySelectorAll('.todo-linked-choice').forEach(row => {
      const id = row.querySelector('input[type=checkbox]').value;
      linkGroups[id] = Math.max(1, Number(row.querySelector('.todo-group-number').value) || 1);
    });
    return {
      id: editingId || uid(), category: createTab, name,
      startDate: createTab === 'routine' ? '' : $('todo-start-date').value,
      endDate: createTab === 'routine' ? '' : $('todo-end-date').value,
      subtasks, links,
      linkedTaskIds: createTab === 'routine' ? [] : selected,
      linkMode: $('todo-link-mode').value, linkGroups,
      checked: editingId ? !!data.tasks.find(t => t.id === editingId)?.checked : false,
      checkedAt: editingId ? (data.tasks.find(t => t.id === editingId)?.checkedAt || 0) : 0
    };
  }
  function toggleTask(task, checked) {
    if (task.checked === checked) return;
    task.checked = checked;
    task.checkedAt = checked ? Date.now() : 0;
    if (checked && task.category === 'main') {
      const wk = weekKey();
      const counted = data.weeklyCounted[wk] || (data.weeklyCounted[wk] = {});
      if (!counted[task.id]) {
        counted[task.id] = true;
        const legacy = LM.getTodoState();
        legacy.weeklyClears = Math.min(LM.TODO_WEEK_TOTAL, (legacy.weeklyClears || 0) + 1);
        LM.saveTodoState(legacy);
      }
      if (LM.notifyBaseMainCompleted) LM.notifyBaseMainCompleted(`manager:${task.id}:${todayKey()}`);
    }
    if (checked && task.category === 'routine') {
      const day = todayKey();
      const counted = data.routineCounted[day] || (data.routineCounted[day] = {});
      if (!counted[task.id]) {
        counted[task.id] = true;
        const legacy = LM.getTodoState();
        legacy.routineClears = (legacy.routineClears || 0) + 1;
        LM.saveTodoState(legacy);
      }
    }
    save();
    render();
    updateProgressDisplays();
  }
  function updateProgressDisplays() {
    const legacy = LM.getTodoState();
    const weeklyCount = $('weekly-count');
    if (weeklyCount) weeklyCount.textContent = `${legacy.weeklyClears} / ${LM.TODO_WEEK_TOTAL}`;
    if ($('weekly-grid')) {
      $('weekly-grid').innerHTML = '';
      for (let i = 1; i <= LM.TODO_WEEK_TOTAL; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'lm-week-cell' + (i <= legacy.weeklyClears ? ' is-filled' : '');
        $('weekly-grid').appendChild(cell);
      }
    }
    if ($('reward-box')) $('reward-box').style.display = legacy.weeklyClears >= LM.TODO_WEEK_TOTAL ? 'block' : 'none';
    const p = LM.calcRoutineProgress(legacy);
    const dayKey = LM.todoDayKey();
    const [year, month, day] = dayKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const routineSlots = Math.max(3, data.tasks.filter(t => t.category === 'routine').length);
    const required = Math.ceil(routineSlots * daysInMonth * LM.TODO_ROUTINE_RATE);
    const remain = Math.max(0, required - p.count);
    const rate = required > 0 ? Math.min(100, Math.round(p.count / required * 100)) : 0;
    if ($('routine-progress')) {
      $('routine-progress').innerHTML = `<div class="lm-event-top"><span>ä»æã®ã«ã¼ãã£ã³</span><span>${rate}%</span></div><div class="lm-progress-track"><div class="lm-progress-fill" style="width:${rate}%"></div></div><div class="lm-event-remain">${p.count} / ${required}å ã» æ®ã${remain}å ã» ææ«ã¾ã§${daysInMonth - day + 1}æ¥</div>`;
    }
    if ($('routine-reward-box')) $('routine-reward-box').style.display = p.count >= required ? 'block' : 'none';
  }
  function filteredTasks() {
    const tab = $('todo-tab-filter').value;
    const deadline = $('todo-deadline-filter').value;
    const sort = $('todo-sort').value;
    const visible = new Set(allVisibleIds());
    let list = data.tasks.filter(t => visible.has(t.id));
    if (tab !== 'all') list = list.filter(t => t.category === tab);
    if (deadline === 'yes') list = list.filter(t => !!t.endDate);
    if (deadline === 'no') list = list.filter(t => !t.endDate);
    list.sort((a, b) => {
      if (sort === 'deadline') {
        if (!a.endDate && b.endDate) return 1;
        if (a.endDate && !b.endDate) return -1;
        if (a.endDate && b.endDate && a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
      }
      return a.name.localeCompare(b.name, 'ja');
    });
    return list;
  }
  function render() {
    const box = $('todo-task-list');
    box.innerHTML = '';
    const list = filteredTasks();
    if (!list.length) {
      box.innerHTML = '<p class="todo-help">è¡¨ç¤ºã§ããã¿ã¹ã¯ãããã¾ãããã¿ã¹ã¯ãè¿½å ãããããã£ã«ã¿ã¼ãå¤æ´ãã¦ãã ããã</p>';
      return;
    }
    list.forEach(task => {
      const card = document.createElement('article');
      card.className = 'todo-task-card' + (task.checked ? ' is-checked' : '');
      const top = document.createElement('div'); top.className = 'todo-task-top';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = task.checked;
      cb.setAttribute('aria-label', task.name + 'ãå®äº');
      cb.addEventListener('change', () => toggleTask(task, cb.checked));
      const title = document.createElement('div'); title.className = 'todo-task-title'; title.textContent = task.name;
      const category = document.createElement('span'); category.className = 'todo-category'; category.textContent = categoryLabel(task.category);
      top.append(cb, title, category); card.appendChild(top);
      const meta = [];
      if (task.startDate) meta.push('éå§ ' + task.startDate);
      if (task.endDate) meta.push('æé ' + task.endDate);
      if (meta.length) { const m = document.createElement('div'); m.className = 'todo-task-meta'; m.textContent = meta.join('ã'); card.appendChild(m); }
      if (task.subtasks.length) {
        const sub = document.createElement('div'); sub.className = 'todo-card-subtasks';
        task.subtasks.forEach(s => {
          const label = document.createElement('label'); label.className = 'todo-card-subtask';
          const scb = document.createElement('input'); scb.type = 'checkbox'; scb.checked = s.checked;
          scb.addEventListener('change', () => { s.checked = scb.checked; save(); });
          const st = document.createElement('span'); st.textContent = s.name;
          label.append(scb, st); sub.appendChild(label);
        });
        card.appendChild(sub);
      }
      if (task.links.length) {
        const links = document.createElement('div'); links.className = 'todo-card-links';
        task.links.forEach(l => {
          const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = l.label || l.url; links.appendChild(a);
        });
        card.appendChild(links);
      }
      if (task.linkedTaskIds.length) {
        const info = document.createElement('div'); info.className = 'todo-task-meta';
        info.textContent = `ç´ä»ã ${task.linkedTaskIds.length}ä»¶ã»${({all:'ãã¹ã¦è¡¨ç¤º',sequence:'é æ¬¡è¡¨ç¤º',custom:'ã«ã¹ã¿ã è¡¨ç¤º'})[task.linkMode]}`;
        card.appendChild(info);
      }
      const actions = document.createElement('div'); actions.className = 'todo-card-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'lm-btn secondary'; edit.textContent = 'ç·¨é'; edit.addEventListener('click', () => editTask(task));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'lm-btn secondary'; del.textContent = 'åé¤'; del.addEventListener('click', () => {
        if (!confirm(`ã${task.name}ããåé¤ãã¾ããï¼ç´ä»ãåãããé¸æå¯¾è±¡ããªããªãã¾ãã`)) return;
        data.tasks = data.tasks.filter(t => t.id !== task.id);
        data.tasks.forEach(t => { t.linkedTaskIds = t.linkedTaskIds.filter(id => id !== task.id); delete t.linkGroups[task.id]; });
        save(); render();
      });
      actions.append(edit, del); card.appendChild(actions);
      box.appendChild(card);
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const task = formTask();
    if (!task) return;
    const index = data.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) data.tasks[index] = task;
    else data.tasks.push(task);
    save(); resetForm(); render();
  });
  document.querySelectorAll('[data-create-tab]').forEach(b => b.addEventListener('click', () => setCreateTab(b.dataset.createTab)));
  $('todo-cancel-edit').addEventListener('click', () => resetForm());
  $('todo-add-subtask').addEventListener('click', () => addSubtask());
  $('todo-add-link').addEventListener('click', () => addLink());
  $('todo-link-mode').addEventListener('change', renderCustomGroups);
  ['todo-tab-filter', 'todo-deadline-filter', 'todo-sort'].forEach(id => $(id).addEventListener('change', render));
  setCreateTab('main');
  render();
  updateProgressDisplays();
})();