(async () => {
  'use strict';
  const frame = document.querySelector('#popup'), report = document.querySelector('#results'), results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); results.push(`PASS ${message}`); };
  const until = async (check, message) => { for (let i = 0; i < 150; i++) { if (check()) return; await wait(10); } throw Error(message); };
  const load = async () => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = new URL(`../popup.html?fixture=${Date.now()}`, location.href).href; });
    await until(() => frame.contentDocument.querySelectorAll('.game[data-game] input').length === 4 && frame.contentDocument.querySelector('.game-status')?.textContent, 'Popup did not load all games');
  };
  const input = id => frame.contentDocument.querySelector(`.game[data-game="${id}"] input`);
  const change = (id, checked) => { const node = input(id); node.checked = checked; node.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true })); };
  let originalStorage;
  try {
    await load();
    originalStorage = frame.contentWindow.localStorage.getItem('margin-preview');
    const puzzle = { updatedAt: Date.now(), game: 'connections', state: { marks: { BASS: { tl: 0 } }, attempts: [{ words: ['BASS','PITCH','TONE','NOTE'], result: 'one-away' }] } };
    const settings = { disabled: ['crossword'], features: { wordle: { clickToEdit: false } }, shortcuts: { sudoku: { key: 'Control' } }, keepPreference: 'unchanged' };
    const M = frame.contentWindow.Margin, today = M.latestPuzzleDate('connections');
    const daily = { connections: today, sudoku: M.shiftDay(M.latestPuzzleDate('sudoku'), -1), crossword: M.latestPuzzleDate('crossword') };
    frame.contentWindow.localStorage.setItem('margin-preview', JSON.stringify({ settings, ...Object.fromEntries(Object.entries(daily).map(([id, date]) => [`daily:${id}`, date])), 'puzzle:kept': puzzle }));
    await load();
    const doc = frame.contentDocument, win = frame.contentWindow;
    assert(doc.querySelector('h1')?.textContent === 'NYT Games Swiss Knife' && doc.title === 'NYT Games Swiss Knife', 'Popup uses the requested NYT Games Swiss Knife brand');
    const rows = [...doc.querySelectorAll('#games .game')], all = [...doc.querySelectorAll('.game[data-game]')];
    assert(rows.length === 3 && rows.map(row => row.querySelector('.game-name').textContent).join(',') === 'Connections,Sudoku,Wordle', 'Popup lists the enabled games by plain name');
    assert(rows.every(row => row.querySelectorAll('img').length === 1 && row.querySelectorAll('input[type="checkbox"]').length === 1 && row.querySelectorAll('a').length === 1 && !row.querySelector('small,p')), 'Each game row has one icon, one play link, a status and an enable switch');
    const GAMES = win.Margin.GAMES;
    assert(rows.every(row => { const link = row.querySelector('a.game-link'); return link.href === GAMES[row.dataset.game].url && link.target === '_blank' && link.rel === 'noopener' && link.querySelector('svg.link-icon') && link.contains(row.querySelector('.game-name')); }), 'Each name links to its game with a small link icon and opens a new tab');
    const statusOf = id => doc.querySelector(`[data-game="${id}"] .game-status`);
    assert(statusOf('connections').classList.contains('done') && /^Done · next in \d+(?:h \d+)?m$/.test(statusOf('connections').textContent), 'A game finished for the latest puzzle shows Done with time to the next one');
    assert(statusOf('sudoku').classList.contains('new') && statusOf('sudoku').textContent === 'New puzzle ready', 'A game last finished before the newest puzzle shows New');
    assert(statusOf('wordle').textContent === 'New puzzle ready', 'A game never finished in this browser shows New');
    const archive = doc.getElementById('archive'), archiveLink = doc.getElementById('archive-toggle');
    assert(archive.hidden && !archiveLink.hidden && archiveLink.closest('footer') && archiveLink.textContent === 'Archive (1)' && doc.querySelector('#archived [data-game="crossword"]') && statusOf('crossword').hidden, 'A disabled game waits in Archive, reached from a small footer link');
    const archivedRow = doc.querySelector('#archived [data-game="crossword"]');
    assert(!archivedRow.querySelector('.toggle').hidden && !input('crossword').checked && !archivedRow.querySelector('.restore') && !archivedRow.checkVisibility(), 'Archived games keep their switch, hidden inside the collapsed Archive');
    const howTo = doc.querySelector('footer a');
    assert(['color','fontSize','fontFamily'].every(key => win.getComputedStyle(archiveLink)[key] === win.getComputedStyle(howTo)[key]) && archiveLink.getBoundingClientRect().top === howTo.getBoundingClientRect().top, 'The Archive link matches How to use beside it');
    const images = all.map(row => row.querySelector('img'));
    await until(() => images.every(img => img.complete && img.naturalWidth > 0), 'Local game SVG icons failed to load');
    const iconBase = new URL('../icons/games/', location.href).href;
    assert(images.every(img => img.src.startsWith(iconBase) && /\.(svg|png)$/.test(img.src) && img.alt === ''), 'Game icons load from bundled image files without network assets');
    const links = [...doc.querySelectorAll('a')], toggle = doc.getElementById('stats-toggle');
    assert(links.some(a => a.textContent === 'How to use') && toggle?.tagName === 'SUMMARY' && !doc.querySelector('#stats-section input[role="switch"]') && !doc.querySelector('header button,header input'), 'Calendar & stats uses a disclosure row below the static title and logo');
    assert(win.getComputedStyle(doc.body).width === '300px' && win.getComputedStyle(doc.querySelector('h1')).fontSize === '19px' && rows.every(row => row.getBoundingClientRect().height >= 60), 'Popup keeps the released width, heading size and game spacing');
    assert(!doc.querySelector('.header-hint') && !doc.body.textContent.includes('Tools & daily stats') && !doc.body.textContent.includes('History has no age limit'), 'Popup omits the extra subtitle and storage explanation');
    const section = doc.getElementById('stats-section');
    assert(!section.open && !doc.querySelector('#stats-panel a'), 'Calendar begins collapsed without duplicate Help or Privacy links');
    toggle.click();assert(section.open && rows.every(row => row.getClientRects().length) && !doc.querySelector('#games').closest('details'), 'The disclosure expands the calendar while keeping every enabled game visible');
    assert(!doc.querySelector('.day.today,.day[aria-current="date"]'), 'The main popup calendar has no puzzle-date dot');
    toggle.click();assert(!section.open && rows.every(row => row.getClientRects().length), 'Collapsing the calendar leaves the original game list open');
    assert(!input('crossword').checked && input('wordle').checked && input('connections').getAttribute('aria-label') === 'Enable Connections tools', 'Enable switches reflect saved preferences and have accessible names');

    archiveLink.click(); assert(archivedRow.checkVisibility() && archiveLink.getAttribute('aria-expanded') === 'true', 'Clicking Archive shows its games above the footer');
    archiveLink.click(); assert(!archivedRow.checkVisibility(), 'Clicking Archive again hides them');
    archiveLink.click();
    change('crossword', true);
    await until(() => doc.querySelector('#games [data-game="crossword"]') && /Crossword restored/.test(doc.getElementById('status').textContent), 'Restore did not bring Crossword back');
    assert(archive.hidden && archiveLink.hidden && input('crossword').checked && !(await win.Margin.storage.get('settings')).disabled.includes('crossword'), 'Switching it back on returns the game to the main list and the Archive link disappears');
    assert(statusOf('crossword').classList.contains('done') && !statusOf('crossword').hidden, 'A restored game shows its status again');
    change('wordle', false);
    await until(() => doc.querySelector('#archived [data-game="wordle"]') && doc.querySelector('#status .status-undo'), 'Disabling did not archive Wordle');
    assert(!doc.querySelector('#games [data-game="wordle"]') && archive.hidden && !archiveLink.hidden && /Wordle moved to Archive/.test(doc.getElementById('status').textContent), 'Turning a game off moves it out of sight into the Archive');
    doc.querySelector('#status .status-undo').click();
    await until(() => doc.querySelector('#games [data-game="wordle"]') && /Wordle restored/.test(doc.getElementById('status').textContent), 'Undo did not restore Wordle');
    assert([...doc.querySelectorAll('#games .game')].map(row => row.dataset.game).join() === 'connections,sudoku,wordle,crossword', 'Undo restores the game in its original order');
    change('crossword', false);await until(() => doc.querySelector('#archived [data-game="crossword"]'), 'Crossword did not return to the Archive');
    for (let i = 0; i < 100 && !(await win.Margin.storage.get('settings')).disabled.includes('crossword'); i++) await wait(10);
    await wait(30);
    assert((await win.Margin.storage.get('settings')).disabled.includes('crossword'), 'Archiving Crossword again is saved');
    const storage = win.Margin.storage, realGet = storage.get.bind(storage), realSet = storage.set.bind(storage);
    let activeWrites = 0, maxWrites = 0, completedWrites = 0;
    storage.get = async key => { await wait(8); return realGet(key); };
    storage.set = async (key, value) => {
      activeWrites++; maxWrites = Math.max(maxWrites, activeWrites); await wait(12);
      try { await realSet(key, value); completedWrites++; } finally { activeWrites--; }
    };
    storage.remove = async () => { throw Error('Popup must not delete records'); };
    for (const [id, checked] of [['connections',false], ['sudoku',false], ['crossword',true], ['wordle',false], ['wordle',true], ['wordle',false]]) change(id, checked);
    await until(() => completedWrites === 6, 'Rapid toggle writes did not finish');
    const saved = await realGet('settings');
    assert(maxWrites === 1 && [...saved.disabled].sort().join(',') === 'connections,sudoku,wordle', 'Rapid changes serialize and preserve the final preference for every game');
    assert(JSON.stringify(saved.features) === JSON.stringify(settings.features) && JSON.stringify(saved.shortcuts) === JSON.stringify(settings.shortcuts) && saved.keepPreference === 'unchanged', 'Game toggles preserve per-game features, shortcut keys, and unrelated settings');
    assert(JSON.stringify(await realGet('puzzle:kept')) === JSON.stringify(puzzle), 'Toggling games preserves existing puzzle data');
    await load();
    assert(!input('connections').checked && !input('sudoku').checked && !input('wordle').checked && input('crossword').checked, 'Enabled and disabled games persist after reopening the popup');

    const retryStorage = frame.contentWindow.Margin.storage, retrySet = retryStorage.set.bind(retryStorage);
    let calls = 0, done = 0;
    retryStorage.set = async (...args) => { const call = ++calls; await wait(15); if (call === 1) { done++; throw Error('Simulated write failure'); } await retrySet(...args); done++; };
    change('crossword', false); change('crossword', true); change('crossword', false);
    await until(() => done === 3, 'Failure-recovery writes did not finish');
    assert(!input('crossword').checked && (await retryStorage.get('settings')).disabled.includes('crossword'), 'An earlier failed save cannot roll back a newer switch state');

    await load();
    const readStorage = frame.contentWindow.Margin.storage, readGet = readStorage.get.bind(readStorage);
    let reads = 0;
    readStorage.get = async key => { const count = ++reads; await wait(12); if (count === 2) throw Error('Simulated read failure'); return readGet(key); };
    change('crossword', true); change('crossword', false);
    await until(() => /Could not save/.test(frame.contentDocument.querySelector('#status').textContent), 'Failed preference read was not reported');
    assert(input('crossword').checked && !(await readGet('settings')).disabled.includes('crossword'), 'A later failed change restores the most recently committed preference');
    assert(JSON.stringify(await readGet('puzzle:kept')) === JSON.stringify(puzzle), 'Failed preference writes also leave puzzle data intact');
  } catch (error) { results.push(`FAIL ${error.stack}`); }
  finally {
    if (originalStorage !== undefined && frame.contentWindow?.localStorage) {
      if (originalStorage === null) frame.contentWindow.localStorage.removeItem('margin-preview');
      else frame.contentWindow.localStorage.setItem('margin-preview', originalStorage);
    }
    report.textContent = results.join('\n');
    document.body.dataset.testStatus = results.some(line => line.startsWith('FAIL')) ? 'failed' : 'passed';
  }
})();
