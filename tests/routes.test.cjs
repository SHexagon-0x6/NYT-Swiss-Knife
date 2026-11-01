'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'shared.js'), 'utf8'), context);
const { gameForPath } = context.window.Margin;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
function injected(url) {
  return manifest.content_scripts.some(script => script.matches.some(pattern => {
    const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${escaped}$`).test(url);
  }));
}
function connected(pathname, game) {
  assert.equal(gameForPath(pathname), game, `Wrong adapter for ${pathname}`);
  assert(injected(`https://www.nytimes.com${pathname}`), `No content script for ${pathname}`);
}

test('daily and archived crosswords select the crossword adapter', () => {
  for (const pathname of ['/crosswords/game/daily', '/crosswords/game/daily/2026/10/01']) connected(pathname, 'crossword');
});
test('Mini and archived Mini crosswords select the crossword adapter', () => {
  for (const pathname of ['/crosswords/game/mini', '/crosswords/game/mini/2026/10/01']) connected(pathname, 'crossword');
});
test('monthly Bonus Crossword URLs already receive the crossword adapter', () => {
  for (const pathname of ['/crosswords/game/bonus/2026/10', '/crosswords/game/bonus/2025/05']) connected(pathname, 'crossword');
});
test('verified new Bonus crossword routes select only the crossword adapter', () => {
  for (const pathname of ['/games/bonus/crossword/mini/2026-08-25', '/games/bonus/crossword/easy-mode/easy-mode-165']) connected(pathname, 'crossword');
});
test('the four other supported games retain their content-script routes', () => {
  for (const [pathname, game] of [
    ['/games/connections', 'connections'], ['/games/wordle/index.html', 'wordle'],
    ['/games/strands', 'strands'], ['/puzzles/sudoku/easy', 'sudoku'],
    ['/puzzles/sudoku/medium', 'sudoku'], ['/puzzles/sudoku/hard', 'sudoku']
  ]) connected(pathname, game);
});
test('bonus hub and unsupported games are not misrepresented as playable adapters', () => {
  for (const pathname of ['/games/bonus/hub', '/games/bonus/wordle-in-1', '/games/bonus/mystery-mini', '/games/pips', '/puzzles/spelling-bee']) {
    assert.equal(gameForPath(pathname), null);
    assert(!injected(`https://www.nytimes.com${pathname}`));
  }
});
test('content scripts never run on another origin or an ordinary NYT article', () => {
  for (const url of ['https://example.com/crosswords/game/bonus/2026/10', 'https://www.nytimes.com/2026/10/01/crosswords/bonus-puzzle.html', 'http://www.nytimes.com/crosswords/game/daily']) assert(!injected(url));
});
