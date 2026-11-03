(async () => {
  'use strict';
  const { el, storage } = Margin, fixtures = document.querySelector('#fixtures'), report = document.querySelector('#results');
  const results = [], previous = localStorage.getItem('margin-preview');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); results.push(`PASS ${message}`); };
  const until = async (check, message) => { for (let i = 0; i < 140; i++) { if (await check()) return; await wait(20); } throw Error(message); };
  function send(type, key, target = document.body, options = {}) {
    const event = new KeyboardEvent(type, { key, code: ['Shift','Control','Alt','Meta'].includes(key) ? `${key}Left` : `Key${key.toUpperCase()}`, bubbles: true, composed: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  }
  function tap(key = 'Shift', target = document.body) { const down = send('keydown', key, target); const up = send('keyup', key, target); return { down, up }; }
  const shadow = () => document.querySelector('#margin-host').shadowRoot;
  const setting = name => shadow().querySelector(`[data-feature="${name}"]`);
  const settings = () => shadow().querySelector('.game-settings');
  const keyChoice=mode=>shadow().querySelector(mode?`[data-shortcut-mode="${mode}"] .shortcut-key`:'.shortcut-setting:not([data-shortcut-mode]) .shortcut-key');
  const setFeature = (name, value) => { const input = setting(name); input.checked = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
  const setKey=(key,mode)=>{keyChoice(mode).click();tap(key,keyChoice(mode));};
  const route = game => history.replaceState(null, '', `${location.pathname}?game=${game}`);
  const coloredRoot = () => document.querySelector('[data-margin-inline="sudoku-colored"]')?.shadowRoot;
  const coloredOn = () => !!coloredRoot()?.querySelector('input[type="checkbox"]')?.checked;
  let release, nativePencilClicks = 0;
  try {
    await wait(40);
    let calls = 0, options = { enabled: true, key: 'Shift' };
    release = Margin.bindShortcut(() => { calls++; return true; }, () => options);
    let nativeModifierHeld = false, nativeReleases = 0;
    const nativeDown = event => { if (event.key === 'Shift') nativeModifierHeld = true; };
    const nativeUp = event => { if (event.key === 'Shift') { nativeModifierHeld = false; nativeReleases++; } };
    document.addEventListener('keydown', nativeDown); document.addEventListener('keyup', nativeUp);
    const first = tap();
    assert(nativeReleases === 1 && !nativeModifierHeld, 'Handled shortcut releases still reach native listeners to clear temporary modifier state');
    document.removeEventListener('keydown', nativeDown); document.removeEventListener('keyup', nativeUp);
    assert(calls === 1 && !first.down.defaultPrevented && first.up.defaultPrevented, 'A modifier tap triggers once on release without swallowing native keydown');
    send('keyup', 'Shift'); assert(calls === 1, 'A release without a matching press does nothing');
    send('keydown', 'Shift', document.body, { shiftKey: true }); send('keydown', 'A', document.body, { shiftKey: true }); send('keyup', 'A', document.body, { shiftKey: true }); send('keyup', 'Shift');
    assert(calls === 1, 'Shift plus a letter remains ordinary typing');
    send('keydown', 'a'); send('keydown', 'Shift', document.body, { shiftKey: true }); send('keyup', 'Shift'); send('keyup', 'a');
    assert(calls === 1, 'A letter held before pressing Shift cannot be mistaken for an isolated modifier tap');
    options.key = 'Control'; send('keydown', 'Control', document.body, { ctrlKey: true }); send('keydown', 'c', document.body, { ctrlKey: true }); send('keyup', 'c', document.body, { ctrlKey: true }); send('keyup', 'Control');
    assert(calls === 1, 'Control plus C does not activate the shortcut');
    for (const key of ['Control','Alt','Meta','Shift']) { options.key = key; tap(key); }
    assert(calls === 5, 'All four configurable modifier keys work as isolated taps');
    const beforeIgnored = calls;
    send('keydown', 'Shift'); send('keydown', 'Shift', document.body, { repeat: true }); send('keyup', 'Shift');
    send('keydown', 'Shift', document.body, { isComposing: true }); send('keyup', 'Shift');
    send('keydown', 'Shift', document.body, { ctrlKey: true }); send('keyup', 'Shift');
    send('keydown', 'Shift', document.body, { code: 'ShiftLeft' }); send('keyup', 'Shift', document.body, { code: 'ShiftRight' });
    assert(calls === beforeIgnored, 'Repeat, composition, another held modifier, and mismatched physical keys cannot trigger a tap');
    send('keyup', 'Shift', document.body, { code: 'ShiftLeft' });
    for (const node of [el('input'), el('textarea'), el('select'), el('div', { contentEditable: 'true' })]) {
      fixtures.append(node); tap('Shift', node); node.remove();
    }
    const owned = el('div', { 'data-margin-inline': 'shortcut-test' }); document.body.append(owned);
    const ownedRoot = owned.attachShadow({ mode: 'closed' }), ownedButton = el('button', { textContent: 'Settings control' }); ownedRoot.append(ownedButton); tap('Shift', ownedButton); owned.remove();
    assert(calls === beforeIgnored, 'Text fields, editable content, and closed extension controls never trigger game shortcuts');
    for (const event of [new Event('blur'), new PageTransitionEvent('pagehide', { persisted: true }), new PointerEvent('pointerdown'), new Event('visibilitychange')]) {
      send('keydown', 'Shift'); window.dispatchEvent(event); send('keyup', 'Shift');
    }
    const beforeURL = location.href; send('keydown', 'Shift'); history.replaceState(null, '', `${location.pathname}?game=none&changed=1`); send('keyup', 'Shift'); history.replaceState(null, '', beforeURL);
    send('keydown', 'Shift'); options.enabled = false; send('keyup', 'Shift'); options.enabled = true;
    send('keydown', 'Shift'); options.key = 'Control'; send('keyup', 'Shift'); options.key = 'Shift';
    assert(calls === beforeIgnored, 'Blur, navigation, pointer input, visibility, and changing preferences cancel pending taps');
    release(); release = null; tap(); assert(calls === beforeIgnored, 'Disposing a shortcut removes all keyboard effects');
    release = Margin.bindShortcut(() => false); const noop = tap(); release(); release = null;
    assert(!noop.up.defaultPrevented, 'An unavailable adapter action leaves native keyup untouched');

    await storage.set('settings',{disabled:[],keepPreference:'kept',features:{wordle:{clickToEdit:false}}});
    let modal;
    const originalOption=el('label',{},el('input',{type:'checkbox'}),el('span',{textContent:'Original game preference'}));
    const settingsButton=el('button',{'aria-label':'Settings',textContent:'Settings',onClick:()=>{
      modal=el('div',{role:'dialog','data-native-settings':''},el('h2',{textContent:'Settings'}),originalOption,el('button',{textContent:'Close',onClick:()=>modal.remove()}));document.body.append(modal);
    }});
    const toolbar=el('div',{'data-native-toolbar':''},settingsButton);
    const sudoku=el('div',{'data-margin-game':'sudoku'});
    fixtures.replaceChildren(toolbar,sudoku);const practice=MarginSudokuBoard.build(sudoku);route('sudoku');
    await until(()=>setting('coloredCandidates')&&coloredRoot(),'Sudoku controls did not mount');
    assert(!setting('cornerNotes')&&!setting('centerNotes')&&!setting('pencilShortcut')&&!setting('scratchpad'),'Sudoku settings contain only the Colored candidate switch');
    assert(keyChoice('colored').textContent==='B'&&!shadow().querySelector('[data-shortcut-mode="play"],[data-shortcut-mode="corner"],[data-shortcut-mode="center"]')&&!coloredOn(),'Sudoku has one default B shortcut and starts with Blue off');
    tap('b');assert(coloredOn()&&practice.candidate.getAttribute('aria-pressed')==='true','B turns on Colored candidate in native Candidate mode');
    tap('b');assert(!coloredOn()&&practice.candidate.getAttribute('aria-pressed')==='true','Pressing B again turns colors off and keeps native Candidate');practice.normal.click();
    settingsButton.click();await until(()=>shadow().querySelector('.native-settings'),'Native settings section did not appear');
    assert(modal.contains(document.querySelector('#margin-host'))&&settings().querySelector('summary').hidden&&originalOption.isConnected,'Tools appear below the original settings without replacing native preferences or adding a gear');
    tap('b');assert(!coloredOn(),'The shortcut is inactive while native Settings is open');
    assert(shadow().querySelector('.colored-settings .colored-hex')?.value==='#2f6fdb','Settings offer the Colored candidate hex color');
    setKey('Control','colored');assert(keyChoice('colored').textContent==='Ctrl','Colored candidate records a new shortcut');
    modal.remove();await wait(180);tap('b');assert(!coloredOn(),'The replaced default key stops toggling Blue');tap('Control');assert(coloredOn(),'The recorded modifier toggles Blue');tap('Control');
    settingsButton.click();await wait(180);keyChoice('colored').click();send('keydown','k',keyChoice('colored'),{ctrlKey:true});send('keyup','k',keyChoice('colored'),{ctrlKey:true});
    assert(keyChoice('colored').textContent==='Ctrl + K','Shortcut recording accepts a custom key combination');modal.remove();await wait(180);
    const comboDown=send('keydown','k',document.body,{ctrlKey:true});send('keyup','k',document.body,{ctrlKey:true});
    assert(comboDown.defaultPrevented&&coloredOn(),'A custom combination toggles Blue without entering a letter');
    practice.select(2);send('keydown','4',practice.cells[2]);await wait(250);
    const record=Object.values(await storage.all()).find(value=>value?.game==='sudoku');
    assert(record?.state.sudokuColored?.[2]?.includes(4)&&practice.shown(2).includes(4),'A colored candidate entered after the shortcut is added and saved');
    settingsButton.click();await wait(180);setFeature('coloredCandidates',false);modal.remove();await wait(180);
    const ignored=send('keydown','k',document.body,{ctrlKey:true});send('keyup','k',document.body,{ctrlKey:true});
    assert(!ignored.defaultPrevented&&coloredRoot().host.hidden,'A disabled Colored candidate ignores its shortcut without swallowing the key');
    settingsButton.click();await wait(180);setFeature('coloredCandidates',true);
    keyChoice('colored').click();tap('Escape',keyChoice('colored'));assert(keyChoice('colored').textContent==='Ctrl + K','Escape cancels recording without overwriting a key');
    shadow().querySelector('[data-shortcut-mode="colored"] .shortcut-clear').click();assert(keyChoice('colored').textContent==='Off','Clearing the shortcut turns it off');modal.remove();await wait(180);
    const crossword=el('div',{className:'crossword-board','data-margin-game':'crossword'});
    for(let i=0;i<25;i++)crossword.append(el('div',{'data-margin-crossword-cell':'','data-row':String(Math.floor(i/5)),'data-col':String(i%5),'data-number':i===0?'1':'','data-block':'false','aria-selected':String(i===0),tabIndex:0}));
    const pencil=el('button',{'aria-label':'Pencil',textContent:'Pencil',onClick:()=>nativePencilClicks++});
    fixtures.replaceChildren(toolbar,crossword,pencil);route('crossword');await until(()=>setting('candidateNotes'),'Crossword did not mount');
    tap('Shift');assert(nativePencilClicks===1,'Crossword modifier shortcut clicks its native Pencil button');
    const candidateToggle=()=>document.querySelector('#margin-crossword-cycle').shadowRoot.querySelector('[data-notes-action="toggle"]');
    const candidateActive=()=>candidateToggle().getAttribute('aria-pressed')==='true';
    tap('Control');assert(candidateActive()&&nativePencilClicks===1,'Ctrl defaults to candidates without toggling native Pencil');
    tap('Control');assert(!candidateActive(),'A second Ctrl tap returns to native letter entry');
    settingsButton.click();await wait(180);setKey('Alt');modal.remove();await wait(180);tap('Shift');tap('Alt');assert(nativePencilClicks===2,'Crossword uses its independently recorded shortcut');
    settingsButton.click();await wait(180);shadow().querySelector('.shortcut-setting:not([data-shortcut-mode]) .shortcut-clear').click();modal.remove();await wait(180);tap('Alt');assert(nativePencilClicks===2,'Crossword pencil shortcut can be disabled');
    settingsButton.click();await wait(180);setKey('N','candidates');modal.remove();await wait(180);
    tap('n');assert(candidateActive(),'A custom letter activates candidate mode');tap('n');assert(!candidateActive(),'A custom letter also exits candidate mode without adding a candidate');
    settingsButton.click();await wait(180);setKey('Control');setKey('Control','candidates');modal.remove();await wait(180);tap('Control');
    assert(candidateActive()&&nativePencilClicks===2&&keyChoice().textContent==='Off','Assigning a conflicting candidate shortcut clears Pencil rather than triggering both');
    tap('Control');settingsButton.click();await wait(180);setFeature('candidateNotes',false);modal.remove();await wait(180);tap('Control');
    assert(!candidateActive()&&candidateToggle().hidden,'Disabled candidates ignore their shortcut');
    settingsButton.click();await wait(180);setFeature('candidateNotes',true);modal.remove();await wait(180);
    fixtures.replaceChildren(toolbar,sudoku);route('sudoku');await until(()=>setting('coloredCandidates'),'Sudoku did not remount');
    assert(keyChoice('colored').textContent==='Off','A cleared shortcut persists across game switches');
    tap('Alt');assert(nativePencilClicks===2,'Removed Crossword listeners do not affect another game');
    const kept=await storage.get('settings');assert(kept.keepPreference==='kept'&&kept.features.wordle.clickToEdit===false&&kept.shortcuts.sudoku.colored.key===''&&kept.shortcuts.crossword.key===''&&kept.shortcuts.crossword.candidates.key==='Control','Shortcut persistence preserves unrelated preferences and independent game choices');
    await storage.set('settings',{...kept,shortcuts:{sudoku:{play:{key:'P'},corner:{key:'S'},center:{key:'C'}}}});route('crossword');await until(()=>setting('candidateNotes'),'Legacy route reset');route('sudoku');await until(()=>setting('coloredCandidates'),'Legacy Sudoku did not mount');
    assert(keyChoice('colored').textContent==='B','Old Play, Snyder and Center keys are ignored and Blue gets the default B');
  } catch (error) { results.push(`FAIL ${error.stack}`); }
  finally {
    release?.(); window.dispatchEvent(new PageTransitionEvent('pagehide'));
    if (previous === null) localStorage.removeItem('margin-preview'); else localStorage.setItem('margin-preview', previous);
    report.textContent = results.join('\n');
    document.body.dataset.testStatus = results.some(line => line.startsWith('FAIL')) ? 'failed' : 'passed';
  }
})();
