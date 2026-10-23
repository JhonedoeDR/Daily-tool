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
  const today = () => dateString(new Date());
  let selectedCalendarDate = today();
  const objectUrls = new Set();
  const dateString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const uid = () => (window.LM && LM.uid ? LM.uid() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const readGames = () => { try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); } catch { return []; } };
  const saveGames = (games) => localStorage.setItem(GAMES_KEY, JSON.stringify(games));
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeWebUrl = (value) => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const toast = (message, type) => window.LM?.showToast ? LM.showToast(message, type) : alert(message);
  const currentGame = () => readGames().find((g) => g.id === selectedGameId) || null;

  function revokeUrls() { objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear(); }
  function newObjectUrl(blob) { const url = URL.createObjectURL(blob); objectUrls.add(url); return url; }

  async function syncReminders() {
    const reminders = readGames().filter((g) => g.notifyEnabled).map((g) => ({ id: g.id, name: g.name, lastLoginDate: g.lastLoginDate || '', reminderTime: g.reminderTime || '20:00', notifyEnabled: true }));
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
    if (window.LM && typeof LM.syncFirebase === 'function') await LM.syncFirebase();
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
      let icon = '<span class="lm-game-icon lm-game-icon-placeholder" aria-hidden="true">🎮</span>';
      if (game.iconKey && window.LMGameDB) {
        try { const blob = await LMGameDB.getImage(game.iconKey); if (blob) icon = `<img class="lm-game-icon" src="${newObjectUrl(blob)}" alt="">`; } catch (e) { console.warn(e); }
      }
      const card = document.createElement('article'); card.className = 'lm-game-card';
      card.innerHTML = `${icon}<div class="lm-game-card-main"><strong>${escapeHtml(game.name)}</strong><p class="lm-game-card-summary">石 ${num(game.currentStones).toLocaleString()}${num(game.stoneGoal) ? ` / 目標 ${num(game.stoneGoal).toLocaleString()}` : ''}</p><p class="lm-game-card-summary">最終ログイン：${escapeHtml(game.lastLoginDate || '未記録')}</p></div><button type="button" class="lm-text-btn" data-game-delete="${escapeHtml(game.id)}">削除</button>`;
      list.appendChild(card);
    }
    list.querySelectorAll('[data-game-delete]').forEach((b) => b.addEventListener('click', () => deleteGame(b.dataset.gameDelete)));
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
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><p class="lm-game-status">今日のログイン：${game.lastLoginDate === today() ? '記録済み' : '未記録'}</p><button type="button" class="lm-btn" id="game-login-today">今日ログインした</button><label class="lm-game-check"><input type="checkbox" id="game-notify-enabled" ${game.notifyEnabled ? 'checked' : ''}> ログイン通知を使う</label><label>通知時刻<input type="time" id="game-reminder-time" value="${escapeHtml(game.reminderTime || '20:00')}"></label><p class="lm-game-status" id="game-notify-status">通知はログイン記録がない日の指定時刻以降に判定されます。</p></div>`;
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
    $('game-reminder-time').addEventListener('change', async (e) => { updateGame(game.id, (g) => { g.reminderTime = e.currentTarget.value || '20:00'; }); await syncReminders(); });
  }

  function renderStonesPanel() {
    const root = $('game-stones-content'); const game = currentGame();
    if (!game) { root.innerHTML = '<p class="lm-empty">先にゲームを登録してください。</p>'; return; }
    const logs = Array.isArray(game.stoneLogs) ? game.stoneLogs : [];
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><form id="game-stones-form" class="lm-game-form"><label>現在の所持数<input type="number" min="0" step="1" name="currentStones" value="${num(game.currentStones)}" required></label><label>目標数<input type="number" min="0" step="1" name="stoneGoal" value="${num(game.stoneGoal)}"></label><label>目標期日<input type="date" name="stoneGoalDate" value="${escapeHtml(game.stoneGoalDate || '')}"></label><button class="lm-btn secondary" type="submit">所持数・目標を保存</button></form><form id="game-stone-delta" class="lm-game-form lm-game-delta-form"><label>入手した石<input type="number" min="0" step="1" name="earned" value="0"></label><label>使った石<input type="number" min="0" step="1" name="spent" value="0"></label><button class="lm-btn" type="submit">差分を反映</button></form><p class="lm-game-status">目標まであと ${Math.max(0, num(game.stoneGoal) - num(game.currentStones)).toLocaleString()} 個</p><details><summary>最近の石の履歴</summary>${logs.length ? `<ul class="lm-game-log-list">${logs.slice(-10).reverse().map((log) => `<li>${escapeHtml(log.date)}：${Number(log.delta) >= 0 ? '+' : ''}${Number(log.delta).toLocaleString()}（${escapeHtml(log.note || '手動記録')}）</li>`).join('')}</ul>` : '<p class="lm-empty">履歴はありません。</p>'}</details></div>`;
    $('game-stones-form').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); updateGame(game.id, (g) => { g.currentStones = num(fd.get('currentStones')); g.stoneGoal = num(fd.get('stoneGoal')); g.stoneGoalDate = String(fd.get('stoneGoalDate') || ''); }); renderActivePanel(); toast('石の数と目標を保存しました'); });
    $('game-stone-delta').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const earned = num(fd.get('earned')); const spent = num(fd.get('spent')); if (spent > num(game.currentStones) + earned) { toast('所持数を超えて消費することはできません', 'error'); return; } updateGame(game.id, (g) => { const delta = earned - spent; g.currentStones = num(g.currentStones) + delta; g.stoneLogs = [...(g.stoneLogs || []), { id: uid(), date: today(), delta, note: `入手${earned}・消費${spent}` }]; }); renderActivePanel(); toast('石の差分を反映しました'); });
  }

  async function renderNotesPanel() {
    const root = $('game-notes-content'); const game = currentGame();
    if (!game) { root.innerHTML = '<p class="lm-empty">先にゲームを登録してください。</p>'; return; }
    const notes = Array.isArray(game.notes) ? game.notes.slice().sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || Number(b.updatedAt || b.createdAt || 0)-Number(a.updatedAt || a.createdAt || 0)) : [];
    root.innerHTML = `<div class="lm-game-subsection"><h3>${escapeHtml(game.name)}</h3><form id="game-note-form" class="lm-game-form"><label>メモのタイトル<input name="title" maxlength="120" placeholder="例：イベント攻略" required></label><label>URL<input name="url" type="url" placeholder="https://..."></label><label>テキスト<textarea name="text" rows="3" placeholder="攻略情報やメモ"></textarea></label><label class="lm-game-file-field"><span>画像（任意）</span><span class="lm-game-file-control"><span id="game-note-file-name">画像を選ぶ</span><span class="lm-game-file-button">ファイルを選択</span><input name="image" type="file" accept="image/*"></span></label><button class="lm-btn" type="submit">メモを保存</button></form><div class="lm-game-notes">${notes.length ? notes.map((note) => `<article class="lm-game-note"><div class="lm-game-note-head"><h4>${escapeHtml(note.title)}</h4><button type="button" class="lm-text-btn" data-note-pin="${escapeHtml(note.id)}">${note.pinned ? '📌 ピン留め解除' : '📌 ピン留め'}</button></div>${safeWebUrl(note.url) ? `<p><a href="${escapeHtml(safeWebUrl(note.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.url)}</a></p>` : ''}${note.text ? `<p class="lm-game-note-text">${escapeHtml(note.text).replace(/\n/g, '<br>')}</p>` : ''}${note.imageKey ? `<div class="lm-note-image" data-image-key="${escapeHtml(note.imageKey)}">画像を読み込み中…</div>` : ''}<button type="button" class="lm-text-btn" data-note-delete="${escapeHtml(note.id)}">このメモを削除</button></article>`).join('') : '<p class="lm-empty">攻略メモはありません。</p>'}</div></div>`;
    const fileInput = root.querySelector('input[name="image"]'); fileInput.addEventListener('change', () => { $('game-note-file-name').textContent = fileInput.files[0]?.name || '画像を選ぶ'; });
    $('game-note-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const file = fd.get('image'); const rawUrl = String(fd.get('url') || '').trim();
      if (rawUrl && !safeWebUrl(rawUrl)) { toast('URLは http:// または https:// から始めてください', 'error'); return; }
      let imageKey = '';
      if (file && file.size && file.type.startsWith('image/')) { imageKey = `note:${game.id}:${uid()}`; try { await LMGameDB.putImage(imageKey, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; } }
      const now = Date.now(); const note = { id: uid(), title: String(fd.get('title') || '').trim(), url: safeWebUrl(rawUrl), text: String(fd.get('text') || ''), imageKey, createdAt: now, updatedAt: now, pinned: false };
      updateGame(game.id, (g) => { g.notes = [...(g.notes || []), note]; }); renderActivePanel(); toast('攻略メモを保存しました');
    });
    root.querySelectorAll('[data-note-pin]').forEach((b) => b.addEventListener('click', () => { updateGame(game.id, (g) => { g.notes = (g.notes || []).map((n) => n.id === b.dataset.notePin ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n); }); renderActivePanel(); }));
    root.querySelectorAll('[data-note-delete]').forEach((b) => b.addEventListener('click', async () => { const note = (readGames().find((g) => g.id === game.id)?.notes || []).find((n) => n.id === b.dataset.noteDelete); if (!note || !confirm(`「${note.title}」を削除しますか？`)) return; if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {}); updateGame(game.id, (g) => { g.notes = (g.notes || []).filter((n) => n.id !== note.id); }); renderActivePanel(); }));
    await loadImages(root);
  }

  async function loadImages(root) {
    for (const box of root.querySelectorAll('[data-image-key]')) { try { const blob = await LMGameDB.getImage(box.dataset.imageKey); if (!blob) { box.textContent = '画像が見つかりません'; continue; } const img = document.createElement('img'); img.src = newObjectUrl(blob); img.alt = '攻略メモの画像'; box.replaceChildren(img); } catch { box.textContent = '画像を読み込めませんでした'; } }
  }

  function renderCalendar() {
    const games = readGames(); const year = shownMonth.getFullYear(); const month = shownMonth.getMonth();
    $('game-calendar-title').textContent = `${year}年${month + 1}月`;
    const first = new Date(year, month, 1); const start = new Date(year, month, 1 - first.getDay());
    const loginDates = new Set(games.flatMap((g) => [...(g.loginHistory || []), ...(g.lastLoginDate ? [g.lastLoginDate] : [])]));
    const goalDates = new Set(games.filter((g) => g.stoneGoalDate).map((g) => g.stoneGoalDate));
    const grid = $('game-calendar-grid'); grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i); const key = dateString(date); const button = document.createElement('button'); button.type = 'button'; button.className = 'lm-game-calendar-day';
      if (date.getMonth() !== month) button.classList.add('is-other-month'); if (key === today()) button.classList.add('is-today'); if (key === selectedCalendarDate) button.classList.add('is-selected');
      button.innerHTML = `<span>${date.getDate()}</span><span class="lm-game-day-dots">${loginDates.has(key) ? '<i class="login-dot"></i>' : ''}${goalDates.has(key) ? '<i class="goal-dot"></i>' : ''}</span>`;
      button.setAttribute('aria-label', `${key}${loginDates.has(key) ? ' ログイン記録あり' : ''}${goalDates.has(key) ? ' 石の目標期日' : ''}`);
      button.addEventListener('click', () => { selectedCalendarDate = key; renderCalendar(); renderSelectedCalendarDate(); }); grid.appendChild(button);
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
    root.innerHTML = notes.map((note, i) => `<article class="lm-game-sticky sticky-${i + 1}"><div class="lm-game-sticky-top"><span>${escapeHtml(note.gameName)}</span>${note.pinned ? '<span aria-label="ピン留め">📌</span>' : ''}</div><h3>${escapeHtml(note.title)}</h3>${safeWebUrl(note.url) ? `<a href="${escapeHtml(safeWebUrl(note.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.url)}</a>` : ''}<p>${escapeHtml(note.text || '').replace(/\n/g, ' ')}</p><button type="button" data-sticky-open="${escapeHtml(note.gameId)}">開く</button></article>`).join('');
    root.querySelectorAll('[data-sticky-open]').forEach((b) => b.addEventListener('click', () => { selectedGameId = b.dataset.stickyOpen; localStorage.setItem('lm_games_selected', selectedGameId); setTab('notes'); }));
  }

  async function deleteGame(id) {
    const games = readGames(); const game = games.find((g) => g.id === id); if (!game || !confirm(`「${game.name}」と関連データを削除しますか？`)) return;
    if (game.iconKey) await LMGameDB.deleteImage(game.iconKey).catch(() => {});
    for (const note of game.notes || []) if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {});
    saveGames(games.filter((g) => g.id !== id)); if (selectedGameId === id) selectedGameId = ''; await syncReminders(); renderActivePanel();
  }

  $('game-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = $('game-name').value.trim(); if (!name) return; const id = uid(); const file = $('game-icon').files[0]; let iconKey = '';
    if (file && file.type.startsWith('image/')) { iconKey = `icon:${id}`; try { await LMGameDB.putImage(iconKey, file); } catch (err) { console.error(err); toast('画像を保存できませんでした', 'error'); return; } }
    const games = readGames(); games.push({ id, name, iconKey, lastLoginDate: '', loginHistory: [], currentStones: 0, stoneGoal: 0, stoneGoalDate: '', stoneLogs: [], notes: [], notifyEnabled: false, reminderTime: '20:00', createdAt: Date.now() });
    saveGames(games); selectedGameId = id; localStorage.setItem('lm_games_selected', id); e.currentTarget.reset(); $('game-icon-file-name').textContent = '画像を選ぶ'; refreshGamePicker(); renderActivePanel(); toast('ゲームを登録しました');
  });

  $('game-icon').addEventListener('change', () => { $('game-icon-file-name').textContent = $('game-icon').files[0]?.name || '画像を選ぶ'; });
  $('game-current-select').addEventListener('change', (e) => { selectedGameId = e.currentTarget.value; localStorage.setItem('lm_games_selected', selectedGameId); renderActivePanel(); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('[data-open-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.openTab)));
  $('game-calendar-prev').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1); renderCalendar(); });
  $('game-calendar-next').addEventListener('click', () => { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1); renderCalendar(); });
  $('game-slide-prev').addEventListener('click', () => setSlide(activeSlide - 1)); $('game-slide-next').addEventListener('click', () => setSlide(activeSlide + 1));
  document.querySelectorAll('[data-slide-to]').forEach((b) => b.addEventListener('click', () => setSlide(Number(b.dataset.slideTo))));

  if (window.LM && typeof LM.renderNav === 'function') LM.renderNav($('nav-container'));
  refreshGamePicker(); setTab('register'); setSlide(0);
})();
