(() => {
  'use strict';
  const { el, storage } = Margin;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const report = document.querySelector('#results');
  const params = new URL(location.href).searchParams;
  const results = [];
  async function until(test, message, timeout = 2200) {
    for (let elapsed = 0; elapsed < timeout; elapsed += 20) { if (test()) return; await wait(20); }
    throw Error(message);
  }
  function publish() { report.textContent = results.join('\n'); }

  // Separate real browsing contexts exercise innerWidth/innerHeight and media
  // queries; shrinking only a fixture container would miss viewport clamping.
  if (!params.has('layout-frame')) {
    (async () => {
      for (const viewport of [{ name: 'desktop', width: 1280, height: 820 }, { name: 'short mobile', width: 360, height: 420 }]) {
        const frame = el('iframe', { className: 'layout-frame', title: `${viewport.name} layout fixture`, width: viewport.width, height: viewport.height,
          src: `${location.pathname}?layout-frame=1&game=connections&viewport=${encodeURIComponent(viewport.name)}` });
        document.body.append(frame);
        await until(() => frame.contentDocument?.body?.dataset.testStatus, `${viewport.name} fixture did not finish`, 30000);
        const child = frame.contentDocument;
        const lines = child.querySelector('#results').textContent.split('\n').filter(Boolean);
        results.push(...lines.map(line => line.replace(/^(PASS|FAIL) /, `$1 ${viewport.name}: `)));
        const passed = child.body.dataset.testStatus === 'passed';
        frame.remove(); publish();
        assert(passed, `${viewport.name} fixture failed`);
      }
      document.body.dataset.testStatus = 'passed';
      document.title = 'Margin settings layout: passed';
    })().catch(error => { results.push(`FAIL layout runner: ${error.message}`); publish(); document.body.dataset.testStatus = 'failed'; });
    return;
  }

  document.body.dataset.layoutChild = 'true';
  const fixtures = document.querySelector('#fixtures');
  const previousStorage = localStorage.getItem('margin-preview');
  const mounts = {};
  for (const [name, api] of Object.entries(MarginGames)) {
    const mount = api.mount;
    api.mount = ctx => { mounts[name] = (mounts[name] || 0) + 1; return mount(ctx); };
  }
  localStorage.setItem('margin-preview', JSON.stringify({ settings: { disabled: [] } }));
  let board, shadow, host;
  const cases = [
    { name: 'Connections', game: 'connections', flag: 'cornerLabels' },
    { name: 'Sudoku', game: 'sudoku', flag: 'centerNotes' },
    { name: 'Wordle', game: 'wordle', flag: 'letterProtection' },
    { name: 'Crossword', game: 'crossword', flag: 'candidateNotes' },
    { name: 'Bonus Crossword', game: 'bonuscrossword', flag: 'candidateNotes' }
  ];
  const actualGame = game => game === 'bonuscrossword' ? 'crossword' : game;
  const settings = () => shadow.querySelector('.game-settings');
  const summary = () => settings().querySelector('summary');
  const content = () => shadow.querySelector('.settings-content');
  const notes = () => shadow.querySelector('[aria-label="Your puzzle notes"]');
  const flag = name => shadow.querySelector(`[data-feature="${name}"]`);
  function nativeButton(text, attrs = {}) { return el('button', { type: 'button', textContent: text, ...attrs }); }
  function makeFixture(game, puzzle = 'first') {
    const column = el('div', { className: 'native-column', 'data-puzzle-id': `${game}-${puzzle}` });
    if (game === 'connections') {
      board = el('div', { className: 'connections-grid', 'data-testid': 'connections-board' });
      for (const word of ['APPLE','BERRY','CHERRY','DATE','ECHO','FOX','GOLD','HARP','INK','JADE','KITE','LIME','MINT','NOTE','OPAL','PEAR']) {
        board.append(el('button', { type: 'button', 'data-testid': 'card-label', 'aria-pressed': 'false' }, el('span', { textContent: word })));
      }
      column.append(el('p', { textContent: 'Create four groups of four!', style: 'text-align:center' }), board, el('div', { className: 'native-actions' }, nativeButton('Shuffle'), nativeButton('Submit')));
    } else if (game === 'sudoku') {
      board = el('div', { className: 'su-board' });
      for (let index = 0; index < 81; index++) board.append(el('button', { type: 'button', className: 'su-cell' }, ...(index === 0 ? [el('span', { className: 'su-cell__value', textContent: '5' })] : [])));
      const modes = el('div', { className: 'su-keyboard__split' }, nativeButton('Normal', { 'data-testid': 'normal-mode' }), nativeButton('Candidate', { 'data-testid': 'candidate-mode' }));
      const pad = el('div', { className: 'su-candidates' });
      for (let digit = 1; digit <= 9; digit++) pad.append(nativeButton(String(digit), { className: 'su-candidate-button', 'aria-label': `Number ${digit}` }));
      const undo = nativeButton('Undo', { className: 'su-keyboard__undo', 'data-testid': 'undo-mobile', disabled: true });
      const auto = el('label', { className: 'su-keyboard__auto' }, el('input', { type: 'checkbox', className: 'su-keyboard__checkbox', 'data-testid': 'sudoku-keyboard-checkbox', name: 'lightenComplete' }), 'Auto Candidate Mode');
      column.append(el('div', { className: 'su-game' }, board, el('div', { className: 'su-keyboard' }, modes, pad, el('div', { className: 'native-actions' }, undo, nativeButton('Erase', { 'data-testid': 'clear-cell' })), auto)));
    } else if (game === 'wordle') {
      board = el('div', { className: 'wordle-board Board-module_board__layout' });
      for (let row = 0; row < 6; row++) {
        const node = el('div', { className: 'wordle-row Row-module_row__layout' });
        for (let col = 0; col < 5; col++) node.append(el('span', { className: 'wordle-tile Tile-module_tile__layout', 'data-state': 'empty' }));
        board.append(node);
      }
      column.append(el('div', { className: 'native-wordle' }, board, el('div', { className: 'native-keyboard Keyboard-module_keyboard__layout' }, nativeButton('A'), nativeButton('B'), nativeButton('Enter', { 'data-key': 'Enter' }))));
    } else {
      if (game === 'bonuscrossword') {
        const ns = 'http://www.w3.org/2000/svg';
        board = document.createElementNS(ns, 'svg'); board.classList.add('bonus-board'); board.setAttribute('viewBox', '0 0 250 250');
        const cells = document.createElementNS(ns, 'g'); cells.setAttribute('data-group', 'cells'); board.append(cells);
        for (let index = 0; index < 25; index++) {
          const cell = document.createElementNS(ns, 'g'); cell.setAttribute('data-group', 'cell');
          const rect = document.createElementNS(ns, 'rect');
          for (const [name, value] of Object.entries({ x: index % 5 * 50, y: Math.floor(index / 5) * 50, width: 50, height: 50 })) rect.setAttribute(name, value);
          cell.append(rect);
          if (index < 5 || index % 5 === 0) {
            const number = document.createElementNS(ns, 'text'); number.setAttribute('data-cell-number', ''); number.setAttribute('x', index % 5 * 50 + 4); number.setAttribute('y', Math.floor(index / 5) * 50 + 11); number.textContent = String(index < 5 ? index + 1 : 5 + index / 5); cell.append(number);
          }
          cells.append(cell);
        }
      } else {
        board = el('div', { className: 'crossword-grid', role: 'grid' });
        for (let index = 0; index < 25; index++) {
          const number = index < 5 ? index + 1 : index % 5 === 0 ? 5 + index / 5 : '';
          board.append(nativeButton(String(number), { role: 'gridcell', 'aria-rowindex': Math.floor(index / 5) + 1, 'aria-colindex': index % 5 + 1, ...(number ? { 'data-number': number } : {}) }));
        }
      }
      const clues = el('aside', { className: 'crossword-clues' });
      for (const direction of ['across', 'down']) {
        const list = el('ol');
        for (let number = 1; number <= 5; number++) list.append(el('li', { 'data-clue-number': number }, el('span', { 'data-testid': 'clue-text', textContent: `Demo ${direction} clue ${number}` })));
        clues.append(el('section', { 'data-testid': `${direction}-clues` }, el('h3', { textContent: direction === 'across' ? 'Across' : 'Down' }), list));
      }
      column.append(el('div', { className: 'xwd__layout' }, board, clues));
    }
    const bar=el('div',{'data-native-toolbar':'',style:'display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:44px'});
    bar.append(nativeButton('Stats',{'aria-label':'Statistics'}),nativeButton('Help',{'aria-label':'Help'}));
    if(['sudoku','wordle','crossword','bonuscrossword'].includes(game))bar.append(nativeButton('Settings',{'aria-label':'Settings','data-test-settings':'',onClick:()=>{
      const modal=el('div',{role:'dialog','data-native-settings':'',style:'position:fixed;inset:16px;max-width:480px;max-height:calc(100vh - 32px);margin:auto;overflow:auto;background:white;border:1px solid #888;padding:16px;z-index:2147483640'},el('h2',{textContent:'Settings'}),el('label',{},el('input',{type:'checkbox'}),'Original preference'));
      modal.append(nativeButton('Close',{'aria-label':'Close',onClick:()=>{modal.remove();bar.querySelector('[data-test-settings]').focus({preventScroll:true});}}));document.body.append(modal);
    }}));
    column.prepend(bar);
    board.dataset.layoutBoard = '';
    fixtures.replaceChildren(column);
  }
  function route(game, puzzle = 'first') {
    const next = new URL(location.href); next.searchParams.set('game', game); next.searchParams.set('puzzle', puzzle); history.replaceState(null, '', next);
    makeFixture(game, puzzle);
  }
  function geometry() {
    const rect = board.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollX, scrollY, scrollWidth: document.documentElement.scrollWidth };
  }
  function unchanged(before, label) {
    const after = geometry();
    for (const key of Object.keys(before)) assert(Math.abs(before[key] - after[key]) < .6, `${label}: ${key} moved from ${before[key]} to ${after[key]}`);
  }
  async function loaded(game,previousMounts){
    const preference=game==='wordle'?'clickToEdit':game==='connections'?'cornerLabels':actualGame(game)==='crossword'?'letterCycle':'cornerNotes';
    await until(()=>(mounts[actualGame(game)]||0)>previousMounts&&document.querySelector('#margin-host')?.shadowRoot?.querySelector(`[data-feature="${preference}"]`),`${game} did not mount`);
    host=document.querySelector('#margin-host');shadow=host.shadowRoot;
    await until(()=>[...document.querySelectorAll('[data-margin-inline]'),host].filter(n=>n.shadowRoot).every(node=>[...node.shadowRoot.querySelectorAll('link[rel="stylesheet"]')].every(link=>!!link.sheet)),'Stylesheets did not load');
    window.scrollTo(0,Math.max(0,fixtures.getBoundingClientRect().top+scrollY-20));fixtures.classList.toggle('layout-positioned');await wait(180);
  }
  const nativeTrigger=()=>fixtures.querySelector('[data-test-settings]');
  async function open(){if(nativeTrigger()){if(!document.querySelector('[data-native-settings]'))nativeTrigger().click();await wait(170);}else{if(!settings().open)summary().click();await wait(50);}}
  async function close(){const modal=document.querySelector('[data-native-settings]');if(modal)modal.querySelector('[aria-label="Close"]').click();else shadow.querySelector('.settings-close').click();await wait(170);}
  async function run(name,fn){await fn();results.push(`PASS ${name}`);publish();}
  async function testCase(item,initial=false){
    const game=actualGame(item.game),beforeMount=mounts[game]||0;
    if(!initial)route(item.game);await loaded(item.game,initial?0:beforeMount);
    const baseline=geometry();
    await run(`${item.name}: settings use the native toolbar`,async()=>{
      if(nativeTrigger())assert(getComputedStyle(host).display==='none','A second settings gear is visible');
      else assert(host.closest('[data-native-toolbar]')&&summary().getBoundingClientRect().height>=40,'Missing toolbar settings button');
      assert(!settings().open&&baseline.scrollWidth<=innerWidth,'Settings opened by themselves or overflowed horizontally');
    });
    await run(`${item.name}: opening original settings preserves the board`,async()=>{
      for(let i=0;i<2;i++){
        await open();unchanged(baseline,'Open');
        const container=nativeTrigger()?document.querySelector('[data-native-settings]'):content(),r=container.getBoundingClientRect();
        assert(r.width>100&&r.height>50&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,'Settings escape the viewport');
        if(nativeTrigger())assert(container.contains(host)&&summary().hidden,'Tools did not join the original dialog '+JSON.stringify({parent:host.parentElement?.outerHTML.slice(0,100),hidden:summary().hidden,open:settings().open,dialogs:document.querySelectorAll('[data-native-settings]').length}));
        await close();unchanged(baseline,'Close');
      }
    });
    await run(`${item.name}: feature switches preserve the mounted adapter`,async()=>{
      await open();const count=mounts[game];flag(item.flag).click();await wait(50);
      assert(settings().open&&mounts[game]===count,'Changing a feature closed settings or remounted the adapter');
      flag(item.flag).click();await wait(50);assert((await storage.get('settings')).features[game][item.flag]===true,'Preference did not persist');
      assert(!flag('scratchpad')&&notes().closest('.notes').hidden,'Removed notes remain visible');
      if(game==='sudoku'||game==='crossword')assert((game==='sudoku'?!shadow.querySelector('.mode-shortcuts').hidden:!shadow.querySelector('.shortcut-setting').hidden)&&shadow.querySelector('.shortcut-key'),'Configurable key recording is missing');
      if(game==='sudoku')assert(!flag('pencilUndo')&&!flag('pencilShortcut'),'Optional Undo or duplicate shortcut toggle remains');
      Object.assign(baseline,geometry());await close();unchanged(baseline,'Close after feature change');
    });
    await run(`${item.name}: Escape closes the applicable settings and preserves scroll`,async()=>{
      await open();flag(item.flag).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true,cancelable:true}));await wait(180);
      assert(!settings().open&&!document.querySelector('[data-native-settings]'),'Escape did not close settings');unchanged(baseline,'Escape');
    });
    await run(`${item.name}: native refresh keeps one settings section`,async()=>{
      await open();board.classList.add('native-refresh');await wait(170);assert(document.querySelectorAll('#margin-host').length===1&&settings().open,'Refresh duplicated or closed settings');unchanged(baseline,'Native refresh');await close();
    });
    if(game==='connections')await run('Connections colors remain below instructions; Tries is in the top toolbar',async()=>{
      const tools=document.querySelector('[data-margin-inline="connections-tools"]'),tries=document.querySelector('[data-margin-inline="connections-tries"]');
      assert(tools.nextElementSibling===board&&tools.previousElementSibling.textContent==='Create four groups of four!','Category toolbar moved below tiles');
      assert(tries.closest('[data-native-toolbar]'),'Tries did not join the native toolbar');
    });
    if(params.get('viewport')==='desktop')await run(`${item.name}: settings persist across puzzles without reviving removed notes`,async()=>{
      await open();flag(item.flag).click();await wait(50);await close();const count=mounts[game];route(item.game,'second');await loaded(item.game,count);await open();
      assert(!flag(item.flag).checked&&notes().value==='','Preference was lost or puzzle notes leaked');flag(item.flag).click();await wait(50);await close();
    });
  }
  route(cases[0].game);
  const script = el('script', { src: '../content.js' });
  script.onload = async () => {
    try {
      for (let index = 0; index < cases.length; index++) await testCase(cases[index], index === 0);
      document.body.dataset.testStatus = 'passed';
    } catch (error) { results.push(`FAIL ${error.message}`); document.body.dataset.testStatus = 'failed'; }
    finally {
      publish();
      if (previousStorage === null) localStorage.removeItem('margin-preview'); else localStorage.setItem('margin-preview', previousStorage);
    }
  };
  script.onerror = () => { results.push('FAIL content script did not load'); publish(); document.body.dataset.testStatus = 'failed'; };
  document.body.append(script);
})();
