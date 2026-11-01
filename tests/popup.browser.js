(async () => {
  'use strict';
  const frame = document.querySelector('#popup'), report = document.querySelector('#results'), results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); results.push(`PASS ${message}`); };
  const until = async (check, message) => { for (let i = 0; i < 150; i++) { if (check()) return; await wait(10); } throw Error(message); };
  const load = async () => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = new URL(`../popup.html?fixture=${Date.now()}`, location.href).href; });
    await until(() => frame.contentDocument.querySelectorAll('#games input').length === 5, 'Popup did not load all games');
  };
  const input = id => frame.contentDocument.querySelector(`[data-game="${id}"] input`);
  const change = (id, checked) => { const node = input(id); node.checked = checked; node.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true })); };
  let originalStorage;
  try {
    await load();
    originalStorage = frame.contentWindow.localStorage.getItem('margin-preview');
    const puzzle = { updatedAt: Date.now(), game: 'connections', state: { marks: { BASS: { tl: 0 } }, attempts: [{ words: ['BASS','PITCH','TONE','NOTE'], result: 'one-away' }] } };
    const settings = { disabled: ['strands'], features: { wordle: { clickToEdit: false } }, shortcuts: { sudoku: { key: 'Control' } }, keepPreference: 'unchanged' };
    frame.contentWindow.localStorage.setItem('margin-preview', JSON.stringify({ settings, 'puzzle:kept': puzzle }));
    await load();
    const doc = frame.contentDocument, win = frame.contentWindow;
    assert(doc.querySelector('h1')?.textContent === 'NYT Games Swiss Knife' && doc.title === 'NYT Games Swiss Knife', 'Popup uses the requested NYT Games Swiss Knife brand');
    const rows = [...doc.querySelectorAll('#games .game')];
    assert(rows.length === 5 && rows.map(row => row.querySelector('.game-name').textContent).join(',') === 'Connections,Sudoku,Strands,Wordle,Crossword', 'Popup lists plain game names without taglines');
    assert(rows.every(row => row.querySelectorAll('img').length === 1 && row.querySelectorAll('input[type="checkbox"]').length === 1 && !row.querySelector('a,small,p')), 'Each game row contains one icon, name, and enable switch');
    const images = rows.map(row => row.querySelector('img'));
    await until(() => images.every(img => img.complete && img.naturalWidth > 0), 'Local game SVG icons failed to load');
    const iconBase = new URL('../icons/games/', location.href).href;
    assert(images.every(img => img.src.startsWith(iconBase) && /\.(svg|png)$/.test(img.src) && img.alt === ''), 'Game icons load from bundled image files without network assets');
    const links = [...doc.querySelectorAll('a')];
    assert(links.length === 1 && links[0].textContent === 'How to use' && new URL(links[0].href).pathname.endsWith('/help.html'), 'Popup contains only the How to use link without a logo credit line');
    assert(!doc.querySelector('button,textarea,select,#export,#delete,#notes') && !/Saved notes|Export|Delete|Open game|little room|maybes/i.test(doc.body.textContent), 'Popup has no notes management, game links, or extra descriptive copy');
    assert(!input('strands').checked && input('wordle').checked && input('connections').getAttribute('aria-label') === 'Enable Connections tools', 'Enable switches reflect saved preferences and have accessible names');

    const storage = win.Margin.storage, realGet = storage.get.bind(storage), realSet = storage.set.bind(storage);
    let activeWrites = 0, maxWrites = 0, completedWrites = 0;
    storage.get = async key => { await wait(8); return realGet(key); };
    storage.set = async (key, value) => {
      activeWrites++; maxWrites = Math.max(maxWrites, activeWrites); await wait(12);
      try { await realSet(key, value); completedWrites++; } finally { activeWrites--; }
    };
    storage.remove = async () => { throw Error('Popup must not delete records'); };
    for (const [id, checked] of [['connections',false], ['sudoku',false], ['strands',true], ['wordle',false], ['wordle',true], ['wordle',false]]) change(id, checked);
    await until(() => completedWrites === 6, 'Rapid toggle writes did not finish');
    const saved = await realGet('settings');
    assert(maxWrites === 1 && [...saved.disabled].sort().join(',') === 'connections,sudoku,wordle', 'Rapid changes serialize and preserve the final preference for every game');
    assert(JSON.stringify(saved.features) === JSON.stringify(settings.features) && JSON.stringify(saved.shortcuts) === JSON.stringify(settings.shortcuts) && saved.keepPreference === 'unchanged', 'Game toggles preserve per-game features, shortcut keys, and unrelated settings');
    assert(JSON.stringify(await realGet('puzzle:kept')) === JSON.stringify(puzzle), 'Toggling games preserves existing puzzle data');
    await load();
    assert(!input('connections').checked && !input('sudoku').checked && !input('wordle').checked && input('strands').checked && input('crossword').checked, 'Enabled and disabled games persist after reopening the popup');

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
