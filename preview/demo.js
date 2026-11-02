/* Original local practice boards. No answer data, network calls, or NYT account needed. */
(() => {
  'use strict';
  const { el, GAMES } = window.Margin;
  const requested = new URL(location.href).searchParams.get('game');
  const bonus = requested === 'bonuscrossword';
  const game = bonus ? 'crossword' : GAMES[requested] ? requested : 'connections';
  const demoId = `demo-${bonus ? 'bonus-crossword' : game}-v2`;
  const nativeKey = `margin-demo-board:${demoId}`;
  const board = document.getElementById('board');
  board.dataset.marginGame = game; board.dataset.puzzleId = demoId;
  document.title = `${bonus ? 'Bonus crossword' : GAMES[game].name} · Local playground`;
  for (const [id, data] of [...Object.entries(GAMES), ['bonuscrossword', { name: 'Bonus crossword' }]]) {
    document.getElementById('games').append(el('a', { href: `?game=${id}`, 'aria-current': (bonus ? id === 'bonuscrossword' : game === id) ? 'page' : 'false', textContent: data.name }));
  }
  document.getElementById('game-title').textContent = bonus ? 'Bonus crossword' : GAMES[game].name;
  document.getElementById('game-description').textContent = {
    connections: 'Category marks and previous tries.', sudoku: 'Snyder and Center.',
    wordle: 'Spot clue conflicts. Change a letter with a click.',
    crossword: bonus ? 'An original 5 × 5 mini. No subscription needed.' : 'An original practice grid, with both clues close by.',
  }[game];
  document.getElementById('test-instructions').textContent = {
    connections: 'Click a corner to toggle its fixed color: yellow, green, blue or purple. Click a category icon to filter, its × to clear that color, or double-click to rename. Open Tries above the board for your submitted groups. Click word centers to select them; feedback is simulated.',
    sudoku: 'Click an empty cell and type 1–9 in Play to enter a number. Delete erases it. Switch to Snyder or Center and use those same keys to add independent marks. Arrow keys move through the grid in Play.',
    wordle: 'Two example rows provide visible feedback. Type STARE to see conflicting letters turn red, then press Enter to review the warning. Click any tile in your current row to type or delete a letter. Open the game’s Settings to turn either feature on or off. New row colors are sample feedback, not an answer check.',
    crossword: 'Click a square and type. Arrow keys move; Space changes Across/Down; Backspace erases; Tab moves to the next clue. Click a clue to select its entry. Hover any white square for both existing clues. No answers or checking are included.',
  }[game];
  const testStatus = document.getElementById('demo-status');
  document.getElementById('reset-demo').title = 'Clear entries and notes for this demo only. Other games and extension data are unchanged.';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(nativeKey) || '{}'); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  function persist(value) { try { localStorage.setItem(nativeKey, JSON.stringify(value)); } catch { testStatus.textContent = 'Browser storage unavailable. This practice session still works.'; } }
  document.getElementById('reset-demo').addEventListener('click', () => {
    try {
      const notes = JSON.parse(localStorage.getItem('margin-preview') || '{}');
      for (const key of Object.keys(notes)) if (key.startsWith(`puzzle:${game}:`) && key.includes(`:${demoId}:`)) delete notes[key];
      localStorage.setItem('margin-preview', JSON.stringify(notes)); localStorage.removeItem(nativeKey);
      location.reload();
    } catch { testStatus.textContent = 'Could not reset browser storage. Reload to restart the board.'; }
  });
  const demoToolbar=el('div',{'data-demo-toolbar':'',style:'display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:42px;margin:0 0 10px'});
  function demoDialog(title){
    const dialog=el('dialog',{'data-native-settings':title==='Settings'?'':null,style:'width:min(500px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:20px;border:1px solid #ccc;border-radius:8px'},el('h2',{textContent:title}));
    dialog.append(el('button',{type:'button','aria-label':'Close',textContent:'Close',onClick:()=>{dialog.close();dialog.remove();}}));document.body.append(dialog);dialog.showModal();
  }
  demoToolbar.append(el('button',{type:'button',className:'action','aria-label':'Statistics',textContent:'Stats',onClick:()=>demoDialog('Demo statistics')}),el('button',{type:'button',className:'action','aria-label':'Help',textContent:'Help',onClick:()=>demoDialog('Demo help')}));
  if(['wordle','sudoku','crossword'].includes(game))demoToolbar.append(el('button',{type:'button',className:'action','aria-label':'Settings',textContent:'Settings',onClick:()=>demoDialog('Settings')}));
  if(game==='crossword')demoToolbar.prepend(el('button',{type:'button',className:'action','aria-label':'Rebus',textContent:'Rebus',disabled:true}),el('button',{type:'button',className:'action','aria-label':'Pencil','aria-pressed':'false',textContent:'Pencil',onClick:event=>{const next=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(next));board.classList.toggle('demo-pencil',next);}}));
  board.before(demoToolbar);
  function nativeInput(event) {
    return !event.defaultPrevented && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.target.closest?.('input,textarea,select,[contenteditable=true],#margin-host,[data-margin-inline],[data-margin-overlay],a');
  }
  if (game === 'connections') {
    const words = ['BARK','STEM','LEAF','ROOT','WAVE','ROLL','BREAK','SURF','NOTE','KEY','SCALE','REST','RING','BAND','STONE','SETTING'];
    const grid = el('div', { className: 'connections-board', 'data-testid': 'connections-board' });
    const selected = new Set();
    words.forEach(word => grid.append(el('button', { type: 'button', 'data-margin-word': word, 'aria-pressed': 'false', textContent: word, onClick: event => {
      if (selected.has(word)) selected.delete(word); else if (selected.size < 4) selected.add(word);
      event.currentTarget.setAttribute('aria-pressed', String(selected.has(word)));
    } })));
    const feedback = el('p', { className: 'board-feedback', 'data-margin-feedback': '', role: 'status', textContent: 'Feedback simulator · no answer checking.' });
    const response = el('select', { id: 'demo-feedback' }, ...[['incorrect','Incorrect'], ['one-away','One away'], ['duplicate','Already guessed']].map(([value,text]) => el('option', { value, textContent: text })));
    document.getElementById('test-options').append(el('label', { className: 'demo-feedback-choice' }, 'Simulated response ', response));
    document.getElementById('game-description').append(el('small', { className: 'demo-rating', 'data-margin-difficulty': '', textContent: 'Sample difficulty 2.5 / 5' }));
    const submit = el('button', { className: 'action', type: 'button', 'data-margin-submit': '', textContent: 'Submit', onClick: () => {
      if (selected.size !== 4) { feedback.textContent = 'Select four words.'; return; }
      const text = { incorrect: 'Not quite. Try again.', 'one-away': 'One away…', duplicate: 'Already guessed!' }[response.value];
      feedback.textContent = ''; setTimeout(() => { feedback.textContent = text; }, 100);
    } });
    board.append(el('p', { 'data-margin-connections-instruction': '', style: 'text-align:center;margin:0 0 14px', textContent: 'Create four groups of four!' }), grid, el('div', { className: 'board-actions', 'data-margin-actions': '' },
      el('button', { className: 'action', type: 'button', textContent: 'Shuffle', onClick: () => {
        const nodes = [...grid.children]; for (let i = nodes.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [nodes[i],nodes[j]] = [nodes[j],nodes[i]]; }
        grid.replaceChildren(...nodes);
      } }), el('button', { className: 'action', type: 'button', textContent: 'Deselect all', onClick: () => { selected.clear(); grid.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed','false')); } }), submit), feedback);
  } else if (game === 'sudoku') {
    const grid = el('div', { className: 'sudoku-board su-board', role: 'grid', 'aria-label': 'Original Sudoku practice grid' });
    const givens = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
    const values = Array.isArray(saved.values) ? Array.from({ length: 81 }, (_, i) => /^[1-9]$/.test(saved.values[i]) ? saved.values[i] : '') : Array(81).fill('');
    let active = 2, nativeCandidate = false;
    const undo = [];
    const cells = [];
    function select(index, focus = false) { active = index; cells.forEach((cell, i) => { cell.classList.toggle('selected', i === active); cell.setAttribute('aria-selected', String(i === active)); cell.tabIndex = i === active ? 0 : -1; }); if (focus) cells[active].focus({ preventScroll: true }); }
    function write(value) {
      if (givens[active] !== '0') return;
      const span = cells[active].querySelector('[data-margin-value]');
      if (nativeCandidate && value) { const notes = cells[active].querySelector('.native-pencil'); const digits = new Set(notes.textContent); digits.has(value) ? digits.delete(value) : digits.add(value); notes.textContent = [...digits].sort().join(''); return; }
      if (values[active] === value) return;
      undo.push(values.slice()); if (undo.length > 40) undo.shift();
      values[active] = value; span.textContent = value; persist({ values });
    }
    for (let i = 0; i < 81; i++) {
      const given = givens[i] !== '0';
      const cell = el('button', { type: 'button', className: 'su-cell', role: 'gridcell', 'data-margin-cell': String(i), 'data-given': String(given), 'aria-readonly': String(given), 'aria-label': `Row ${Math.floor(i / 9) + 1}, column ${i % 9 + 1}${given ? ', given '+givens[i] : ''}`, onClick: () => select(i) },
        el('span', { 'data-margin-value': '', textContent: given ? givens[i] : values[i] }), el('span', { className: 'native-pencil' }));
      cells.push(cell); grid.append(cell);
    }
    const normal = el('button', { type: 'button', 'data-testid': 'normal-mode', textContent: 'Normal', onClick: () => { nativeCandidate = false; } });
    const candidate = el('button', { type: 'button', 'data-testid': 'candidate-mode', textContent: 'Candidate', onClick: () => { nativeCandidate = true; } });
    const pad = el('div', { className: 'sudoku-keypad su-candidates', 'data-margin-sudoku-keypad': '' });
    for (let n = 1; n <= 9; n++) pad.append(el('button', { type: 'button', className: 'su-candidate-button', 'data-margin-sudoku-digit': String(n), textContent: String(n), onClick: () => write(String(n)) }));
    const erase = el('button', { type: 'button', className: 'action sudoku-erase', 'data-margin-sudoku-erase': '', 'data-testid': 'clear-cell', textContent: 'Erase', onClick: () => write('') });
    const undoButton = el('button', { type: 'button', className: 'action su-keyboard__undo', 'data-testid': 'undo-desktop', textContent: 'Undo', onClick: () => {
      const previous = undo.pop(); if (!previous) return;
      values.splice(0, values.length, ...previous); cells.forEach((cell, index) => { if (givens[index] === '0') cell.querySelector('[data-margin-value]').textContent = values[index]; }); persist({ values });
    } });
    const auto = el('label', { className: 'su-keyboard__auto' }, el('input', { type: 'checkbox', className: 'su-keyboard__checkbox', name: 'lightenComplete', 'data-testid': 'sudoku-keyboard-checkbox', checked: false }), 'Auto Candidate Mode');
    board.append(grid, el('div', { className: 'su-keyboard' }, el('div', { className: 'su-keyboard__split' }, normal, candidate), pad, el('div', { className: 'sudoku-extra-actions' }, undoButton, erase), auto));
    document.getElementById('test-instructions').append(' The demo Auto Candidate switch only mirrors its setting; it never calculates possible digits.');
    document.addEventListener('keydown', event => {
      if (!nativeInput(event)) return;
      if (/^[1-9]$/.test(event.key)) { event.preventDefault(); write(event.key); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); write(''); }
      else if (/^Arrow/.test(event.key)) { const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }; const next = active + offsets[event.key]; if (next >= 0 && next < 81) { event.preventDefault(); select(next, true); } }
    });
    select(active);
  } else if (game === 'wordle') {
    const grid = el('div', { className: 'wordle-board' });
    const previous = ['CRANE','STOUT'];
    const feedback = [['absent','absent','present','absent','present'], ['absent','absent','absent','absent','absent']];
    let current = 2, guess = '';
    for (let row = 0; row < 6; row++) { const node = el('div', { className: 'wordle-row', 'data-margin-row': '' }); for (let col = 0; col < 5; col++) node.append(el('span', { className: 'wordle-tile', 'data-margin-tile': '', 'data-state': row < 2 ? feedback[row][col] : 'empty', textContent: previous[row]?.[col] || '' })); grid.append(node); }
    const status = el('p', { className: 'sample-note', role: 'status', textContent: 'Example feedback · no hidden answer or dictionary check.' });
    function paint() { if (current >= 6) return; [...grid.children[current].children].forEach((tile, i) => { tile.textContent = guess[i] || ''; tile.dataset.state = guess[i] ? 'tbd' : 'empty'; }); }
    function key(key) {
      if (current >= 6) return;
      if (key === 'Enter') {
        if (guess.length !== 5) { status.textContent = 'Type five letters first.'; return; }
        [...grid.children[current].children].forEach(tile => { tile.dataset.state = /[AE]/.test(tile.textContent) ? 'present' : 'absent'; });
        current++; guess = ''; status.textContent = current === 6 ? 'Practice complete. Reset demo to start again.' : 'Submission received. Colors are simulated feedback only.';
      } else if (key === 'Backspace' || key === 'Delete') { guess = guess.slice(0,-1); paint(); }
      else if (/^[a-z]$/i.test(key) && guess.length < 5) { guess += key.toUpperCase(); paint(); }
    }
    document.addEventListener('keydown', event => { if (!nativeInput(event) || event.key === 'Enter' && event.target.closest?.('button')) return; if (/^[a-z]$/i.test(event.key) || ['Enter','Backspace','Delete'].includes(event.key)) { event.preventDefault(); key(event.key); } });
    const keyboard = el('div', { className: 'wordle-keyboard', 'data-margin-keyboard': '' });
    for (const keys of ['QWERTYUIOP','ASDFGHJKL',['Enter',...'ZXCVBNM','Backspace']]) {
      const row = el('div', { className: 'keyboard-row' });
      for (const letter of keys) row.append(el('button', { type: 'button', 'data-key': letter, ...(letter === 'Enter' ? { 'data-margin-enter': '' } : {}), 'aria-label': letter, textContent: letter === 'Backspace' ? '⌫' : letter, onClick: () => key(letter) }));
      keyboard.append(row);
    }
    board.append(grid, keyboard, status);
  } else {
    const size = 5, pattern = bonus ? '.'.repeat(25) : '..#.......#...#.......#..';
    const acrossClues = bonus ? ['It keeps a steady beat in your chest','A coal that is still glowing','Treat very badly','Sticky substance from a tree','A direction of change'] : ['Morning hours, briefly','The opposite of off','A tentative answer','A tiny mark','Thoughts worth saving','At this moment, in a text','An affirmative vote'];
    const downClues = bonus ? ['The center of a matter','A tiny glow in the fireplace','Misuse','Material in some craft molds','What becomes fashionable'] : ['The opposite of off','A quiet break','Put pen to paper','Not out','The tip of a pen','Note following do','Before noon, briefly'];
    const grid = el('div', { className: 'crossword-board', role: 'grid', 'aria-label': bonus ? 'Original bonus mini crossword' : 'Original crossword practice grid' });
    const activeClue = el('p', { className: 'native-active-clue', 'aria-live': 'polite' });
    const cells = [], numbers = {}, entries = { across: [], down: [] }, values = Array(25).fill('');
    if (Array.isArray(saved.values)) saved.values.slice(0,25).forEach((value, index) => { if (/^[A-Z]$/.test(value)) values[index] = value; });
    let number = 0, active = 0, direction = 'across';
    for (let index = 0; index < 25; index++) {
      const row = Math.floor(index / size), col = index % size, block = pattern[index] === '#';
      const across = !block && (col === 0 || pattern[index - 1] === '#');
      const down = !block && (row === 0 || pattern[index - size] === '#');
      if (across || down) numbers[index] = ++number;
      for (const [axis, start, step] of [['across',across,1],['down',down,size]]) if (start) {
        const indices = [];
        for (let next = index; next < 25 && pattern[next] !== '#' && (axis === 'down' || Math.floor(next / size) === row); next += step) indices.push(next);
        if (indices.length > 1) entries[axis].push({ number: numbers[index], indices, text: (axis === 'across' ? acrossClues : downClues)[entries[axis].length] || 'Original practice clue' });
      }
      const cell = el(block ? 'div' : 'button', { ...(block ? {} : { type: 'button' }), className: `crossword-cell${block ? ' block' : ''}`, role: 'gridcell', 'data-margin-crossword-cell': String(index), 'data-row': String(row), 'data-col': String(col), 'data-number': numbers[index] ? String(numbers[index]) : '', 'data-block': String(block), tabIndex: -1, 'aria-label': block ? 'Black square' : `Row ${row + 1}, column ${col + 1}${numbers[index] ? ', number '+numbers[index] : ''}`, onClick: () => { if (!block) { if (active === index) direction = direction === 'across' ? 'down' : 'across'; select(index, true); } } },
        numbers[index] ? el('small', { textContent: String(numbers[index]) }) : '', el('span', { className: 'crossword-letter', textContent: values[index] }));
      cells.push(cell); grid.append(cell);
    }
    const lists = el('div', { className: 'demo-clue-lists' });
    for (const axis of ['across','down']) lists.append(el('section', { 'data-margin-clue-direction': axis }, el('h3', { textContent: axis === 'across' ? 'Across' : 'Down' }),
      el('ol', {}, ...entries[axis].map(entry => {
        const button = el('button', { type: 'button', onClick: () => { direction = axis; select(entry.indices[0], true); } }, el('b', { textContent: `${entry.number}. ` }), el('span', { 'data-clue-text': '', textContent: `${entry.text} (${entry.indices.length})` }));
        const item = el('li', { 'data-margin-clue-number': String(entry.number) }, button); entry.item = item; return item;
      }))));
    function entryAt(axis = direction, index = active) { return entries[axis].find(entry => entry.indices.includes(index)); }
    function select(index, focus = false) {
      active = index; if (!entryAt()) direction = direction === 'across' ? 'down' : 'across';
      const entry = entryAt();
      cells.forEach((cell, i) => { cell.classList.toggle('entry-selected', !!entry?.indices.includes(i)); cell.classList.toggle('selected', i === active); cell.setAttribute('aria-selected', String(i === active)); cell.tabIndex = i === active ? 0 : -1; });
      for (const axis of ['across','down']) entries[axis].forEach(item => item.item.classList.toggle('selected-clue', item === entry));
      activeClue.textContent = entry ? `${entry.number} ${direction === 'across' ? 'Across' : 'Down'} · ${entry.text} (${entry.indices.length})` : '';
      if (focus) cells[active].focus({ preventScroll: true });
    }
    function advance(step) { const entry = entryAt(); const next = entry?.indices[entry.indices.indexOf(active) + step]; if (next !== undefined) select(next, true); }
    function write(value) { values[active] = value; cells[active].querySelector('.crossword-letter').textContent = value; persist({ values }); }
    grid.addEventListener('keydown', event => {
      if (!nativeInput(event)) return;
      if (/^[a-z]$/i.test(event.key)) { event.preventDefault(); write(event.key.toUpperCase()); advance(1); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); if (!values[active] && event.key === 'Backspace') advance(-1); write(''); }
      else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); direction = direction === 'across' ? 'down' : 'across'; select(active); }
      else if (event.key === 'Tab') { event.preventDefault(); const all = [...entries.across.map(entry => ({ entry, axis: 'across' })), ...entries.down.map(entry => ({ entry, axis: 'down' }))]; const index = all.findIndex(item => item.entry === entryAt()); const next = all[(index + (event.shiftKey ? -1 : 1) + all.length) % all.length]; direction = next.axis; select(next.entry.indices[0], true); }
      else if (/^Arrow/.test(event.key)) { event.preventDefault(); const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size }, step = offsets[event.key]; direction = Math.abs(step) === 1 ? 'across' : 'down'; let next = active + step; while (next >= 0 && next < 25 && (Math.abs(step) !== 1 || Math.floor(next / size) === Math.floor(active / size))) { if (pattern[next] !== '#') { select(next, true); break; } next += step; } }
    });
    board.append(activeClue, grid, lists); select(active);
  }
})();
