(function () {
  const KEY = 'lm_timeCalcItems';
  const END_TIME_KEY = 'lm_timeCalcEndTime';
  const workForm = document.getElementById('work-form');
  const nameInput = document.getElementById('f-work-name');
  const minInput = document.getElementById('f-work-min');
  const listEl = document.getElementById('work-list');
  const totalEl = document.getElementById('work-total');
  const endTimeInput = document.getElementById('f-end-time');
  const reverseResult = document.getElementById('reverse-result');
  const resetAllBtn = document.getElementById('reset-all-btn');

  endTimeInput.value = LM.get(END_TIME_KEY, '') || '';
  renderWorkList();
  LM.renderNav(document.getElementById('nav-container'));

  workForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const min = Number(minInput.value);
    if (!name || !min) return;
    const items = LM.get(KEY, []);
    items.push({ id: LM.uid(), name, min });
    LM.set(KEY, items);
    nameInput.value = '';
    minInput.value = '';
    renderWorkList();
  });

  listEl.addEventListener('click', (e) => {
    const removeId = e.target.dataset.remove;
    if (!removeId) return;
    const items = LM.get(KEY, []).filter((it) => it.id !== removeId);
    LM.set(KEY, items);
    renderWorkList();
  });

  endTimeInput.addEventListener('input', () => {
    LM.set(END_TIME_KEY, endTimeInput.value);
    updateReverse();
  });

  resetAllBtn.addEventListener('click', () => {
    if (!confirm('作業時間の一覧と終了したい時刻をリセットしますか?')) return;
    LM.set(KEY, []);
    LM.set(END_TIME_KEY, '');
    endTimeInput.value = '';
    renderWorkList();
  });

  function renderWorkList() {
    const items = LM.get(KEY, []);

    if (items.length === 0) {
      listEl.innerHTML = '<p class="lm-empty">作業がまだ登録されていません</p>';
      totalEl.textContent = '';
      updateReverse();
      return;
    }

    listEl.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'lm-check-list';
    items.forEach((it) => {
      const li = document.createElement('li');
      li.className = 'lm-check-item';
      li.style.justifyContent = 'space-between';
      li.innerHTML = `
        <span>${escapeHtml(it.name)} ・ ${it.min}分</span>
        <button type="button" data-remove="${it.id}" class="lm-btn secondary" style="padding:4px 8px; font-size:12px;">削除</button>
      `;
      ul.appendChild(li);
    });
    listEl.appendChild(ul);

    const total = items.reduce((sum, it) => sum + it.min, 0);
    totalEl.textContent = `合計:${total}分`;
    updateReverse();
  }

  function updateReverse() {
    const total = LM.get(KEY, []).reduce((sum, it) => sum + it.min, 0);
    if (!endTimeInput.value || total === 0) {
      reverseResult.textContent = total === 0 ? '作業を登録すると逆算できます' : '';
      return;
    }
    const endMin = LM.clockToMinutes(endTimeInput.value);
    const startMin = endMin - total;
    reverseResult.innerHTML = `合計${total}分を確保する場合、開始時刻は <strong>${LM.minutesToClock(startMin)}</strong> です`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
