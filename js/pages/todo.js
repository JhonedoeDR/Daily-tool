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
    return LM.set(KEY, data);
  }
  function renderLegacyGroups() {
    const container = $('todo-groups');
    if (!container) return;
    container.replaceChildren();
    const state = LM.getTodoState();

    LM.TODO_GROUPS.forEach(group => {
      const groupEl = document.createElement('section');
      groupEl.className = 'lm-todo-group';
      const heading = document.createElement('div');
      heading.className = 'lm-todo-group-label' + (group.isMain ? ' is-main' : '');
      heading.textContent = group.label;
      groupEl.appendChild(heading);

      group.ids.forEach(id => {
        const task = state.dailyTasks[id] || { name: '', checked: false };
        const row = document.createElement('div');
        row.className = 'lm-todo-row' + (task.checked ? ' is-checked' : '');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!task.checked;
        checkbox.setAttribute('aria-label', `${group.label}を完了`);
        checkbox.addEventListener('change', () => {
          LM.toggleTodoCheck(LM.getTodoState(), id, checkbox.checked);
          renderLegacyGroups();
          updateProgressDisplays();
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 200;
        input.value = task.name || '';
        input.placeholder = `${group.label}のタスク`;
        input.addEventListener('input', () => {
          const current = LM.getTodoState();
          LM.setTodoTaskName(current, id, input.value);
          LM.saveTodoState(current);
          row.classList.toggle('is-checked', !!current.dailyTasks[id].checked);
        });
        row.append(checkbox, input);

        if (group.key === 'other' && group.ids.length > 1) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'lm-todo-slot-remove';
          remove.textContent = '-';
          remove.setAttribute('aria-label', 'このタスク枠を削除');
          remove.addEventListener('click', () => {
            const current = LM.getTodoState();
            const lastSlot = group.ids.length;
            for (let slot = Number(id.slice(5)) + 1; slot <= lastSlot; slot += 1) {
              current.dailyTasks[`other${slot - 1}`] = current.dailyTasks[`other${slot}`];
            }
            delete current.dailyTasks[`other${lastSlot}`];
            current.otherSlotCount = LM.configureOtherTodoSlots(lastSlot - 1);
            LM.saveTodoState(current);
            renderLegacyGroups();
          });
          row.appendChild(remove);
        }
        groupEl.appendChild(row);
      });

      if (group.key === 'other') {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'lm-btn secondary';
        add.textContent = '＋ 枠を追加';
        add.addEventListener('click', () => {
          const current = LM.getTodoState();
          current.otherSlotCount = LM.configureOtherTodoSlots(current.otherSlotCount + 1);
          current.dailyTasks[`other${current.otherSlotCount}`] = { name: '', checked: false };
          LM.saveTodoState(current);
          renderLegacyGroups();
        });
        groupEl.appendChild(add);
      }

      LM.appendLinkedTodoRows(groupEl, group.key, renderLegacyGroups);
      container.appendChild(groupEl);
    });
  }
  function setupTomorrowTasks() {
    const key = 'lm_tomorrowTasks';
    const button = $('tomorrow-task-btn');
    if (!button) return;

    button.addEventListener('click', () => {
      const [year, month, day] = LM.todoDayKey().split('-').map(Number);
      const forDay = LM.scheduleDateKey(new Date(year, month - 1, day + 1));
      const saved = LM.get(key, null);
      const data = saved && saved.forDay === forDay
        ? { forDay, tasks: saved.tasks || {}, otherSlotCount: Math.max(1, Number(saved.otherSlotCount) || 1) }
        : { forDay, tasks: {}, otherSlotCount: 1 };
      const wrap = document.createElement('div');

      function persist() {
        const hasTasks = Object.values(data.tasks).some(value => String(value || '').trim());
        if (hasTasks) LM.set(key, data);
        else localStorage.removeItem(key);
        LM.syncFirebaseDebounced();
      }

      function render() {
        wrap.replaceChildren();
        const note = document.createElement('p');
        note.className = 'lm-empty';
        note.style.marginBottom = '12px';
        note.textContent = 'AM4:00以降に最初にこのページを開いたとき、今日のタスクに反映されます(ルーティンは毎日引き継がれるため対象外です)';
        wrap.appendChild(note);
        const locks = LM.getMainLockTitles('tomorrow');

        LM.TODO_GROUPS.filter(group => group.key !== 'routine').forEach(group => {
          const ids = group.key === 'other'
            ? Array.from({ length: data.otherSlotCount }, (_, index) => `other${index + 1}`)
            : group.ids;
          const groupEl = document.createElement('div');
          groupEl.className = 'lm-todo-group';
          const heading = document.createElement('div');
          heading.className = 'lm-todo-group-label' + (group.isMain ? ' is-main' : '');
          heading.textContent = group.label;
          groupEl.appendChild(heading);

          ids.forEach((id, index) => {
            const row = document.createElement('div');
            row.className = 'lm-todo-row';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `${group.label}${ids.length > 1 ? ` ${index + 1}` : ''}のタスク`;
            input.value = data.tasks[id] || '';
            const lockTitle = group.isMain ? locks[index] : undefined;
            if (lockTitle) {
              input.value = lockTitle;
              input.disabled = true;
              input.classList.add('dl-locked');
              input.title = '締切のタスクが使用中です';
            }
            input.addEventListener('input', () => {
              data.tasks[id] = input.value;
              persist();
            });
            row.appendChild(input);

            if (group.key === 'other' && index > 0) {
              const remove = document.createElement('button');
              remove.type = 'button';
              remove.className = 'lm-todo-slot-remove';
              remove.textContent = '-';
              remove.setAttribute('aria-label', 'この追加枠を削除');
              remove.addEventListener('click', () => {
                for (let slot = index + 1; slot < data.otherSlotCount; slot += 1) {
                  data.tasks[`other${slot}`] = data.tasks[`other${slot + 1}`] || '';
                }
                delete data.tasks[`other${data.otherSlotCount}`];
                data.otherSlotCount -= 1;
                persist();
                render();
              });
              row.appendChild(remove);
            }
            groupEl.appendChild(row);
          });

          if (group.key === 'other') {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'lm-btn secondary';
            add.textContent = '＋ 枠を追加';
            add.addEventListener('click', () => {
              data.otherSlotCount += 1;
              persist();
              render();
            });
            groupEl.appendChild(add);
          }
          wrap.appendChild(groupEl);
        });
      }

      render();
      LM.openModal('明日のタスク', wrap);
    });
  }
  function resetDailyTasks() {
    const button = $('daily-reset-btn');
    if (!button) return;
    button.addEventListener('click', () => {
      if (!confirm('今日のタスク入力と達成状況をリセットしますか?')) return;
      const state = LM.getTodoState();
      const routineNames = Object.fromEntries(
        LM.TODO_ROUTINE_IDS.map(id => [id, (state.dailyTasks[id] && state.dailyTasks[id].name) || ''])
      );
      state.dailyTasks = LM.defaultTodoTasks();
      LM.TODO_ROUTINE_IDS.forEach(id => { state.dailyTasks[id].name = routineNames[id]; });
      state.taskEnteredAt = 0;
      LM.saveTodoState(state);
      renderLegacyGroups();
      updateProgressDisplays();
    });
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
  setupTomorrowTasks();
  resetDailyTasks();
  setCreateTab('main');
  render();
  renderLegacyGroups();
  updateProgressDisplays();
})();