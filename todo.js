(function () {
  const groupsEl = document.getElementById('todo-groups');
  const weeklyGridEl = document.getElementById('weekly-grid');
  const weeklyCountEl = document.getElementById('weekly-count');
  const rewardBoxEl = document.getElementById('reward-box');
  const routineProgressEl = document.getElementById('routine-progress');
  const routineRewardBoxEl = document.getElementById('routine-reward-box');
  const routineRewardTitleEl = document.getElementById('routine-reward-title');

  let state = LM.getTodoState();

  const rewardInput = document.getElementById('f-reward');
  rewardInput.value = state.reward || '';
  rewardInput.addEventListener('input', () => {
    state.reward = rewardInput.value;
    LM.saveTodoState(state);
  });

  const routineRewardInput = document.getElementById('f-routine-reward');
  routineRewardInput.value = state.routineReward || '';
  routineRewardInput.addEventListener('input', () => {
    state.routineReward = routineRewardInput.value;
    LM.saveTodoState(state);
  });

  renderGroups();
  renderWeeklyGrid();
  renderRoutineProgress();
  LM.renderNav(document.getElementById('nav-container'));

  document.getElementById('daily-reset-btn').addEventListener('click', () => {
    const ok = confirm('タスクをリセットします。よろしいですか?\n(週間・月間の達成記録は消えません。ルーティンの内容も残ります)');
    if (!ok) return;
    // ルーティンの内容は残す。月間の「今日チェック済み」の印も残す(リセット後の付け直しで二重に数えないため)
    const routineNames = {};
    LM.TODO_ROUTINE_IDS.forEach((id) => { routineNames[id] = state.dailyTasks[id].name; });
    state.dailyTasks = LM.defaultTodoTasks();
    LM.TODO_ROUTINE_IDS.forEach((id) => { state.dailyTasks[id].name = routineNames[id]; });
    state.reflected = LM.defaultTodoReflected();
    LM.saveTodoState(state);
    renderGroups();
    renderWeeklyGrid();
    renderRoutineProgress();
  });

  function renderGroups() {
    groupsEl.innerHTML = '';
    LM.TODO_GROUPS.forEach((g) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'lm-todo-group';

      const label = document.createElement('div');
      label.className = 'lm-todo-group-label' + (g.isMain ? ' is-main' : '');
      label.innerHTML = `<span>${g.label}</span><span class="count">${g.ids.length}</span>`;
      groupEl.appendChild(label);

      g.ids.forEach((id, idx) => {
        const task = state.dailyTasks[id];
        const row = document.createElement('div');
        row.className = 'lm-todo-row' + (task.checked ? ' is-checked' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.checked;
        checkbox.addEventListener('change', () => {
          LM.toggleTodoCheck(state, id, checkbox.checked);
          row.classList.toggle('is-checked', checkbox.checked);
          renderWeeklyGrid();
          renderRoutineProgress();
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        const num = g.ids.length > 1 ? '①②③'[idx] || String(idx + 1) : '';
        nameInput.placeholder = `${g.label}${num} のタスク`;
        nameInput.value = task.name;
        nameInput.addEventListener('input', () => {
          state.dailyTasks[id].name = nameInput.value;
          LM.saveTodoState(state);
        });

        row.appendChild(checkbox);
        row.appendChild(nameInput);
        groupEl.appendChild(row);
      });

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

  // 月間ルーティン: イベントと同じバーで表示する
  function renderRoutineProgress() {
    const p = LM.calcRoutineProgress(state);
    routineProgressEl.innerHTML = `
      <div class="lm-event-top">
        <span>今月のルーティン</span>
        <span>${p.rate}%</span>
      </div>
      <div class="lm-progress-track">
        <div class="lm-progress-fill" style="width:${p.rate}%"></div>
      </div>
      <div class="lm-event-remain">${p.count} / ${p.required}回 ・ 残り${p.remain}回 ・ 月末まで${p.remainDays}日</div>
    `;
    const done = p.count >= p.required;
    routineRewardBoxEl.style.display = done ? 'block' : 'none';
    routineRewardTitleEl.textContent = `今月のルーティンを${p.required}回クリアしました`;
  }
})();
