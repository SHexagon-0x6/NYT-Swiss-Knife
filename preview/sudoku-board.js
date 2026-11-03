/* An original Sudoku practice board shaped like NYT's markup, for local previews and tests.
   No answers are stored; Auto candidate only removes digits already seen in a row, column or box. */
(() => {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';
  const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
  const CSS = `
    [data-sudoku-practice]{width:420px;max-width:100%;margin:0 auto}
    [data-sudoku-practice] .su-board{position:relative;display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(9,1fr);aspect-ratio:1;border:2px solid #121212;background:#fff}
    [data-sudoku-practice] .su-cell{position:relative;display:grid;place-items:center;border-right:1px solid #ddd;border-bottom:1px solid #ddd;font:24px Arial,sans-serif;color:#32628b;cursor:pointer;user-select:none}
    [data-sudoku-practice] .su-cell:nth-child(3n){border-right:2px solid #121212}
    [data-sudoku-practice] .su-cell:nth-child(n+19):nth-child(-n+27),[data-sudoku-practice] .su-cell:nth-child(n+46):nth-child(-n+54){border-bottom:2px solid #121212}
    [data-sudoku-practice] .su-cell.prefilled{color:#121212;font-weight:700}
    [data-sudoku-practice] .su-cell.selected{background:#e9f1f7}
    [data-sudoku-practice] .su-practice-layer{position:absolute;inset:0;pointer-events:none}
    [data-sudoku-practice] .su-candidates{position:absolute;inset:0}
    [data-sudoku-practice] .su-candidates>svg{position:absolute;left:calc(var(--x) * 100% / 27);top:calc(var(--y) * 100% / 27);width:calc(100% / 27);height:calc(100% / 27);overflow:visible}
    [data-sudoku-practice] .su-candidates>svg>text{fill:#666;font:600 11px Arial,sans-serif}
    [data-sudoku-practice] .su-candidate{pointer-events:none}
    [data-sudoku-practice] .su-candidate-button{opacity:0;pointer-events:auto;cursor:pointer}
    [data-sudoku-practice] .su-candidate-button:hover{opacity:.4}
    [data-sudoku-practice] .su-keyboard{margin:12px auto 0}
    [data-sudoku-practice] .su-keyboard__split{display:flex}
    [data-sudoku-practice] .su-keyboard__mode{flex:1;height:36px;border:1px solid #ccc;background:#f4f4f4;color:#555;font:14px Arial,sans-serif;cursor:pointer}
    [data-sudoku-practice] .su-keyboard__mode[aria-pressed=true]{background:#121212;color:#fff}
    [data-sudoku-practice] .su-keyboard__container{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
    [data-sudoku-practice] .su-keyboard__container button{height:44px;border:1px solid #ddd;border-radius:4px;background:#fff;font:20px Arial,sans-serif;cursor:pointer}
    [data-sudoku-practice] .su-keyboard__auto{grid-column:1/-1;display:flex;align-items:center;gap:8px;font:16px Arial,sans-serif;color:#121212;margin-top:4px;cursor:pointer}`;
  function make(tag, attrs = {}, ...children) {
    const node = tag === 'svg' || tag === 'text' ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
    node.append(...children);
    return node;
  }
  const valid = digit => Number.isInteger(digit) && digit >= 1 && digit <= 9;
  function build(host, options = {}) {
    const saved = options.saved && typeof options.saved === 'object' ? options.saved : {};
    const persist = options.persist || (() => {});
    const givens = options.givens || GIVENS;
    const values = Array.from({length: 81}, (_, i) => /^[1-9]$/.test(saved.values?.[i]) ? saved.values[i] : '');
    const notes = Array.from({length: 81}, (_, i) => new Set((Array.isArray(saved.notes?.[i]) ? saved.notes[i] : []).filter(valid)));
    const removed = Array.from({length: 81}, (_, i) => new Set((Array.isArray(saved.removed?.[i]) ? saved.removed[i] : []).filter(valid)));
    let active = 2, candidateMode = false, auto = !!saved.auto;
    const history = [];
    const digitAt = i => givens[i] !== '0' ? givens[i] : values[i];
    function possible(i) {
      const row = Math.floor(i / 9), col = i % 9, seen = new Set();
      for (let k = 0; k < 81; k++) {
        const r = Math.floor(k / 9), c = k % 9;
        if (k !== i && (r === row || c === col || Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3)) && digitAt(k)) seen.add(Number(digitAt(k)));
      }
      return [1,2,3,4,5,6,7,8,9].filter(d => !seen.has(d));
    }
    const shown = i => digitAt(i) ? [] : auto ? possible(i).filter(d => !removed[i].has(d)) : [...notes[i]].sort();
    const save = () => persist({values: values.slice(), notes: notes.map(set => [...set]), removed: removed.map(set => [...set]), auto});
    function snapshot() { history.push({values: values.slice(), notes: notes.map(set => new Set(set)), removed: removed.map(set => new Set(set))}); if (history.length > 50) history.shift(); }

    const root = make('div', {'data-sudoku-practice': ''});
    const board = make('div', {class: 'su-board', role: 'grid', 'aria-label': 'Original Sudoku practice grid'});
    const cells = Array.from({length: 81}, (_, i) => {
      const cell = make('div', {role: 'gridcell', 'data-cell': i, 'aria-colindex': i % 9 + 1, tabindex: -1});
      cell.addEventListener('click', () => select(i, true));
      return cell;
    });
    const layer = make('div', {role: 'presentation', class: 'su-practice-layer'});
    board.append(...cells, layer);
    const normal = make('button', {type: 'button', 'data-testid': 'normal-mode', class: 'su-keyboard__mode normal', 'aria-pressed': 'true'}, 'Normal');
    const candidate = make('button', {type: 'button', 'data-testid': 'candidate-mode', class: 'su-keyboard__mode candidate', 'aria-pressed': 'false'}, 'Candidate');
    normal.addEventListener('click', () => { candidateMode = false; paint(); });
    candidate.addEventListener('click', () => { candidateMode = true; paint(); });
    const container = make('div', {class: 'su-keyboard__container'});
    for (let n = 1; n <= 9; n++) {
      const key = make('button', {type: 'button', class: 'su-keyboard__number', 'aria-label': `Number ${n}`}, String(n));
      key.addEventListener('click', () => enter(n));
      container.append(key);
    }
    const erase = make('button', {type: 'button', class: 'su-keyboard__delete', 'aria-label': 'Delete'}, 'Delete');
    const undo = make('button', {type: 'button', class: 'su-keyboard__undo'}, 'Undo');
    erase.addEventListener('click', clear);
    undo.addEventListener('click', () => {
      const last = history.pop(); if (!last) return;
      values.splice(0, 81, ...last.values); last.notes.forEach((set, i) => { notes[i] = set; }); last.removed.forEach((set, i) => { removed[i] = set; });
      save(); paint();
    });
    const autoInput = make('input', {type: 'checkbox', class: 'su-keyboard__checkbox', name: 'lightenComplete', 'data-testid': 'sudoku-keyboard-checkbox'});
    autoInput.checked = auto;
    autoInput.addEventListener('change', () => { auto = autoInput.checked; save(); paint(); });
    const autoLabel = make('label', {class: 'su-keyboard__auto'}, autoInput, 'Auto candidate');
    container.append(erase, undo, autoLabel);
    const keyboard = make('div', {class: 'su-keyboard'}, make('div', {}, make('div', {class: 'su-keyboard__split'}, normal, candidate)), container);
    root.append(make('style', {}, CSS), board, keyboard);
    host.append(root);

    function select(index, focus = false) { active = index; paint(); if (focus) cells[index].focus({preventScroll: true}); }
    function toggleCandidate(i, d) {
      if (digitAt(i)) return;
      snapshot();
      if (auto) { if (!possible(i).includes(d)) { history.pop(); return; } removed[i].has(d) ? removed[i].delete(d) : removed[i].add(d); }
      else notes[i].has(d) ? notes[i].delete(d) : notes[i].add(d);
      save(); paint();
    }
    function enter(d) {
      if (givens[active] !== '0') return;
      if (candidateMode) { toggleCandidate(active, d); return; }
      snapshot(); values[active] = String(d); save(); paint();
    }
    function clear() {
      if (givens[active] !== '0') return;
      snapshot();
      if (values[active]) values[active] = '';
      else if (!auto) notes[active].clear();
      save(); paint();
    }
    function paint() {
      normal.setAttribute('aria-pressed', String(!candidateMode));
      candidate.setAttribute('aria-pressed', String(candidateMode));
      cells.forEach((cell, i) => {
        const value = digitAt(i), given = givens[i] !== '0';
        cell.className = `su-cell${given ? ' prefilled' : ''}${i === active ? ' selected' : ''}`;
        cell.setAttribute('aria-label', `Row ${Math.floor(i / 9) + 1}, column ${i % 9 + 1}, ${given ? `prefilled ${value}` : value || 'empty'}`);
        cell.tabIndex = i === active ? 0 : -1;
        cell.replaceChildren(...(value ? [make('span', {class: 'su-cell__value'}, value)] : []));
      });
      // Like the real game, every square's candidate group starts at the board's
    // corner and each digit is positioned inside its square. Rebuilt on every change.
      layer.replaceChildren(...cells.map((_, i) => i).filter(i => !digitAt(i)).map(i => {
        const group = make('div', {class: `su-candidates${i === active ? ' selected' : ''}`, 'data-testid': 'su-candidates'});
        const digit = (d, cls) => {
          const svg = make('svg', {class: cls, viewBox: '0 0 20 20', 'data-candidate': d, 'data-number': d}, make('text', {x: 10, y: 14, 'text-anchor': 'middle'}, String(d)));
          svg.style.setProperty('--x', String(i % 9 * 3 + (d - 1) % 3)); svg.style.setProperty('--y', String(Math.floor(i / 9) * 3 + Math.floor((d - 1) / 3)));
          if (cls === 'su-candidate-button') svg.addEventListener('click', () => { if (i === active) toggleCandidate(i, d); });
          return svg;
        };
        group.append(...shown(i).map(d => digit(d, 'su-candidate')));
        if (i === active) for (let d = 1; d <= 9; d++) group.append(digit(d, 'su-candidate-button'));
        return group;
      }));
    }
    const ignored = event => event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input,textarea,select,[contenteditable=true],#margin-host,[data-margin-inline],[data-margin-overlay],a,dialog');
    function key(event) {
      if (ignored(event)) return;
      if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); clear(); }
      else if (/^Arrow/.test(event.key)) {
        const next = active + {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9}[event.key];
        if (next >= 0 && next < 81) { event.preventDefault(); select(next, true); }
      }
    }
    document.addEventListener('keydown', key);
    paint();
    return {root, board, cells, keyboard, normal, candidate, autoInput, autoLabel, erase, undo, select, shown, paint,
      state: () => ({values: values.slice(), active, candidateMode, auto}),
      destroy() { document.removeEventListener('keydown', key); root.remove(); }};
  }
  window.MarginSudokuBoard = {build, GIVENS};
})();
