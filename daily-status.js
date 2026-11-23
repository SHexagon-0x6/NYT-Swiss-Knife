(() => {
  'use strict';
  // Remembers the latest puzzle date you finished in each game so the popup can
  // show Done or New. Only visible results on this page are read; nothing is
  // sent anywhere and no account data or hidden game state is used.
  if (!globalThis.chrome?.runtime?.id || chrome.extension?.inIncognitoContext) return;
  const {storage, gameForPath, puzzleDate, latestPuzzleDate} = globalThis.Margin;
  const {validDate} = globalThis.MarginStats;
  const visible = node => node && !node.closest('[hidden],[aria-hidden="true"]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/;
  // NYT's start screen after a finished daily puzzle, for example "Great job on today's puzzle!".
  const FINISHED_WELCOME = /great job on today|you(?:’|')ve (?:already )?(?:solved|finished|completed) today/i;
  let saved = '', timer = null, writing = false, page = '', opened = {};
  // Without a date on the page, use the puzzle that was current when this page
  // opened, so a puzzle finished before midnight or the evening release never
  // marks the next one done.
  function openedDate(id) {
    const now = location.pathname + location.search;
    if (now !== page) { page = now; opened = {}; }
    return opened[id] ||= latestPuzzleDate(id);
  }

  function game() {
    // Bonus crosswords are monthly, so they do not count toward today's crossword.
    if (/^\/games\/bonus\//.test(location.pathname)) return null;
    return gameForPath(location.pathname);
  }
  function printedDate(text) {
    const match = String(text || '').match(MONTHS);
    if (!match) return null;
    const month = 'January February March April May June July August September October November December'.split(' ').indexOf(match[1]) + 1;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    return validDate(iso) ? iso : null;
  }
  function pageDate(id) {
    const archived = location.pathname.match(/\/(20\d{2})[-/](\d{2})[-/](\d{2})(?:\/|$)/);
    if (archived && validDate(archived.slice(1).join('-'))) return archived.slice(1).join('-');
    return puzzleDate(id === 'crossword' ? 'crossword-daily' : id) || openedDate(id);
  }
  const outsideDialogs = node => !node.closest('dialog,[role="dialog"],[aria-modal="true"],[class*="Modal-module"],[class*="HelpModal"]');
  function sudokuBoardSolved() {
    const cells = [...document.querySelectorAll('.su-board .su-cell')].filter(visible);
    if (cells.length !== 81) return false;
    const grid = Array(81).fill(0);
    cells.forEach((cell, idx) => {
      if (/(?:^|\s)(?:conflicted|rejected)(?:\s|$)/.test(cell.className || '')) return;
      const raw = cell.getAttribute('data-cell'), pos = raw !== null && /^\d+$/.test(raw) ? Number(raw) : idx;
      const value = cell.querySelector('.su-cell__value');
      const digit = Number(value?.getAttribute('data-number') || value?.textContent?.match(/[1-9]/)?.[0] || 0);
      if (pos >= 0 && pos < 81 && digit >= 1 && digit <= 9) grid[pos] = digit;
    });
    if (grid.includes(0)) return false;
    for (let i = 0; i < 9; i++) {
      const row = new Set(), col = new Set(), box = new Set();
      for (let j = 0; j < 9; j++) {
        row.add(grid[i * 9 + j]);
        col.add(grid[j * 9 + i]);
        box.add(grid[(Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + (j % 3)]);
      }
      if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
    }
    return true;
  }
  function finishedDate(id) {
    for (const node of document.querySelectorAll('.pz-moment__welcome,[class*="Welcome-module_contentWelcome"]')) {
      if (visible(node) && FINISHED_WELCOME.test(node.textContent)) return printedDate(node.textContent) || pageDate(id);
    }
    if (id === 'connections') {
      const rows = [...document.querySelectorAll('[class*="SolvedCategory-module_solvedCategory"],[data-testid="solved-category"]')].filter(visible);
      if (rows.length === 4 && rows.every(row => row.querySelectorAll('[class*="SolvedCategory-module_cardListItem"],[data-solved-word]').length === 4)) return pageDate(id);
    }
    if (id === 'wordle') {
      const rows = [...document.querySelectorAll('[class*="Row-module_row"]')].filter(row => visible(row) && outsideDialogs(row))
        .map(row => {
          const tiles = row.querySelectorAll('[class*="Tile-module_tile"]');
          return [...(tiles.length ? tiles : row.querySelectorAll('[data-state]'))].map(tile => tile.getAttribute('data-state'));
        });
      const evaluated = row => row.length === 5 && row.every(state => ['correct', 'present', 'absent'].includes(state));
      if (rows.some(row => row.length === 5 && row.every(state => state === 'correct')) || rows.length === 6 && rows.every(evaluated)) return pageDate(id);
    }
    if (id === 'sudoku') {
      for (const modal of document.querySelectorAll('[data-testid="sudoku-congrats"],[class*="CongratsMoment-module_content"],.xwd__modal--content')) {
        if (visible(modal) && /You finished an?\s+(?:easy|medium|hard)\s+puzzle\b/i.test(modal.textContent.replace(/\s+/g, ' '))) return pageDate(id);
      }
      for (const welcome of document.querySelectorAll('.playbook-welcome-moment,[class*="welcomeMomentContainer"]')) {
        if (!visible(welcome)) continue;
        const solved = [...welcome.querySelectorAll('[role="group"][aria-label="Choose Your Puzzle"] button,[class*="DifficultyGroup-module"] button')]
          .some(btn => visible(btn) && (/\b(?:easy|medium|hard)\s*,\s*completed\b/i.test(btn.textContent.replace(/\s+/g, ' ')) || !!btn.querySelector('[class*="iconChecked"]')));
        if (solved) return printedDate(welcome.querySelector('[class*="momentInfoDate"]')?.textContent || welcome.innerText || welcome.textContent) || pageDate(id);
      }
      if (sudokuBoardSolved()) return pageDate(id);
    }
    if (id === 'crossword') {
      for (const modal of document.querySelectorAll('.xwd__congrats-modal')) {
        if (visible(modal) && /\bYou solved\b/i.test(modal.textContent)) return pageDate(id);
      }
    }
    return null;
  }
  async function check() {
    timer = null;
    const id = game();
    if (!id || writing) return;
    const date = finishedDate(id);
    if (!date || saved === `${id}:${date}` || date > latestPuzzleDate(id)) return;
    writing = true;
    try {
      const settings = await storage.get('settings') || {};
      if (settings.disabled?.includes(id)) return;
      // One key per game, so tabs for different games never overwrite each other.
      const previous = await storage.get(`daily:${id}`);
      if (!(validDate(previous) && previous >= date)) await storage.set(`daily:${id}`, date);
      saved = `${id}:${date}`;
    } catch {
      // A reloaded extension invalidates this page's context. The next visit records again.
    } finally { writing = false; }
  }
  const schedule = () => { if (!timer) timer = setTimeout(check, 400); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-state', 'data-number', 'hidden', 'aria-hidden']});
  const interval = setInterval(schedule, 2000);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { clearTimeout(timer); clearInterval(interval); observer.disconnect(); }
  });
  openedDate(game());
  schedule();
})();
