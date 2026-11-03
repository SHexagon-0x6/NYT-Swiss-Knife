'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {}, Intl, Date };
vm.runInNewContext(fs.readFileSync(path.join(root, 'shared.js'), 'utf8'), context);
const { latestPuzzleDate, nextRelease, shiftDay } = context.window.Margin;
const at = iso => new Date(iso);

test('Sudoku and crosswords switch to the next puzzle at 10 p.m. Eastern on weekdays', () => {
  for (const game of ['sudoku', 'crossword']) {
    assert.equal(latestPuzzleDate(game, at('2026-11-03T02:59:00Z')), '2026-11-02', 'Monday 9:59 p.m. EST');
    assert.equal(latestPuzzleDate(game, at('2026-11-03T03:00:00Z')), '2026-11-03', 'Monday 10 p.m. EST releases Tuesday');
    assert.equal(latestPuzzleDate(game, at('2026-11-07T03:00:00Z')), '2026-11-07', 'Friday 10 p.m. releases Saturday');
  }
});

test('Weekend puzzles arrive at 6 p.m. Eastern', () => {
  assert.equal(latestPuzzleDate('crossword', at('2026-11-07T22:59:00Z')), '2026-11-07', 'Saturday 5:59 p.m. EST');
  assert.equal(latestPuzzleDate('crossword', at('2026-11-07T23:00:00Z')), '2026-11-08', 'Saturday 6 p.m. releases Sunday');
  assert.equal(latestPuzzleDate('sudoku', at('2026-11-08T23:00:00Z')), '2026-11-09', 'Sunday 6 p.m. releases Monday');
  assert.equal(latestPuzzleDate('sudoku', at('2026-10-31T21:59:00Z')), '2026-10-31', 'Saturday 5:59 p.m. EDT');
  assert.equal(latestPuzzleDate('sudoku', at('2026-10-31T22:00:00Z')), '2026-11-01', 'Saturday 6 p.m. EDT');
});

test('The countdown points at the next release, across daylight-saving changes', () => {
  assert.equal(nextRelease('crossword', at('2026-11-02T17:00:00Z')).toISOString(), '2026-11-03T03:00:00.000Z', 'Monday noon to Monday 10 p.m.');
  assert.equal(nextRelease('crossword', at('2026-11-03T03:30:00Z')).toISOString(), '2026-11-04T03:00:00.000Z', 'After the Monday release, Tuesday 10 p.m.');
  assert.equal(nextRelease('sudoku', at('2026-11-07T04:00:00Z')).toISOString(), '2026-11-07T23:00:00.000Z', 'Friday night to Saturday 6 p.m.');
  assert.equal(nextRelease('sudoku', at('2026-11-01T03:00:00Z')).toISOString(), '2026-11-01T23:00:00.000Z', 'Clocks fall back before Sunday 6 p.m. EST');
  assert.equal(nextRelease('sudoku', at('2026-03-08T04:00:00Z')).toISOString(), '2026-03-08T22:00:00.000Z', 'Clocks spring forward before Sunday 6 p.m. EDT');
});

test('Wordle and Connections follow local midnight', () => {
  const now = new Date(2026, 10, 2, 23, 30);
  for (const game of ['wordle', 'connections']) {
    assert.equal(latestPuzzleDate(game, now), '2026-11-02');
    assert.equal(+nextRelease(game, now), +new Date(2026, 10, 3));
  }
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

test('On a Pacific clock, Sudoku and crosswords change at 7 p.m. on weekdays and 3 p.m. on weekends', () => {
  const pacific = date => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  // Noon Pacific on each day of one week (PST is UTC-8).
  const expected = { Mon: 'Mon 19:00', Tue: 'Tue 19:00', Wed: 'Wed 19:00', Thu: 'Thu 19:00', Fri: 'Fri 19:00', Sat: 'Sat 15:00', Sun: 'Sun 15:00' };
  for (let day = 9; day <= 15; day++) {
    const noon = at(`2026-11-${String(day).padStart(2, '0')}T20:00:00Z`), label = pacific(noon).slice(0, 3);
    for (const game of ['sudoku', 'crossword']) assert.equal(pacific(nextRelease(game, noon)), expected[label], `${game} from ${label} noon Pacific`);
  }
});
