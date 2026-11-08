const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildItems,
  jstDateStr,
  jstMidnightEpoch,
  selectDue,
  summarizeTasks,
} = require('./notify-check.js');

test('JST date conversion stays correct across UTC date boundaries', () => {
  const midnight = jstMidnightEpoch('2026-11-08');
  assert.equal(new Date(midnight).toISOString(), '2026-11-07T15:00:00.000Z');
  assert.equal(jstDateStr(midnight), '2026-11-08');
});

test('task summary counts named main and other tasks separately', () => {
  const summary = summarizeTasks({
    todo: {
      dayKey: '2026-11-08',
      dailyTasks: {
        main1: { name: 'Main', checked: true },
        main2: { name: '  ', checked: false },
        other1: { name: 'Other', checked: false },
      },
    },
  }, '2026-11-08');

  assert.deepEqual(summary, {
    entered: 2,
    mainEntered: 1,
    mainUnfinished: 0,
    mainComplete: true,
    otherUnfinished: 1,
    unfinished: 1,
  });
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
