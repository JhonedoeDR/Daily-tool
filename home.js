(function () {
  const today = LM.todayStr();
  document.getElementById('date-header').textContent = LM.formatDateHeader(today);

  const SECTION_ORDER = ['event', 'task', 'schedule', 'belongings', 'shift'];
  const hasContent = {};

  hasContent.event = renderEvents();
  hasContent.task = renderTasks();
  hasContent.schedule = renderSchedules();
  hasContent.belongings = renderBelongings();
  hasContent.shift = renderShift();
  reorderSections();

  setupTaskLink();

  renderNotifyBanner();
  setupBackup();
  LM.renderNav(document.getElementById('nav-container'));

  /* ---------- セクションの並び替え(表示があるものを先に、基本順はイベント→予定→持ちもの→タスク→勤務) ---------- */
  function reorderSections() {
    const page = document.querySelector('.lm-page');
    const anchor = document.getElementById('nav-container');
    const sorted = [...SECTION_ORDER].sort((a, b) => {
      const ah = hasContent[a] ? 0 : 1;
      const bh = hasContent[b] ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b);
    });
    sorted.forEach((key, i) => {
      const el = document.querySelector(`[data-section="${key}"]`);
      el.style.borderTop = i === 0 ? 'none' : '';
      page.insertBefore(el, anchor);
    });
  }

  /* ---------- 今日の予定 ---------- */
  function renderSchedules() {
   const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
   const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
   const schedules = LM.get(LM.KEYS.SCHEDULES, [])
   .filter((s) => s.date === today && nowMin < toMin(s.start) + 60)
   .sort((a, b) => a.start.localeCompare(b.start));


    if (schedules.length === 0) {
      el.innerHTML = '<p class="lm-empty">今日の予定はありません</p>';
      return false;
    }

    el.innerHTML = '';
    schedules.forEach((s) => {
      const row = document.createElement('a');
      row.className = 'lm-schedule-item';
      row.href = `./schedule.html?id=${encodeURIComponent(s.id)}`;
      const departureHtml = renderDepartureLine(s);
      row.innerHTML = `
        <span class="lm-schedule-time">${s.start}</span>
        <span>
          <div>${escapeHtml(s.name)}</div>
          ${departureHtml}
        </span>
      `;
      el.appendChild(row);
    });
    return true;
  }

  function renderDepartureLine(s) {
    const r = LM.calcDeparture(s);
    return `<div class="lm-schedule-departure">準備開始 <strong>${r.prepStart}</strong> ・ 出発 <strong>${r.depart}</strong></div>`;
  }

  /* ---------- 今日の持ちもの(カード+モーダル) ---------- */
  function renderBelongings() {
    const el = document.getElementById('belongings-list');
    const countEl = document.getElementById('belongings-count');

    const schedules = LM.get(LM.KEYS.SCHEDULES, []).filter((s) => s.date === today);
    const setIds = [...new Set(schedules.flatMap((s) => s.belongingSetIds || (s.belongingSetId ? [s.belongingSetId] : [])))];
    const allSets = LM.get(LM.KEYS.BELONGING_SETS, []);
    const sets = setIds.map((id) => allSets.find((s) => s.id === id)).filter(Boolean);

    if (sets.length === 0) {
      countEl.textContent = '';
      el.innerHTML = '<p class="lm-empty">今日呼び出す持ちものセットはありません</p>';
      return false;
    }

    const checks = LM.get(LM.KEYS.DAILY_CHECKS, {});
    const todayCheck = checks[today] || { checkedItemIds: [] };
    const checkedSet = new Set(todayCheck.checkedItemIds);

    let totalItems = 0;
    let totalChecked = 0;
    el.innerHTML = '';
    sets.forEach((set) => {
      const checkedCount = set.items.filter((it) => checkedSet.has(it.id)).length;
      totalItems += set.items.length;
      totalChecked += checkedCount;
      const card = document.createElement('div');
      card.className = 'lm-card';
      card.innerHTML = `
        <span class="lm-card-title">${escapeHtml(set.name)}</span>
        <span class="lm-card-count">${checkedCount}/${set.items.length}</span>
      `;
      card.addEventListener('click', () => openBelongingModal(set));
      el.appendChild(card);
    });
    countEl.textContent = `${totalChecked}/${totalItems}`;
    return true;
  }

  function openBelongingModal(set) {
    const checks = LM.get(LM.KEYS.DAILY_CHECKS, {});
    const entry = checks[today] || { checkedItemIds: [] };
    const checkedSet = new Set(entry.checkedItemIds);

    const ul = document.createElement('ul');
    ul.className = 'lm-check-list';
    if (set.items.length === 0) {
      ul.innerHTML = '<li class="lm-empty">持ちものが登録されていません</li>';
    } else {
      set.items.forEach((it) => {
        const li = document.createElement('li');
        li.className = 'lm-check-item' + (checkedSet.has(it.id) ? ' done' : '');
        li.innerHTML = `
          <input type="checkbox" ${checkedSet.has(it.id) ? 'checked' : ''} data-item-id="${it.id}" />
          <span>${escapeHtml(it.name)}</span>
        `;
        ul.appendChild(li);
      });
    }

    ul.addEventListener('change', (e) => {
      const checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;
      const itemId = checkbox.dataset.itemId;
      const checks2 = LM.get(LM.KEYS.DAILY_CHECKS, {});
      const entry2 = checks2[today] || { checkedItemIds: [] };
      const idSet = new Set(entry2.checkedItemIds);
      if (checkbox.checked) idSet.add(itemId);
      else idSet.delete(itemId);
      entry2.checkedItemIds = [...idSet];
      checks2[today] = entry2;
      LM.set(LM.KEYS.DAILY_CHECKS, checks2);
      checkbox.closest('li').classList.toggle('done', checkbox.checked);
      renderBelongings();
    });

    LM.openModal(set.name, ul);
  }

  /* ---------- 今日のタスク(メインタスク+ほかの件数) ---------- */
  function renderTasks() {
    const el = document.getElementById('tasks-list');
    const state = LM.getTodoState();

    const mainTasks = LM.TODO_MAIN_IDS.map((id) => ({ id, ...state.dailyTasks[id] })).filter((t) => t.name.trim());
    const otherIds = LM.TODO_GROUPS.filter((g) => !g.isMain).flatMap((g) => g.ids);
    const otherCount = otherIds.filter((id) => (state.dailyTasks[id].name || '').trim()).length;

    if (mainTasks.length === 0 && otherCount === 0) {
      el.innerHTML = '<p class="lm-empty">今日のタスクはまだ登録されていません</p>';
      return false;
    }

    el.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'lm-check-list';
    mainTasks.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'lm-check-item' + (t.checked ? ' done' : '');
      li.innerHTML = `
        <input type="checkbox" ${t.checked ? 'checked' : ''} data-todo-id="${t.id}" />
        <span>${escapeHtml(t.name)}</span>
      `;
      ul.appendChild(li);
    });
    el.appendChild(ul);

    if (otherCount > 0) {
      const otherEl = document.createElement('div');
      otherEl.style.cssText = 'text-align:right; font-size:12px; color:var(--text-soft); margin-top:6px;';
      otherEl.textContent = `ほか${otherCount}`;
      el.appendChild(otherEl);
    }

    ul.addEventListener('change', (e) => {
      const checkbox = e.target;
      if (checkbox.type !== 'checkbox') return;
      const id = checkbox.dataset.todoId;
      const s = LM.getTodoState();
      LM.toggleTodoCheck(s, id, checkbox.checked);
      hasContent.task = renderTasks();
    });

    return true;
  }

  /* ---------- タスクセクションをタップでタスクページへ ---------- */
  function setupTaskLink() {
    const section = document.querySelector('[data-section="task"]');
    section.style.cursor = 'pointer';
    section.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      location.href = './todo.html';
    });
  }

  /* ---------- 今日の勤務 ---------- */
  function renderShift() {
    const el = document.getElementById('shift-box');
    const shift = LM.get(LM.KEYS.SHIFTS, []).find((s) => s.date === today);

    if (!shift) {
      el.innerHTML = '<p class="lm-empty">今日の勤務はありません</p>';
      return false;
    }

    const wageSettings = LM.get(LM.KEYS.WAGE_SETTINGS, { hourlyWage: 0, transportFee: 0 });
    const { workMin, pay } = LM.calcShiftPay(shift, wageSettings);
    const h = Math.floor(workMin / 60);
    const m = workMin % 60;

    el.innerHTML = `
      <div class="lm-shift-box">
        <span>勤務時間 ${shift.start}〜${shift.end}(休憩${shift.breakMin || 0}分)</span>
        <span>実働 ${h}時間${m}分</span>
        <span class="lm-shift-pay">見込み給与 ¥${pay.toLocaleString()}</span>
      </div>
    `;
    return true;
  }

  /* ---------- 今日のイベント(タップでイベントページへ) ---------- */
  function renderEvents() {
    const el = document.getElementById('events-list');
    const events = LM.get(LM.KEYS.EVENTS, []).filter((ev) => ev.end >= today);

    if (events.length === 0) {
      el.innerHTML = '<p class="lm-empty">開催中のイベントはありません</p>';
      return false;
    }

    el.innerHTML = '';
    events.forEach((ev) => {
      const { remain, remainDays, perDay, rate } = LM.calcEventProgress(ev, today);
      const box = document.createElement('a');
      box.href = './event.html';
      box.className = 'lm-event';
      box.style.display = 'block';
      box.style.textDecoration = 'none';
      box.style.color = 'inherit';
      box.innerHTML = `
        <div class="lm-event-top">
          <span>${escapeHtml(ev.name)}</span>
          <span>${rate}%</span>
        </div>
        <div class="lm-progress-track">
          <div class="lm-progress-fill" style="width:${rate}%"></div>
        </div>
        <div class="lm-event-remain">残り${remainDays}日 ・ 残り${remain.toLocaleString()}${escapeHtml(ev.unit || '')} ・ 1日あたり${perDay.toLocaleString()}${escapeHtml(ev.unit || '')}必要</div>
      `;
      el.appendChild(box);
    });
    return true;
  }

  /* ---------- 通知の状態表示・登録ボタン ---------- */
  function renderNotifyBanner() {
    const el = document.getElementById('notify-banner');
    if (!('Notification' in window)) {
      el.innerHTML = '<p class="lm-empty">この端末は通知に対応していません</p>';
      return;
    }
    if (Notification.permission === 'denied') {
      el.innerHTML = '<p class="lm-empty">通知がブロックされています(端末の設定から許可できます)</p>';
      return;
    }

    if (Notification.permission === 'granted') {
      LM.startNotificationLoop();
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
          <span class="lm-empty" style="margin:0;">通知:有効</span>
          <button type="button" id="resync-notify" class="lm-btn secondary" style="font-size:12px; padding:6px 12px;">アプリ外通知を登録し直す</button>
        </div>
      `;
      document.getElementById('resync-notify').addEventListener('click', () => registerFirebase(true));
      return;
    }

    el.innerHTML = '<button type="button" id="enable-notify" class="lm-btn secondary" style="margin-bottom:8px;">通知を有効にする(アプリ外通知)</button>';
    document.getElementById('enable-notify').addEventListener('click', async () => {
      const result = await LM.requestNotificationPermission();
      renderNotifyBanner();
      if (result === 'granted') {
        LM.startNotificationLoop();
        registerFirebase(true);
      }
    });
  }

  // FCMトークン登録+データ同期。showFeedback=trueの時は結果をトーストで表示
  async function registerFirebase(showFeedback) {
    if (!window.LMFirebase) {
      await new Promise((resolve) => window.addEventListener('lm-firebase-ready', resolve, { once: true }));
    }
    try {
      const token = await window.LMFirebase.registerToken();
      await window.LMFirebase.syncData();
      if (showFeedback) {
        if (token) LM.showToast('アプリ外通知を登録しました');
        else LM.showToast('登録に失敗しました(トークン取得不可)', 'error');
      }
    } catch (e) {
      console.error(e);
      if (showFeedback) LM.showToast('登録に失敗しました', 'error');
    }
  }

  /* ---------- バックアップの保存/復元 ---------- */
  function setupBackup() {
    document.getElementById('export-btn').addEventListener('click', () => {
      try {
        const data = LM.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `生活管理バックアップ_${today}.json`;
        a.click();
        URL.revokeObjectURL(url);
        LM.showToast('バックアップを保存しました');
      } catch (err) {
        console.error(err);
        LM.showToast('保存できませんでした', 'error');
      }
    });

    document.getElementById('import-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!confirm('現在のデータに上書きして復元しますか?')) return;
          LM.importAllData(data);
          alert('復元しました');
          location.reload();
        } catch (err) {
          alert('復元に失敗しました。ファイルが正しいか確認してください。');
        }
      };
      reader.readAsText(file);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
