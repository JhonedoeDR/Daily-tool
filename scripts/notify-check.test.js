const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildItems,
  jstDateStr,
  jstMidnightEpoch,
  selectDue,
} = require('./notify-check.js');

test('JST date conversion stays correct across UTC date boundaries', () => {
  const midnight = jstMidnightEpoch('2026-11-08');
  assert.equal(new Date(midnight).toISOString(), '2026-11-07T15:00:00.000Z');
  assert.equal(jstDateStr(midnight), '2026-11-08');
});

test('scheduled notifications are selected only within the configured time window', () => {
  const now = Date.parse('2026-11-08T03:00:00.000Z');
  const items = [
    { key: 'past', at: now - 5 * 60_000 },
    { key: 'soon', at: now + 5 * 60_000 },
    { key: 'later', at: now + 9 * 60_000 },
  ];

  assert.deepEqual(selectDue(items, now).map((item) => item.key), ['soon']);
});

test('daily schedule items use JST and omit deadline records from start reminders', () => {
  const items = buildItems({
    schedules: [
      { id: 'appointment', date: '2026-11-08', start: '12:00', name: 'Appointment' },
      { id: 'deadline', kind: 'deadline', date: '2026-11-08', start: '12:00', name: 'Deadline' },
    ],
  }, Date.parse('2026-11-08T00:00:00.000Z'));

  const starts = items.filter((item) => item.key.startsWith('start:'));
  assert.deepEqual(starts.map((item) => item.key), ['start:appointment:2026-11-08']);
  assert.equal(starts[0].at, jstMidnightEpoch('2026-11-08') + 12 * 60 * 60_000);
});

test('a main task replaces empty reminders with 3-hour unfinished reminders', () => {
  const dayStart = jstMidnightEpoch('2026-11-08') + 4 * 60 * 60_000;
  const items = buildItems({
    todoManager: [{
      id: 'main-1',
      category: 'main',
      name: 'Report',
      checked: false,
      createdAt: dayStart,
    }],
  }, dayStart + 5 * 60 * 60_000);

  const empty = items.find((item) => item.key === 'task-empty:2026-11-08:7');
  const unfinished = items.find((item) => item.key === `task-unfinished:2026-11-08:${dayStart + 3 * 60 * 60_000}`);
  assert.equal(empty.build({ todoManager: [{ id: 'main-1', category: 'main', name: 'Report' }] }), null);
  assert.deepEqual(unfinished.build({ todoManager: [{
    id: 'main-1', category: 'main', name: 'Report', checked: false,
  }] }), { title: 'メインタスクが未達成です', body: '「Report」' });
});

test('non-main reminders list the soonest deadline first and include category', () => {
  const items = buildItems({
    todoManager: [
      { id: 'other-a', category: 'other', name: 'Alpha', checked: false },
      { id: 'routine-b', category: 'routine', name: 'Due', endDate: '2026-11-09', checked: false },
    ],
  }, jstMidnightEpoch('2026-11-08') + 4 * 60 * 60_000);
  const reminder = items.find((item) => item.key === 'task-other-unfinished:2026-11-08:12');

  assert.deepEqual(reminder.build({
    todoManager: [
      { id: 'other-a', category: 'other', name: 'Alpha', checked: false },
      { id: 'routine-b', category: 'routine', name: 'Due', endDate: '2026-11-09', checked: false },
    ],
  }), { title: 'タスクが未達成です', body: '「ルーティン の Due」ほか1つ' });
});

test('weekly and custom per-task notifications can coexist', () => {
  const items = buildItems({
    todoManager: [{
      id: 'task-1',
      category: 'other',
      name: 'Prepare',
      checked: false,
      notifications: {
        weekdays: [0],
        times: ['07:00'],
        custom: [{ date: '2026-11-08', time: '07:15' }],
      },
    }],
  }, jstMidnightEpoch('2026-11-08'));

  assert.ok(items.some((item) => item.key === 'todo-task-weekly:task-1:2026-11-08:07:00'));
  assert.ok(items.some((item) => item.key === 'todo-task-custom:task-1:2026-11-08:07:15'));
});

test('future-start and expired tasks are excluded from reminders', () => {
  const items = buildItems({
    todoManager: [
      {
        id: 'future',
        category: 'main',
        name: 'Not started',
        startDate: '2026-11-09',
        notifications: { weekdays: [0], times: ['07:00'] },
      },
      {
        id: 'expired',
        category: 'other',
        name: 'Expired',
        endDate: '2026-11-07',
        notifications: { custom: [{ date: '2026-11-08', time: '07:00' }] },
      },
    ],
  }, jstMidnightEpoch('2026-11-08') + 4 * 60 * 60_000);

  assert.equal(items.find((item) => item.key === 'task-empty:2026-11-08:7')
    .build({ todoManager: [{ id: 'future', category: 'main', name: 'Not started', startDate: '2026-11-09' }] }), null);
  assert.ok(!items.some((item) => item.key.startsWith('todo-task-weekly:future:')));
  assert.ok(!items.some((item) => item.key.startsWith('todo-task-custom:expired:')));
});
