(() => {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';
  const MAX_PATHS = 200;
  const colors = { yellow: '#e6bf41', blue: '#5f9dc7' };
  const selectors = [
    '[data-margin-game="strands"] [data-margin-letter]',
    '[data-testid="strands-board"] button',
    '.strands-board button',
    '[class*="Board_board"] button',
    '[class*="Board-board"] button',
    '[class*="Cell-module_cell"]',
    '[class*="Cell_cell"]',
    '[data-testid="strands-cell"]'
  ];
  function letters() {
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden' && /^[a-z]$/i.test(node.textContent.trim());
      });
      if (nodes.length === 48) return nodes;
    }
    return [];
  }
  const svgNode = (name, attrs) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  function distanceToSegment(point, first, last) {
    const dx = last.x - first.x, dy = last.y - first.y;
    const t = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - first.x - t * dx, point.y - first.y - t * dy);
  }
  function segmentDistance(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
        Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y)) return 0;
    return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
  }
  window.MarginGames = window.MarginGames || {};
  window.MarginGames.strands = { mount(ctx) {
    const { el } = ctx;
    const enabled=name=>typeof ctx.feature!=='function'||ctx.feature(name,true)!==false;
    ctx.state.strandsPaths = (ctx.state.strandsPaths || []).filter(path => Array.isArray(path.cells) && colors[path.color] && path.cells.every(index => Number.isInteger(index) && index >= 0 && index < 48));
    let mode = 'play', color = 'yellow', board = [], boardRoot = null, points = [], drawing = null, pointerId = null, lastDrawing = '', destroyed = false;
    let hidden = ctx.state.strandsHidden === true;
    const undo = [];
    let erasing = null, interactionRoot = null, originalTouchAction = '';
    function updateInteraction() {
      if (interactionRoot && (interactionRoot !== boardRoot || mode === 'play')) { interactionRoot.style.touchAction = originalTouchAction; interactionRoot = null; }
      if (boardRoot && mode !== 'play') {
        if (!interactionRoot) { interactionRoot = boardRoot; originalTouchAction = boardRoot.style.touchAction; }
        boardRoot.style.touchAction = 'none';
      }
    }
    const overlay = svgNode('svg', { 'aria-hidden': 'true', 'data-margin-overlay': 'strands' });
    Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147483000', overflow: 'hidden' });
    document.documentElement.append(overlay);
    const status = el('p', { className: 'muted small', role: 'status' });
    const instruction = el('p', { className: 'small' });
    const modes = el('div', { className: 'row strands-modes', role: 'group', 'aria-label': 'Board interaction mode' });
    const modeButtons = {}, colorButtons = {};
    function setMode(next) {
      if(next==='draw'&&!enabled('pathDrawing'))next='play';
      if (drawing || erasing) finish();
      mode = next;
      if (mode !== 'play' && hidden) { hidden = false; ctx.state.strandsHidden = false; updateVisibility(); ctx.save(); render(); }
      for (const [key, button] of Object.entries(modeButtons)) { button.classList.toggle('active', key === mode); button.setAttribute('aria-pressed', String(key === mode)); }
      updateInteraction(); updateInstruction();
    }
    function updateInstruction() {
      instruction.textContent = mode === 'play' ? (hidden ? 'A fresh look at the board. Your sketches are saved and hidden.' : 'Play normally. Your planned paths stay visible.') : mode === 'draw' ? 'Drag through neighboring letters to plan a word. Release to save your path.' : `Click a path to erase it, or drag across paths to erase several.${enabled('sketchUndo') ? ' Undo restores the whole gesture.' : ''}`;
    }
    for (const [key, name] of [['play', 'Play'], ['draw', 'Draw']]) {
      modeButtons[key] = el('button', { className: 'button', type: 'button', textContent: name, onClick: () => setMode(key) }); modes.append(modeButtons[key]);
    }
    const eraseButton = el('button', { className: 'button strands-icon strands-eraser', type: 'button', title: 'Erase paths · click or drag', 'aria-label': 'Erase', onClick: () => setMode(mode === 'erase' ? 'play' : 'erase') });
    const eraserIcon = svgNode('svg', { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' });
    eraserIcon.append(svgNode('path', { d: 'm15 3 6 6a2 2 0 0 1 0 3l-8 8H8l-5-5a2 2 0 0 1 0-3L12 3a2 2 0 0 1 3 0ZM7 8l9 9M13 20h9', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    eraseButton.append(eraserIcon); modeButtons.erase = eraseButton;
    const palette = el('div', { className: 'row strands-palette', role: 'group', 'aria-label': 'Sketch color' });
    function selectColor(next) {
      color = next;
      for (const [key, button] of Object.entries(colorButtons)) { button.classList.toggle('active', key === color); button.setAttribute('aria-pressed', String(key === color)); }
    }
    for (const key of ['yellow', 'blue']) {
      colorButtons[key] = el('button', { className: 'button margin-strands-color', type: 'button', title: `Draw in ${key}`, 'aria-label': `Use ${key} highlights`, onClick: () => { selectColor(key); setMode('draw'); } }, el('span', { className: `margin-strands-swatch ${key}` }), el('span', { className: ctx.inline ? 'strands-sr-only' : '', textContent: key === 'yellow' ? 'Yellow' : 'Blue' }));
      palette.append(colorButtons[key]);
    }
    function snapshot() { undo.push(JSON.stringify(ctx.state.strandsPaths)); if (undo.length > 30) undo.shift(); }
    function save() { ctx.save(); updateActions(); render(); }
    const undoButton = el('button', { className: 'button strands-icon', type: 'button', textContent: ctx.inline ? '↶' : 'Undo', title: 'Undo sketch change', 'aria-label': 'Undo', onClick: () => { if (enabled('sketchUndo')&&undo.length) { cancel(); ctx.state.strandsPaths = JSON.parse(undo.pop()); save(); } } });
    const clearButton = el('button', { className: 'button', type: 'button', textContent: 'Clear all', onClick: () => { if (ctx.state.strandsPaths.length) { cancel(); snapshot(); ctx.state.strandsPaths = []; drawing = null; pointerId = null; save(); ctx.notice(enabled('sketchUndo') ? 'Paths cleared. Undo can restore them.' : 'Paths cleared.'); } } });
    const hideButton = el('button', { className: 'button strands-icon', type: 'button', onClick: () => {
      if (!enabled('sketchVisibility')) return;
      if (drawing || erasing) finish();
      hidden = !hidden; ctx.state.strandsHidden = hidden;
      setMode('play'); updateVisibility(); ctx.save(); render();
    } });
    function updateVisibility() {
      hideButton.textContent = ctx.inline ? (hidden ? '◌' : '◉') : hidden ? 'Show sketches' : 'Hide sketches';
      hideButton.title = hidden ? 'Show sketches' : 'Hide sketches';
      hideButton.setAttribute('aria-pressed', String(hidden));
      hideButton.setAttribute('aria-label', hidden ? 'Show saved sketches' : 'Hide sketches without deleting them');
    }
    function updateActions() { undoButton.disabled = !enabled('sketchUndo') || !undo.length; clearButton.disabled = !ctx.state.strandsPaths.length; hideButton.disabled = !enabled('sketchVisibility'); }
    const style = el('style', { textContent: '.margin-strands-color{display:inline-flex;align-items:center;gap:7px}.margin-strands-swatch{display:inline-block;width:11px;height:11px;border-radius:50%;border:1px solid #0002}.margin-strands-swatch.yellow{background:#e6bf41}.margin-strands-swatch.blue{background:#5f9dc7}.strands-inline{font:12px/1.4 Arial,sans-serif;color:var(--ink,#333);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:7px 0}.strands-inline .strands-modes{display:inline-flex;gap:0;flex-wrap:nowrap;border:1px solid #bbb;border-radius:999px;overflow:hidden}.strands-inline .button{font:600 11px/1.2 Arial,sans-serif;color:var(--ink,#333);background:var(--paper,#fff);border:1px solid #c8c8c8;border-radius:999px;padding:7px 11px;min-height:29px;cursor:pointer}.strands-inline .strands-modes .button{border:0;border-radius:0}.strands-inline .strands-modes .button.active{background:var(--ink,#121212);color:var(--paper,#fff)}.strands-inline .button:hover:not(:disabled):not(.active){background:var(--surface,#eee)}.strands-inline .button:disabled{opacity:.35;cursor:default}.strands-inline .button:focus-visible{outline:2px solid #777;outline-offset:2px}.strands-inline .strands-palette{display:inline-flex;flex-wrap:nowrap;gap:4px}.strands-inline .margin-strands-color{width:27px;height:27px;min-height:27px;border:2px solid transparent;padding:3px;background:transparent}.strands-inline .margin-strands-color.active{border-color:var(--ink,#333);background:transparent}.strands-inline .margin-strands-swatch{width:17px;height:17px}.strands-inline .strands-icon{width:29px;height:29px;padding:0;font:18px/1 Arial,sans-serif;border:0;background:transparent}.strands-inline .strands-icon[aria-pressed=true]{color:var(--ink,#555);background:var(--surface,#eee)}.strands-cleanup{display:inline-flex;align-items:center;gap:3px;flex-wrap:nowrap}.strands-eraser{display:inline-grid;place-items:center}.strands-inline .strands-eraser[aria-pressed=true]{background:var(--ink,#121212);color:var(--paper,#fff)}.strands-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' });
    const tools = el('div', { className: ctx.inline ? 'inline-tools strands-inline' : 'stack', role: 'group', 'aria-label': 'Strands sketch tools' }, style, modes, palette, undoButton, hideButton, el('div', { className: 'strands-cleanup' }, eraseButton, clearButton));
    ctx.panel.append(tools, ...(ctx.inline ? [] : [instruction, status]));
    function placeTools() {
      if (!ctx.inline || !boardRoot) return;
      const anchor = boardRoot.namespaceURI === SVG ? boardRoot.closest('svg') : boardRoot;
      if (!anchor) return;
      const destination = ctx.inline('strands-sketch', anchor, 'after');
      if (destination && tools.parentNode !== destination) destination.append(tools);
      if (destination?.getRootNode().host) destination.getRootNode().host.hidden = tools.hidden;
    }
    function updateGeometry() {
      points = board.map(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }; });
    }
    function render() {
      if (destroyed) return;
      updateGeometry();
      const paths = hidden ? [] : drawing ? ctx.state.strandsPaths.concat(drawing) : ctx.state.strandsPaths;
      const signature = JSON.stringify({ points, paths });
      if (signature === lastDrawing) return;
      lastDrawing = signature;
      const fragment = document.createDocumentFragment();
      for (const path of paths) {
        const coords = path.cells.map(index => points[index]).filter(Boolean);
        if (!coords.length) continue;
        const width = Math.max(12, Math.min(30, Math.min(coords[0].width, coords[0].height) * .64));
        if (coords.length === 1) fragment.append(svgNode('circle', { cx: coords[0].x, cy: coords[0].y, r: width / 2, fill: colors[path.color], 'fill-opacity': .38 }));
        else fragment.append(svgNode('polyline', { points: coords.map(point => `${point.x},${point.y}`).join(' '), fill: 'none', stroke: colors[path.color], 'stroke-opacity': .42, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      }
      overlay.replaceChildren(fragment);
    }
    function hit(x, y) {
      let best = -1, distance = Infinity;
      points.forEach((point, index) => {
        const d = Math.hypot(x - point.x, y - point.y);
        if (d < Math.min(point.width, point.height) * .55 && d < distance) { best = index; distance = d; }
      });
      return best;
    }
    function adjacent(first, last) {
      // A visible Strands board has six columns and eight rows.
      return first !== last && Math.abs(first % 6 - last % 6) <= 1 && Math.abs(Math.floor(first / 6) - Math.floor(last / 6)) <= 1;
    }
    function eraseTo(x, y) {
      if (!erasing) return;
      const from = erasing.last, to = { x, y };
      erasing.last = to;
      const hits = [];
      ctx.state.strandsPaths.forEach((path, index) => {
        const coords = path.cells.map(cell => points[cell]).filter(Boolean);
        if (!coords.length) return;
        const radius = Math.max(10, Math.min(19, Math.min(coords[0].width, coords[0].height) * .32 + 4));
        const touched = coords.length === 1 ? distanceToSegment(coords[0], from, to) <= radius :
          coords.some((point, i) => i > 0 && segmentDistance(from, to, coords[i - 1], point) <= radius);
        if (touched) hits.push(index);
      });
      if (!hits.length) return;
      if (!erasing.changed) { snapshot(); erasing.changed = true; }
      for (const index of hits.reverse()) ctx.state.strandsPaths.splice(index, 1);
      updateActions(); render();
    }
    function ownEvent(event) { return event.composedPath().some(node => node?.id === 'margin-host' || node?.hasAttribute?.('data-margin-inline')); }
    function boardEvent(event) {
      const target = event.target;
      return !!(boardRoot && target instanceof Element && boardRoot.contains(target) &&
        !ownEvent(event) && !target.closest('dialog, [role="dialog"], [aria-modal="true"]'));
    }
    function inBoard(x, y) {
      if (!points.length) return false;
      const left = Math.min(...points.map(p => p.x - p.width / 2)), right = Math.max(...points.map(p => p.x + p.width / 2));
      const top = Math.min(...points.map(p => p.y - p.height / 2)), bottom = Math.max(...points.map(p => p.y + p.height / 2));
      return x >= left && x <= right && y >= top && y <= bottom;
    }
    function down(event) {
      if (mode === 'play' || !boardEvent(event) || event.button !== 0 || !board.length) return;
      updateGeometry();
      if (!inBoard(event.clientX, event.clientY)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (drawing || erasing) return;
      if (mode === 'erase') {
        pointerId = event.pointerId; erasing = { last: { x: event.clientX, y: event.clientY }, changed: false };
        eraseTo(event.clientX, event.clientY); return;
      }
      if (ctx.state.strandsPaths.length >= MAX_PATHS) {
        ctx.notice('This puzzle has 200 sketches. Erase a sketch or clear paths before adding another.');
        return;
      }
      const index = hit(event.clientX, event.clientY);
      if (index < 0) return;
      drawing = { color, cells: [index] }; pointerId = event.pointerId; render();
    }
    function move(event) {
      if ((!drawing && !erasing) || event.pointerId !== pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (erasing) {
        const samples = event.getCoalescedEvents?.() || [];
        for (const sample of samples) eraseTo(sample.clientX, sample.clientY);
        eraseTo(event.clientX, event.clientY); return;
      }
      const index = hit(event.clientX, event.clientY), path = drawing.cells, previous = path[path.length - 1];
      if (index < 0 || index === previous) return;
      if (path.length > 1 && index === path[path.length - 2]) path.pop();
      else if (adjacent(previous, index) && !path.includes(index)) path.push(index);
      render();
    }
    function finish(event) {
      if ((!drawing && !erasing) || (event && event.pointerId !== pointerId)) return;
      if (event) { event.preventDefault(); event.stopImmediatePropagation(); }
      if (erasing) {
        if (event) eraseTo(event.clientX, event.clientY);
        const changed = erasing.changed; erasing = null; pointerId = null;
        if (changed) save();
        return;
      }
      if (ctx.state.strandsPaths.length >= MAX_PATHS) {
        drawing = null; pointerId = null; render();
        ctx.notice('This puzzle has 200 sketches. Erase a sketch or clear paths before adding another.');
        return;
      }
      snapshot(); ctx.state.strandsPaths.push(drawing); drawing = null; pointerId = null; save();
    }
    function cancel(event) {
      if (event && event.pointerId !== pointerId) return;
      const changed = erasing?.changed;
      drawing = null; erasing = null; pointerId = null;
      if (changed) save(); else render();
    }
    function click(event) {
      if (mode !== 'play' && boardEvent(event) && inBoard(event.clientX, event.clientY)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function key(event) {
      if (event.key === 'Escape' && mode !== 'play' && !ownEvent(event)) { cancel(); setMode('play'); event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function refresh() {
      modeButtons.draw.hidden=!enabled('pathDrawing');
      palette.hidden=!enabled('pathDrawing');undoButton.hidden=!enabled('sketchUndo');
      hideButton.hidden=!enabled('sketchVisibility');
      if(mode==='draw'&&!enabled('pathDrawing')){cancel();setMode('play');}
      updateActions();updateInstruction();
      board = letters();
      boardRoot = board[0]?.parentElement || null;
      while (boardRoot && !board.every(cell => boardRoot.contains(cell))) boardRoot = boardRoot.parentElement;
      // A board dispersed across the whole document is not a trustworthy hit area.
      if (boardRoot === document.body || boardRoot === document.documentElement) boardRoot = null;
      updateInteraction(); placeTools();
      const text = board.length ? 'Board connected · paths saved on this device' : 'Open a Strands puzzle to connect its board. If NYT’s layout changed, drawing stays inactive.';
      if (status.textContent !== text) status.textContent = text;
      render();
    }
    const geometry = () => render();
    const blur = () => cancel();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', geometry, true);
    window.addEventListener('resize', geometry);
    window.addEventListener('blur', blur);
    setMode('play'); selectColor('yellow'); updateActions(); updateVisibility(); refresh();
    return { refresh, destroy() { cancel(); mode = 'play'; updateInteraction(); destroyed = true; window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', finish, true); window.removeEventListener('pointercancel', cancel, true); window.removeEventListener('click', click, true); window.removeEventListener('keydown', key, true); window.removeEventListener('scroll', geometry, true); window.removeEventListener('resize', geometry); window.removeEventListener('blur', blur); tools.remove(); overlay.remove(); } };
  } };
})();
