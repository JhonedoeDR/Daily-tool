(function () {
  const groupsEl = document.getElementById('todo-groups');
  const weeklyGridEl = document.getElementById('weekly-grid');
  const weeklyCountEl = document.getElementById('weekly-count');
  const rewardBoxEl = document.getElementById('reward-box');

  let state = LM.getTodoState();

  const rewardInput = document.getElementById('f-reward');
  rewardInput.value = state.reward || '';
  rewardInput.addEventListener('input', () => {
    state.reward = rewardInput.value;
    LM.saveTodoState(state);
  });

  renderGroups();
  renderWeeklyGrid();
  LM.renderNav(document.getElementById('nav-container'));

  document.getElementById('daily-reset-btn').addEventListener('click', () => {
    const ok = confirm('タスクをリセットします。よろしいですか?\n(週間クリア記録は消えません)');
    if (!ok) return;
    state.otherSlotCount = LM.TODO_OTHER_DEFAULT_COUNT;
    state.dailyTasks = LM.defaultTodoTasks(state.otherSlotCount);
    state.reflected = LM.defaultTodoReflected();
    state.enteredAt = null;
    LM.saveTodoState(state);
    renderGroups();
    renderWeeklyGrid();
  });

  // タスク名が初めて入力された時刻を記録する(通知の起点に使われる)
  function markEnteredIfNeeded() {
    if (!state.enteredAt) {
      state.enteredAt = Date.now();
    }
  }

  function renderGroups() {
    groupsEl.innerHTML = '';
    LM.getTodoGroups(state).forEach((g) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'lm-todo-group';

      const label = document.createElement('div');
      label.className = 'lm-todo-group-label' + (g.isMain ? ' is-main' : '');
      label.innerHTML = `<span>${g.label}</span><span class="count">${g.ids.length}</span>`;
      groupEl.appendChild(label);

      g.ids.forEach((id, idx) => {
        const task = state.dailyTasks[id] || { name: '', checked: false };
        state.dailyTasks[id] = task;
        const row = document.createElement('div');
        row.className = 'lm-todo-row' + (task.checked ? ' is-checked' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.checked;
        checkbox.addEventListener('change', () => {
          LM.toggleTodoCheck(state, id, checkbox.checked);
          row.classList.toggle('is-checked', checkbox.checked);
          renderWeeklyGrid();
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        const num = g.ids.length > 1 ? '①②③④⑤⑥⑦⑧⑨'[idx] || String(idx + 1) : '';
        nameInput.placeholder = `${g.label}${num} のタスク`;
        nameInput.value = task.name;
        nameInput.addEventListener('input', () => {
          state.dailyTasks[id].name = nameInput.value;
          if (nameInput.value.trim()) markEnteredIfNeeded();
          LM.saveTodoState(state);
        });

        row.appendChild(checkbox);
        row.appendChild(nameInput);
        groupEl.appendChild(row);
      });

      if (g.key === 'other') {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'lm-btn secondary';
        addBtn.style.cssText = 'margin-top:6px; font-size:12px; padding:6px 12px;';
        addBtn.textContent = '＋ その他のスロットを追加';
        addBtn.addEventListener('click', () => {
          state.otherSlotCount = (state.otherSlotCount || LM.TODO_OTHER_DEFAULT_COUNT) + 1;
          const newId = `other${state.otherSlotCount}`;
          state.dailyTasks[newId] = { name: '', checked: false };
          LM.saveTodoState(state);
          renderGroups();
        });
        groupEl.appendChild(addBtn);
      }

      groupsEl.appendChild(groupEl);
    });
  }

  function renderWeeklyGrid() {
    weeklyGridEl.innerHTML = '';
    for (let i = 1; i <= LM.TODO_WEEK_TOTAL; i++) {
      const cell = document.createElement('div');
      cell.className = 'lm-week-cell' + (i <= state.weeklyClears ? ' is-filled' : '');
      weeklyGridEl.appendChild(cell);
    }
    weeklyCountEl.textContent = `${state.weeklyClears} / ${LM.TODO_WEEK_TOTAL}`;
    rewardBoxEl.style.display = state.weeklyClears >= LM.TODO_WEEK_TOTAL ? 'block' : 'none';
  }
})();
