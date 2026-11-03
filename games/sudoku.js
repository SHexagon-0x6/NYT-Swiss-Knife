(() => {
  'use strict';
  // Colored candidate: a second color for NYT's own candidates. While it is on,
  // every candidate you enter or tap takes your color (for Snyder marks or any
  // other use). Native Normal, Candidate and Auto candidate controls stay as-is.
  const SVG = 'http://www.w3.org/2000/svg';
  const DEFAULT_COLOR = '#2f6fdb';
  const OWN = '#margin-host,[data-margin-inline],[data-margin-overlay]';
  const MODAL = 'dialog,[role="dialog"],[aria-modal="true"]';
  const KEYPAD_DIGIT = '.su-keyboard__number';
  const CELL_DIGIT = '.su-candidates .su-candidate-button[data-candidate]';
  const ERASE = '.su-keyboard__delete,[data-testid="clear-cell"]';
  const UNDO = '.su-keyboard__undo';
  const visible = node => { if (!node) return false; const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'; };
  const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const digitOf = value => { const match = String(value || '').trim().match(/^(?:number\s+)?([1-9])$/i); return match ? Number(match[1]) : null; };
  function cells() {
    const found = Array.from(document.querySelectorAll('.su-board .su-cell')).filter(visible);
    return found.length === 81 ? found : [];
  }
  const filled = cell => /(?:^|\s)prefilled(?:\s|$)/.test(cell.className || '') || !!cell.querySelector('.su-cell__value');
  const svgNode = (name, attrs) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  function eyeIcon(open) {
    const icon = svgNode('svg', {viewBox: '0 0 24 24', 'aria-hidden': 'true'});
    icon.append(svgNode('path', {d: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z'}), svgNode('circle', {cx: 12, cy: 12, r: 2.8}));
    if (!open) icon.append(svgNode('path', {d: 'M4 20 20 4'}));
    return icon;
  }

  window.MarginGames = window.MarginGames || {};
  window.MarginGames.sudoku = { mount(ctx) {
    const { el } = ctx;
    const feature = name => ctx.feature ? ctx.feature(name, true) : true;
    const enabled = () => feature('coloredCandidates');
    let previewColor = null;
    const italic = () => ctx.option?.('coloredItalic') !== false;
    const color = () => { const value = previewColor || ctx.option?.('coloredColor'); return validColor(value) ? value.toLowerCase() : DEFAULT_COLOR; };
    // Snyder and Center marks were removed; drop their saved overlay notes.
    if (ctx.state.sudokuNotes) { delete ctx.state.sudokuNotes; ctx.save(); }
    const marks = ctx.state.sudokuColored && typeof ctx.state.sudokuColored === 'object' ? ctx.state.sudokuColored : {};
    for (const [key, digits] of Object.entries(marks)) {
      const index = Number(key), clean = Array.isArray(digits) ? [...new Set(digits.filter(d => Number.isInteger(d) && d >= 1 && d <= 9))].sort() : [];
      if (!Number.isInteger(index) || index < 0 || index > 80 || !clean.length) delete marks[key]; else marks[key] = clean;
    }
    ctx.state.sudokuColored = marks;
    let board = [], destroyed = false, coloredOn = false, press = null, boardRoot = null, rootColor = null;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); };

    const pageStyle = document.createElement('style');
    pageStyle.setAttribute('data-margin-overlay', 'sudoku-colored');
    // Digits are drawn as shapes, so italic is a slight slant of each digit.
    pageStyle.textContent = '.su-candidates>svg.su-candidate[data-margin-colored]>:not(title){fill:var(--margin-sudoku-colored,' + DEFAULT_COLOR + ')!important}' +
      '[data-margin-colored-italic] .su-candidates>svg.su-candidate[data-margin-colored]>:not(title){transform:skewX(-12deg);transform-box:fill-box;transform-origin:50% 50%}' +
      '[data-margin-colored-hidden] .su-candidates>svg.su-candidate[data-margin-colored]{visibility:hidden!important}';
    (document.head || document.documentElement).append(pageStyle);

    const isColored = (index, digit) => !!marks[index]?.includes(digit);
    function setColored(index, digit, on) {
      const set = new Set(marks[index] || []);
      if (on === set.has(digit)) return;
      if (on) set.add(digit); else set.delete(digit);
      if (set.size) marks[index] = [...set].sort(); else delete marks[index];
      ctx.save(); paint(); paintSettings();
    }
    // NYT positions every candidate digit inside its square, so match digits to
    // squares by where they are drawn. Returns square index -> digit -> element.
    function candidates() {
      const rects = board.map(cell => cell.getBoundingClientRect()), found = new Map();
      for (const mark of document.querySelectorAll('.su-candidates > svg.su-candidate[data-candidate]')) {
        if (mark.closest(OWN)) continue;
        const r = mark.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (!r.width && !r.height) continue;
        const index = rects.findIndex(c => x >= c.left && x < c.right && y >= c.top && y < c.bottom);
        const digit = Number(mark.getAttribute('data-candidate'));
        if (index < 0 || !(digit >= 1 && digit <= 9)) continue;
        if (!found.has(index)) found.set(index, new Map());
        found.get(index).set(digit, mark);
      }
      return found;
    }
    function paint() {
      if (destroyed) return;
      board = cells();
      const root = board[0]?.closest('.su-board') || null;
      if (boardRoot && boardRoot !== root) restoreRoot();
      if (root && root !== boardRoot) { boardRoot = root; rootColor = [root.style.getPropertyValue('--margin-sudoku-colored'), root.style.getPropertyPriority('--margin-sudoku-colored')]; }
      if (boardRoot) {
        if (boardRoot.style.getPropertyValue('--margin-sudoku-colored') !== color()) boardRoot.style.setProperty('--margin-sudoku-colored', color());
        boardRoot.toggleAttribute('data-margin-colored-hidden', enabled() && !!ctx.state.sudokuColoredHidden);
        boardRoot.toggleAttribute('data-margin-colored-italic', enabled() && italic());
      }
      const painted = new Set();
      if (enabled() && board.length) for (const [index, digits] of candidates()) {
        for (const [digit, mark] of digits) {
          if (!isColored(index, digit)) continue;
          painted.add(mark);
          if (!mark.hasAttribute('data-margin-colored')) mark.setAttribute('data-margin-colored', '');
        }
      }
      for (const mark of document.querySelectorAll('[data-margin-colored]')) if (!painted.has(mark)) mark.removeAttribute('data-margin-colored');
    }
    function restoreRoot() {
      if (!boardRoot) return;
      boardRoot.removeAttribute('data-margin-colored-hidden');boardRoot.removeAttribute('data-margin-colored-italic');
      if (rootColor?.[0]) boardRoot.style.setProperty('--margin-sudoku-colored', rootColor[0], rootColor[1]); else boardRoot.style.removeProperty('--margin-sudoku-colored');
      boardRoot = null; rootColor = null;
    }
    // Drop blue from candidates the game no longer shows in empty squares.
    function reconcile(only = null) {
      board = cells();
      if (!board.length || dialogOpen()) return;
      const map = candidates();
      let changed = false;
      for (const key of Object.keys(marks)) {
        const index = Number(key);
        if (only !== null && index !== only) continue;
        const cell = board[index];
        if (!cell || filled(cell)) continue;
        const kept = marks[key].filter(digit => map.get(index)?.has(digit));
        if (kept.length !== marks[key].length) { changed = true; if (kept.length) marks[key] = kept; else delete marks[key]; }
      }
      if (changed) { ctx.save(); paint(); paintSettings(); }
    }

    const modeButton = name => Array.from(document.querySelectorAll(`[data-testid="${name}-mode"]`)).find(node => visible(node) && !node.closest(OWN));
    const candidateMode = () => modeButton('candidate')?.getAttribute('aria-pressed') === 'true';
    const dialogOpen = () => Array.from(document.querySelectorAll(`${MODAL},.su-modal-pause,.xwd__modal--content`)).some(node => visible(node) && !node.closest(OWN));
    const selectedIndex = () => board.findIndex(cell => /(?:^|\s)selected(?:\s|$)/.test(cell.className || '') || cell.getAttribute('aria-selected') === 'true');
    // Turning colors on needs Candidate mode. Turning them off never changes the
    // game's mode: whatever you chose stays.
    function setColoredMode(on) {
      on = !!on && enabled();
      if (on === coloredOn) { paintRow(); return; }
      coloredOn = on;
      const candidate = modeButton('candidate');
      if (on && candidate && candidate.getAttribute('aria-pressed') !== 'true') candidate.click();
      paintRow();
    }

    // What one digit press means while blue tools are active.
    function decide(digit) {
      if (!enabled() || digit === null) return null;
      board = cells();
      const index = selectedIndex();
      if (index < 0 || filled(board[index]) || !candidateMode()) return null;
      const present = !!candidates().get(index)?.has(digit), blue = isColored(index, digit);
      if (coloredOn) {
        // Paint or unpaint a candidate that is already there without removing it.
        if (present) return { block: true, apply: () => setColored(index, digit, !blue) };
        // Add a missing candidate through the game, then paint it.
        return { block: false, apply: () => { setColored(index, digit, true); later(() => reconcile(index), 700); } };
      }
      // The game removes this candidate, or adds a plain one where an old blue
      // mark was left behind; either way forget its color.
      if (blue) return { block: false, apply: () => setColored(index, digit, false) };
      return null;
    }
    const ownEvent = event => event.composedPath().some(node => node?.nodeType === 1 && node.matches?.(OWN));
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    function pressedDigit(target) {
      const key = target?.closest?.(KEYPAD_DIGIT);
      if (key && !key.closest(`${OWN},${MODAL}`)) return digitOf(key.getAttribute('aria-label') || key.textContent);
      const ghost = target?.closest?.(CELL_DIGIT);
      if (ghost && !ghost.closest(OWN)) return digitOf(ghost.getAttribute('data-candidate'));
      return null;
    }
    function pointer(event) {
      if (destroyed || ownEvent(event) || event.button !== 0) return;
      const target = event.target;
      if (event.type === 'click' && target?.closest?.('[data-testid="normal-mode"]') && coloredOn) { setColoredMode(false); return; }
      if (target?.closest?.(`${ERASE},${UNDO}`) && !target.closest(OWN)) {
        if (event.type === 'click') { const index = selectedIndex(); later(() => reconcile(target.closest(UNDO) ? null : index), 450); }
        return;
      }
      const digit = pressedDigit(target);
      if (digit === null) return;
      if (event.type === 'pointerdown' || event.type === 'mousedown' && press?.target !== target) {
        press = { target, decision: decide(digit), time: Date.now() };
      }
      const current = press && press.target === target && Date.now() - press.time < 1500 ? press : { target, decision: event.type === 'click' ? decide(digit) : null };
      if (current.decision?.block) stop(event);
      if (event.type === 'click') { press = null; current.decision?.apply(); }
    }
    function keys(event) {
      if (destroyed || ownEvent(event) || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.repeat) return;
      if (event.target?.closest?.(`input:not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"],${MODAL}`)) return;
      if (event.key === 'Backspace' || event.key === 'Delete') { board = cells(); const index = selectedIndex(); later(() => reconcile(index), 450); return; }
      const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : null;
      const decision = decide(digit);
      if (!decision) return;
      if (decision.block) stop(event);
      decision.apply();
    }

    // The Colored candidate row sits right below NYT's Auto candidate checkbox.
    const coloredInput = el('input', { type: 'checkbox', 'aria-label': 'Colored candidate', onChange: event => setColoredMode(event.target.checked) });
    const swatch = el('span', { className: 'colored-swatch', 'aria-hidden': 'true' });
    const eye = el('button', { type: 'button', className: 'colored-eye', onClick: () => { ctx.state.sudokuColoredHidden = !ctx.state.sudokuColoredHidden; ctx.save(); paint(); paintRow(); } });
    const hint = el('span', { className: 'colored-hint' });
    const row = el('div', { className: 'colored-row' }, el('label', { className: 'colored-toggle' }, coloredInput, el('span', { textContent: 'Colored candidate' }), swatch), hint, eye);
    const rowStyle = el('style', { textContent: `
      .colored-row{display:flex;align-items:center;gap:8px;min-height:30px;color:var(--ink,#121212);font:var(--colored-weight,400) var(--colored-size,16px)/1.2 var(--colored-font,Arial,Helvetica,sans-serif)}
      .colored-toggle{display:inline-flex;align-items:center;gap:8px;font:inherit;cursor:pointer}
      .colored-toggle input{width:var(--colored-box,18px);height:var(--colored-box,18px);margin:0;flex:0 0 var(--colored-box,18px);accent-color:var(--colored,${DEFAULT_COLOR});cursor:pointer}
      .colored-swatch{width:10px;height:10px;border-radius:50%;background:var(--colored,${DEFAULT_COLOR})}
      .colored-hint{color:var(--muted,#666);font-size:.8em}
      .colored-eye{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer}
      .colored-eye:hover{background:var(--surface,#f0f0f0)}.colored-eye svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .colored-eye:focus-visible,.colored-toggle input:focus-visible{outline:2px solid #4b83b4;outline-offset:2px}
      [hidden]{display:none!important}` });
    function paintRow() {
      coloredInput.checked = coloredOn;
      row.style.setProperty('--colored', color());
      const hidden = !!ctx.state.sudokuColoredHidden;
      eye.replaceChildren(eyeIcon(!hidden));
      eye.setAttribute('aria-pressed', String(hidden));
      eye.setAttribute('aria-label', hidden ? 'Show colored candidates' : 'Hide colored candidates');
      eye.title = hidden ? 'Show colored candidates' : 'Hide colored candidates';
      const key = ctx.shortcutLabel?.('colored');
      hint.textContent = key && key !== 'Off' ? key : '';
      hint.hidden = !hint.textContent;
    }
    let slot = null;
    function placeRow() {
      if (!ctx.inline) return;
      const auto = Array.from(document.querySelectorAll('label.su-keyboard__auto')).find(node => visible(node) && !node.closest(OWN));
      const anchor = auto || document.querySelector('.su-keyboard__container') || document.querySelector('.su-keyboard') || board[0]?.closest('.su-board');
      if (!enabled() || !anchor || !board.length) { if (slot) slot.getRootNode().host.hidden = true; return; }
      slot = ctx.inline('sudoku-colored', anchor, 'after', { width: 'auto' });
      if (row.parentNode !== slot) slot.replaceChildren(rowStyle, row);
      const host = slot.getRootNode().host;
      host.hidden = false;
      const nativeLabel = getComputedStyle(auto || anchor);
      Object.assign(host.style, { width: '100%', maxWidth: 'none', margin: auto ? '4px 0 0' : '8px 0', gridColumn: '1 / -1', boxSizing: 'border-box' });
      row.style.setProperty('--colored-font', nativeLabel.fontFamily);
      row.style.setProperty('--colored-size', `${Math.max(14, parseFloat(nativeLabel.fontSize) || 16)}px`);
      row.style.setProperty('--colored-weight', nativeLabel.fontWeight);
      // Line the checkbox up with Auto candidate's checkbox.
      const box = auto?.querySelector('input')?.getBoundingClientRect(), own = host.getBoundingClientRect();
      row.style.paddingLeft = box && own.width ? `${Math.max(0, Math.round(box.left - own.left))}px` : '0';
      if (box?.width >= 10 && box.width <= 28) row.style.setProperty('--colored-box', `${Math.round(box.width)}px`);
    }

    // Settings: color, italic, and two ways to clear this puzzle's colored candidates.
    // Dragging previews the color; it is saved once, when the picker closes.
    const colorPicker = el('input', { type: 'color', 'aria-label': 'Colored candidate color',
      onInput: event => { previewColor = event.target.value; colorText.value = color(); paint(); paintRow(); },
      onChange: event => { previewColor = null; saveColor(event.target.value); } });
    const colorText = el('input', { type: 'text', className: 'field colored-hex', maxLength: 7, spellcheck: false, autocomplete: 'off', 'aria-label': 'Colored candidate color hex', placeholder: DEFAULT_COLOR,
      onChange: event => { const value = event.target.value.trim(); if (validColor(value)) saveColor(value); else { event.target.value = color(); ctx.notice('Use a hex color such as #2f6fdb.'); } } });
    const resetColor = el('button', { type: 'button', className: 'button', textContent: 'Default', onClick: () => saveColor(DEFAULT_COLOR) });
    const italicInput = el('input', { type: 'checkbox', 'aria-label': 'Italic colored candidates', onChange: event => { ctx.setOption?.('coloredItalic', event.target.checked); paint(); } });
    const clearColors = el('button', { type: 'button', className: 'button', textContent: 'Colors', 'aria-label': 'Clear all colors. Candidates stay, uncolored.',
      title: 'Uncolor every colored candidate in this puzzle. The candidates stay.', onClick: () => {
        for (const key of Object.keys(marks)) delete marks[key];
        ctx.save(); paint(); paintSettings();
      } });
    let armed = 0, armTimer = null, deleting = false;
    const clearCandidates = el('button', { type: 'button', className: 'button', textContent: 'Colored candidates', 'aria-label': 'Delete all colored candidates from the board',
      title: 'Delete every colored candidate from this puzzle\'s board. Click twice to confirm.', onClick: () => {
        if (deleting) return;
        if (!armed) {
          armed = coloredOnBoard().length;
          if (!armed) { for (const key of Object.keys(marks)) delete marks[key]; ctx.save(); paint(); paintSettings(); return; }
          clearTimeout(armTimer); armTimer = setTimeout(() => { armed = 0; paintSettings(); }, 4000); paintSettings(); return;
        }
        armed = 0; clearTimeout(armTimer); deleteColored();
      } });
    const settings = el('div', { className: 'colored-settings' },
      el('style', { textContent: '.colored-settings{display:grid;gap:8px;margin:10px 0 4px}.colored-settings-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.colored-settings input[type=color]{width:32px;height:28px;padding:0;border:1px solid var(--line,#d3d6da);border-radius:4px;background:none}.colored-settings .colored-hex{width:78px;padding:5px 6px;font-family:monospace}.colored-settings .button{white-space:nowrap}.colored-settings label{display:inline-flex;align-items:center;gap:6px}.colored-clear{display:inline-flex;align-items:center;gap:6px;margin-left:10px}' }),
      el('div', { className: 'colored-settings-row' }, el('span', { textContent: 'Color' }), colorPicker, colorText, resetColor),
      el('div', { className: 'colored-settings-row' }, el('label', {}, italicInput, el('span', { textContent: 'Italic' })),
        el('span', { className: 'colored-clear', role: 'group', 'aria-label': 'Clear all' }, el('span', { textContent: 'Clear all' }), clearColors, clearCandidates)));
    // [square, digit] for every colored candidate the board shows now.
    function coloredOnBoard() {
      board = cells();
      const map = candidates(), found = [];
      for (const [key, digits] of Object.entries(marks)) for (const digit of digits) if (map.get(Number(key))?.has(digit)) found.push([Number(key), digit]);
      return found;
    }
    const settle = () => new Promise(resolve => setTimeout(resolve, 60));
    function selectSquare(cell) {
      const r = cell.getBoundingClientRect(), point = { clientX: r.x + 4, clientY: r.y + 4, bubbles: true, cancelable: true, composed: true, button: 0 };
      cell.dispatchEvent(new PointerEvent('pointerdown', { ...point, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      cell.dispatchEvent(new MouseEvent('mousedown', { ...point, buttons: 1 }));
      cell.dispatchEvent(new PointerEvent('pointerup', { ...point, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      cell.dispatchEvent(new MouseEvent('mouseup', point));
      cell.click();
    }
    // Removes each colored candidate with the game's own keypad, one at a time,
    // then puts back the square and mode you had.
    async function deleteColored() {
      deleting = true; paintSettings();
      const targets = coloredOnBoard(), before = selectedIndex(), wasCandidate = candidateMode();
      setColoredMode(false);
      if (!wasCandidate) modeButton('candidate')?.click();
      try {
        for (const [index, digit] of targets) {
          if (destroyed || !candidateMode()) break;
          board = cells();
          if (selectedIndex() !== index && board[index]) { selectSquare(board[index]); await settle(); }
          board = cells();
          if (selectedIndex() !== index || !candidates().get(index)?.has(digit)) continue;
          const key = Array.from(document.querySelectorAll(KEYPAD_DIGIT)).find(node => visible(node) && !node.closest(OWN) && digitOf(node.getAttribute('aria-label') || node.textContent) === digit);
          if (!key) break;
          key.click(); await settle();
        }
      } finally {
        for (const key of Object.keys(marks)) delete marks[key];
        board = cells();
        if (before >= 0 && board[before] && selectedIndex() !== before) selectSquare(board[before]);
        if (!wasCandidate && candidateMode()) modeButton('normal')?.click();
        deleting = false; ctx.save(); paint(); paintRow(); paintSettings();
      }
    }
    ctx.panel.append(settings);
    function saveColor(value) {
      if (!validColor(value)) return;
      ctx.setOption?.('coloredColor', value.toLowerCase());
      paint(); paintRow(); paintSettings();
    }
    function paintSettings() {
      settings.hidden = !enabled();
      if (colorPicker.value !== color()) colorPicker.value = color();
      if (colorText !== colorText.getRootNode().activeElement && colorText.value !== color()) colorText.value = color();
      italicInput.checked = italic();
      clearColors.disabled = deleting || !Object.keys(marks).length;
      clearCandidates.disabled = deleting || !Object.keys(marks).length;
      clearCandidates.textContent = deleting ? 'Deleting…' : armed ? `Delete ${armed}? Click again` : 'Colored candidates';
    }

    const boardObserver = new MutationObserver(paint);
    let observed = null;
    function observeBoard() {
      const root = board[0]?.closest('.su-board') || null;
      if (root === observed) return;
      boardObserver.disconnect(); observed = root;
      if (root) boardObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-candidate', 'class'] });
    }
    function refresh() {
      board = cells();
      if (!enabled() && coloredOn) setColoredMode(false);
      // The game's own Normal button or shortcut ends blue entry.
      if (coloredOn && board.length && modeButton('normal')?.getAttribute('aria-pressed') === 'true') setColoredMode(false);
      observeBoard(); paint(); placeRow(); paintRow(); paintSettings();
    }
    const unbindShortcut = ctx.bindShortcut?.(() => {
      if (destroyed || !enabled() || !cells().length || dialogOpen()) return false;
      setColoredMode(!coloredOn);
      return true;
    }, 'colored');
    const listeners = [['pointerdown', pointer], ['mousedown', pointer], ['pointerup', pointer], ['mouseup', pointer], ['click', pointer], ['keydown', keys]];
    for (const [type, handler] of listeners) window.addEventListener(type, handler, true);
    const geometry = () => paint();
    window.addEventListener('resize', geometry);
    refresh();
    return { refresh, destroy() {
      destroyed = true; coloredOn = false; clearTimeout(armTimer);
      for (const id of timers) clearTimeout(id); timers.clear();
      unbindShortcut?.(); boardObserver.disconnect();
      for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
      window.removeEventListener('resize', geometry);
      for (const mark of document.querySelectorAll('[data-margin-colored]')) mark.removeAttribute('data-margin-colored');
      restoreRoot(); pageStyle.remove(); settings.remove(); row.remove();
    } };
  } };
})();
