/* ゲーム管理: メタデータはlocalStorage、画像はIndexedDB。通知に必要な最小限の情報のみFirebaseへ同期。 */
(() => {
  'use strict';
  const GAMES_KEY = 'lm_games';
  const REMINDERS_KEY = 'lm_gameReminders';
  const $ = (id) => document.getElementById(id);
  let selectedId = null;
  let imageUrls = [];

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const uid = () => (window.LM && LM.uid ? LM.uid() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const readGames = () => { try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); } catch { return []; } };
  const saveGames = (games) => localStorage.setItem(GAMES_KEY, JSON.stringify(games));
  const readReminders = () => { try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]'); } catch { return []; } };
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeWebUrl = (value) => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const toast = (message, type) => window.LM?.showToast ? LM.showToast(message, type) : alert(message);

  async function syncReminders() {
    const reminders = readGames().filter((g) => g.notifyEnabled).map((g) => ({
      id: g.id, name: g.name, lastLoginDate: g.lastLoginDate || '',
      reminderTime: g.reminderTime || '20:00', notifyEnabled: true,
    }));
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
    if (window.LM && typeof LM.syncFirebase === 'function') await LM.syncFirebase();
  }

  function closeSelected() {
    selectedId = null;
    renderGames();
  }

  async function renderGames() {
    imageUrls.forEach(URL.revokeObjectURL);
    imageUrls = [];
    const games = readGames();
    const list = $('games-list');
    if (!games.length) {
      list.innerHTML = '<p class="lm-empty">まだゲームが登録されていません。</p>';
      return;
    }
    list.innerHTML = '';
    for (const game of games) {
      const card = document.createElement('article');
      card.className = `lm-game-card${selectedId === game.id ? ' is-selected' : ''}`;
      let iconMarkup = '<div class="lm-game-icon lm-game-icon-placeholder" aria-hidden="true">🎮</div>';
      if (game.iconKey && window.LMGameDB) {
        try {
          const blob = await LMGameDB.getImage(game.iconKey);
          if (blob) {
            const url = URL.createObjectURL(blob); imageUrls.push(url);
            iconMarkup = `<img class="lm-game-icon" src="${url}" alt="">`;
          }
        } catch (e) { console.warn('ゲーム画像を読み込めませんでした', e); }
      }
      const current = num(game.currentStones);
      const goal = num(game.stoneGoal);
      const missing = Math.max(0, goal - current);
      card.innerHTML = `${iconMarkup}<div class="lm-game-card-main"><button type="button" class="lm-game-name" data-action="open" data-id="${escapeHtml(game.id)}">${escapeHtml(game.name)}</button><p class="lm-game-card-summary">石 ${current.toLocaleString()}${goal ? ` / 目標 ${goal.toLocaleString()}（あと ${missing.toLocaleString()}）` : ''}</p><p class="lm-game-card-summary">最終ログイン：${escapeHtml(game.lastLoginDate || '未記録')}</p></div><button type="button" class="lm-game-delete" data-action="delete" data-id="${escapeHtml(game.id)}" aria-label="${escapeHtml(game.name)}を削除">削除</button>`;
      list.appendChild(card);
      if (selectedId === game.id) card.insertAdjacentHTML('beforeend', detailMarkup(game));
    }
    bindListActions();
    if (selectedId) bindDetailActions();
  }

  function detailMarkup(game) {
    const notes = Array.isArray(game.notes) ? game.notes : [];
    const logs = Array.isArray(game.stoneLogs) ? game.stoneLogs : [];
    return `<div class="lm-game-detail">
      <div class="lm-game-detail-head"><h2>ゲームの管理</h2><button type="button" class="lm-text-btn" data-action="close-detail">閉じる</button></div>
      <section class="lm-game-subsection"><h3>ログイン管理</h3><p class="lm-game-status">今日のログイン：${game.lastLoginDate === today() ? '記録済み' : '未記録'}</p><button type="button" class="lm-btn" data-action="login" data-id="${escapeHtml(game.id)}">今日ログインした</button>
        <label class="lm-game-check"><input type="checkbox" data-field="notifyEnabled" ${game.notifyEnabled ? 'checked' : ''}> ログイン通知を使う</label>
        <label>通知時刻<input type="time" data-field="reminderTime" value="${escapeHtml(game.reminderTime || '20:00')}" /></label>
      </section>
      <section class="lm-game-subsection"><h3>石管理</h3><form data-form="stones" class="lm-game-form"><label>現在の所持数<input type="number" min="0" step="1" name="currentStones" value="${num(game.currentStones)}" required /></label><label>目標数<input type="number" min="0" step="1" name="stoneGoal" value="${num(game.stoneGoal)}" /></label><button class="lm-btn secondary" type="submit">所持数・目標を保存</button></form>
        <form data-form="stone-delta" class="lm-game-form lm-game-delta-form"><label>入手した石<input type="number" min="0" step="1" name="earned" value="0" /></label><label>使った石<input type="number" min="0" step="1" name="spent" value="0" /></label><button class="lm-btn" type="submit">差分を反映</button></form>
        <p class="lm-game-status">目標まであと ${Math.max(0, num(game.stoneGoal) - num(game.currentStones)).toLocaleString()} 個</p>
        <details><summary>最近の石の履歴</summary>${logs.length ? `<ul class="lm-game-log-list">${logs.slice(-10).reverse().map((log) => `<li>${escapeHtml(log.date)}：${log.delta >= 0 ? '+' : ''}${Number(log.delta).toLocaleString()}（${escapeHtml(log.note || '手動記録')}）</li>`).join('')}</ul>` : '<p class="lm-empty">履歴はありません。</p>'}</details>
      </section>
      <section class="lm-game-subsection"><h3>攻略メモ</h3><form data-form="note" class="lm-game-form"><label>メモのタイトル<input name="title" maxlength="120" placeholder="例：イベント攻略" required /></label><label>URL<input name="url" type="url" placeholder="https://..." /></label><label>テキスト<textarea name="text" rows="4" placeholder="攻略情報やメモ"></textarea></label><label>画像（任意）<input name="image" type="file" accept="image/*" /></label><button class="lm-btn" type="submit">メモを保存</button></form>
        <div class="lm-game-notes">${notes.length ? notes.slice().reverse().map((note) => `<article class="lm-game-note"><h4>${escapeHtml(note.title)}</h4>${safeWebUrl(note.url) ? `<p><a href="${escapeHtml(safeWebUrl(note.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.url)}</a></p>` : ''}${note.text ? `<p class="lm-game-note-text">${escapeHtml(note.text).replace(/\n/g, '<br>')}</p>` : ''}${note.imageKey ? `<div class="lm-note-image" data-image-key="${escapeHtml(note.imageKey)}">画像を読み込み中…</div>` : ''}<button type="button" class="lm-text-btn" data-action="delete-note" data-id="${escapeHtml(game.id)}" data-note-id="${escapeHtml(note.id)}">このメモを削除</button></article>`).join('') : '<p class="lm-empty">攻略メモはありません。</p>'}</div>
      </section>
      <button type="button" class="lm-btn danger" data-action="delete-game" data-id="${escapeHtml(game.id)}">このゲームを削除</button>
    </div>`;
  }

  function bindListActions() {
    $('games-list').querySelectorAll('[data-action="open"]').forEach((button) => button.addEventListener('click', () => { selectedId = button.dataset.id; renderGames(); }));
    $('games-list').querySelectorAll('[data-action="delete"]').forEach((button) => button.addEventListener('click', () => deleteGame(button.dataset.id)));
  }

  function bindDetailActions() {
    const detail = $('games-list').querySelector('.lm-game-detail');
    if (!detail) return;
    detail.querySelector('[data-action="close-detail"]')?.addEventListener('click', closeSelected);
    detail.querySelector('[data-action="login"]')?.addEventListener('click', async () => {
      updateGame(selectedId, (g) => { g.lastLoginDate = today(); g.lastLoginAt = Date.now(); });
      await syncReminders(); await renderGames(); toast('今日のログインを記録しました');
    });
    detail.querySelectorAll('[data-field="notifyEnabled"], [data-field="reminderTime"]').forEach((input) => input.addEventListener('change', async () => {
      const id = selectedId;
      updateGame(id, (g) => { if (input.dataset.field === 'notifyEnabled') g.notifyEnabled = input.checked; else g.reminderTime = input.value || '20:00'; });
      await syncReminders(); renderGames();
    }));
    detail.querySelector('[data-form="stones"]')?.addEventListener('submit', (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      updateGame(selectedId, (g) => { g.currentStones = num(fd.get('currentStones')); g.stoneGoal = num(fd.get('stoneGoal')); });
      renderGames(); toast('石の数を保存しました');
    });
    detail.querySelector('[data-form="stone-delta"]')?.addEventListener('submit', (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const earned = num(fd.get('earned')); const spent = num(fd.get('spent'));
      const game = readGames().find((g) => g.id === selectedId); if (!game) return;
      if (spent > num(game.currentStones) + earned) { toast('所持数を超えて消費することはできません', 'error'); return; }
      updateGame(selectedId, (g) => { const delta = earned - spent; g.currentStones = num(g.currentStones) + delta; g.stoneLogs = [...(g.stoneLogs || []), { id: uid(), date: today(), delta, note: `入手${earned}・消費${spent}` }]; });
      renderGames(); toast('石の差分を反映しました');
    });
    detail.querySelector('[data-form="note"]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form); const file = fd.get('image');
      let imageKey = '';
      if (file && file.size && file.type.startsWith('image/')) {
        imageKey = `note:${selectedId}:${uid()}`;
        try { await LMGameDB.putImage(imageKey, file); } catch (error) { console.error(error); toast('画像を端末に保存できませんでした', 'error'); return; }
      }
      const rawUrl = String(fd.get('url') || '').trim();
      if (rawUrl && !safeWebUrl(rawUrl)) { toast('URLは https:// または http:// から始まるアドレスを入力してください', 'error'); if (imageKey) await LMGameDB.deleteImage(imageKey).catch(() => {}); return; }
      const note = { id: uid(), title: String(fd.get('title') || '').trim(), url: safeWebUrl(rawUrl), text: String(fd.get('text') || ''), imageKey, createdAt: Date.now() };
      updateGame(selectedId, (g) => { g.notes = [...(g.notes || []), note]; });
      await renderGames(); toast('攻略メモを保存しました');
    });
    detail.querySelectorAll('[data-action="delete-note"]').forEach((button) => button.addEventListener('click', async () => {
      const game = readGames().find((g) => g.id === button.dataset.id); const note = game?.notes?.find((n) => n.id === button.dataset.noteId); if (!note) return;
      if (!confirm(`「${note.title}」を削除しますか？`)) return;
      if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {});
      updateGame(game.id, (g) => { g.notes = (g.notes || []).filter((n) => n.id !== note.id); }); renderGames();
    }));
    detail.querySelector('[data-action="delete-game"]')?.addEventListener('click', () => deleteGame(selectedId));
    loadNoteImages(detail);
  }

  async function loadNoteImages(detail) {
    for (const box of detail.querySelectorAll('[data-image-key]')) {
      try {
        const blob = await LMGameDB.getImage(box.dataset.imageKey);
        if (!blob) { box.textContent = '画像が見つかりません'; continue; }
        const url = URL.createObjectURL(blob); imageUrls.push(url);
        const img = document.createElement('img'); img.src = url; img.alt = '攻略メモの画像'; box.replaceChildren(img);
      } catch { box.textContent = '画像を読み込めませんでした'; }
    }
  }

  function updateGame(id, mutator) {
    const games = readGames(); const game = games.find((g) => g.id === id); if (!game) return;
    mutator(game); saveGames(games);
  }
  async function deleteGame(id) {
    const games = readGames(); const game = games.find((g) => g.id === id); if (!game) return;
    if (!confirm(`「${game.name}」と関連データを削除しますか？`)) return;
    if (game.iconKey) await LMGameDB.deleteImage(game.iconKey).catch(() => {});
    for (const note of game.notes || []) if (note.imageKey) await LMGameDB.deleteImage(note.imageKey).catch(() => {});
    saveGames(games.filter((g) => g.id !== id)); selectedId = null;
    await syncReminders(); renderGames();
  }

  $('game-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = $('game-name').value.trim(); if (!name) return;
    const id = uid(); const file = $('game-icon').files[0]; let iconKey = '';
    if (file && file.type.startsWith('image/')) {
      iconKey = `icon:${id}`;
      try { await LMGameDB.putImage(iconKey, file); } catch (error) { console.error(error); toast('画像を保存できませんでした', 'error'); return; }
    }
    const games = readGames(); games.push({ id, name, iconKey, lastLoginDate: '', currentStones: 0, stoneGoal: 0, stoneLogs: [], notes: [], notifyEnabled: false, reminderTime: '20:00', createdAt: Date.now() });
    saveGames(games); e.currentTarget.reset(); renderGames();
  });

  $('game-enable-notifications').addEventListener('click', async () => {
    const status = $('game-notify-status');
    if (!('Notification' in window)) { status.textContent = 'このブラウザでは通知に対応していません。'; return; }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { status.textContent = '通知が許可されていません。ブラウザまたは端末の設定を確認してください。'; return; }
      if (!window.LMFirebase) { status.textContent = 'Firebaseの準備ができていません。ページを再読み込みしてお試しください。'; return; }
      const token = await window.LMFirebase.registerToken();
      if (!token) { status.textContent = '通知トークンを登録できませんでした。HTTPS・Service Worker・Firebase設定を確認してください。'; return; }
      await syncReminders();
      status.textContent = '通知を許可し、通知用情報を同期しました。通知したいゲームごとに「ログイン通知を使う」を有効にしてください。';
    } catch (error) { console.error(error); status.textContent = '通知の設定に失敗しました。'; }
  });

  renderGames();
})();
