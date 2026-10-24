/* ゲーム管理。メタデータはlocalStorage、画像はIndexedDBに保存。通知用の最小限の情報のみFirebaseへ同期。 */
(() => {
  'use strict';
  const GAMES_KEY = 'lm_games';
  const REMINDERS_KEY = 'lm_gameReminders';
  const $ = (id) => document.getElementById(id);
  let selectedGameId = localStorage.getItem('lm_games_selected') || '';
  let activeTab = 'register';
  let activeSlide = 0;
  let shownMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dateString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dateString(new Date());
  let selectedCalendarDate = today();
  const objectUrls = new Set();
  const uid = () => (window.LM && LM.uid ? LM.uid() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const readGames = () => { try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); } catch { return []; } };
  const saveGames = (games) => localStorage.setItem(GAMES_KEY, JSON.stringify(games));
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeWebUrl = (value) => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const toast = (message, type) => (typeof LM !== 'undefined' && typeof LM.showToast === 'function') ? LM.showToast(message, type) : alert(message);
  const currentGame = () => readGames().find((g) => g.id === selectedGameId) || null;

  /* 編集中のID・アイコン(絵文字は使わずSVGで描画)・入力欄へのスクロール */
  let editingGameId = '';
  let editingNoteId = '';
  const ICON_PIN = (on) => `<svg class="lm-game-svg" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-.8 5.2L17 12.5H7l2.8-3.3L9 4z"/><path d="M12 12.5V20"/></svg>`;
  const ICON_GAME = '<svg class="lm-game-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7.5" width="18" height="9.5" rx="4.75"/><path d="M8 10.5v3.5M6.25 12.25h3.5"/><path d="M15.5 11.2h.01M17.5 13.2h.01"/></svg>';
  function scrollToEl(el) { if (!el) return; requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function slideToInput(tab) { scrollToEl(tab === 'register' ? $('game-register-section') : $('game-current-picker')); }

  function revokeUrls() { objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear(); }
  function newObjectUrl(blob) { const url = URL.createObjectURL(blob); objectUrls.add(url); return url; }

  async function syncReminders() {
    const reminders = readGames().filter((g) => g.notifyEnabled).map((g) => ({ id: g.id, name: g.name, lastLoginDate: g.lastLoginDate || '', reminderTimes: (Array.isArray(g.reminderTimes) && g.reminderTimes.length ? g.reminderTimes : [g.reminderTime || '20:00']).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)), notifyEnabled: true }));
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
    if (typeof LM !== 'undefined' && typeof LM.syncFirebase === 'function') await LM.syncFirebase();
  }

  function updateGame(id, mutator) {
    const games = readGames(); const game = games.find((g) => g.id === id); if (!game) return;
    mutator(game); saveGames(games);
  }

  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => { const active = b.dataset.tab === tab; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active)); });
    document.querySelectorAll('[data-panel]').forEach((panel) => { const active = panel.dataset.panel === tab; panel.hidden = !active; panel.classList.toggle('is-active', active); });
    $('game-current-picker').hidden = tab === 'register';
    renderActivePanel();
  }

  function setSlide(index) {
    activeSlide = (index + 2) % 2;
    document.querySelectorAll('[data-slide]').forEach((slide) => slide.classList.toggle('is-active', slide.dataset.slide === (activeSlide === 0 ? 'calendar' : 'notes')));
    document.querySelectorAll('[data-slide-to]').forEach((dot) => dot.classList.toggle('is-active', Number(dot.dataset.slideTo) === activeSlide));
  }

  function refreshGamePicker() {
    const select = $('game-current-select'); const games = readGames();
    if (!games.some((g) => g.id === selectedGameId)) selectedGameId = games[0]?.id || '';
    localStorage.setItem('lm_games_selected', selectedGameId);
    select.innerHTML = '<option value="">ゲームを選択</option>' + games.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');
    select.value = selectedGameId;
  }

  async function renderGameList() {
    const list = $('games-list'); const games = readGames();
    if (!games.length) { list.innerHTML = '<p class="lm-empty">まだゲームが登録されていません。</p>'; return; }
    list.innerHTML = '';
    for (const game of games) {
      let icon = `<span class="lm-game-icon lm-game-icon-placeholder" aria-hidden="true">${ICON_GAME}</span>`;
      if (game.iconKey && window.LMGameDB) {
        try { const blob = await LMGameDB.getImage(game.iconKey); if (blob) icon = `<img class="lm-game-icon" src="${newObjectUrl(blob)}" alt="">`; } catch (e) { console.warn(e); }
      }
      const card = document.createElement('article'); card.className = `lm-game-card${game.id === editingGameId ? ' is-editing' : ''}`;
      card.innerHTML = `${icon}<div class="lm-game-card-main"><strong>${escapeHtml(game.name)}</strong><p class="lm-game-card-summary">石 ${num(game.currentStones).toLocaleString()}${num(game.stoneGoal) ? ` / 目標 ${num(game.stoneGoal).toLocaleString()}` : ''}</p><p class="lm-game-card-summary">最終ログイン：${escapeHtml(game.lastLoginDate || '未記録')}</p></div><div class="lm-game-card-actions"><button type="button" class="lm-btn secondary" data-game-edit="${escapeHtml(game.id)}">編集</button><button type="button" class="lm-btn secondary" data-game-delete="${escapeHtml(game.id)}">削除</button></div>`;
      list.appendChild(card);
    }
    list.querySelectorAll('[data-game-delete]').forEach((b) => b.addEventListener('click', () => deleteGame(b.dataset.gameDelete)));
    list.querySelectorAll('[data-game-edit]').forEach((b) => b.addEventListener('click', () => startGameEdit(b.dataset.gameEdit)));
  }

  function renderActivePanel() {
    revokeUrls();
    refreshGamePicker();
    renderGameList();
    if (activeTab === 'login') renderLoginPanel();
    if (activeTab === 'stones') renderStonesPanel();
    if (activeTab === 'notes') renderNotesPanel();
    renderCalendar(); renderStickyNotes();
  }

  function renderLoginPanel() {
    const root = $('game-login-content'); const game = currentGame();
    if (!game) { root.innerHTML = '<p class="lm-empty">先にゲームを登録してください。</p>'; return; }
    const reminderTimes = Array.isArray(game.reminderTimes) && game.reminderTimes.length ? game.reminderTimes : [game.reminderTime || '20:00'];
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><p class="lm-game-status">今日のログイン：${game.lastLoginDate === today() ? '記録済み' : '未記録'}</p><button type="button" class="lm-btn" id="game-login-today">今日ログインした</button><label class="lm-game-check"><input type="checkbox" id="game-notify-enabled" ${game.notifyEnabled ? 'checked' : ''}> ログイン通知を使う</label><fieldset class="lm-game-notify-times"><legend>通知時刻（複数設定可）</legend><div id="game-reminder-times-list">${reminderTimes.map((time, i) => `<div class="lm-game-reminder-row"><input type="time" data-reminder-time="${i}" value="${escapeHtml(time)}" aria-label="通知時刻 ${i + 1}"><button type="button" class="lm-btn secondary lm-game-small-btn" data-remove-reminder="${i}" aria-label="通知時刻を削除">削除</button></div>`).join('')}</div><button type="button" class="lm-btn secondary" id="game-add-reminder-time">＋ 時刻を追加</button></fieldset><p class="lm-game-status" id="game-notify-status">今日のログイン記録がない場合、設定時刻ごとに通知対象になります。</p></div>`;
    $('game-login-today').addEventListener('click', async () => {
      updateGame(game.id, (g) => { g.lastLoginDate = today(); g.lastLoginAt = Date.now(); g.loginHistory = [...new Set([...(g.loginHistory || []), today()])].sort(); });
      await syncReminders(); renderActivePanel(); toast('今日のログインを記録しました');
    });
    $('game-notify-enabled').addEventListener('change', async (e) => {
      const status = $('game-notify-status'); let enabled = e.currentTarget.checked;
      if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { e.currentTarget.checked = false; status.textContent = '通知が許可されていません。端末やブラウザの設定を確認してください。'; return; }
      }
      if (enabled && !('Notification' in window)) { e.currentTarget.checked = false; status.textContent = 'このブラウザでは通知に対応していません。'; return; }
      if (enabled) {
        if (!window.LMFirebase || typeof window.LMFirebase.registerToken !== 'function') {
          e.currentTarget.checked = false;
          status.textContent = '通知機能の準備ができていません。ページを再読み込みしてからお試しください。';
          return;
        }
        const token = await window.LMFirebase.registerToken();
        if (!token) {
          e.currentTarget.checked = false;
          status.textContent = '通知の登録に失敗しました。HTTPS・Service Worker・Firebase設定を確認してください。';
          return;
        }
      }
      updateGame(game.id, (g) => { g.notifyEnabled = enabled; }); await syncReminders(); renderActivePanel();
    });
    const saveReminderTimes = async () => {
      const times = [...root.querySelectorAll('[data-reminder-time]')].map((input) => input.value).filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
      updateGame(game.id, (g) => { g.reminderTimes = [...new Set(times)].sort(); g.reminderTime = g.reminderTimes[0] || '20:00'; });
      await syncReminders();
    };
    root.querySelectorAll('[data-reminder-time]').forEach((input) => input.addEventListener('change', saveReminderTimes));
    root.querySelectorAll('[data-remove-reminder]').forEach((button) => button.addEventListener('click', async () => { const idx = Number(button.dataset.removeReminder); updateGame(game.id, (g) => { const existing = Array.isArray(g.reminderTimes) && g.reminderTimes.length ? g.reminderTimes : [g.reminderTime || '20:00']; g.reminderTimes = existing.filter((_, i) => i !== idx); g.reminderTime = g.reminderTimes[0] || '20:00'; }); await syncReminders(); renderActivePanel(); }));
    $('game-add-reminder-time').addEventListener('click', () => {
      const list = $('game-reminder-times-list'); const index = list.querySelectorAll('[data-reminder-time]').length;
      if (index >= 8) { toast('通知時刻は8件まで設定できます', 'error'); return; }
      const row = document.createElement('div'); row.className = 'lm-game-reminder-row';
      row.innerHTML = `<input type="time" data-reminder-time="${index}" value="20:00" aria-label="通知時刻 ${index + 1}"><button type="button" class="lm-btn secondary lm-game-small-btn" data-remove-reminder="${index}" aria-label="通知時刻を削除">削除</button>`;
      list.appendChild(row);
      row.querySelector('[data-reminder-time]').addEventListener('change', saveReminderTimes);
      row.querySelector('[data-remove-reminder]').addEventListener('click', async () => { const idx = Number(row.querySelector('[data-reminder-time]').dataset.reminderTime); updateGame(game.id, (g) => { const existing = Array.isArray(g.reminderTimes) && g.reminderTimes.length ? g.reminderTimes : [g.reminderTime || '20:00']; g.reminderTimes = existing.filter((_, i) => i !== idx); g.reminderTime = g.reminderTimes[0] || '20:00'; }); await syncReminders(); renderActivePanel(); });
      saveReminderTimes();
    });
  }

  function renderStonesPanel() {
    const root = $('game-stones-content'); const game = currentGame();
    if (!game) { root.innerHTML = '<p class="lm-empty">先にゲームを登録してください。</p>'; return; }
    const logs = Array.isArray(game.stoneLogs) ? game.stoneLogs : [];
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><form id="game-stones-form" class="lm-game-form"><div class="lm-field"><label for="game-stone-current">現在の所持数</label><input id="game-stone-current" type="number" min="0" step="1" inputmode="numeric" name="currentStones" value="${num(game.currentStones)}" required></div><div class="lm-field"><label for="game-stone-goal">目標数</label><input id="game-stone-goal" type="number" min="0" step="1" inputmode="numeric" name="stoneGoal" value="${num(game.stoneGoal)}"></div><div class="lm-field"><label for="game-stone-goal-date">目標期日</label><input id="game-stone-goal-date" type="date" name="stoneGoalDate" value="${escapeHtml(game.stoneGoalDate || '')}"></div><button class="lm-btn" type="submit">所持数・目標を保存</button></form><div class="lm-game-quick-stone-wrap"><div class="lm-game-status">登録したボタンで石を追加</div><div class="lm-game-quick-stone-buttons">${(Array.isArray(game.stoneQuickButtons) ? game.stoneQuickButtons : [100, 1000]).map((amount) => `<button type="button" class="lm-btn secondary lm-game-quick-stone" data-stone-add="${num(amount)}">＋${num(amount).toLocaleString()}</button>`).join('')}</div></div><form id="game-stone-delta" class="lm-game-form lm-game-delta-form"><div class="lm-field"><label for="game-stone-earned">入手した石</label><input id="game-stone-earned" type="number" min="0" step="1" inputmode="numeric" name="earned" value="0"></div><div class="lm-field"><label for="game-stone-spent">使った石</label><input id="game-stone-spent" type="number" min="0" step="1" inputmode="numeric" name="spent" value="0"></div><button class="lm-btn" type="submit">差分を反映</button></form><p class="lm-game-status">目標まであと ${Math.max(0, num(game.stoneGoal) - num(game.currentStones)).toLocaleString()} 個</p><details><summary>最近の石の履歴</summary>${logs.length ? `<ul class="lm-game-log-list">${logs.slice(-10).reverse().map((log) => `<li>${escapeHtml(log.date)}：${Number(log.delta) >= 0 ? '+' : ''}${Number(log.delta).toLocaleString()}（${escapeHtml(log.note || '手動記録')}）</li>`).join('')}</ul>` : '<p class="lm-empty">履歴はありません。</p>'}</details></div>`;
    $('game-stones-form').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); updateGame(game.id, (g) => { g.currentStones = num(fd.get('currentStones')); g.stoneGoal = num(fd.get('stoneGoal')); g.stoneGoalDate = String(fd.get('stoneGoalDate') || ''); }); renderActivePanel(); toast('石の数と目標を保存しました'); });
    $('game-stone-delta').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const earned = num(fd.get('earned')); const spent = num(fd.get('spent')); if (spent > num(game.currentStones) + earned) { toast('所持数を超えて消費することはできません', 'error'); return; } updateGame(game.id, (g) => { const delta = earned - spent; g.currentStones = num(g.currentStones) + delta; g.stoneLogs = [...(g.stoneLogs || []), { id: uid(), date: today(), delta, note: `入手${earned}・消費${spent}` }]; }); renderActivePanel(); toast('石の差分を反映しました'); });
    root.querySelectorAll('[data-stone-add]').forEach((button) => button.addEventListener('click', () => {
      const amount = num(button.dataset.stoneAdd); if (!amount) return;
      updateGame(game.id, (g) => { g.currentStones = num(g.currentStones) + amount; g.stoneLogs = [...(g.stoneLogs || []), { id: uid(), date: today(), delta: amount, note: `クイック追加 +${amount}` }]; });
      renderActivePanel(); toast(`＋${amount.toLocaleString()} を追加しました`);
    }));
  }

  async function renderNotesPanel() {
    const root = $('game-notes-content'); const game = currentGame();
    if (!game) { root.innerHTML = '<p class="lm-empty">先にゲームを登録してください。</p>'; return; }
    const notes = Array.isArray(game.notes) ? game.notes.slice().sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || Number(b.updatedAt || b.createdAt || 0)-Number(a.updatedAt || a.createdAt || 0)) : [];
    const editing = editingNoteId ? (game.notes || []).find((n) => n.id === editingNoteId) || null : null;
    if (!editing) editingNoteId = '';
    const hasImage = !!(editing && editing.imageKey);
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><div class="lm-game-form-label" id="game-note-form-title">${editing ? 'メモを編集' : 'メモを登録'}</div><form id="game-note-form" class="lm-game-form"><div class="lm-field"><label for="game-note-title">メモのタイトル</label><input id="game-note-title" name="title" maxlength="120" placeholder="例：イベント攻略" value="${editing ? escapeHtml(editing.title) : ''}" required></div><div class="lm-field"><label for="game-note-url">URL</label><input id="game-note-url" name="url" type="url" placeholder="https://..." value="${editing ? escapeHtml(editing.url || '') : ''}"></div><div class="lm-field"><label for="game-note-text">テキスト</label><textarea id="game-note-text" name="text" rows="3" placeholder="攻略情報やメモ">${editing ? escapeHtml(editing.text || '') : ''}</textarea></div><div class="lm-field lm-game-file-field"><label for="game-note-image">画像（任意）</label><label class="lm-game-file-control"><span id="game-note-file-name">${hasImage ? '現在の画像（変更する場合のみ選択）' : '画像を選ぶ'}</span><span class="lm-game-file-button">ファイルを選択</span><input id="game-note-image" name="image" type="file" accept="image/*"></label></div>${hasImage ? '<label class="lm-game-check"><input type="checkbox" name="removeImage"> 現在の画像を削除する</label>' : ''}<div class="lm-game-form-actions"><button class="lm-btn" type="submit">${editing ? 'メモを更新' : 'メモを保存'}</button>${editing ? '<button type="button" class="lm-btn secondary" id="game-note-cancel-edit">キャンセル</button>' : ''}</div></form><div class="lm-game-notes">${notes.length ? notes.map((note) => `<article class="lm-game-note${editing && editing.id === note.id ? ' is-editing' : ''}"><div class="lm-game-note-head"><h4>${escapeHtml(note.title)}</h4><button type="button" class="lm-game-pin-btn${note.pinned ? ' is-pinned' : ''}" data-note-pin="${escapeHtml(note.id)}" aria-pressed="${note.pinned ? 'true' : 'false'}" aria-label="${note.pinned ? 'ピン留めを解除' : 'ピン留め'}" title="${note.pinned ? 'ピン留めを解除' : 'ピン留め'}">${ICON_PIN(!!note.pinned)}</button></div>${safeWebUrl(note.url) ? `<p><a href="${escapeHtml(safeWebUrl(note.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.url)}</a></p>` : ''}${note.text ? `<p class="lm-game-note-text">${escapeHtml(note.text).replace(/\n/g, '<br>')}</p>` : ''}${note.imageKey ? `<div class="lm-note-image" data-image-key="${escapeHtml(note.imageKey)}">画像を読み込み中…</div>` : ''}<div class="lm-game-note-actions"><button type="button" class="lm-btn secondary" data-note-edit="${escapeHtml(note.id)}">編集</button><button type="button" class="lm-btn secondary" data-note-delete="${escapeHtml(note.id)}">削除</button></div></article>`).join('') : '<p class="lm-empty">攻略メモはありません。</p>'}</div></div>`;
    const fileInput = root.querySelector('input[name="image"]'); fileInput.addEventListener('change', () => { $('game-note-file-name').textContent = fileInput.files[0]?.name || (hasImage ? '現在の画像（変更する場合のみ選択）' : '画像を選ぶ'); });
    const cancelNoteEdit = $('game-note-cancel-edit'); if (cancelNoteEdit) cancelNoteEdit.addEventListener('click', () => { editingNoteId = ''; renderActivePanel(); });
    $('game-note-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const file = fd.get('image'); const rawUrl = String(fd.get('url') || '').trim();
      if (rawUrl && !safeWebUrl(rawUrl)) { toast('URLは http:// または https:// から始めてください', 'error'); return; }
      if (editing) {
        let editedImageKey = editing.imageKey || '';
        if (file && file.size && file.type.startsWith('image/')) { const key = editedImageKey || `note:${game.id}:${uid()}`; try { await LMGameDB.putImage(key, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; } editedImageKey = key; }
        else if (fd.get('removeImage') && editedImageKey) { await LMGameDB.deleteImage(editedImageKey).catch(() => {}); editedImageKey = ''; }
        updateGame(game.id, (g) => { g.notes = (g.notes || []).map((n) => n.id === editing.id ? { ...n, title: String(fd.get('title') || '').trim(), url: safeWebUrl(rawUrl), text: String(fd.get('text') || ''), imageKey: editedImageKey, updatedAt: Date.now() } : n); });
        editingNoteId = ''; renderActivePanel(); toast('攻略メモを更新しました'); return;
      }
      let imageKey = '';
      if (file && file.size && file.type.startsWith('image/')) { imageKey = `note:${game.id}:${uid()}`; try { await LMGameDB.putImage(imageKey, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; } }
      const now = Date.now(); const note = { id: uid(), title: String(fd.get('title') || '').trim(), url: safeWebUrl(rawUrl), text: String(fd.get('text') || ''), imageKey, createdAt: now, updatedAt: now, pinned: false };
      updateGame(game.id, (g) => { g.notes = [...(g.notes || []), note]; }); renderActivePanel(); toast('攻略メモを保存しました');
    });
    root.querySelectorAll('[data-note-pin]').forEach((b) => b.addEventListener('click', () => { updateGame(game.id, (g) => { g.notes = (g.notes || []).map((n) => n.id === b.dataset.notePin ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n); }); renderActivePanel(); }));
    root.querySelectorAll('[data-note-edit]').forEach((b) => b.addEventListener('click', () => { editingNoteId = b.dataset.noteEdit; renderActivePanel(); scrollToEl($('game-note-form-title')); }));
    root.querySelectorAll('[data-note-delete]').forEach((b) => b.addEventListener('click', async () => { const note = (readGames().find((g) => g.id === game.id)?.notes || []).find((n) => n.id === b.dataset.noteDelete); if (!note || !confirm(`「${note.title}」を削除しますか？`)) return; if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {}); updateGame(game.id, (g) => { g.notes = (g.notes || []).filter((n) => n.id !== note.id); }); if (editingNoteId === note.id) editingNoteId = ''; renderActivePanel(); }));
    await loadImages(root);
  }

  async function loadImages(root) {
    for (const box of root.querySelectorAll('[data-image-key]')) { try { const blob = await LMGameDB.getImage(box.dataset.imageKey); if (!blob) { box.textContent = '画像が見つかりません'; continue; } const img = document.createElement('img'); img.src = newObjectUrl(blob); img.alt = '攻略メモの画像'; box.replaceChildren(img); } catch { box.textContent = '画像を読み込めませんでした'; } }
  }

  function renderCalendar() {
    const games = readGames();
    const year = shownMonth.getFullYear();
    const month = shownMonth.getMonth();
    $('game-calendar-title').textContent = `${year}年${month + 1}月`;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const loginDates = new Set(games.flatMap((g) => [...(g.loginHistory || []), ...(g.lastLoginDate ? [g.lastLoginDate] : [])]));
    const goalDates = new Set(games.filter((g) => g.stoneGoalDate).map((g) => g.stoneGoalDate));
    const grid = $('game-calendar-grid');
    grid.replaceChildren();
    ['日', '月', '火', '水', '木', '金', '土'].forEach((weekday) => {
      const heading = document.createElement('span');
      heading.className = 'hs-calendar-weekday';
      heading.textContent = weekday;
      grid.appendChild(heading);
    });
    for (let cell = 0; cell < cellCount; cell += 1) {
      const day = cell - firstWeekday + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hs-calendar-day';
      if (day < 1 || day > daysInMonth) {
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        grid.appendChild(button);
        continue;
      }
      const date = dateString(new Date(year, month, day));
      const hasLogin = loginDates.has(date);
      const hasGoal = goalDates.has(date);
      button.dataset.date = date;
      button.setAttribute('aria-pressed', String(date === selectedCalendarDate));
      if (date === today()) button.classList.add('is-today');
      const number = document.createElement('span');
      number.className = 'hs-calendar-number';
      number.textContent = String(day);
      button.appendChild(number);
      const markers = document.createElement('span');
      markers.className = 'hs-calendar-markers';
      if (hasLogin) {
        const marker = document.createElement('span');
        marker.className = 'hs-calendar-marker is-game-login';
        marker.setAttribute('aria-label', 'ログイン');
        markers.appendChild(marker);
      }
      if (hasGoal) {
        const marker = document.createElement('span');
        marker.className = 'hs-calendar-marker is-game-goal';
        marker.setAttribute('aria-label', '石の目標期日');
        markers.appendChild(marker);
      }
      button.appendChild(markers);
      button.setAttribute('aria-label', `${date}${hasLogin ? '、ログイン記録あり' : ''}${hasGoal ? '、石の目標期日' : ''}`);
      button.addEventListener('click', () => {
        selectedCalendarDate = date;
        renderCalendar();
        renderSelectedCalendarDate();
      });
      grid.appendChild(button);
    }
    renderSelectedCalendarDate();
  }

  function renderSelectedCalendarDate() {
    const games = readGames(); const logins = games.filter((g) => (g.loginHistory || []).includes(selectedCalendarDate) || g.lastLoginDate === selectedCalendarDate).map((g) => g.name); const goals = games.filter((g) => g.stoneGoalDate === selectedCalendarDate).map((g) => g.name);
    const parts = []; if (logins.length) parts.push(`ログイン：${logins.join('、')}`); if (goals.length) parts.push(`石の目標期日：${goals.join('、')}`);
    $('game-calendar-selected').textContent = `${selectedCalendarDate}　${parts.join('／') || '記録はありません。'}`;
  }

  async function renderStickyNotes() {
    const root = $('game-sticky-board'); const all = [];
    for (const game of readGames()) for (const note of (game.notes || [])) all.push({ ...note, gameName: game.name, gameId: game.id });
    all.sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || Number(b.updatedAt || b.createdAt || 0)-Number(a.updatedAt || a.createdAt || 0));
    const notes = all.slice(0, 4);
    if (!notes.length) { root.innerHTML = '<p class="lm-empty">攻略メモはまだありません。</p>'; return; }
    root.innerHTML = notes.map((note, i) => `<article class="lm-game-sticky sticky-${i + 1}"><div class="lm-game-sticky-top"><span>${escapeHtml(note.gameName)}</span>${note.pinned ? `<span class="lm-game-sticky-pin" aria-label="ピン留め">${ICON_PIN(true)}</span>` : ''}</div><h3>${escapeHtml(note.title)}</h3>${safeWebUrl(note.url) ? `<a href="${escapeHtml(safeWebUrl(note.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.url)}</a>` : ''}<p>${escapeHtml(note.text || '').replace(/\n/g, ' ')}</p><button type="button" data-sticky-open="${escapeHtml(note.gameId)}">開く</button></article>`).join('');
    root.querySelectorAll('[data-sticky-open]').forEach((b) => b.addEventListener('click', () => { selectedGameId = b.dataset.stickyOpen; localStorage.setItem('lm_games_selected', selectedGameId); setTab('notes'); slideToInput('notes'); }));
  }

  async function deleteGame(id) {
    const games = readGames(); const game = games.find((g) => g.id === id); if (!game || !confirm(`「${game.name}」と関連データを削除しますか？`)) return;
    if (game.iconKey) await LMGameDB.deleteImage(game.iconKey).catch(() => {});
    for (const note of game.notes || []) if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {});
    saveGames(games.filter((g) => g.id !== id)); if (editingGameId === id) resetGameForm(); if (selectedGameId === id) selectedGameId = ''; await syncReminders(); renderActivePanel();
  }

  let pendingQuickAmounts = [100, 1000];
  function renderPendingQuickAmounts() {
    const root = $('game-quick-values');
    root.innerHTML = pendingQuickAmounts.length ? pendingQuickAmounts.map((amount) => `<span class="lm-game-quick-chip">＋${amount.toLocaleString()}<button type="button" data-remove-quick="${amount}" aria-label="＋${amount}を削除">×</button></span>`).join('') : '<span class="lm-game-status">追加ボタンは未設定です。</span>';
    root.querySelectorAll('[data-remove-quick]').forEach((button) => button.addEventListener('click', () => { pendingQuickAmounts = pendingQuickAmounts.filter((amount) => amount !== Number(button.dataset.removeQuick)); renderPendingQuickAmounts(); }));
  }
  $('game-quick-add-button').addEventListener('click', () => {
    const input = $('game-quick-amount'); const amount = Number(input.value);
    if (!Number.isSafeInteger(amount) || amount <= 0) { toast('1以上の整数を入力してください', 'error'); return; }
    if (pendingQuickAmounts.includes(amount)) { toast('その追加ボタンは登録済みです', 'error'); return; }
    if (pendingQuickAmounts.length >= 8) { toast('追加ボタンは8個まで登録できます', 'error'); return; }
    pendingQuickAmounts.push(amount); pendingQuickAmounts.sort((a, b) => a - b); input.value = ''; renderPendingQuickAmounts();
  });
  renderPendingQuickAmounts();

  function resetGameForm() {
    editingGameId = '';
    $('game-form').reset();
    pendingQuickAmounts = [100, 1000]; renderPendingQuickAmounts();
    $('game-icon-file-name').textContent = '画像を選ぶ';
    $('game-icon-remove-field').hidden = true;
    $('game-form-title').textContent = 'ゲームを登録';
    $('game-submit').textContent = 'ゲームを追加';
    $('game-cancel-edit').style.display = 'none';
  }

  function startGameEdit(id) {
    const game = readGames().find((g) => g.id === id); if (!game) return;
    editingGameId = id;
    $('game-name').value = game.name;
    $('game-icon').value = '';
    $('game-icon-file-name').textContent = game.iconKey ? '現在の画像（変更する場合のみ選択）' : '画像を選ぶ';
    $('game-icon-remove').checked = false;
    $('game-icon-remove-field').hidden = !game.iconKey;
    pendingQuickAmounts = (Array.isArray(game.stoneQuickButtons) ? game.stoneQuickButtons : [100, 1000]).map(num).filter((n) => n > 0);
    renderPendingQuickAmounts();
    $('game-form-title').textContent = 'ゲームを編集';
    $('game-submit').textContent = '変更を保存';
    $('game-cancel-edit').style.display = 'inline-block';
    renderGameList();
    scrollToEl($('game-register-section'));
  }

  async function saveGameEdit(name) {
    const id = editingGameId; const current = readGames().find((g) => g.id === id);
    if (!current) { resetGameForm(); return; }
    const file = $('game-icon').files[0]; let iconKey = current.iconKey || '';
    if (file && file.type.startsWith('image/')) {
      const key = iconKey || `icon:${id}`;
      try { await LMGameDB.putImage(key, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; }
      iconKey = key;
    } else if ($('game-icon-remove').checked && iconKey) {
      await LMGameDB.deleteImage(iconKey).catch(() => {}); iconKey = '';
    }
    updateGame(id, (g) => { g.name = name; g.iconKey = iconKey; g.stoneQuickButtons = [...pendingQuickAmounts]; });
    syncReminders().catch((err) => console.warn(err)); resetGameForm(); refreshGamePicker(); renderActivePanel(); toast('ゲームを更新しました');
  }
  $('game-cancel-edit').addEventListener('click', resetGameForm);

  $('game-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = $('game-name').value.trim(); if (!name) return; if (editingGameId) { await saveGameEdit(name); return; } const id = uid(); const file = $('game-icon').files[0]; let iconKey = '';
    if (file && file.type.startsWith('image/')) { iconKey = `icon:${id}`; try { await LMGameDB.putImage(iconKey, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; } }
    const games = readGames(); games.push({ id, name, iconKey, lastLoginDate: '', loginHistory: [], currentStones: 0, stoneGoal: 0, stoneGoalDate: '', stoneLogs: [], stoneQuickButtons: [...pendingQuickAmounts], notes: [], notifyEnabled: false, reminderTimes: ['20:00'], reminderTime: '20:00', createdAt: Date.now() });
    saveGames(games); selectedGameId = id; localStorage.setItem('lm_games_selected', id); e.currentTarget.reset(); pendingQuickAmounts = [100, 1000]; renderPendingQuickAmounts(); $('game-icon-file-name').textContent = '画像を選ぶ'; refreshGamePicker(); renderActivePanel(); toast('ゲームを登録しました');
  });

  $('game-icon').addEventListener('change', () => { $('game-icon-file-name').textContent = $('game-icon').files[0]?.name || '画像を選ぶ'; });
  $('game-current-select').addEventListener('change', (e) => { selectedGameId = e.currentTarget.value; localStorage.setItem('lm_games_selected', selectedGameId); renderActivePanel(); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); slideToInput(b.dataset.tab); }));
  document.querySelectorAll('[data-open-tab]').forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.openTab); slideToInput(b.dataset.openTab); }));
  $('game-calendar-prev').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1); renderCalendar(); });
  $('game-calendar-next').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1); renderCalendar(); });
  $('game-calendar-today').addEventListener('click', () => { shownMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedCalendarDate = today(); renderCalendar(); });
  $('game-slide-prev').addEventListener('click', () => setSlide(activeSlide - 1)); $('game-slide-next').addEventListener('click', () => setSlide(activeSlide + 1));
  document.querySelectorAll('[data-slide-to]').forEach((b) => b.addEventListener('click', () => setSlide(Number(b.dataset.slideTo))));

  if (typeof LM !== 'undefined' && typeof LM.renderNav === 'function') LM.renderNav($('nav-container'));
  refreshGamePicker(); setTab('register'); setSlide(0);
})();
