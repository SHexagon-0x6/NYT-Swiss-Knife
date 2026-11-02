(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;

  // These adapters use only rendered squares and their printed numbers.
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function rendered(node) {
    if (!node?.isConnected || !node.getClientRects().length || node.closest('[hidden],#margin-host,[data-margin-inline],[data-margin-overlay]')) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function numberOf(node) {
    const explicitNumber = clean(node.getAttribute('data-number') || node.getAttribute('data-cell-number'));
    if (/^[1-9]\d{0,2}$/.test(explicitNumber)) return Number(explicitNumber);
    // Native SVGs can use the same test id for the entered letter and printed
    // clue number. Find the numeric label rather than depending on DOM order.
    const labels = node.querySelectorAll('[data-testid="cell-number"],[data-cell-number],text[class*="Cell-label"],text[class*="Cell_label"],text[class*="cell-number"],text[data-testid="cell-text"]');
    for (const label of labels) {
      const value = clean(label.textContent);
      if (rendered(label) && /^[1-9]\d{0,2}$/.test(value)) return Number(value);
    }
    const explicit = (node.getAttribute('aria-label') || '').match(/\b(?:clue\s+)?number\s+(\d+)\b/i);
    return explicit ? Number(explicit[1]) : null;
  }
  function isBlock(node, rect) {
    if (/^(?:true|1)$/.test(node.getAttribute('data-block') || '') || /^(?:true|1)$/.test(node.getAttribute('data-is-block') || '') || /^(?:block|black)$/.test(node.getAttribute('data-cell-type') || '')) return true;
    if (/\b(?:black|blocked)\s+(?:square|cell)\b/i.test(node.getAttribute('aria-label') || '')) return true;
    if (/(?:^|[\s_-])(?:block|black|blocked)(?:[\s_-]|$)/i.test(`${node.getAttribute('class') || ''} ${rect?.getAttribute('class') || ''}`)) return true;
    if (!rect && (node.getAttribute('data-block') === 'false' || node.getAttribute('data-is-block') === 'false' || node.getAttribute('role') === 'gridcell')) return false;
    const color = rect ? getComputedStyle(rect).fill : getComputedStyle(node).backgroundColor;
    const alpha = color.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
    if (alpha && Number(alpha[1]) < .95) return false;
    const fill = color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    return !!fill && fill.slice(1).every(channel => Number(channel) <= 40);
  }
  function coordinateGrid(nodes, root) {
    const cells = nodes.filter(rendered).map(node => {
      const row = Number(node.getAttribute('data-row') ?? node.getAttribute('aria-rowindex'));
      const col = Number(node.getAttribute('data-col') ?? node.getAttribute('aria-colindex'));
      return { node, row, col, number: numberOf(node), block: isBlock(node, node.querySelector('rect')) };
    });
    if (!cells.length || cells.some(cell => !Number.isInteger(cell.row) || !Number.isInteger(cell.col))) return null;
    const minRow = Math.min(...cells.map(cell => cell.row)), minCol = Math.min(...cells.map(cell => cell.col));
    cells.forEach(cell => { cell.row -= minRow; cell.col -= minCol; });
    const size = Math.max(...cells.map(cell => cell.row)) + 1;
    if (size < 2 || size > 30 || Math.max(...cells.map(cell => cell.col)) + 1 !== size || cells.length !== size * size) return null;
    const indices = new Set(cells.map(cell => cell.row * size + cell.col));
    if (indices.size !== cells.length) return null;
    cells.sort((a, b) => a.row * size + a.col - b.row * size - b.col);
    return { cells, root, size };
  }
  function geometricGrid(nodes, root) {
    const cells = nodes.filter(rendered).map(node => {
      const rect = node.matches('rect') ? node : Array.from(node.querySelectorAll('rect')).find(rect => rendered(rect) && rect.getBoundingClientRect().width > 4);
      const box = rect?.getBoundingClientRect();
      return { node, rect, box, number: numberOf(node), block: isBlock(node, rect) };
    });
    const size = Math.sqrt(cells.length);
    if (!Number.isInteger(size) || size < 2 || size > 30 || cells.some(cell => !cell.box || cell.box.width < 4 || cell.box.height < 4)) return null;
    const width = cells[0].box.width, height = cells[0].box.height;
    if (width / height < .8 || width / height > 1.2 || cells.some(cell => Math.abs(cell.box.width - width) > width * .2 || Math.abs(cell.box.height - height) > height * .2)) return null;
    function positions(values, tolerance) {
      const result = [];
      values.sort((a, b) => a - b).forEach(value => { if (!result.some(previous => Math.abs(previous - value) <= tolerance)) result.push(value); });
      return result;
    }
    const xs = positions(cells.map(cell => cell.box.left), width * .15);
    const ys = positions(cells.map(cell => cell.box.top), height * .15);
    if (xs.length !== size || ys.length !== size) return null;
    cells.forEach(cell => { cell.col = xs.findIndex(value => Math.abs(value - cell.box.left) <= width * .15); cell.row = ys.findIndex(value => Math.abs(value - cell.box.top) <= height * .15); });
    if (new Set(cells.map(cell => cell.row * size + cell.col)).size !== cells.length) return null;
    cells.sort((a, b) => a.row * size + a.col - b.row * size - b.col);
    return { cells, root, size };
  }
  function readGrid() {
    const preview = document.querySelector('[data-margin-game="crossword"]');
    if (preview) return coordinateGrid(Array.from(preview.querySelectorAll('[data-margin-crossword-cell][data-row][data-col]')), preview);
    for (const root of document.querySelectorAll('[role="grid"]')) {
      const native = nativeAriaGrid(root);
      if (native) return native;
      const nodes = Array.from(root.querySelectorAll('[role="gridcell"][aria-rowindex][aria-colindex]'));
      if (nodes.length) { const grid = coordinateGrid(nodes, root); if (grid) return grid; }
    }
    for (const root of document.querySelectorAll('svg [data-group="cells"],svg [data-testid="crossword-cells"]')) {
      const nodes = Array.from(root.querySelectorAll('[data-group="cell"],[data-testid="crossword-cell"]'));
      const grid = geometricGrid(nodes, root.closest('svg'));
      if (grid) return grid;
    }
    for (const svg of document.querySelectorAll('svg')) {
      const nodes = Array.from(new Set(Array.from(svg.querySelectorAll('rect[class*="Cell-cell"],rect[class*="Cell_cell"]')).map(rect => rect.parentElement)));
      const grid = geometricGrid(nodes, svg);
      if (grid) return grid;
    }
    return null;
  }
  function nativeAriaGrid(root) {
    const size = Number(root.getAttribute('aria-rowcount'));
    if (!Number.isInteger(size) || size < 2 || size > 30 || Number(root.getAttribute('aria-colcount')) !== size) return null;
    const rows = Array.from(root.querySelectorAll('[role="row"]')).filter(row => row.closest('[role="grid"]') === root);
    if (rows.length !== size) return null;
    const cells = [];
    for (let row = 0; row < size; row++) {
      const nodes = Array.from(rows[row].children).filter(node => node.matches('[data-testid="cell-g"]'));
      if (nodes.length !== size) return null;
      for (let col = 0; col < size; col++) {
        const node = nodes[col], role = node.getAttribute('role'), rect = node.querySelector('rect');
        if (!rendered(node) || !rect) return null;
        const block = isBlock(node, rect);
        if (role === 'gridcell') {
          if (block || Number(node.getAttribute('aria-rowindex')) !== row + 1 || Number(node.getAttribute('aria-colindex')) !== col + 1) return null;
        } else if (role !== 'presentation' || !block) return null;
        cells.push({ node, row, col, block, number: block ? null : numberOf(node) });
      }
    }
    return { cells, root, size };
  }
  function visuallyReadable(node) {
    if (!rendered(node)) return false;
    for (let current = node; current?.nodeType === 1; current = current.parentElement) {
      if (/(?:^|[\s_-])obscured(?:[\s_-]|$)/i.test(current.getAttribute('class') || '')) return false;
      const style = getComputedStyle(current);
      if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
      const blur = style.filter.match(/blur\(\s*([\d.]+)/i);
      if (blur && Number(blur[1]) > 0) return false;
    }
    return true;
  }
  function squareLetter(cell){
    if(!cell)return null;
    const explicit=cell.node.getAttribute('data-letter');if(explicit!==null)return explicit.trim().toUpperCase();
    const input=cell.node.matches('input')?cell.node:cell.node.querySelector('input');if(input)return input.value.trim().toUpperCase();
    const ownText=node=>clean([...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).join('')).toUpperCase();
    const value=cell.node.querySelector('[data-margin-crossword-value],.crossword-letter,[data-testid="cell-value"],.xwd__cell--letter');if(value)return ownText(value);
    const letters=[...cell.node.querySelectorAll('text,span')].filter(node=>rendered(node)&&!node.closest('.xwd__cell--hidden')).map(ownText).filter(text=>/^[A-Z]+$/.test(text));
    if(letters.length===1)return letters[0];
    const text=ownText(cell.node);return /^[A-Z]$/.test(text)?text:letters.length?null:'';
  }
  function installCandidateNotes(ctx, { controls, selectedCell, available, modalOpen, pause, listen }) {
    const { el, state } = ctx, history = [], suppressed = new Set();
    const enabled = () => ctx.feature ? ctx.feature('candidateNotes', true) : true;
    const notes = () => state.crossword.candidates || {};
    const keyOf = cell => `${cell.row}:${cell.col}`;
    const letters = cell => [...new Set((Array.isArray(notes()[keyOf(cell)]) ? notes()[keyOf(cell)] : []).filter(value => /^[A-Z]$/.test(value)))].sort();
    let active = false, grid = null, parent = null, previous = null, drawn = '';
    const overlay = el('div', { id: 'margin-crossword-candidates', 'data-margin-overlay': 'crossword-candidates', 'aria-hidden': 'true', hidden: true });
    Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10' });
    const shadow = overlay.attachShadow({ mode: ctx.shadowMode || (ctx.isPreview ? 'open' : 'closed') });
    shadow.append(el('style', { textContent: ':host{all:initial;pointer-events:none}:host([hidden]){display:none!important}.note{box-sizing:border-box;position:absolute;display:grid;align-content:center;justify-content:center;gap:0 2px;color:#333;font-family:Arial,Helvetica,sans-serif;font-weight:400;text-align:center;pointer-events:none}.note span{min-width:0}' }));
    const layer = el('div'); shadow.append(layer);
    const status = el('span', { className: 'mc-cycle-status', role: 'status', 'aria-live': 'polite' });
    const toggle = el('button', { type: 'button', 'data-notes-action': 'toggle', 'aria-label': 'Notes', textContent: 'Notes', 'aria-pressed': 'false', onClick: () => setActive(!active) });
    function focusCell() { selectedCell()?.node.focus?.({ preventScroll: true }); }
    function action(name, label, path, callback) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path); svg.append(shape);
      return el('button', { type: 'button', className: 'mc-notes-action', 'data-notes-action': name, 'aria-label': label, title: label, onClick: () => { if (!modalOpen()) callback(); focusCell(); } }, svg);
    }
    function change(next, message) {
      if (JSON.stringify(next) === JSON.stringify(notes())) return;
      history.push(JSON.parse(JSON.stringify(notes()))); if (history.length > 30) history.shift();
      state.crossword.candidates = next; ctx.save(); status.textContent = message; refresh(grid);
    }
    function erase() {
      const cell = selectedCell(); if (!available(cell) || !letters(cell).length) return;
      const next = { ...notes() }; delete next[keyOf(cell)]; change(next, 'Candidates erased');
    }
    function undo() {
      if (!history.length) return;
      state.crossword.candidates = history.pop(); ctx.save(); status.textContent = 'Candidate change undone'; refresh(grid);
    }
    const undoButton = action('undo', 'Undo candidate change', 'M7 3 1 8l6 5V9h5a4 4 0 0 1 0 8H9v2h3a6 6 0 0 0 0-12H7Z', undo);
    const eraseButton = action('erase', 'Erase candidates in this square', 'm12 2 7 7-9 9H5l-5-5Zm-9 11 3 3h3l3-3-5-5Z', erase);
    const clearButton = action('clear', 'Clear all candidates', 'M7 1h6v2h5v2H2V3h5ZM4 7h12l-1 12H5Zm3 2v8h2V9Zm4 0v8h2V9Z', () => change({}, 'All candidates cleared'));
    controls.append(toggle, undoButton, eraseButton, clearButton, status);
    function setActive(value) {
      if (value && (!enabled() || !available(selectedCell()))) return false;
      if (value) pause();
      active = value; status.textContent = value ? 'Candidate letters on. Type letters to add or remove them.' : 'Candidate letters off';
      refresh(grid); focusCell(); return true;
    }
    function detach() {
      overlay.remove();
      if (parent && previous) {
        if (parent.style.isolation === 'isolate') parent.style.isolation = previous.isolation;
        if (previous.positionChanged && parent.style.position === 'relative') parent.style.position = previous.position;
      }
      parent = null; previous = null; drawn = '';
    }
    function refresh(value) {
      grid = value;
      if (!enabled() || !grid) active = false;
      toggle.hidden = !enabled(); toggle.setAttribute('aria-pressed', String(active));
      const shortcut = ctx.shortcutLabel?.('candidates');
      toggle.title = `Candidate letters${shortcut && shortcut !== 'Off' ? ` (${shortcut})` : ''}`;
      for (const button of [undoButton, eraseButton, clearButton]) button.hidden = !active;
      undoButton.disabled = !history.length;
      const selected = selectedCell();
      eraseButton.disabled = !selected || !letters(selected).length;
      clearButton.disabled = !Object.keys(notes()).length;
      overlay.hidden = !enabled() || !grid || modalOpen() || !visuallyReadable(grid.root) || document.visibilityState === 'hidden';
      if (overlay.hidden) return;
      if (!Object.keys(notes()).length) { if (drawn) layer.replaceChildren(); drawn = ''; return; }
      const anchor = (grid.root.closest('svg') || grid.root).parentElement;
      if (!anchor || anchor === document.body || anchor === document.documentElement) { overlay.hidden = true; return; }
      if (parent !== anchor) {
        detach(); parent = anchor;
        previous = { position: parent.style.position, isolation: parent.style.isolation, positionChanged: getComputedStyle(parent).position === 'static' };
        if (previous.positionChanged) parent.style.position = 'relative';
        parent.style.isolation = 'isolate'; parent.append(overlay);
      }
      const origin = overlay.getBoundingClientRect(), scaleX = origin.width / overlay.offsetWidth || 1, scaleY = origin.height / overlay.offsetHeight || 1;
      const marks = grid.cells.filter(cell => !cell.block && letters(cell).length && squareLetter(cell) === '').map(cell => {
        const box = (cell.node.querySelector('rect') || cell.node).getBoundingClientRect();
        return { letters: letters(cell), key: keyOf(cell), x: (box.left-origin.left)/scaleX, y: (box.top-origin.top)/scaleY, width: box.width/scaleX, height: box.height/scaleY };
      });
      const signature = JSON.stringify(marks); if (signature === drawn) return; drawn = signature;
      layer.replaceChildren(...marks.map(mark => {
        const columns = Math.ceil(Math.sqrt(mark.letters.length)), rows = Math.ceil(mark.letters.length/columns);
        const size = Math.max(5, Math.min(14, mark.width/(columns+1), mark.height*.65/rows));
        const node = el('div', { className: 'note', 'data-square': mark.key }, ...mark.letters.map(letter => el('span', { textContent: letter })));
        Object.assign(node.style, { left: `${mark.x}px`, top: `${mark.y}px`, width: `${mark.width}px`, height: `${mark.height}px`, padding: `${mark.height*.18}px 2px 0`, gridTemplateColumns: `repeat(${columns},1fr)`, fontSize: `${size}px`, lineHeight: `${size*1.1}px` });
        return node;
      }));
    }
    const unbind = ctx.bindShortcut?.(() => setActive(!active), 'candidates');
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    listen(window, 'keydown', event => {
      if (!active || event.isComposing || event.composedPath().some(node => node?.isContentEditable || node?.matches?.('#margin-host,[data-margin-inline],[data-margin-overlay],input,textarea,select,[contenteditable]')) || !available(selectedCell())) return;
      const undoKey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z';
      if (!undoKey && (event.ctrlKey || event.metaKey || event.altKey)) return;
      if (!undoKey && !/^(?:[a-z]|Backspace|Delete|Escape)$/i.test(event.key)) return;
      consume(event); suppressed.add(event.code || event.key);
      if (event.repeat) return;
      if (event.key === 'Escape') { setActive(false); return; }
      if (undoKey) { undo(); return; }
      const cell = selectedCell();
      if (squareLetter(cell) !== '') { status.textContent = 'Select an empty square for candidates'; return; }
      if (/^(?:Backspace|Delete)$/.test(event.key)) { erase(); return; }
      const letter = event.key.toUpperCase(), values = new Set(letters(cell));
      if (values.has(letter)) values.delete(letter); else values.add(letter);
      const next = { ...notes() }; if (values.size) next[keyOf(cell)] = [...values].sort(); else delete next[keyOf(cell)];
      change(next, values.size ? `Candidates: ${[...values].sort().join(', ')}` : 'Candidates erased');
    }, true);
    for (const type of ['keypress', 'keyup']) listen(window, type, event => {
      if (!suppressed.has(event.code || event.key)) return;
      consume(event); if (type === 'keyup') suppressed.delete(event.code || event.key);
    }, true);
    listen(window, 'blur', () => suppressed.clear());
    return { refresh, exit() { if (active) setActive(false); }, destroy() { unbind?.(); detach(); } };
  }

  function mount(ctx) {
    const { el, state } = ctx;
    // Retain older notebook entries alongside the new per-square candidates.
    state.crossword ||= {};
    const enabled = () => ctx.feature ? ctx.feature('letterCycle', true) : true;
    const OWN = '#margin-host,[data-margin-inline],[data-margin-overlay]';
    const SELECTED = '[aria-selected="true"],[data-selected="true"],[class*="Cell-selected"],[class*="Cell_selected"],.xwd__cell--selected';
    // A short yield keeps input responsive. Each trial still waits for the
    // native letter and selection updates before moving to the next letter.
    const INTERVAL = 20;
    let destroyed = false, grid = null, target = null, phase = 'idle', next = 0;
    let timer = null, operation = null, pendingTrial = null, replaying = false, lastTypedAt = 0, refreshTimer = null;
    let followSelection = true;
    const listeners = [];
    const listen = (node, name, callback, options) => {
      node.addEventListener(name, callback, options);
      listeners.push(() => node.removeEventListener(name, callback, options));
    };
    const host = el('div', { id: 'margin-crossword-cycle', 'data-margin-overlay': 'crossword-cycle', hidden: true });
    Object.assign(host.style, { position: 'fixed', zIndex: '1', width: 'max-content' });
    const root = host.attachShadow({ mode: ctx.shadowMode || (ctx.isPreview ? 'open' : 'closed') });
    root.append(el('style', { textContent: ':host{all:initial;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.mc-cycle{display:flex;align-items:center;gap:0;padding:0;border:0;border-radius:0;background:transparent;color:#121212;font:400 var(--toolbar-size,14px) var(--toolbar-font,Arial,sans-serif)}.mc-cycle button{display:flex;align-items:center;gap:5px;justify-content:center;height:var(--toolbar-height,48px);min-width:40px;border:0;border-radius:0;padding:0 10px;background:transparent;color:inherit;font:inherit;cursor:pointer}.mc-cycle [data-cycle-action="toggle"],.mc-cycle [data-notes-action="toggle"]{width:var(--toolbar-width,auto)}.mc-cycle button:hover{background:#f1f1f1}.mc-cycle button:focus-visible{outline:2px solid #4b83b4;outline-offset:2px}.mc-cycle svg{width:12px;height:12px;fill:currentColor}.mc-cycle-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}' }));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 12 12'); icon.setAttribute('aria-hidden', 'true');
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'path'); icon.append(symbol);
    const toggle = el('button', { type: 'button', 'data-cycle-action': 'toggle', 'aria-label': 'Try A–Z', onClick: () => {
      if (phase === 'running') { pause(); return; }
      if (!enabled()) return;
      refresh();
      if (!target || !available(currentCell())) return;
      if (phase !== 'paused') { next = 0; lastTypedAt = 0; }
      candidates.exit(); followSelection = false;
      phase = 'running'; paint(); step();
    } }, icon, el('span', { textContent: 'A–Z' }));
    const stop = el('button', { type: 'button', 'data-cycle-action': 'stop', 'aria-label': 'Stop A–Z', textContent: '×', hidden: true, onClick: () => {
      pause(); phase = 'idle'; next = 0;
      if (pendingTrial) pendingTrial.restart = true;
      paint();
    } });
    const status = el('span', { className: 'mc-cycle-status', role: 'status', 'aria-live': 'polite' });
    const controls = el('div', { className: 'mc-cycle', role: 'group', 'aria-label': 'Crossword tools' }, toggle, stop, status);
    root.append(controls); document.documentElement.append(host);
    root.append(el('style', { textContent: '.mc-cycle button[aria-pressed="true"]{background:#121212;color:white}.mc-cycle button:disabled{opacity:.35;cursor:default}.mc-cycle .mc-notes-action{min-width:28px;padding:0 6px}.mc-cycle .mc-notes-action svg{width:16px;height:16px}' }));
    for (const name of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'click']) listen(root, name, event => event.stopPropagation());

    function signature(value) {
      return JSON.stringify([location.href, document.querySelector('[data-puzzle-id]')?.getAttribute('data-puzzle-id'), value.size, value.cells.map(cell => [cell.row, cell.col, cell.number, cell.block])]);
    }
    function selectedCell(value = grid) {
      return value?.cells.find(cell => !cell.block && (cell.node.matches(SELECTED) || cell.node.querySelector(SELECTED)));
    }
    function currentCell(value = grid) {
      return target && value?.root === target.root && signature(value) === target.signature ? value.cells.find(cell => cell.row === target.row && cell.col === target.col) : null;
    }
    function activeDialogs() {
      const dialogs = Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],[data-margin-complete="true"],.xwd__modal--content')).filter(node =>
        !node.closest(OWN) && rendered(node) && getComputedStyle(node).opacity !== '0');
      return dialogs.filter(node => !dialogs.some(other => other !== node && other.contains(node)));
    }
    const dismissedResults = new WeakMap();
    function dismissIncorrectResult() {
      const job = pendingTrial || operation, cell = currentCell(), dialogs = activeDialogs();
      if (phase !== 'running' || !enabled() || !job?.letter || !cell || letterOf(cell) !== job.letter || dialogs.length !== 1 || !grid.cells.every(square => square.block || !!letterOf(square))) return false;
      const dialog = dialogs[0], text = dialog.innerText.replace(/\s+/g,' ');
      if (!/not quite|not (?:correct|right)|incorrect|at least one (?:square|letter)\b[^.!?]*(?:wrong|incorrect|amiss)/i.test(text) || /congratulations|you (?:have )?solved/i.test(text)) return false;
      const buttons = [...dialog.querySelectorAll('button,[role="button"]')].filter(button => rendered(button) && /^(?:ok|okay|keep trying|continue)$/i.test(button.innerText.trim()));
      if (buttons.length !== 1) return false;
      const button = buttons[0], first = dismissedResults.get(button);
      if (first?.job === job) return Date.now()-first.at < 1500;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
      dismissedResults.set(button,{job,at:Date.now()});
      native(() => button.click());
      return true;
    }
    function modalOpen() {return activeDialogs().length > 0;}
    function available(cell) {
      if (!cell || cell.block || !visuallyReadable(cell.node) || modalOpen() || document.visibilityState === 'hidden') return false;
      if (cell.node.closest('[inert],[aria-disabled="true"],[data-readonly="true"]') || cell.node.matches(':disabled,[readonly],[aria-readonly="true"]')) return false;
      if (cell.node.querySelector('input:disabled,input[readonly],input[aria-readonly="true"]')) return false;
      const rect = cell.node.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return hit === cell.node || cell.node.contains(hit);
    }
    const letterOf=squareLetter;
    function paint() {
      host.dataset.state = phase;
      const running = phase === 'running', paused = phase === 'paused';
      toggle.hidden = !enabled();
      toggle.setAttribute('aria-label', running ? 'Pause A–Z' : paused ? 'Resume A–Z' : 'Try A–Z');
      toggle.title = running ? 'Pause letter trials' : paused ? `Resume at ${String.fromCharCode(65 + next)}` : 'Try A to Z in this square';
      symbol.setAttribute('d', running ? 'M2 1h3v10H2zM7 1h3v10H7z' : 'M3 1 11 6 3 11Z');
      stop.hidden = !running && !paused;
      status.textContent = running ? `Trying ${String.fromCharCode(65 + Math.min(next, 25))} in the selected square` : paused ? 'Paused' : phase === 'done' ? 'Finished at Z' : '';
      place();
    }
    function place() {
      const rebus=ctx.nativeControl?.(/^Rebus(?: |$)/i)||[...document.querySelectorAll('button')].find(node=>rendered(node)&&/^rebus$/i.test(node.getAttribute('aria-label')||node.textContent.trim()));
      const anchor=rebus?.closest('li')||rebus;
      if(anchor){
        if(host.parentNode!==anchor.parentNode||host.nextSibling!==anchor)anchor.before(host);
        Object.assign(host.style,{position:'relative',zIndex:'auto',left:'auto',top:'auto',margin:'0',alignSelf:'center',flex:'0 0 auto'});
        const nativeStyle=getComputedStyle(rebus), nativeBox=rebus.getBoundingClientRect();
        host.style.setProperty('--toolbar-width',`${nativeBox.width}px`);
        host.style.setProperty('--toolbar-font',nativeStyle.fontFamily);host.style.setProperty('--toolbar-size',`${Math.max(14,parseFloat(nativeStyle.fontSize)||16)}px`);host.style.setProperty('--toolbar-height',`${Math.max(40,nativeBox.height)}px`);
        return;
      }
      host.style.removeProperty('--toolbar-width');
      if(host.hidden||!grid?.cells.length)return;
      const boxes=grid.cells.map(cell=>cell.node.getBoundingClientRect());
      const top=Math.min(...boxes.map(box=>box.top)),left=Math.min(...boxes.map(box=>box.left));
      Object.assign(host.style,{position:'fixed',zIndex:'1',left:`${Math.max(8,left)}px`,top:`${Math.max(8,top-40)}px`});
    }
    function pause(message) {
      clearTimeout(timer); timer = null; operation = null;
      if (phase === 'running') phase = 'paused';
      if (message) ctx.notice(message);
      paint();
    }
    function native(action) {
      replaying = true;
      try { action(); } finally { replaying = false; }
    }
    function select(cell) {
      const rect = cell.node.getBoundingClientRect();
      native(() => cell.node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 })));
    }
    function later(callback, delay) {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; if (!destroyed && phase === 'running') callback(); }, delay);
    }
    function waitFor(job, check, done) {
      if (destroyed || phase !== 'running' || operation !== job) return;
      grid = readGrid();
      const cell = currentCell();
      if (dismissIncorrectResult()) {later(() => waitFor(job,check,done),40);return;}
      if (!enabled() || !available(cell)) { pause(); return; }
      if (check(cell)) { done(cell); return; }
      if (Date.now() >= job.deadline) {
        // A solved board can stop accepting keys before congratulations opens.
        const filled = grid?.cells.every(square => square.block || !!letterOf(square));
        pause(filled ? undefined : 'The game did not accept the letter trial. Select the square and try again.'); return;
      }
      later(() => waitFor(job, check, done), 20);
    }
    function ensureSelected(job, done) {
      const cell = currentCell();
      if (!available(cell)) { pause(); return; }
      if (selectedCell()?.node === cell.node) { done(cell); return; }
      job.deadline = Date.now() + 600;
      select(cell);
      waitFor(job, selected => selectedCell()?.node === selected.node, done);
    }
    function finishTrial(job) {
      operation = job;
      waitFor(job, square => letterOf(square) === job.letter, () => {
        pendingTrial = null;
        next = job.restart ? 0 : job.index + 1;
        // Keep this operation active through the interval: native games can
        // render the letter and auto-advance in separate updates. Every next
        // step reselects the original square before sending its key.
        ensureSelected(job, () => {
          if (next >= 26) { phase = 'done'; operation = null; paint(); }
          else { paint(); later(step, Math.max(0, INTERVAL - (Date.now() - lastTypedAt))); }
        });
      });
    }
    function step() {
      if (destroyed || phase !== 'running') return;
      grid = readGrid();
      const cell = currentCell();
      if (dismissIncorrectResult()) {later(step,40);return;}
      if (!enabled() || !available(cell)) { pause(); return; }
      if (pendingTrial) { finishTrial(pendingTrial); return; }
      if (next >= 26) { phase = 'done'; operation = null; paint(); return; }
      const delay = Math.max(0, INTERVAL - (Date.now() - lastTypedAt));
      if (delay) { later(step, delay); return; }
      const job = { index: next, letter: String.fromCharCode(65 + next), deadline: Date.now() + 600 };
      operation = job;
      ensureSelected(job, selected => {
        if (phase !== 'running' || operation !== job || !available(selected)) return;
        const previous = letterOf(selected);
        if (previous === null || previous.length > 1) { pause('Select a square that holds one letter.'); return; }
        // Re-entering the same letter cannot be distinguished from an old
        // render. Skip it so a delayed native auto-advance cannot spill input.
        if (previous === job.letter) { next = job.index + 1; operation = null; paint(); later(step, INTERVAL); return; }
        lastTypedAt = Date.now();
        pendingTrial = job;
        native(() => {
          const input = selected.node.matches('input') ? selected.node : selected.node.querySelector('input:not([readonly]):not(:disabled)');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, job.letter);
            input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: job.letter }));
          } else {
            selected.node.focus?.({ preventScroll: true });
            const event = { key: job.letter.toLowerCase(), code: `Key${job.letter}`, keyCode: job.letter.charCodeAt(0), which: job.letter.charCodeAt(0), bubbles: true, cancelable: true, composed: true };
            const accepted = selected.node.dispatchEvent(new KeyboardEvent('keydown', event));
            if (accepted) selected.node.dispatchEvent(new KeyboardEvent('keypress', { ...event, charCode: event.key.charCodeAt(0), keyCode: event.key.charCodeAt(0), which: event.key.charCodeAt(0) }));
            selected.node.dispatchEvent(new KeyboardEvent('keyup', event));
          }
        });
        job.deadline = Date.now() + 600;
        finishTrial(job);
      });
    }
    function refresh() {
      if (destroyed) return;
      grid = readGrid(); candidates.refresh(grid);
      const selected = selectedCell();
      if (!enabled()) { pause(); phase = 'idle'; next = 0; target = null; pendingTrial = null; followSelection = true; }
      if (target && !currentCell()) { pause(); phase = 'idle'; next = 0; target = null; pendingTrial = null; followSelection = true; }
      if (phase === 'running' && dismissIncorrectResult()) {paint();return;}
      if (phase === 'running' && (!available(currentCell()) || !operation && selected?.node !== currentCell()?.node)) pause();
      if (phase !== 'running' && selected && (!target || followSelection && (selected.row !== target.row || selected.col !== target.col))) {
        target = { root: grid.root, signature: signature(grid), row: selected.row, col: selected.col };
        phase = 'idle'; next = 0; pendingTrial = null;
      }
      host.hidden = (!enabled() && ctx.feature?.('candidateNotes', true) === false) || !target || !rendered(currentCell()?.node);
      paint();
    }
    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 0);
    }
    function userAction(event) {
      if (replaying || destroyed || event.composedPath().includes(host)) return;
      if (phase === 'running') pause();
      const button = event.target.closest?.('button,[role="button"]');
      if (event.type === 'click' && /^pencil(?: |$)/i.test(button?.getAttribute('aria-label') || button?.textContent.trim() || '')) candidates.exit();
      // Only deliberate board interaction releases the pinned target. A late
      // native auto-advance after Pause must not silently choose its neighbor.
      const editable = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      const gameKey = event.type === 'keydown' && !editable && /^(?:[a-z]|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace|Delete|Tab|Home|End| )$/i.test(event.key);
      const clue = event.target.closest?.('[data-margin-clue-number],[data-testid="clue"],[class*="Clue-li"],[class*="Clue_li"],[class*="xwd__clue"]');
      if (event.type !== 'focusin' && (grid?.root.contains(event.target) || gameKey || clue)) {
        followSelection = true;
        pendingTrial = null;
      }
      scheduleRefresh();
    }
    listen(window, 'pointerdown', userAction, true);
    listen(window, 'click', userAction, true);
    listen(window, 'keydown', event => {
      if (replaying || event.composedPath().includes(host)) return;
      if (event.key === 'Escape' || !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) userAction(event);
    }, true);
    listen(window, 'focusin', event => { if (!operation) userAction(event); }, true);
    listen(window, 'blur', () => pause());
    listen(window, 'pagehide', () => { pause(); target = null; pendingTrial = null; host.hidden = true; });
    listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') pause(); candidates.refresh(grid); });
    listen(window, 'resize', () => { place(); candidates.refresh(grid); }); listen(window, 'scroll', () => { place(); candidates.refresh(grid); }, true);
    const observer = new MutationObserver(records => {
      if (records.some(record => !(record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest(OWN))) scheduleRefresh();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['aria-selected', 'data-selected', 'aria-disabled', 'aria-readonly', 'data-puzzle-id', 'data-letter', 'class', 'hidden', 'open', 'aria-hidden'] });
    const unbindShortcut=ctx.bindShortcut?.(()=>{
      const pencil=ctx.nativeControl?.(/^Pencil(?: |$)/i)||[...document.querySelectorAll('button[aria-label="Pencil" i]')].find(rendered);
      if(!pencil||pencil.disabled||modalOpen()||!readGrid())return false;
      pause();candidates.exit();pencil.click();return true;
    });
    const candidates = installCandidateNotes(ctx, { controls, selectedCell, available, modalOpen, pause, listen });
    refresh();
    return { refresh, destroy() {
      unbindShortcut?.();destroyed = true; clearTimeout(timer); clearTimeout(refreshTimer); operation = null; pendingTrial = null;
      listeners.forEach(remove => remove()); observer.disconnect(); candidates.destroy(); host.remove();
    } };
  }
  global.MarginGames = global.MarginGames || {};
  global.MarginGames.crossword = { mount };
})(typeof window === 'object' ? window : globalThis);
