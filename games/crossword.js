(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;

  // These adapters use only rendered squares, their printed numbers, and clue-list text.
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
  function readableClue(node) {
    return visuallyReadable(node) && !node.closest('[aria-hidden="true"]');
  }
  function readClues() {
    const clues = { across: new Map(), down: new Map() };
    const sections = [];
    for (const direction of ['across', 'down']) {
      document.querySelectorAll(`[data-margin-clue-direction="${direction}"],[data-testid="${direction}-clues"],[aria-label="${direction} clues" i]`).forEach(node => sections.push({ direction, node }));
    }
    for (const heading of document.querySelectorAll('h2,h3,h4,[role="heading"],[class*="ClueList-title"],[class*="ClueList_title"]')) {
      const direction = clean(heading.innerText).toLowerCase();
      if (!['across', 'down'].includes(direction) || !rendered(heading)) continue;
      let node = heading.parentElement;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        if (node.querySelector('ol,[role="list"]')) {
          const headings = Array.from(node.querySelectorAll('h2,h3,h4,[role="heading"]')).filter(item => /^(across|down)$/i.test(clean(item.innerText)));
          if (headings.length <= 1) sections.push({ direction, node });
          break;
        }
      }
    }
    for (const { direction, node } of sections) {
      if (!readableClue(node)) continue;
      let items = Array.from(node.querySelectorAll('[data-margin-clue-number]'));
      if (!items.length) items = Array.from(node.querySelectorAll('li,[role="listitem"],[data-testid="clue"]'));
      for (const item of items.filter(readableClue)) {
        const label = item.querySelector('[data-testid="clue-number"],[class*="Clue-label"],[class*="Clue_label"],.xwd__clue--label');
        const text = clean(item.innerText);
        const number = Number(item.getAttribute('data-margin-clue-number') || item.getAttribute('data-clue-number') || clean(label?.innerText) || text.match(/^\d{1,3}(?=\D|$)/)?.[0]);
        if (!Number.isInteger(number) || number < 1 || number > 999) continue;
        const body = item.querySelector('[data-testid="clue-text"],[data-clue-text],[class*="Clue-text"],[class*="Clue_text"],.xwd__clue--text');
        if (body && !readableClue(body)) continue;
        const clue = clean(body ? body.innerText : text.replace(new RegExp(`^${number}(?:[.::)]|\\s)+`), ''));
        if (clue && clue.length <= 1200 && clue !== String(number)) clues[direction].set(number, clue);
      }
    }
    return clues.across.size && clues.down.size ? clues : null;
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
  function cluesFor(cell, grid, lists) {
    if(!cell||cell.block||!lists)return [];
    const result=[];
    for(const direction of ['across','down']){
      for(const start of grid.cells){
        if(start.block||!start.number||!lists[direction].has(start.number))continue;
        if(direction==='across'?(start.row!==cell.row||start.col>cell.col):(start.col!==cell.col||start.row>cell.row))continue;
        const run=[];let row=start.row,col=start.col;
        while(row<grid.size&&col<grid.size){
          const square=grid.cells[row*grid.size+col];if(!square||square.block)break;
          run.push(square);if(direction==='across')col++;else row++;
        }
        if(!run.some(square=>square.node===cell.node)||run.every(square=>!!squareLetter(square)))continue;
        result.push({number:start.number,direction,text:lists[direction].get(start.number),letters:run.map(square=>squareLetter(square)||''),activeIndex:run.findIndex(square=>square.node===cell.node)});
      }
    }
    return result;
  }
  function installClueHover(ctx, saved) {
    const { el } = ctx;
    if (saved.hoverClues === undefined) saved.hoverClues = true;
    const enabled = () => ctx.feature ? ctx.feature('clueHover', saved.hoverClues) : saved.hoverClues;
    let grid = null, lists = null, active = null, destroyed = false, keyboardTimer, shownClues = '', typing=false, pointer=null;
    const listeners = [];
    const listen = (node, type, handler, options) => { node.addEventListener(type, handler, options); listeners.push(() => node.removeEventListener(type, handler, options)); };
    const host = document.createElement('div');
    host.id = 'margin-crossword-tooltip'; host.dataset.marginOverlay = 'crossword'; host.setAttribute('role', 'tooltip'); host.hidden = true;
    Object.assign(host.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483630', left: '0', top: '0', maxWidth: 'calc(100vw - 16px)' });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(el('style', { textContent: ':host{color-scheme:light}*{box-sizing:border-box}.tip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;width:100%;max-height:calc(100vh - 16px);overflow:hidden;pointer-events:none;overscroll-behavior:contain;padding:10px 12px;background:#fff;color:#121212;border:1px solid #878a8c;border-radius:4px;box-shadow:0 2px 8px #0002;font:13px/1.4 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}.tip[data-count="1"]{grid-template-columns:1fr}.entry{min-width:0}.entry:nth-child(even){border-left:1px solid #d3d6da;padding-left:14px}.label{font-size:12px;font-weight:700;color:#121212;margin-bottom:3px}.clue{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.word-boxes{display:flex;flex-wrap:wrap;gap:2px;margin-top:7px}.letter-box{display:grid;place-items:center;width:19px;height:23px;border:1px solid #999;font:600 12px Arial,sans-serif;background:white}.letter-box.current{border:2px solid #5082a8;background:#edf4fa}.letter-box.rebus{font-size:8px}.blank-count{font-size:11px;color:#666;margin-top:4px}.tip:focus-visible{outline:2px solid #4b83b4;outline-offset:2px}' }));
    const body = el('div', { className: 'tip', 'aria-label': 'Across and Down clues' }); shadow.append(body); document.body.append(host);
    // Central settings own the two Crossword switches; hover adds no panel UI.
    const controls = el('div', { hidden: true });
    function hide() {
      if (active) {
        const tokens = (active.node.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== host.id);
        if (tokens.length) active.node.setAttribute('aria-describedby', tokens.join(' '));
        else active.node.removeAttribute('aria-describedby');
      }
      active = null; host.hidden = true;
    }
    function position() {
      if(!grid||!active)return;
      const square=active.node.getBoundingClientRect();
      const boxes=grid.cells.map(cell=>cell.node.getBoundingClientRect());
      const left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right));
      const width=Math.min(360,Math.max(240,right-left),innerWidth-16);
      host.style.width=`${width}px`;
      const above=Math.max(0,square.top-16),below=Math.max(0,innerHeight-square.bottom-16);
      const useBelow=below>=120||below>above;
      body.style.maxHeight=`${Math.max(36,Math.min(230,useBelow?below:above))}px`;
      const height=host.getBoundingClientRect().height;
      host.style.left=`${Math.round(Math.max(8,Math.min(square.left+square.width/2-width/2,Math.max(left,right-width),innerWidth-width-8)))}px`;
      host.style.top=`${Math.round(useBelow?square.bottom+8:Math.max(8,square.top-height-8))}px`;
      body.style.pointerEvents='none';body.removeAttribute('tabindex');
    }
    function show(cell, source) {
      if (destroyed || typing || !enabled() || !grid || !rendered(cell?.node)) { hide(); return; }
      const entries = cluesFor(cell, grid, lists);
      if (!entries.length) { hide(); return; }
      if (active?.node !== cell.node) hide();
      active = { ...cell, source };
      const tokens = new Set((cell.node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      tokens.add(host.id); cell.node.setAttribute('aria-describedby', [...tokens].join(' '));
      const signature = JSON.stringify(entries);
      if (shownClues !== signature) {
        shownClues = signature; body.dataset.count = String(entries.length);
        body.replaceChildren(...entries.map(entry => el('div', { className: 'entry' },
          el('div', { className: 'label', textContent: `${entry.number} ${entry.direction === 'across' ? 'Across' : 'Down'}` }),
          el('div', { className: 'clue', textContent: entry.text }),
          el('div',{className:'word-boxes','aria-label':`${entry.letters.length} squares, ${entry.letters.filter(letter=>!letter).length} blanks`},
            ...entry.letters.map((letter,index)=>el('span',{className:`letter-box${index===entry.activeIndex?' current':''}${letter.length>1?' rebus':''}`,'aria-hidden':'true',textContent:letter}))),
          el('div',{className:'blank-count',textContent:`${entry.letters.filter(letter=>!letter).length} blank${entry.letters.filter(letter=>!letter).length===1?'':'s'} left`})
        )));
        body.scrollTop = 0;
      }
      host.hidden = false;
      position();
    }
    function cellFor(node) { return node?.nodeType ? grid?.cells.find(cell => cell.node === node || cell.node.contains(node)) : null; }
    function selectedCell() {
      const selector = '[aria-selected="true"],[data-selected="true"],[class*="Cell-selected"],[class*="Cell_selected"]';
      return grid?.cells.find(cell => !cell.block && (cell.node.matches(selector) || cell.node.querySelector(selector)));
    }
    function refresh() {
      if (destroyed) return;
      grid = enabled() ? readGrid() : null; lists = enabled() ? readClues() : null;
      const ready = grid && lists;
      if (active) {
        const cell = grid?.cells.find(cell => cell.node === active.node);
        if (cell && ready) show(cell, active.source); else hide();
      }
    }
    listen(document, 'pointerover', event => {
      if (!enabled() || event.target.closest?.('#margin-host,[data-margin-inline],[data-margin-overlay]')) return;
      const cell = cellFor(event.target);
      if (cell) show(cell, 'pointer');
    }, true);
    listen(window,'keydown',event=>{
      if(event.composedPath().some(node=>node?.nodeType===1&&node.matches('#margin-host,[data-margin-inline],[data-margin-overlay]')))return;
      if(event.isComposing||/^[a-z0-9]$/i.test(event.key)||['Backspace','Delete','Enter',' '].includes(event.key)){
        typing=true;clearTimeout(keyboardTimer);hide();
      }
    },true);
    listen(window,'beforeinput',event=>{
      if(event.composedPath().some(node=>node?.nodeType===1&&node.matches('#margin-host,[data-margin-inline],[data-margin-overlay]')))return;
      typing=true;clearTimeout(keyboardTimer);hide();
    },true);
    listen(document,'pointermove',event=>{
      const moved=!pointer||Math.abs(event.clientX-pointer.x)+Math.abs(event.clientY-pointer.y)>2;
      if(!moved)return;
      pointer={x:event.clientX,y:event.clientY};typing=false;
      const cell=cellFor(event.target);if(cell)show(cell,'pointer');
    },true);
    const inCluePanel = node => node === host || !!node && shadow.contains(node);
    listen(document, 'pointerout', event => {
      if (active?.source === 'pointer' && cellFor(event.target)?.node === active.node && cellFor(event.relatedTarget)?.node !== active.node && !inCluePanel(event.relatedTarget)) hide();
    }, true);
    listen(host, 'pointerout', event => {
      if (active?.source === 'pointer' && !inCluePanel(event.relatedTarget) && cellFor(event.relatedTarget)?.node !== active.node) hide();
    });
    listen(document, 'focusin', event => {
      if (inCluePanel(event.target)) return;
      const cell = cellFor(event.target);
      if (cell) show(cell, 'keyboard');
      else if (grid?.root.contains(event.target)) { const selected = selectedCell(); if (selected) show(selected, 'keyboard'); }
      else if (active?.source === 'keyboard') hide();
    }, true);
    listen(document, 'focusout', event => {
      if (active?.source === 'keyboard' && !grid?.root.contains(event.relatedTarget) && !inCluePanel(event.relatedTarget)) hide();
    }, true);
    listen(document, 'keydown', event => {
      if (event.key === 'Escape') { hide(); return; }
      if (!/^Arrow(?:Up|Down|Left|Right)$/.test(event.key) || event.composedPath().some(node => node.id === 'margin-host' || node.nodeType === 1 && node.hasAttribute('data-margin-inline'))) return;
      const before = selectedCell()?.node;
      clearTimeout(keyboardTimer);
      keyboardTimer = setTimeout(() => {
        refresh(); const next = selectedCell();
        if (next && (next.node !== before || grid.root.contains(document.activeElement))) show(next, 'keyboard');
      }, 0);
    }, true);
    const reposition = () => { if (active) { if (rendered(active.node)) position(); else hide(); } };
    listen(window, 'resize', reposition); listen(window, 'scroll', reposition, true);
    refresh();
    return { controls, refresh, destroy() { destroyed = true; clearTimeout(keyboardTimer); hide(); listeners.forEach(remove => remove()); host.remove(); } };
  }

  function mount(ctx) {
    const { el, state } = ctx;
    // Retain earlier saved notes for compatibility; these tools don't edit them.
    state.crossword ||= {};
    const hover = installClueHover(ctx, state.crossword);
    const enabled = () => ctx.feature ? ctx.feature('letterCycle', true) : true;
    const OWN = '#margin-host,[data-margin-inline],[data-margin-overlay]';
    const SELECTED = '[aria-selected="true"],[data-selected="true"],[class*="Cell-selected"],[class*="Cell_selected"],.xwd__cell--selected';
    const INTERVAL = 700;
    let destroyed = false, grid = null, target = null, phase = 'idle', next = 0;
    let timer = null, operation = null, pendingTrial = null, replaying = false, lastTypedAt = 0, refreshTimer = null;
    let followSelection = true;
    const listeners = [];
    const listen = (node, name, callback, options) => {
      node.addEventListener(name, callback, options);
      listeners.push(() => node.removeEventListener(name, callback, options));
    };
    const host = el('div', { id: 'margin-crossword-cycle', 'data-margin-overlay': 'crossword-cycle', hidden: true });
    Object.assign(host.style, { position: 'fixed', zIndex: '2147483631', width: 'max-content' });
    const root = host.attachShadow({ mode: ctx.shadowMode || (ctx.isPreview ? 'open' : 'closed') });
    root.append(el('style', { textContent: ':host{all:initial;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.mc-cycle{display:flex;align-items:center;gap:0;padding:0;border:0;border-radius:0;background:transparent;color:#121212;font:400 var(--toolbar-size,14px) var(--toolbar-font,Arial,sans-serif)}.mc-cycle button{display:flex;align-items:center;gap:5px;justify-content:center;height:var(--toolbar-height,48px);min-width:40px;border:0;border-radius:0;padding:0 10px;background:transparent;color:inherit;font:inherit;cursor:pointer}.mc-cycle button:hover{background:#f1f1f1}.mc-cycle button:focus-visible{outline:2px solid #4b83b4;outline-offset:2px}.mc-cycle svg{width:12px;height:12px;fill:currentColor}.mc-cycle-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}' }));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 12 12'); icon.setAttribute('aria-hidden', 'true');
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'path'); icon.append(symbol);
    const toggle = el('button', { type: 'button', 'data-cycle-action': 'toggle', 'aria-label': 'Try A–Z', onClick: () => {
      if (phase === 'running') { pause(); return; }
      if (!enabled()) return;
      refresh();
      if (!target || !available(currentCell())) return;
      if (phase !== 'paused') { next = 0; lastTypedAt = 0; }
      followSelection = false;
      phase = 'running'; paint(); step();
    } }, icon, el('span', { textContent: 'A–Z' }));
    const stop = el('button', { type: 'button', 'data-cycle-action': 'stop', 'aria-label': 'Stop A–Z', textContent: '×', hidden: true, onClick: () => {
      pause(); phase = 'idle'; next = 0;
      if (pendingTrial) pendingTrial.restart = true;
      paint();
    } });
    const status = el('span', { className: 'mc-cycle-status', role: 'status', 'aria-live': 'polite' });
    const controls = el('div', { className: 'mc-cycle', role: 'group', 'aria-label': 'Try letters in the selected square' }, toggle, stop, status);
    root.append(controls); document.documentElement.append(host);
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
    function modalOpen() {
      return Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],[data-margin-complete="true"]')).some(node =>
        !node.closest(OWN) && rendered(node) && getComputedStyle(node).opacity !== '0');
    }
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
        Object.assign(host.style,{position:'relative',left:'auto',top:'auto',margin:'0 2px',alignSelf:'center',flex:'0 0 auto'});
        const nativeStyle=getComputedStyle(rebus);
        host.style.setProperty('--toolbar-font',nativeStyle.fontFamily);host.style.setProperty('--toolbar-size',`${Math.max(14,parseFloat(nativeStyle.fontSize)||16)}px`);host.style.setProperty('--toolbar-height',`${Math.max(40,rebus.getBoundingClientRect().height)}px`);
        return;
      }
      if(host.hidden||!grid?.cells.length)return;
      const boxes=grid.cells.map(cell=>cell.node.getBoundingClientRect());
      const top=Math.min(...boxes.map(box=>box.top)),left=Math.min(...boxes.map(box=>box.left));
      Object.assign(host.style,{position:'fixed',left:`${Math.max(8,left)}px`,top:`${Math.max(8,top-40)}px`});
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
      if (!enabled() || !available(cell)) { pause(); return; }
      if (check(cell)) { done(cell); return; }
      if (Date.now() >= job.deadline) { pause('The game did not accept the letter trial. Select the square and try again.'); return; }
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
      hover.refresh(); grid = readGrid();
      const selected = selectedCell();
      if (!enabled()) { pause(); phase = 'idle'; next = 0; target = null; pendingTrial = null; followSelection = true; host.hidden = true; return; }
      if (target && !currentCell()) { pause(); phase = 'idle'; next = 0; target = null; pendingTrial = null; followSelection = true; }
      if (phase === 'running' && (!available(currentCell()) || !operation && selected?.node !== currentCell()?.node)) pause();
      if (phase !== 'running' && selected && (!target || followSelection && (selected.row !== target.row || selected.col !== target.col))) {
        target = { root: grid.root, signature: signature(grid), row: selected.row, col: selected.col };
        phase = 'idle'; next = 0; pendingTrial = null;
      }
      host.hidden = !target || !rendered(currentCell()?.node);
      paint();
    }
    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 0);
    }
    function userAction(event) {
      if (replaying || destroyed || event.composedPath().includes(host)) return;
      if (phase === 'running') pause();
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
    listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') pause(); });
    listen(window, 'resize', place); listen(window, 'scroll', place, true);
    const observer = new MutationObserver(records => {
      if (records.some(record => !(record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest(OWN))) scheduleRefresh();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['aria-selected', 'data-selected', 'aria-disabled', 'aria-readonly', 'data-puzzle-id', 'data-letter', 'class'] });
    const unbindShortcut=ctx.bindShortcut?.(()=>{
      const pencil=ctx.nativeControl?.(/^Pencil(?: |$)/i)||[...document.querySelectorAll('button[aria-label="Pencil" i]')].find(rendered);
      if(!pencil||pencil.disabled||modalOpen()||!readGrid())return false;
      pause();pencil.click();return true;
    });
    refresh();
    return { refresh, destroy() {
      unbindShortcut?.();destroyed = true; clearTimeout(timer); clearTimeout(refreshTimer); operation = null; pendingTrial = null;
      listeners.forEach(remove => remove()); observer.disconnect(); host.remove(); hover.destroy();
    } };
  }
  global.MarginGames = global.MarginGames || {};
  global.MarginGames.crossword = { mount };
})(typeof window === 'object' ? window : globalThis);
