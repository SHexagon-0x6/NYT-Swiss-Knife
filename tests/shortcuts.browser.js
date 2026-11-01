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
  const sudokuRoot = () => document.querySelector('[data-margin-inline="sudoku-pencil"]')?.shadowRoot;
  const mode = () => sudokuRoot()?.querySelector('.sudoku-modes [aria-pressed="true"]')?.textContent;
  const modeButton = name => [...sudokuRoot().querySelectorAll('.sudoku-modes button')].find(button => button.textContent === name);
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
    const sudoku=el('div',{className:'sudoku-board','data-margin-game':'sudoku'});
    for(let i=0;i<81;i++)sudoku.append(el('button',{'data-margin-cell':String(i),textContent:i===0?'5':'',...(i===0?{'data-given':'true'}:{})}));
    fixtures.replaceChildren(toolbar,sudoku);route('sudoku');
    await until(()=>setting('cornerNotes')&&sudokuRoot(),'Sudoku controls did not mount');
    assert(!setting('pencilShortcut')&&!setting('pencilUndo')&&!setting('scratchpad'),'Sudoku settings contain mark switches without optional Undo, pencil shortcut toggle or notes');
    assert(['play','corner','center'].map(n=>keyChoice(n).textContent).join('')==='PSC'&&mode()==='Play','Sudoku has three direct default keys P, S, C and starts in Play');
    tap('s');assert(mode()==='Snyder','S directly selects Snyder');tap('s');assert(mode()==='Snyder','Repeating a mode key leaves the same mode selected');
    const cell=sudoku.children[1];cell.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0}));send('keydown','1');send('keyup','1');
    tap('c');assert(mode()==='Center','C directly selects Center');send('keydown','2');send('keyup','2');
    tap('p');assert(mode()==='Play','P directly returns to native Play');
    settingsButton.click();await until(()=>shadow().querySelector('.native-settings'),'Native settings section did not appear');
    assert(modal.contains(document.querySelector('#margin-host'))&&settings().querySelector('summary').hidden&&originalOption.isConnected,'Tools appear below the original settings without replacing native preferences or adding a gear');
    tap('s');assert(mode()==='Play','Mode keys are inactive while native Settings is open');
    setKey('Control','corner');assert(keyChoice('corner').textContent==='Ctrl'&&keyChoice('center').textContent==='C','Each mode records its own shortcut without changing the others');
    modal.remove();await wait(180);tap('s');assert(mode()==='Play','The replaced default key stops selecting Snyder');tap('Control');assert(mode()==='Snyder','The recorded modifier directly selects Snyder');
    settingsButton.click();await wait(180);keyChoice('center').click();send('keydown','k',keyChoice('center'),{ctrlKey:true});send('keyup','k',keyChoice('center'),{ctrlKey:true});
    assert(keyChoice('center').textContent==='Ctrl + K','Shortcut recording accepts a custom key combination');modal.remove();await wait(180);
    const comboDown=send('keydown','k',document.body,{ctrlKey:true});send('keyup','k',document.body,{ctrlKey:true});
    assert(comboDown.defaultPrevented&&mode()==='Center','A custom combination selects Center without entering a letter');
    settingsButton.click();await wait(180);setFeature('cornerNotes',false);modal.remove();await wait(180);
    const disabled=tap('Control');assert(mode()==='Center'&&!disabled.up.defaultPrevented,'A disabled Snyder mode ignores its shortcut without swallowing the key');
    settingsButton.click();await wait(180);setFeature('cornerNotes',true);setKey('P','center');
    assert(keyChoice('play').textContent==='Off'&&keyChoice('center').textContent==='P','Assigning the same key to another mode disables the older binding');
    setKey('P','play');setKey('C','center');
    keyChoice('center').click();tap('Escape',keyChoice('center'));assert(keyChoice('center').textContent==='C','Escape cancels recording without overwriting a key');
    shadow().querySelector('[data-shortcut-mode="corner"] .shortcut-clear').click();modal.remove();await wait(180);tap('p');tap('Control');assert(mode()==='Play','Clearing one shortcut leaves other mode keys working');
    const record=Object.values(await storage.all()).find(value=>value?.game==='sudoku');assert(record.state.sudokuNotes[1].corner.join('')==='1'&&record.state.sudokuNotes[1].center.join('')==='2','Reconfiguring shortcuts preserves both mark types');
    const crossword=el('div',{className:'crossword-board','data-margin-game':'crossword'});
    for(let i=0;i<25;i++)crossword.append(el('div',{'data-margin-crossword-cell':'','data-row':String(Math.floor(i/5)),'data-col':String(i%5),'data-number':i===0?'1':'','data-block':'false',tabIndex:0}));
    const pencil=el('button',{'aria-label':'Pencil',textContent:'Pencil',onClick:()=>nativePencilClicks++});
    fixtures.replaceChildren(toolbar,crossword,pencil);route('crossword');await until(()=>setting('clueHover'),'Crossword did not mount');
    tap('Shift');assert(nativePencilClicks===1,'Crossword modifier shortcut clicks its native Pencil button');
    settingsButton.click();await wait(180);setKey('Alt');modal.remove();await wait(180);tap('Shift');tap('Alt');assert(nativePencilClicks===2,'Crossword uses its independently recorded shortcut');
    settingsButton.click();await wait(180);shadow().querySelector('.shortcut-setting:not([data-shortcut-mode]) .shortcut-clear').click();modal.remove();await wait(180);tap('Alt');assert(nativePencilClicks===2,'Crossword pencil shortcut can be disabled');
    fixtures.replaceChildren(toolbar,sudoku);route('sudoku');await until(()=>setting('cornerNotes'),'Sudoku did not remount');
    assert(keyChoice('corner').textContent==='Off'&&keyChoice('play').textContent==='P'&&keyChoice('center').textContent==='C'&&mode()==='Play','Disabled custom shortcuts persist across game switches');
    tap('Alt');assert(nativePencilClicks===2,'Removed Crossword listeners do not affect another game');
    const kept=await storage.get('settings');assert(kept.keepPreference==='kept'&&kept.features.wordle.clickToEdit===false&&kept.shortcuts.sudoku.corner.key===''&&kept.shortcuts.sudoku.play.key==='P'&&kept.shortcuts.sudoku.center.key==='C'&&kept.shortcuts.crossword.key==='','Shortcut persistence preserves unrelated preferences and independent game choices');
    await storage.set('settings',{...kept,shortcuts:{sudoku:{key:'Alt'}}});route('crossword');await until(()=>setting('clueHover'),'Legacy route reset');route('sudoku');await until(()=>setting('cornerNotes'),'Legacy Sudoku did not mount');
    assert(keyChoice('corner').textContent==='Alt'&&keyChoice('play').textContent==='P'&&keyChoice('center').textContent==='C','Legacy custom keys migrate to Snyder while the other two receive defaults');
    await storage.set('settings',{...kept,shortcuts:{sudoku:{key:''}}});route('crossword');await until(()=>setting('clueHover'),'Disabled legacy route reset');route('sudoku');await until(()=>setting('cornerNotes'),'Disabled legacy Sudoku did not mount');
    assert(['play','corner','center'].every(n=>keyChoice(n).textContent==='Off'),'Legacy disabled shortcuts stay disabled after migration');
  } catch (error) { results.push(`FAIL ${error.stack}`); }
  finally {
    release?.(); window.dispatchEvent(new PageTransitionEvent('pagehide'));
    if (previous === null) localStorage.removeItem('margin-preview'); else localStorage.setItem('margin-preview', previous);
    report.textContent = results.join('\n');
    document.body.dataset.testStatus = results.some(line => line.startsWith('FAIL')) ? 'failed' : 'passed';
  }
})();
