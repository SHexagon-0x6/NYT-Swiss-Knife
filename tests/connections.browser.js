(async () => {
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(`PASS ${message}`);
  };
  const pause = () => new Promise(resolve => setTimeout(resolve, 25));
  const board = document.querySelector('[data-margin-game]');
  const words = ['BASS', 'PITCH', 'TONE', 'NOTE', 'BANK', 'STREAM', 'BED', 'MOUTH', 'SPRING', 'FALL', 'MARCH', 'MAY', 'SEAL', 'CRANE', 'BAT', 'ROBIN'];
  let gameClicks = 0;
  let gamePointerEvents = 0;
  board.addEventListener('pointerdown', () => gamePointerEvents++);
  board.addEventListener('pointerup', () => gamePointerEvents++);
  words.forEach(word => {
    const button = document.createElement('button');
    button.textContent = word;
    button.dataset.marginWord = word;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      gameClicks++;
      button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    });
    board.append(button);
  });
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    children.flat().filter(value => value != null).forEach(child => node.append(child));
    return node;
  };
  const host = el('div', { id: 'margin-host' });
  const panel = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const state = {};
  let saves = 0;
  const notices = [];
  let adapter = window.MarginGames.connections.mount({ el, panel, state, save: () => saves++, settings: {}, notice: message => notices.push(message), isPreview: true });
  const popupRoot = () => document.querySelector('[data-margin-overlay="connections-popups"]').shadowRoot;
  const markerHosts = () => [...document.querySelectorAll('[data-margin-overlay="connections"]')];
  const handles = () => ({
    querySelectorAll: selector => markerHosts().flatMap(host => [...host.shadowRoot.querySelectorAll(selector)]),
    querySelector: selector => handles().querySelectorAll(selector)[0] || null,
  });
  const handle = (word, corner) => handles().querySelector(`[data-word="${word}"][data-corner="${corner}"]`);
  const clickPanel = text => {
    const button = [...panel.querySelectorAll('button'), ...popupRoot().querySelectorAll('button')].find(node => node.textContent === text || node.getAttribute('aria-label') === text);
    if (!button) throw new Error(`No control: ${text}`);
    button.click();
  };
  const selectFirstFour = () => {
    for (const button of board.children) button.setAttribute('aria-pressed', String(words.slice(0, 4).includes(button.dataset.marginWord)));
  };
  try {
    assert(/3\.2\s*\/\s*5/.test(panel.textContent), 'Shows only the visible difficulty rating');
    assert(!/Merriam-Webster|Word meanings|reveal answer|show solution/i.test(panel.textContent), 'No dictionary or answer controls remain');
    handle('BASS','tl').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true, button: 0 }));
    handle('BASS','tl').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, cancelable: true, button: 0 }));
    handle('BASS','tl').click();
    assert(state.marks.BASS.tl === 0, 'Top-left direct corner writes the yellow category');
    assert(gameClicks === 0 && gamePointerEvents === 0, 'Corner pointer gestures never reach native selection handlers');
    handle('BASS','br').click();
    assert(state.marks.BASS.tl === 0 && state.marks.BASS.br === 3, 'A word can carry independent fixed-color corner ideas');
    assert(handle('BASS','tl').textContent === '' && handle('BASS','br').textContent === '', 'Saved corner marks have no letter overlays');
    const before = handle('BASS','tl').getBoundingClientRect().left;
    board.append(board.firstElementChild); adapter.refresh();
    assert(handle('BASS','tl').getBoundingClientRect().left !== before, 'Labels follow the word after shuffle');
    handle('BASS','br').click();
    assert(state.marks.BASS.br === undefined && state.marks.BASS.tl === 0, 'Repeating a corner click removes just that corner');
    clickPanel('Undo mark');
    assert(state.marks.BASS.br === 3, 'Undo restores the last erased annotation');
    selectFirstFour();
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-feedback]').textContent = 'One away…';
    await pause();
    assert(state.attempts.length === 1 && state.attempts[0].result === 'one-away', 'Captures asynchronous one-away feedback');
    assert(state.attempts[0].words.join(',') === 'PITCH,TONE,NOTE,BASS', 'Captures the submitted four words before later board changes');
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-feedback]').textContent = 'One away…';
    await pause();
    assert(state.attempts.length === 2 && state.attempts[1].result === 'one-away', 'Repeated identical feedback is captured as a new submission');
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-feedback]').textContent = 'Not quite. Try again.';
    await pause();
    assert(state.attempts[2].result === 'incorrect', 'Incorrect feedback does not invent an exact distance');
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-feedback]').textContent = 'You have already guessed that';
    await pause();
    assert(state.attempts.length === 3, 'A duplicate-guess rejection is not counted as another miss');
    selectFirstFour();
    document.querySelector('[data-test-shuffle]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    board.querySelector('[data-margin-word="BASS"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    for (const button of board.children) button.setAttribute('aria-pressed', String(words.slice(4, 8).includes(button.dataset.marginWord)));
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-feedback]').textContent = 'Not quite. Try again.';
    await pause();
    assert(state.attempts.length === 4 && state.attempts[3].words.join(',') === 'BANK,STREAM,BED,MOUTH', 'Enter on Shuffle, a tile, or with modifiers never creates a phantom submission');
    // Shape observed on NYT on 2026-10-31: labels containing checkboxes,
    // keyboard-reference spans, and a separate visible word span.
    board.dataset.testid = 'connections-board';
    board.replaceChildren(...words.map((word, index) => {
      const label = el('label', { className: 'Card-module_label__fixture', 'data-testid': 'card-label', style: 'display:flex;height:60px;align-items:center;justify-content:center;position:relative' });
      const input = el('input', { type: 'checkbox', 'data-testid': 'card-input' });
      input.style.position = 'absolute'; input.style.opacity = '0';
      label.append(input, el('span', { className: 'Card-module_reference__fixture', textContent: String(index + 1) }), el('span', { textContent: word }));
      return label;
    }));
    await new Promise(resolve => setTimeout(resolve,300));adapter.refresh();
    assert(handles().querySelectorAll('button.corner-handle').length === 64, 'Detects the NYT label-and-checkbox board shape');
    handle('BASS','tr').click();
    assert(state.marks.BASS.tr === 1 && !state.marks['1BASS'], 'Saves the visible word without its keyboard-reference span');
    assert(!board.firstElementChild.querySelector('input').checked, 'A corner click does not toggle the underlying native checkbox');
    for (const [index, label] of [...board.children].entries()) {label.querySelector('input').checked = index < 4;label.classList.toggle('Card-module_selected__fixture',index < 4);}
    clickPanel('Previous tries');
    assert(!popupRoot().querySelector('.connection-history').querySelector('select,input,.connection-popup-actions')&&popupRoot().querySelector('.connection-history').querySelectorAll('button').length===1,'Tries has only recorded guesses and its close button');
    clickPanel('Close previous tries');
    document.querySelector('[data-margin-submit]').click();document.querySelector('[data-margin-feedback]').textContent='One away';await pause();
    assert(state.attempts.at(-1).words.join(',') === 'BASS,PITCH,TONE,NOTE', 'Reads selected words from the current NYT checkbox structure');
    const countBeforeDotMiss = state.attempts.length;
    document.querySelector('[data-margin-feedback]').textContent = '';
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-mistakes]').lastElementChild.remove();
    await new Promise(resolve => setTimeout(resolve, 850));
    assert(state.attempts.length === countBeforeDotMiss + 1 && state.attempts.at(-1).result === 'incorrect' && state.attempts.at(-1).source === 'nyt-mistake-count', 'A lost visible mistake dot records an ordinary miss without a toast');
    document.querySelector('[data-margin-submit]').click();
    document.querySelector('[data-margin-mistakes]').lastElementChild.remove();
    adapter.refresh();
    document.querySelector('[data-margin-feedback]').textContent = 'One away…';
    await pause();
    assert(state.attempts.at(-1).result === 'one-away', 'Explicit one-away feedback takes priority over the lost-dot fallback');
    const afterOneAway = state.attempts.length;
    await new Promise(resolve => setTimeout(resolve, 850));
    assert(state.attempts.length === afterOneAway, 'Lost-dot timer cannot double-record an explicit feedback result');
    // A native handler may clear selection before the result or mistake animation ends.
    const submit = document.querySelector('[data-margin-submit]');
    document.querySelector('[data-margin-feedback]').textContent = '';await pause();
    const beforeFast = state.attempts.length, beforeSave = saves;
    submit.addEventListener('click', () => {
      for (const label of board.children) {label.querySelector('input').checked = false;label.classList.remove('Card-module_selected__fixture');}
      document.querySelector('[data-margin-mistakes]').lastElementChild.remove();
    }, {once:true});
    submit.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));submit.click();
    assert(state.attempts.length === beforeFast+1 && saves > beforeSave && state.attempts.at(-1).words.length === 4, 'Persists the first submission before native handlers clear the selection');
    assert(markerHosts().length === 0 && !handle('BASS','tl'), 'Corner triangles are actually unpainted immediately on submission');
    for (const [index,label] of [...board.children].entries()) {label.classList.toggle('Card-module_selected__fixture',index >= 4 && index < 8);label.querySelector('input').checked = index < 3 || index >= 5 && index < 8;}
    submit.click();
    assert(state.attempts.length === beforeFast+2 && state.attempts[beforeFast].result === 'incorrect', 'A fast second submission preserves the first wrong attempt while its feedback is settling');
    const solvedRow = el('div',{'data-testid':'solved-category'}, ...words.slice(4,8).map(word => el('span',{'data-solved-word':'',textContent:word})));
    board.after(solvedRow);
    const animation = board.lastElementChild.animate([{transform:'translateY(0)'},{transform:'translateY(30px)'}],{duration:1500});
    await pause();
    assert(state.attempts.at(-1).result === 'correct' && state.attempts.at(-1).words.join(',') === 'BANK,STREAM,BED,MOUTH', 'The correct attempt uses visible selection despite stale checked and unchecked inputs, then matches the solved group');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert(markerHosts().length === 0 && !handle('BASS','tl'), 'No corner triangles are painted while native tile motion runs');
    animation.finish();await new Promise(resolve => setTimeout(resolve, 300));
    assert(markerHosts().length > 0 && handle('BASS','tl').getClientRects().length > 0 && state.marks.BASS.tl === 0, 'Corners return after motion settles without losing saved marks');
    // Native selection also animates: only Submit may hide the flags.
    for (const type of ['animationstart','animationend','transitionrun','transitionend']) {
      board.firstElementChild.dispatchEvent(new Event(type,{bubbles:true}));
      assert(markerHosts().length > 0 && handle('BASS','tl').getClientRects().length > 0, 'Tile selection keeps flags visible during '+type);
    }
    document.querySelector('[data-test-shuffle]').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
    document.querySelector('[data-test-shuffle]').click();
    assert(markerHosts().length > 0 && handle('BASS','tl').getClientRects().length > 0, 'Shuffle does not trigger the Submit-only hiding behavior');
    solvedRow.remove();
    const afterFast = state.attempts.length;
    for (const [index,label] of [...board.children].entries()) {label.querySelector('input').checked = index < 4;label.classList.toggle('Card-module_selected__fixture',index < 4);}
    const textInput = el('input',{type:'text'});document.body.append(textInput);
    textInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));textInput.remove();
    assert(state.attempts.length === afterFast, 'Enter in an unrelated text field does not record a guess');
    board.firstElementChild.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));submit.click();
    assert(state.attempts.length === afterFast+1, 'Enter from a focused native tile records once, including a follow-up click');
    document.querySelector('[data-margin-feedback]').textContent = 'Not quite';await pause();
    const beforeSolved=state.attempts.length;document.querySelector('[data-margin-feedback]').textContent='';
    document.querySelector('[data-margin-submit]').click();const solved=[...board.children].slice(0,4);solved.forEach(node=>node.remove());adapter.refresh();
    assert(state.attempts.length===beforeSolved+1&&state.attempts.at(-1).words.join(',')==='BASS,PITCH,TONE,NOTE','The log also records a submitted group removed from the visible board');
    clickPanel('Previous tries');assert(popupRoot().querySelectorAll('.connection-one-away').length===state.attempts.filter(a=>a.result==='one-away').length,'Only observed one-away attempts receive a badge');clickPanel('Close previous tries');
    board.prepend(...solved);document.querySelector('[data-margin-feedback]').textContent='Not quite';await new Promise(resolve => setTimeout(resolve,300));adapter.refresh();
    state.marks = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [index === 0 ? 'BASS' : `SAVED${index}`, { tl: 0 }]));
    adapter.refresh();
    handle('PITCH','tl').click();
    assert(Object.keys(state.marks).length === 64 && !Object.hasOwn(state.marks, 'PITCH') && notices.at(-1).includes('64 words'), 'A full annotation store refuses a 65th distinct word with a notice');
    handle('BASS','tr').click();
    assert(state.marks.BASS.tr === 1 && Object.keys(state.marks).length === 64, 'Existing word annotations remain editable at the limit');
    handle('BASS','tr').click(); handle('BASS','tl').click();
    assert(!Object.hasOwn(state.marks, 'BASS') && Object.keys(state.marks).length === 63, 'Removing the last corner mark frees a word slot');
    handle('PITCH','tl').click();
    assert(state.marks.PITCH.tl === 0 && Object.keys(state.marks).length === 64, 'A new word can use a slot freed by erasing');
    clickPanel('Undo mark'); clickPanel('Undo mark');
    assert(state.marks.BASS.tl === 0 && !Object.hasOwn(state.marks, 'PITCH') && Object.keys(state.marks).length === 64, 'Undo restores existing annotations without exceeding the word limit');
    document.querySelector('[data-margin-difficulty]').remove();
    adapter.refresh();
    assert(/difficulty unavailable/i.test(panel.textContent), 'Unavailable difficulty is labelled honestly');
    let finishRating,readCount=0;
    window.MarginConnectionsRating={read:()=>{readCount++;return new Promise(resolve=>finishRating=resolve);}};
    adapter.refresh();
    const difficulty=panel.querySelector('.connection-inline-difficulty');
    assert(difficulty.textContent==='Difficulty loading…'&&difficulty.getAttribute('aria-busy')==='true','Difficulty shows loading immediately while the request is pending');
    await pause();adapter.refresh();
    assert(readCount===1&&difficulty.textContent==='Difficulty loading…','Refreshes keep loading visible and do not duplicate a pending request');
    finishRating({status:'ok',rating:3.6});await pause();
    assert(difficulty.textContent==='Difficulty 3.6/5'&&difficulty.getAttribute('aria-busy')==='false','A completed request replaces loading with the published rating');
    assert(saves >= 7, 'User changes request persistence');
    adapter.destroy(); panel.replaceChildren();
    let rejectRating;
    window.MarginConnectionsRating={read:()=>new Promise((resolve,reject)=>rejectRating=reject)};
    const legacyState = { marks: { BASS: { br: 2, tr: 0, bl: 0 }, PITCH: { tl: 3 } }, labels: ['My first group', 'B', 'C', 'D'] };
    adapter = window.MarginGames.connections.mount({ el, panel, state: legacyState, save: () => saves++, settings: {}, notice: message => notices.push(message), isPreview: true });
    assert(legacyState.marks.BASS.bl === 2 && legacyState.marks.BASS.tl === 0 && Object.keys(legacyState.marks.BASS).length === 2 && legacyState.marks.PITCH.br === 3, 'Legacy arbitrary-corner marks retain their colors at the new fixed positions');
    assert(legacyState.labels[0] === 'My first group', 'Existing category names survive the redesign');
    assert(panel.querySelector('.connection-inline-difficulty').textContent==='Difficulty loading…','A fresh request starts in loading rather than unavailable');
    await pause();rejectRating(new Error('Request failed'));await pause();
    assert(panel.querySelector('.connection-inline-difficulty').textContent==='Difficulty unavailable'&&panel.querySelector('.connection-inline-difficulty').getAttribute('aria-busy')==='false','Only a finished failed request changes loading to unavailable');
    delete window.MarginConnectionsRating;
    adapter.destroy();
    assert(!document.querySelector('[data-margin-overlay="connections"],[data-margin-overlay="connections-popups"]'), 'Destroy removes the annotation and popup surfaces');
    document.querySelector('#test-results').textContent = `${results.join('\n')}\nALL ${results.length} TESTS PASSED`;
    document.documentElement.dataset.testResult = 'passed';
  } catch (error) {
    adapter.destroy();
    document.querySelector('#test-results').textContent = `${results.join('\n')}\nFAIL ${error.stack}`;
    document.documentElement.dataset.testResult = 'failed';
  }
})();
