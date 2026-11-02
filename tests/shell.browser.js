(function () {
  'use strict';
  const { el, storage } = Margin;
  const fixtures = document.querySelector('#fixtures');
  const report = document.querySelector('#results');
  const previousStorage = localStorage.getItem('margin-preview');
  const results = [];
  let nativeTileClicks = 0;
  let nativeKeys = 0;
  let nativeEnterClicks = 0;
  let shadow;
  const words = ['APPLE', 'BERRY', 'CHERRY', 'DATE', 'ECHO', 'FOX', 'GOLD', 'HARP', 'INK', 'JADE', 'KITE', 'LIME', 'MINT', 'NOTE', 'OPAL', 'PEAR'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const slot = name => document.querySelector(`[data-margin-inline="${name}"]`);
  const overlay = () => ({
    querySelectorAll: selector => [...document.querySelectorAll('[data-margin-overlay="connections"]')].flatMap(host => [...host.shadowRoot.querySelectorAll(selector)]),
    querySelector: selector => overlay().querySelectorAll(selector)[0] || null,
  });
  const settings = () => shadow.querySelector('.game-settings');
  const button = text => Array.from(shadow.querySelectorAll('button')).find(node => node.textContent === text);
  function nativeToolbar(settingsAvailable=false){
    const bar=el('div',{'data-native-toolbar':'',style:'display:flex;align-items:center;gap:6px;min-height:44px'},el('button',{'aria-label':'Statistics',textContent:'Stats'}),el('button',{'aria-label':'Help',textContent:'Help'}));
    if(settingsAvailable)bar.append(el('button',{'aria-label':'Settings','data-native-settings-button':'',textContent:'Settings',onClick:()=>{
      const modal=el('div',{role:'dialog','data-native-settings':'',style:'position:fixed;inset:20px;background:white;z-index:2147483640'},el('h2',{textContent:'Settings'}));modal.append(el('button',{'aria-label':'Close',textContent:'Close',onClick:()=>modal.remove()}));document.body.append(modal);
    }}));return bar;
  }
  function connections() {
    const board = el('div', { className: 'fixture-words', 'data-margin-game': 'connections' });
    for (const word of words) board.append(el('button', { 'data-margin-word': word, 'aria-pressed': 'false', textContent: word, onClick: event => {
      nativeTileClicks++; event.currentTarget.setAttribute('aria-pressed', String(event.currentTarget.getAttribute('aria-pressed') !== 'true'));
    } }));
    fixtures.replaceChildren(nativeToolbar(),el('p', { textContent: 'Create four groups of four!', 'data-margin-connections-instructions': '' }), board);
  }
  function wordle() {
    const board = el('div', { className: 'native-wordle' });
    const grid = el('div', { className: 'Board-module_board__fixture' });
    for (let index = 0; index < 6; index++) {
      const row = el('div', { className: 'fixture-wordle-row', 'data-margin-row': '' });
      const letters = index < 2 ? 'CRANE' : '     ';
      const states = index === 0 ? ['correct', 'absent', 'correct', 'absent', 'absent'] : Array(5).fill(index === 1 ? 'tbd' : 'empty');
      Array.from(letters).forEach((letter, position) => row.append(el('span', { 'data-margin-tile': '', 'data-state': states[position], textContent: letter })));
      grid.append(row);
    }
    board.append(grid, el('div', { className: 'Keyboard-module_keyboard__fixture', 'data-margin-keyboard': '' }, el('button', { 'data-margin-enter': '', textContent: 'Enter', onClick: () => { nativeEnterClicks++; } })));
    fixtures.replaceChildren(nativeToolbar(true),board);
  }
  function route(game, extra = '') { history.replaceState(null, '', `${location.pathname}?game=${game}${extra}`); }
  async function run(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.message}`); }
    report.textContent = results.join('\n');
  }
  // This dedicated fixture uses preview storage only; it restores any prior fixture data when done.
  localStorage.setItem('margin-preview', JSON.stringify({
    'puzzle:expired': { updatedAt: Date.now() - 91 * 86400000, state: { scratch: 'old' } },
    'puzzle:recent': { updatedAt: Date.now() - 86400000, state: { scratch: 'keep' } },
    settings: { disabled: [] }
  }));
  route('connections');
  connections();
  document.addEventListener('keydown', () => { nativeKeys++; });
  window.addEventListener('load', async () => {
    await wait(250);
    shadow = document.querySelector('#margin-host').shadowRoot;
    await run('late Connections startup is not starved by continuous page mutations', async () => {
      fixtures.replaceChildren();await wait(150);
      const ticker=el('span',{textContent:'Loading'});document.body.append(ticker);
      let ticks=0;const churn=setInterval(()=>ticker.textContent=String(++ticks),20);
      try {
        connections();await wait(350);
        assert(slot('connections-tools')?.isConnected&&!slot('connections-tools').hidden,'late game controls never appeared');
        assert(overlay()?.querySelectorAll('.corner-handle').length===64,'late board never received its corners');
      } finally {clearInterval(churn);ticker.remove();}
    });
    await run('primary tools mount in normal flow with settings collapsed', () => {
      assert(!settings().open, 'settings opened automatically');
      assert(!shadow.querySelector('.notebook,.launcher'), 'floating notebook remains');
      const tools=slot('connections-tools');
      assert(tools?.nextElementSibling===fixtures.querySelector('.fixture-words'), 'tools not above board');
      assert(tools.previousElementSibling?.textContent === 'Create four groups of four!', 'toolbar is not below the native instructions');
      assert(getComputedStyle(tools).position!=='fixed', 'tools floating');
      assert(document.querySelector('#margin-host').closest('[data-native-toolbar]')&&slot('connections-tries').closest('[data-native-toolbar]'),'Settings and Tries are not in the native toolbar');
      assert(!slot('connections-history'), 'previous tries still occupies space below the board');
      assert(!shadow.querySelector('[data-feature="scratchpad"],[data-feature="wordMeanings"]') && shadow.querySelector('.notes').hidden, 'removed Connections notes or dictionary remain');
      assert(fixtures.querySelector('.fixture-words').children.length===16, 'tools changed board cells');
      assert(Object.keys(MarginGames).sort().join(',')==='connections,crossword,sudoku,wordle', 'unexpected game adapters');
    });
    await run('90-day retention removes expired notes and preserves recent notes/settings', async () => {
      const data = await storage.all();
      assert(!data['puzzle:expired'], 'expired puzzle retained');
      assert(data['puzzle:recent']?.state.scratch === 'keep', 'recent puzzle removed');
      assert(data.settings && Array.isArray(data.settings.disabled), 'settings pruned');
    });
    await run('direct corner marking persists without native selection', async () => {
      overlay().querySelector('[data-word="APPLE"][data-corner="tl"]').click(); await wait(30);
      assert(nativeTileClicks===0, 'corner click reached game');
      const record=Object.values(await storage.all()).find(value=>value?.game==='connections');
      assert(record?.state.marks.APPLE.tl===0, 'mark not persisted');
      assert(!settings().open, 'mark opened settings');
    });
    await run('settings collapse retains controls and word center clicks stay native', () => {
      const tools=slot('connections-tools'); settings().open=true;settings().open=false;
      fixtures.querySelector('[data-margin-word="BERRY"]').click();
      assert(nativeTileClicks===1, 'word center intercepted');
      assert(tools===slot('connections-tools'), 'tools remounted');
      const mark=overlay().querySelector('[data-word="APPLE"][data-corner="tl"]');
      assert(mark.textContent === '' && !mark.classList.contains('empty'), 'corner should remain colored without a letter');
    });
    await run('repeated mutations keep one stable set of inline hosts', async () => {
      const before=[...document.querySelectorAll('[data-margin-inline]')];
      for(let i=0;i<3;i++){fixtures.querySelector('button').className='refresh'+i;await wait(140);}
      assert(before.length===document.querySelectorAll('[data-margin-inline]').length, 'duplicate hosts');
      assert(before.every(node=>node.isConnected), 'hosts replaced');
      assert(slot('connections-tools').nextElementSibling===fixtures.querySelector('.fixture-words'), 'placement drift');
    });
    await run('Connections settings keep keyboard input out of the native game', async () => {
      const control = shadow.querySelector('[data-feature="cornerLabels"]');
      const before = nativeKeys;
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true, cancelable: true }));
      assert(nativeKeys === before, 'settings key reached native document handler');
    });
    await run('route and DOM changes switch the actual shell to Wordle and remove old overlays', async () => {
      route('wordle'); wordle(); await wait(1750);
      assert(shadow.querySelector('[data-feature="clickToEdit"]'), 'route did not switch');
      assert(document.querySelector('#margin-host').style.display==='none','A duplicate Wordle settings gear is visible');
      assert(!slot('connections-tools'), 'old inline controls leaked');
      assert(!document.querySelector('[data-margin-overlay="connections"]'), 'old overlay leaked');
      const features = [...shadow.querySelectorAll('[data-feature]')].map(node => node.dataset.feature);
      assert(features.length === 2 && features.includes('letterProtection') && features.includes('clickToEdit'), 'Wordle should have exactly two preferences');
      assert(!slot('wordle-letters') && !shadow.querySelector('.mw-workbench'), 'removed Wordle workbench remains');
      assert(shadow.querySelector('.notes').hidden, 'Wordle notes are still exposed');
      assert(shadow.querySelector('[aria-label="Your puzzle notes"]').value === '', 'notes bled between games');
    });
    await run('Wordle uses its original settings and keeps tool input out of the game',async()=>{
      fixtures.querySelector('[data-native-settings-button]').click();await wait(140);
      assert(document.querySelector('[data-native-settings]').contains(document.querySelector('#margin-host'))&&settings().querySelector('summary').hidden,'Wordle tools did not join original settings');
      const before=nativeKeys;shadow.querySelector('[data-feature="clickToEdit"]').dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true,composed:true,cancelable:true}));assert(nativeKeys===before,'settings key reached the game');
      document.querySelector('[data-native-settings] [aria-label="Close"]').click();await wait(140);
    });
    await run('warning stays beside keyboard with settings closed and override submits once', () => {
      const before=nativeKeys;
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      assert(nativeKeys===before, 'guarded Enter reached game');
      assert(!settings().open, 'warning opened settings');
      const warning=slot('wordle-warning');
      assert(warning&&warning.style.display!=='none', 'warning absent');
      const submit=[...warning.shadowRoot.querySelectorAll('button')].find(node=>node.textContent==='Submit anyway');
      assert(submit, 'override absent');submit.click();assert(nativeEnterClicks===1, 'override did not submit once');
    });
    await run('returning to Connections restores corner colors without exposing notes', async () => {
      route('connections'); connections(); await wait(1750);
      assert(slot('connections-tools')&&!slot('wordle-warning'), 'route back failed');
      const mark=overlay().querySelector('[data-word="APPLE"][data-corner="tl"]');
      assert(mark.textContent === '' && !mark.classList.contains('empty'), 'saved corner color not restored');
      assert(!shadow.querySelector('[data-feature="scratchpad"]') && shadow.querySelector('.notes').hidden, 'Connections notes reappeared');
    });
    await run('disabled game setting hides the shell and leaves native play untouched', async () => {
      await storage.set('settings', { disabled: ['wordle'] });
      route('wordle'); wordle(); await wait(1750);
      const host=document.querySelector('#margin-host');
      assert((!host||host.style.display === 'none')&&!document.querySelector('[data-margin-inline]'), 'disabled tools visible');
      const before = nativeKeys;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      assert(nativeKeys === before + 1, 'disabled game still intercepted');
    });
    await run('Crossword settings contain letter cycling and Notes', async () => {
      await storage.set('settings', { disabled: [] });
      route('crossword', '&puzzle=first'); fixtures.replaceChildren(); await wait(1750);
      const features = [...shadow.querySelectorAll('[data-feature]')].map(node => node.dataset.feature).sort();
      assert(features.join(',') === 'candidateNotes,letterCycle', 'Crossword feature settings do not match its tools');
      assert(shadow.querySelector('.notes').hidden && !shadow.querySelector('.mc-notebook'), 'Crossword notes remain exposed');
      assert(!shadow.querySelector('.shortcut-setting').hidden&&shadow.querySelector('.shortcut-key'),'Crossword configurable Pencil hotkey is missing');
      const toggle = shadow.querySelector('[data-feature="letterCycle"]'); toggle.click(); await wait(30);
      route('crossword', '&puzzle=second'); await wait(1750);
      assert(!shadow.querySelector('[data-feature="letterCycle"]').checked, 'Crossword feature preference did not persist');
    });
    if (previousStorage === null) localStorage.removeItem('margin-preview');
    else localStorage.setItem('margin-preview', previousStorage);
    report.textContent = results.join('\n');
    document.body.dataset.testStatus = results.some(result => result.startsWith('FAIL')) ? 'failed' : 'passed';
    document.title = `Margin inline integration: ${document.body.dataset.testStatus}`;
  });
})();
