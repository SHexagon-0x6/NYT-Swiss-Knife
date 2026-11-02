(async function () {
  'use strict';
  const report = document.querySelector('#results');
  const host = document.querySelector('#margin-host');
  const shadow = host.attachShadow({ mode: 'open' });
  const board = document.querySelector('#board');
  const enter = document.querySelector('#enter');
  let nativeClicks = 0;
  let nativeKeys = 0;
  let active;
  let ctx;
  let keyboard;
  let nativeInput = false;
  let nativeDelay = 0;
  let generation = 0;
  const inlineSlots = new Map();
  const results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node && !key.startsWith('aria-') && key !== 'role') node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.flat());
    return node;
  }
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function controls() { return [shadow, ...Array.from(inlineSlots.values(), slot => slot.container)]; }
  function button(text) { return controls().flatMap(root => Array.from(root.querySelectorAll('button'))).find(node => node.textContent === text); }
  function warning() { return controls().map(root => root.querySelector('.mw-alert')).find(Boolean); }
  function typing(key, target = document.body, extra = {}) { return target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...extra })); }
  function key() { typing('Enter'); }
  function row(word, states) {
    return el('div', { className: 'row', 'data-margin-row': '' }, ...Array.from(word.padEnd(5, ' ')).map((letter, i) => el('span', { className: 'tile', 'data-margin-tile': '', 'data-state': states[i], textContent: letter.trim() })));
  }
  const feedback = ['correct', 'absent', 'correct', 'absent', 'absent'];
  function current(word, index = 1) {
    const tiles = board.children[index].children;
    for (let i = 0; i < 5; i++) { tiles[i].textContent = (word[i] || '').trim(); tiles[i].setAttribute('data-state', word[i]?.trim() ? 'tbd' : 'empty'); }
  }
  function draft() { return board.children[1].textContent.trim(); }
  function tile(index, rowIndex = 1) { return board.children[rowIndex].children[index]; }
  function nativeLetter(value) {
    if (!nativeInput) return;
    const guess = draft();
    const next = value === 'Backspace' ? guess.slice(0, -1) : /^[a-z]$/i.test(value) ? (guess + value.toUpperCase()).slice(0, 5) : guess;
    if (next === guess) return;
    const epoch = generation;
    // Derive each update from the rendered guess, as a native handler can do.
    // A replacement must wait for each render instead of dispatching a burst.
    if (nativeDelay) setTimeout(() => { if (epoch === generation) current(next); }, nativeDelay);
    else current(next);
  }
  document.addEventListener('click', event => {
    if (event.target === enter) { nativeClicks++; return; }
    const control = event.composedPath().find(node => node.nodeType === 1 && node.matches?.('button[data-key]'));
    if (control) nativeLetter(['←', '⌫'].includes(control.dataset.key) ? 'Backspace' : control.dataset.key);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter') nativeKeys++;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    nativeLetter(event.key);
  });
  function setup(game = 'wordle', state = {}, inline = false, features = null) {
    active?.destroy(); generation++;
    document.activeElement?.blur?.();
    nativeInput = false; nativeDelay = 0;
    for (const slot of inlineSlots.values()) slot.host.remove();
    inlineSlots.clear();
    if (keyboard) { keyboard.before(enter); keyboard.remove(); }
    enter.hidden = false;
    shadow.replaceChildren();
    board.replaceChildren(row('CRANE', feedback), row('CRANE', Array(5).fill('tbd')), ...Array.from({ length: 4 }, () => row('', Array(5).fill('empty'))));
    keyboard = el('div', { 'data-margin-keyboard': '' }); enter.before(keyboard); keyboard.append(enter);
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') keyboard.append(el('button', { type: 'button', 'data-key': letter.toLowerCase(), textContent: letter }));
    keyboard.append(el('button', { type: 'button', 'data-key': '←', 'aria-label': 'Backspace', textContent: '⌫' }));
    nativeClicks = 0; nativeKeys = 0;
    ctx = { panel: shadow, state, save() { ctx.saves++; }, saves: 0, settings: {}, el, notice(text) { ctx.lastNotice = text; }, isPreview: true };
    if (features) ctx.feature = (name, fallback = true) => features[name] ?? fallback;
    if (inline) {
      ctx.inline = (name, anchor, position) => {
        let slot = inlineSlots.get(name);
        if (!slot) {
          const host = el('div', { 'data-margin-inline': name }); const root = host.attachShadow({ mode: 'closed' }); const container = el('div'); root.append(container);
          for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, event => event.stopPropagation());
          slot = { host, container }; inlineSlots.set(name, slot);
        }
        if (position === 'before') anchor.before(slot.host); else anchor.after(slot.host);
        return slot.container;
      };
      ctx.reveal = element => { ctx.revealed = element; };
    }
    active = MarginGames[game].mount(ctx);
  }
  function run(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } }
  async function runAsync(name, fn) {
    try { await fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.message}`); }
  }
  async function until(predicate, message) {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(10); }
    throw new Error(message);
  }

  run('physical Enter blocks conflicting guesses and shows the reasons immediately', () => {
    setup(); key();
    assert(nativeKeys === 0, 'native received blocked key');
    assert(warning()?.querySelector('h3')?.textContent === 'Are you sure?', 'missing confirmation heading');
    assert(button('Submit anyway') && button('Keep editing'), 'missing confirmation actions');
    assert(warning().textContent.includes('R was already ruled out'), 'missing conflict explanation');
    const item = warning().querySelector('li');
    assert(item?.getBoundingClientRect().height > 0 && !item.closest('details:not([open])'), 'reasons require another click');
  });
  run('Submit anyway submits exactly once and immediately dismisses the warning', () => {
    setup(); key(); button('Submit anyway').click();
    assert(nativeClicks === 1 && nativeKeys === 0, 'explicit continuation did not reach native enter once');
    assert(!button('Submit anyway') && warning().hidden, 'warning remained visible');
  });
  run('on-screen Enter receives the same confirmation', () => {
    setup(); enter.click(); assert(nativeClicks === 0, 'native click escaped');
    button('Submit anyway').click(); assert(nativeClicks === 1, 'override failed');
  });
  run('keyboard-only fallback requires a second deliberate Enter', () => {
    setup(); enter.hidden = true;
    key(); button('Submit anyway').click();
    assert(nativeClicks + nativeKeys === 0, 'fallback submitted without a second Enter');
    assert(ctx.lastNotice.includes('Press Enter'), 'missing keyboard continuation instruction');
    key(); assert(nativeKeys === 1, 'fallback did not permit the confirmed guess');
    enter.hidden = false;
  });
  run('Keep editing preserves the guess and cancels submission', () => {
    setup(); key(); button('Keep editing').click();
    assert(nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'dismissal submitted or left the warning');
    assert(draft() === 'CRANE', 'native draft changed');
  });
  run('Escape dismisses a focused inline confirmation without submitting', () => {
    setup('wordle', {}, true); key();
    const keep = button('Keep editing');
    assert(keep && !warning().hidden, 'confirmation was not open');
    assert(!typing('Escape', keep), 'Escape was not handled inside the closed inline root');
    assert(!button('Submit anyway') && warning().hidden && nativeClicks + nativeKeys === 0, 'Escape submitted or left the confirmation open');
    assert(draft() === 'CRANE', 'Escape changed the guess');
  });
  run('compatible guesses and compatible final attempts pass through', () => {
    setup(); current('COAST'); key();
    assert(nativeKeys === 1 && !button('Submit anyway'), 'compatible guess warned');
    board.replaceChildren(...Array.from({ length: 5 }, () => row('CRANE', feedback)), row('COAST', Array(5).fill('tbd')));
    key(); assert(nativeKeys === 2 && !button('Submit anyway'), 'removed final-attempt pause remains active');
  });
  run('stale warning cannot submit a changed guess', () => {
    setup(); key(); current('COAST'); button('Submit anyway').click();
    assert(nativeClicks + nativeKeys === 0, 'changed guess submitted');
    assert(ctx.lastNotice.includes('changed'), 'missing stale warning explanation');
  });
  run('warning disappears when the guess changes', () => {
    setup(); key(); current('COAST'); active.refresh();
    assert(!button('Submit anyway'), 'stale warning remained');
  });
  run('confirmation is consumed once and does not disable later warnings', () => {
    setup(); key(); button('Submit anyway').click(); key();
    assert(nativeClicks === 1 && nativeKeys === 0 && button('Submit anyway'), 'confirmation leaked to a later submission');
  });
  run('conflicting letters turn red before submission while compatible letters remain normal', () => {
    setup(); active.refresh();
    assert([1, 3, 4].every(index => tile(index).hasAttribute('data-margin-wordle-conflict')), 'eliminated letters were not marked');
    assert([0, 2].every(index => !tile(index).hasAttribute('data-margin-wordle-conflict')), 'correctly placed green letters were marked');
    assert(!board.children[0].querySelector('[data-margin-wordle-conflict]'), 'submitted feedback was recolored');
    const marked = getComputedStyle(tile(1)), normal = getComputedStyle(tile(0));
    assert(['color', 'borderColor', 'backgroundColor'].some(property => marked[property] !== normal[property]), 'conflict marker has no visible red styling');
    current('COAST'); active.refresh();
    assert(!board.querySelector('[data-margin-wordle-conflict]'), 'fixed guess retained red markers');
  });
  run('partial guesses highlight known bad letters before all five letters exist', () => {
    setup(); current('SR'); active.refresh();
    assert(tile(0).hasAttribute('data-margin-wordle-conflict'), 'wrong green position was not marked while typing');
    assert(tile(1).hasAttribute('data-margin-wordle-conflict'), 'eliminated letter was not marked while typing');
    assert(!button('Submit anyway'), 'typing opened confirmation without a submit');
  });
  run('yellow letters cannot be repeated in their ruled-out position', () => {
    setup(); board.replaceChildren(row('CRANE', ['absent', 'absent', 'present', 'absent', 'absent']), row('STASH', Array(5).fill('tbd'))); active.refresh();
    assert(tile(2).hasAttribute('data-margin-wordle-conflict'), 'yellow in the same position was not marked');
    key(); assert(warning().textContent.includes('position 3'), 'yellow position missing from confirmation');
  });
  run('gray duplicates keep allowed copies instead of blacklisting the entire letter', () => {
    setup(); board.replaceChildren(row('EERIE', ['present', 'absent', 'absent', 'absent', 'correct']), row('SUEDE', Array(5).fill('tbd'))); active.refresh();
    assert(!board.querySelector('[data-margin-wordle-conflict]'), 'allowed duplicate E was marked');
    key(); assert(nativeKeys === 1, 'compatible duplicate count blocked');
  });
  run('settings independently enable only clue warnings and click-to-edit', () => {
    const features = { letterProtection: true, clickToEdit: true };
    setup('wordle', { wordle: { draft: 'COAST', finalReview: true } }, true, features);
    assert(!shadow.querySelector('input,textarea,.mw-workbench,.mw-switch'), 'extra Wordle tools or local settings remain');
    assert(!inlineSlots.has('wordle-letters'), 'removed workbench still mounts');
    tile(1).click(); assert(tile(1).hasAttribute('data-margin-wordle-selected'), 'click-to-edit unavailable');
    key(); features.letterProtection = false; active.refresh();
    assert(!button('Submit anyway') && !board.querySelector('[data-margin-wordle-conflict]'), 'disabling warnings left warning state');
    key(); assert(nativeKeys === 1, 'disabled protection still intercepted');
    tile(1).click(); features.clickToEdit = false; active.refresh();
    assert(!board.querySelector('[data-margin-wordle-selected]'), 'disabled editing left selection');
    features.letterProtection = true; active.refresh(); key();
    assert(button('Submit anyway'), 'warnings depend on click-to-edit');
  });
  run('flipping feedback clears decorations and is never used for confirmation', () => {
    setup(); tile(1).click(); board.children[0].children[0].setAttribute('data-animation', 'flip-out'); active.refresh();
    assert(!board.querySelector('[data-margin-wordle-conflict],[data-margin-wordle-selected]'), 'decorations survived a feedback animation');
    key(); assert(!button('Submit anyway'), 'used animating feedback');
  });
  run('unrecognized board leaves the native game untouched', () => {
    setup(); board.replaceChildren(); active.refresh(); key();
    assert(nativeKeys === 1 && !button('Submit anyway'), 'unknown DOM was intercepted');
  });
  run('destroy removes event guards and native tile decorations', () => {
    setup(); tile(1).click(); active.destroy(); active = null; key(); enter.click();
    assert(nativeKeys === 1 && nativeClicks === 1, 'handlers leaked after destroy');
    assert(!board.querySelector('[data-margin-wordle-conflict],[data-margin-wordle-selected]'), 'tile decoration leaked after destroy');
  });
  run('NYT row and tile classes and accessible Enter labels are recognized', () => {
    setup();
    board.querySelectorAll('[data-margin-row]').forEach(node => { node.removeAttribute('data-margin-row'); node.classList.add('Row-module_row__pwpBq'); });
    board.querySelectorAll('[data-margin-tile]').forEach(node => { node.removeAttribute('data-margin-tile'); node.classList.add('Tile-module_tile__UWEHN'); });
    enter.removeAttribute('data-margin-enter'); enter.setAttribute('aria-label', 'enter');
    try {
      active.refresh(); enter.click(); assert(nativeClicks === 0 && button('Submit anyway'), 'live selectors not protected');
      button('Submit anyway').click(); assert(nativeClicks === 1, 'accessible Enter override failed');
    } finally { enter.setAttribute('data-margin-enter', ''); enter.removeAttribute('aria-label'); }
  });
  run('inline warning takes no space until needed and dismisses without opening settings', () => {
    setup('wordle', {}, true);
    const slot = inlineSlots.get('wordle-warning');
    assert(slot.host.nextElementSibling === keyboard && slot.host.style.display === 'none', 'inactive warning affects native layout');
    const boardBefore = board.getBoundingClientRect(), keyboardBefore = keyboard.getBoundingClientRect();
    key(); assert(slot.host.style.display === 'block' && !warning().hidden, 'inline warning missing');
    const boardAfter = board.getBoundingClientRect(), keyboardAfter = keyboard.getBoundingClientRect();
    assert(boardAfter.y === boardBefore.y && boardAfter.height === boardBefore.height && keyboardAfter.y === keyboardBefore.y && keyboardAfter.height === keyboardBefore.height, 'confirmation shifted the board or keyboard');
    assert(slot.host.shadowRoot === null, 'inline controls use an open root');
    assert(!shadow.querySelector('.mw-alert,.mw-workbench'), 'warning is duplicated in settings');
    button('Keep editing').click(); assert(slot.host.style.display === 'none', 'dismissed warning still takes space');
  });
  run('inline warning follows a rerendered keyboard and is removed on teardown', () => {
    setup('wordle', {}, true); const original = warning();
    const next = el('div', { 'data-margin-keyboard': '' }); keyboard.before(next); next.append(...keyboard.childNodes); keyboard.remove(); keyboard = next; active.refresh();
    const slot = inlineSlots.get('wordle-warning');
    assert(slot.host.nextElementSibling === keyboard && warning() === original, 'refresh duplicated or misplaced warning');
    active.destroy(); active = null;
    assert(!slot.container.querySelector('.mw-alert'), 'destroy left inline warning');
  });
  run('Crossword keeps legacy notebook data inert without exposing removed tools', () => {
    const state = { scratch: 'Legacy scratchpad', crossword: { hoverClues: true, entries: [{ id: 'kept', ref: '12 Across', pattern: 'CAKE', note: 'My idea', confidence: 'pencil', done: false }], draft: { ref: '3 Down', pattern: '?A?', note: 'Draft idea', confidence: 'pencil' }, slot: 2 } };
    const before = JSON.stringify(state);
    setup('crossword', state, false, { clueHover: true, letterCycle: true, clueNotebook: true, pencilShortcut: true });
    active.refresh();
    assert(!shadow.querySelector('.mc-notebook,input,textarea,select') && !document.querySelector('#margin-crossword-tooltip'), 'removed Crossword tools are still active with legacy preferences');
    assert(JSON.stringify(state) === before && ctx.saves === 0, 'mount changed legacy notebook data');
    assert(nativeClicks + nativeKeys === 0, 'mount generated native input');
  });
  await runAsync('native typing highlights conflicts without an explicit refresh', async () => {
    setup(); current('C'); active.refresh(); nativeInput = true; typing('r');
    await until(() => tile(1).hasAttribute('data-margin-wordle-conflict'), 'typing did not update the red warning');
    assert(!button('Submit anyway'), 'typing alone opened a confirmation');
  });
  await runAsync('clicking a middle cell replaces its letter and preserves the rest of the guess', async () => {
    setup(); nativeInput = true; tile(1).click(); typing('o');
    await until(() => draft() === 'COANE', `middle replacement did not preserve the suffix: ${draft()}`);
    assert(nativeClicks + nativeKeys === 0 && board.children[0].textContent === 'CRANE', 'editing submitted or changed feedback');
  });
  await runAsync('the native on-screen keyboard can replace a selected cell', async () => {
    setup(); nativeInput = true; tile(3).click(); keyboard.querySelector('[data-key="s"]').click();
    await until(() => draft() === 'CRASE', `on-screen replacement failed: ${draft()}`);
    assert(nativeClicks + nativeKeys === 0, 'on-screen editing submitted');
  });
  await runAsync('first and last cells can be replaced', async () => {
    for (const [index, letter, expected] of [[0, 'b', 'BRANE'], [4, 't', 'CRANT']]) {
      setup(); nativeInput = true; tile(index).click(); typing(letter);
      await until(() => draft() === expected, `position ${index + 1} was not replaced`);
    }
  });
  await runAsync('partial guesses preserve their typed suffix during replacement', async () => {
    setup(); current('CRA'); active.refresh(); nativeInput = true; tile(0).click(); typing('b');
    await until(() => draft() === 'BRA', `partial replacement changed length or suffix: ${draft()}`);
  });
  await runAsync('replacement waits for asynchronous native renders', async () => {
    setup(); nativeInput = true; nativeDelay = 8; tile(1).click(); typing('o');
    await until(() => draft() === 'COANE', `async native replacement lost letters: ${draft()}`);
    await wait(30);
    assert(draft() === 'COANE' && nativeClicks + nativeKeys === 0, 'late edit callbacks changed the completed replacement');
  });
  await runAsync('Enter during replacement waits for the final word before confirming', async () => {
    setup(); nativeInput = true; nativeDelay = 8; tile(1).click(); typing('o'); key();
    assert(nativeClicks + nativeKeys === 0, 'Enter submitted a partly erased guess');
    await until(() => !!button('Submit anyway'), 'queued Enter did not receive the ordinary confirmation');
    assert(draft() === 'COANE' && warning().textContent.includes('COANE'), 'confirmation used an intermediate guess');
    assert(nativeClicks + nativeKeys === 0, 'queued Enter bypassed the clue warning');
    button('Submit anyway').click(); assert(nativeClicks === 1, 'confirmed edit did not submit once');
  });
  await runAsync('rapid positional edits preserve the letters in other tiles', async () => {
    setup(); nativeInput = true; nativeDelay = 8; tile(1).click(); typing('o'); typing('Backspace'); typing('t');
    await until(() => draft() === 'COTNE', 'queued typing corrupted the replacement or its suffix');
    assert(nativeClicks + nativeKeys === 0, 'queued typing submitted a guess');
  });
  await runAsync('turning click-to-edit off completes the active replacement and drops queued input', async () => {
    const features = { letterProtection: true, clickToEdit: true };
    setup('wordle', {}, false, features); nativeInput = true; nativeDelay = 8;
    tile(1).click(); typing('o'); typing('Backspace'); typing('t'); key();
    features.clickToEdit = false; active.refresh();
    await until(() => draft() === 'COANE', 'disabling click-to-edit lost the active replacement suffix');
    await wait(130);
    assert(draft() === 'COANE' && nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'a preference change retained queued typing or submission');
    tile(1).click(); typing('u'); await wait(30);
    assert(draft() === 'COANE' && !board.querySelector('[data-margin-wordle-selected]'), 'click-to-edit accepted another replacement after being disabled');
  });
  await runAsync('window blur completes the active replacement and drops queued input', async () => {
    setup(); nativeInput = true; nativeDelay = 8;
    tile(1).click(); typing('o'); typing('Backspace'); typing('t'); key();
    window.dispatchEvent(new Event('blur'));
    await until(() => draft() === 'COANE', 'blur lost the active replacement suffix');
    await wait(130);
    assert(draft() === 'COANE' && nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'blur retained queued typing or submission');
    assert(!board.querySelector('[data-margin-wordle-selected]'), 'blur retained the selected tile');
    typing('u'); await wait(30);
    assert(draft() === 'COANE', 'typing after blur reused an old replacement selection');
  });
  await runAsync('destroy and pagehide stop replaying an unfinished replacement', async () => {
    for (const end of ['destroy', 'pagehide']) {
      setup(); nativeInput = true; nativeDelay = 8; tile(1).click(); typing('o'); key();
      if (end === 'destroy') { active.destroy(); active = null; }
      else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      await wait(30); const stopped = draft(); await wait(100);
      assert(draft() === stopped && nativeClicks + nativeKeys === 0, `${end} left native edit or submit callbacks running`);
    }
  });
  await runAsync('disabled click-to-edit leaves native typing unchanged', async () => {
    setup('wordle', {}, false, { letterProtection: true, clickToEdit: false }); nativeInput = true;
    tile(1).click(); typing('o'); await wait(30);
    assert(draft() === 'CRANE' && !board.querySelector('[data-margin-wordle-selected]'), 'disabled feature edited a full guess');
    current('CRA'); typing('s'); assert(draft() === 'CRAS', 'disabled feature altered ordinary appending');
  });
  await runAsync('submitted cells cannot be selected or rewritten', async () => {
    setup(); nativeInput = true; tile(1, 0).click(); typing('o'); await wait(30);
    assert(draft() === 'CRANE' && board.children[0].textContent === 'CRANE', 'submitted tile changed');
    assert(!board.querySelector('[data-margin-wordle-selected]'), 'submitted tile was selected');
  });
  await runAsync('ordinary typing still appends when no cell is selected', async () => {
    setup(); current('COA'); active.refresh(); nativeInput = true; typing('s'); typing('t');
    assert(draft() === 'COAST', 'ordinary typing stopped appending');
  });
  await runAsync('typing into another input does not replace the selected tile', async () => {
    setup(); nativeInput = true; tile(1).click();
    const input = el('input', { type: 'text' }); document.body.append(input); input.focus(); typing('o', input); await wait(30);
    assert(draft() === 'CRANE', 'unrelated form typing replaced a game tile'); input.remove();
  });
  await runAsync('shortcut keys do not replace the selected letter', async () => {
    setup(); nativeInput = true; tile(1).click(); typing('a', document.body, { ctrlKey: true }); typing('c', document.body, { metaKey: true });
    await wait(30); assert(draft() === 'CRANE', 'browser shortcut edited the guess');
  });
  await runAsync('rapid Enter waits for rendered tiles and still warns on a conflicting guess', async () => {
    setup(); current('C'); typing('e'); key(); key();
    assert(nativeKeys === 0, 'pending render submitted immediately');
    setTimeout(() => current('CRANE'), 0); await wait(130);
    assert(nativeKeys + nativeClicks === 0 && button('Submit anyway'), 'deferred render escaped the guard');
    button('Keep editing').click(); assert(nativeClicks + nativeKeys === 0 && draft() === 'CRANE', 'keep editing changed deferred guess');
  });
  await runAsync('rapid compatible Enter replays once despite repeated Enter events', async () => {
    setup(); current('C'); typing('t'); key(); key(); setTimeout(() => current('COAST'), 0); await wait(130);
    assert(nativeClicks === 1 && nativeKeys === 0 && !button('Submit anyway'), 'deferred compatible guess did not submit exactly once');
  });
  await runAsync('a still-partial rendered guess is never replayed after the bounded wait', async () => {
    setup(); current('C'); typing('e'); key(); await wait(130);
    assert(nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'partial DOM bypassed protection after timeout');
  });
  await runAsync('further native input cancels a deferred submission', async () => {
    setup(); current('C'); typing('e'); key(); typing('Backspace'); current('COAST'); await wait(130);
    assert(nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'changed input was submitted');
  });
  await runAsync('changed feedback cancels a deferred submission', async () => {
    setup(); current('C'); typing('e'); key(); current('COAST'); board.children[0].children[1].setAttribute('data-state', 'present'); await wait(130);
    assert(nativeClicks + nativeKeys === 0 && !button('Submit anyway'), 'changed row feedback was submitted');
  });
  await runAsync('destroy cancels pending submission callbacks', async () => {
    setup(); current('C'); typing('e'); key(); current('COAST'); active.destroy(); active = null; await wait(130);
    assert(nativeClicks + nativeKeys === 0, 'destroyed module submitted later');
  });
  await runAsync('focused Help, link and letter controls are not converted into game submissions', async () => {
    for (const [tag, attrs] of [['button', { textContent: 'Help' }], ['a', { href: '#help', textContent: 'Log in' }], ['button', { 'data-key': 'a', textContent: 'A' }], ['div', { role: 'button', tabIndex: 0, textContent: 'Settings' }]]) {
      setup(); current('C'); typing('e'); const control = el(tag, attrs); document.body.append(control); control.focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); control.dispatchEvent(event); current('CRANE'); await wait(130);
      assert(!event.defaultPrevented && nativeClicks === 0 && !button('Submit anyway'), `${tag} was converted to a game submission`); control.remove();
    }
  });
  run('physical Enter on the native Enter control still receives protection', () => {
    setup(); enter.focus(); const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); enter.dispatchEvent(event);
    assert(event.defaultPrevented && nativeClicks === 0 && button('Submit anyway'), 'focused native Enter escaped protection');
  });
  await runAsync('URL changes cancel pending submission even when the board is unchanged', async () => {
    setup(); current('C'); typing('e'); key(); current('COAST');
    const original = location.href; history.replaceState(null, '', `${location.pathname}?different-puzzle=1`); await wait(130); history.replaceState(null, '', original);
    assert(nativeClicks + nativeKeys === 0, 'navigation replayed a stale submission');
  });
  await runAsync('pagehide and blur cancel pending submissions', async () => {
    for (const event of [new PageTransitionEvent('pagehide', { persisted: true }), new Event('blur')]) {
      setup(); current('C'); typing('e'); key(); current('COAST'); window.dispatchEvent(event); await wait(130);
      assert(nativeClicks + nativeKeys === 0 && !button('Submit anyway'), `${event.type} replayed a stale submission`);
    }
  });
  await runAsync('any active tile can hold a draft letter and gaps prevent native submission',async()=>{
    setup();current('');active.refresh();nativeInput=true;
    tile(4).click();typing('t');
    assert(tile(4).getAttribute('data-margin-wordle-letter')==='T'&&draft()==='','far empty tile was not drafted independently');
    key();assert(nativeClicks+nativeKeys===0&&ctx.lastNotice.includes('five tiles'),'a gapped row reached native Enter');
    tile(0).click();for(const letter of 'coas')typing(letter);
    await until(()=>draft()==='COAST','filled draft was not synchronized to native input');
    tile(2).click();typing('Delete');
    await until(()=>draft()==='CO','selected deletion did not retain the native prefix');
    assert(Array.from({length:5},(_,i)=>tile(i).getAttribute('data-margin-wordle-letter')||'_').join('')==='CO_ST','deleting a selected tile shifted or erased its neighbors');
    typing('a');await until(()=>draft()==='COAST','refilling a gap lost its suffix');
    key();await wait(150);assert(nativeClicks===1,'completed compatible positional row did not submit exactly once');
  });
  run('a missing yellow letter does not color every unrelated tile red',()=>{
    setup();board.children[0].replaceWith(row('ABCDE',['present','absent','absent','absent','absent']));current('TOILS');active.refresh();
    assert(!board.querySelector('[data-margin-wordle-conflict]'),'missing-only issue marked unrelated letters red');
    key();assert(warning().textContent.includes('requires the letter A'),'missing required letter was not explained at submission');
  });
  run('only excess duplicate copies are red',()=>{
    setup();board.children[0].replaceWith(row('EERIE',['present','absent','absent','absent','absent']));current('SHEEP');active.refresh();
    const red=Array.from({length:5},(_,i)=>tile(i).hasAttribute('data-margin-wordle-conflict'));
    assert(!red[2]&&red[3]&&!red[0]&&!red[1]&&!red[4],'allowed duplicate letter was marked as excess');
  });
  active?.destroy();
  report.textContent = results.join('\n');
  document.body.dataset.testStatus = results.some(result => result.startsWith('FAIL')) ? 'failed' : 'passed';
  document.title = `Margin browser tests: ${document.body.dataset.testStatus}`;
})();
