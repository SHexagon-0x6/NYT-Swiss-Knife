(() => {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';
  const selectors = [
    '[data-margin-game="sudoku"] [data-margin-cell]',
    '.su-board .su-cell',
    '[data-testid="sudoku-board"] [data-cell]',
    '[data-testid="sudoku-cell"]',
    '.sudoku-board [role="gridcell"]',
    '[aria-label*="Sudoku"] [role="gridcell"]'
  ];
  const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'; };
  const DIGIT_SELECTOR = '[data-margin-sudoku-digit], .su-candidate-button, [data-testid^="sudoku-number-"], .su-keyboard button, .su-candidates [role="button"]';
  const UNDO_SELECTOR = '[data-margin-sudoku-undo],button.su-keyboard__undo';
  function nativeDigit(node) {
    if (!node || !visible(node) || node.closest('#margin-host,[data-margin-inline],dialog,[role="dialog"],[aria-modal="true"]')) return null;
    const label = node.getAttribute('data-margin-sudoku-digit') || node.getAttribute('data-digit') || node.getAttribute('aria-label') || node.querySelector('title')?.textContent || node.textContent;
    const match = String(label || '').trim().match(/^(?:number|digit)?\s*([1-9])(?:\s+(?:button|key))?$/i);
    return match ? Number(match[1]) : null;
  }
  function cells() {
    for (const selector of selectors) {
      const found = Array.from(document.querySelectorAll(selector)).filter(visible);
      if (found.length === 81) return found;
    }
    return [];
  }
  function filled(cell) {
    if (cell.dataset.given === 'true' || cell.getAttribute('aria-readonly') === 'true' || /(?:^|\s)(?:given|clue)(?:\s|$)/i.test(cell.className || '')) return true;
    const value = cell.querySelector('.su-cell__value, [data-testid="cell-value"], [data-margin-value], [class*="Cell_value"]');
    if (value) return /[1-9]/.test(value.textContent);
    const copy = cell.cloneNode(true);
    copy.querySelectorAll('[class*="notes"], [class*="pencil"], [data-note], [data-margin-overlay]').forEach(node => node.remove());
    return /^[1-9]$/.test(copy.textContent.trim());
  }
  const svgNode = (name, attrs) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  window.MarginGames = window.MarginGames || {};
  window.MarginGames.sudoku = { mount(ctx) {
    const { el } = ctx;
    ctx.state.sudokuNotes = ctx.state.sudokuNotes || {};
    let mode = 'play', selected = -1, board = [], lastDrawing = '', destroyed = false, nativePad = null;
    let replacedModeBar = null, nativeNormal = null, originalModeDisplay = '', originalModePriority = '';
    let nativeUndo = null, originalUndoDisabled = false;
    let autoCandidate=null,autoWrapper=null,autoPlaceholder=null,autoOriginalStyle=null,autoInputStyle=null,autoText=[];
    const autoSlot=el('div',{'data-margin-inline':'sudoku-candidates'});
    Object.assign(autoSlot.style,{display:'inline-flex',alignItems:'center',margin:'0 10px',font:'16px Arial,sans-serif',whiteSpace:'nowrap'});
    const history = [];
    const feature = name => ctx.feature ? ctx.feature(name, true) : true;
    const modeEnabled = value => value === 'play' || feature(value === 'corner' ? 'cornerNotes' : 'centerNotes');
    const overlay = svgNode('svg', { 'aria-hidden': 'true', 'data-margin-overlay': 'sudoku' });
    Object.assign(overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '10', overflow: 'hidden' });
    let overlayBoard = null, boardStyles = [];
    function restoreBoardLayer() {
      for (const [name,value,priority] of boardStyles) {
        if (value) overlayBoard.style.setProperty(name,value,priority);
        else overlayBoard.style.removeProperty(name);
      }
      boardStyles = [];overlayBoard = null;
    }
    function placeOverlay() {
      let parent = board[0]?.closest('.su-board,[data-testid="sudoku-board"],[data-margin-game="sudoku"],.sudoku-board,[role="grid"]') || board[0]?.parentElement;
      if (parent?.namespaceURI === SVG) parent = parent.parentElement;
      if (!parent) {overlay.remove();return false;}
      if (parent !== overlayBoard) {
        restoreBoardLayer();overlayBoard = parent;
        for (const [name,value] of [['position','relative'],['isolation','isolate']]) {
          if (name === 'position' && getComputedStyle(parent).position !== 'static') continue;
          boardStyles.push([name,parent.style.getPropertyValue(name),parent.style.getPropertyPriority(name)]);
          parent.style.setProperty(name,value);
        }
        parent.append(overlay);lastDrawing = '';
      }
      return true;
    }
    function dialogOpen() {
      return [...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],[data-native-settings],.su-modal-pause,.xwd__modal--content')].some(visible);
    }
    function layerVisibility() {
      const value = dialogOpen() ? 'hidden' : 'visible';
      if (overlay.style.visibility !== value) overlay.style.visibility = value;
    }
    const modalObserver = new MutationObserver(layerVisibility);
    modalObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','aria-hidden','aria-modal','style']});
    const status = el('p', { className: 'muted small', role: 'status' });
    const selection = el('p', { className: 'small', textContent: 'Choose Snyder or Center, then an empty cell.' });
    const modes = el('div', { className: 'row sudoku-modes', role: 'group', 'aria-label': 'Mark placement' });
    const modeButtons = {};
    const focusAttributes = new Map();
    const isNativeSelected=cell=>cell.matches('[aria-selected="true"],[data-selected="true"],.selected,.su-cell--selected');
    function focusBoard(){
      const cell=board[selected]||board.find(isNativeSelected)||board[0];
      if(!cell?.isConnected)return;
      if(!cell.hasAttribute('tabindex')&&cell.tabIndex<0){focusAttributes.set(cell,null);cell.setAttribute('tabindex','-1');}
      cell.focus({preventScroll:true});
    }
    function nativeSelect(index){
      const cell=board[index];if(!cell?.isConnected)return;
      if(!isNativeSelected(cell))cell.click();
      focusBoard();
    }
    function chooseMode(next, userAction = false) {
      if(userAction){
        board=cells();
        if(mode==='play'){
          const index=board.findIndex(isNativeSelected);
          if(index>=0)selected=index;
        }
      }
      mode = modeEnabled(next) ? next : 'play';
      if (next === 'play' && userAction && nativeNormal?.isConnected && !nativeNormal.disabled) nativeNormal.click();
      for (const [key, button] of Object.entries(modeButtons)) {
        button.classList.toggle('active', key === mode);
        button.setAttribute('aria-pressed', String(key === mode));
      }
      if(userAction){if(mode==='play'&&selected>=0)nativeSelect(selected);else focusBoard();}
      updateSelection(); render();
    }
    function shortcutReady() {
      return !destroyed&&cells().length===81&&!dialogOpen();
    }
    function selectMode(next) {
      if(!shortcutReady()||!modeEnabled(next))return false;
      board=cells();
      chooseMode(next,true);
      return true;
    }
    for (const [key, name] of [['play', 'Play'], ['corner', 'Snyder'], ['center', 'Center']]) {
      modeButtons[key] = el('button', { className: 'button', type: 'button', textContent: name, onClick: () => chooseMode(key, true) });
      modes.append(modeButtons[key]);
    }
    function updateSelection() {
      const active = selected >= 0 && board[selected] && !filled(board[selected]);
      selection.textContent = mode === 'play' ? '' : active ? `Row ${Math.floor(selected / 9) + 1}, column ${selected % 9 + 1} · ${mode === 'corner' ? 'Snyder' : 'Center'}` : 'Select an empty cell on the board.';
      for (const button of digits.querySelectorAll('button')) button.disabled = mode === 'play' || !active;
      clearCell.disabled = mode === 'play' || !active;
      undo.disabled = history.length === 0;
      undo.hidden = mode === 'play';
      clearAll.hidden=mode==='play';clearAll.textContent=mode==='corner'?'Erase all Snyder':'Erase all Center';
      clearAll.disabled=!Object.values(ctx.state.sudokuNotes).some(note=>note?.[mode]?.length);
      syncNativeUndo();
      undo.hidden=mode==='play'||!!(ctx.inline&&nativeUndo);
      clearCell.hidden=mode==='play'||!!(ctx.inline&&[...document.querySelectorAll('[data-testid="clear-cell"],[data-margin-sudoku-erase]')].some(visible));
      if (ctx.inline) {
        selection.hidden = mode === 'play';
        digits.hidden = mode === 'play' || !!nativePad;
      }
    }
    function restoreNativeUndo() {
      if (nativeUndo) nativeUndo.disabled = originalUndoDisabled;
      nativeUndo = null;
    }
    function syncNativeUndo() {
      const node = mode !== 'play' ? Array.from(document.querySelectorAll(UNDO_SELECTOR)).find(control => control.textContent.trim() === 'Undo' && visible(control) && !control.closest('#margin-host,[data-margin-inline],dialog,[role="dialog"],[aria-modal="true"]')) : null;
      if (nativeUndo && nativeUndo !== node) restoreNativeUndo();
      if (!node) return;
      if (nativeUndo !== node) { nativeUndo = node; originalUndoDisabled = !!node.disabled; }
      node.disabled = history.length === 0;
    }
    function remember() {
      history.push({cell:selected,notes:structuredClone(ctx.state.sudokuNotes)});
      if(history.length>30)history.shift();
    }
    function undoNotes() {
      const change=history.pop();if(!change)return;
      ctx.state.sudokuNotes=change.notes;selected=change.cell;
      nativeSelect(selected);
      ctx.save();updateSelection();render();
    }
    function eraseAll(){
      if(mode==='play'||!Object.values(ctx.state.sudokuNotes).some(note=>note?.[mode]?.length))return;
      remember();for(const note of Object.values(ctx.state.sudokuNotes))if(note)note[mode]=[];
      ctx.save();updateSelection();render();
    }
    function toggleDigit(digit) {
      if (mode === 'play' || selected < 0 || !board[selected] || filled(board[selected])) {
        ctx.notice('Select an empty cell in Snyder or Center mode first.'); return;
      }
      remember();
      const note = ctx.state.sudokuNotes[selected] || { corner: [], center: [] };
      const set = new Set(Array.isArray(note[mode]) ? note[mode] : []);
      if (set.has(digit)) set.delete(digit); else set.add(digit);
      note[mode] = Array.from(set).sort((a, b) => a - b);
      ctx.state.sudokuNotes[selected] = note;
      ctx.save(); updateSelection(); render();
    }
    function eraseCell() {
      if (selected < 0 || mode === 'play' || !board[selected] || filled(board[selected])) return;
      const note = ctx.state.sudokuNotes[selected];
      if (note?.[mode]?.length) { remember(); note[mode] = []; ctx.save(); updateSelection(); render(); }
    }
    const boardAction=action=>()=>{action();focusBoard();};
    const digits = el('div', { className: 'margin-sudoku-digits' });
    for (let digit = 1; digit <= 9; digit++) digits.append(el('button', { className: 'button', type: 'button', textContent: String(digit), 'aria-label': `Toggle mark ${digit}`, onClick: boardAction(() => toggleDigit(digit)) }));
    const clearCell = el('button', { className: 'button', type: 'button', textContent: ctx.inline ? '⌫' : 'Erase selected marks', title: 'Erase this cell’s active marks', 'aria-label': 'Erase selected marks', onClick: boardAction(eraseCell) });
    const undo = el('button', { className: 'button', type: 'button', textContent: 'Undo', 'aria-label':'Undo marks', onClick: boardAction(undoNotes) });
    const clearAll=el('button',{className:'button',type:'button',textContent:'Erase all Snyder',onClick:boardAction(eraseAll)});
    const style = el('style', { textContent: '.margin-sudoku-digits{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:3px}.margin-sudoku-digits[hidden]{display:none}.margin-sudoku-digits .button{padding:8px 0;min-width:0}.sudoku-inline{font:12px/1.4 Arial,sans-serif;color:#333;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:7px 0}.sudoku-inline .inline-label{font-size:11px;font-weight:600;color:#555;margin-right:2px}.sudoku-inline .sudoku-modes{display:inline-flex;flex-wrap:nowrap;gap:0;border:1px solid #bbb;border-radius:999px;overflow:hidden}.sudoku-inline .button{font:600 11px/1.2 Arial,sans-serif;background:#fff;color:#333;border:1px solid #c8c8c8;border-radius:999px;padding:7px 11px;min-height:29px;cursor:pointer}.sudoku-inline .sudoku-modes .button{border:0;border-radius:0}.sudoku-inline .button.active{background:#121212;color:#fff}.sudoku-inline .button:hover:not(:disabled):not(.active){background:#eee}.sudoku-inline .button:disabled{opacity:.35;cursor:default}.sudoku-inline .button:focus-visible{outline:2px solid #777;outline-offset:2px}.sudoku-inline .margin-sudoku-digits{flex-basis:100%;max-width:330px}.sudoku-inline .sudoku-selection{flex-basis:100%;text-align:center;margin:0;font-size:10px;color:#666}.sudoku-inline.native-keypad{padding:0;gap:6px}.sudoku-inline.native-keypad .inline-label{display:none}.sudoku-inline.native-keypad .sudoku-modes{width:100%;border-radius:3px;border-color:#d3d3d3}.sudoku-inline.native-keypad .sudoku-modes .button{flex:1;min-height:36px;font-size:12px;font-weight:400}.sudoku-inline [hidden]{display:none!important}' });
    const tools = el('div', { className: ctx.inline ? 'inline-tools sudoku-inline' : 'stack' }, style,
      ...(ctx.inline ? [el('span', { className: 'inline-label', textContent: 'Marks' })] : []), modes, undo, clearAll, clearCell, digits);
    style.textContent += '.sudoku-inline[hidden]{display:none!important}';
    if (ctx.inline) selection.className = 'sudoku-selection';
    tools.append(selection);
    const help = el('details', {}, el('summary', { textContent: 'Using pencil marks' }), el('p', { className: 'muted small', textContent: 'Corner marks for Snyder notation; Center marks for other possibilities. Use the game’s number buttons or type 1–9. Backspace erases this mode; Esc returns to Play. Undo restores your last 30 pencil changes across both modes. These marks are separate from NYT’s notes.' }));
    ctx.panel.append(tools);
    function restoreAutoCandidate(){
      if(autoWrapper){
        if(autoPlaceholder?.isConnected)autoPlaceholder.replaceWith(autoWrapper);
        if(autoOriginalStyle===null)autoWrapper.removeAttribute('style');else autoWrapper.setAttribute('style',autoOriginalStyle);
        for(const [node,text] of autoText)node.textContent=text;
        if(autoCandidate){if(autoInputStyle===null)autoCandidate.removeAttribute('style');else autoCandidate.setAttribute('style',autoInputStyle);}
      }
      autoSlot.remove();autoCandidate=null;autoWrapper=null;autoPlaceholder=null;autoText=[];
    }
    function syncAutoCandidate(){
      if(destroyed)return;
      const wrapper=board.length?[...document.querySelectorAll('label.su-keyboard__auto')].find(label=>label.querySelector('input.su-keyboard__checkbox[type="checkbox"][name="lightenComplete"]')&&label.querySelectorAll('input,button,a,[role="button"]').length===1&&(label===autoWrapper||visible(label))):null;
      if(autoWrapper&&autoWrapper!==wrapper)restoreAutoCandidate();
      if(!wrapper)return;
      autoCandidate=wrapper.querySelector('input');
      const anchor=ctx.nativeControl?.(/^(?:Settings|More)(?: |$)/i)||document.querySelector('[data-margin-sudoku-toolbar]');
      if(!anchor)return;
      if(autoWrapper!==wrapper){
        autoWrapper=wrapper;autoOriginalStyle=wrapper.getAttribute('style');autoInputStyle=autoCandidate.getAttribute('style');
        autoPlaceholder=document.createComment('native auto candidates');wrapper.before(autoPlaceholder);
        autoText=[...wrapper.childNodes].filter(node=>node.nodeType===3).map(node=>[node,node.textContent]);
        for(const [node]of autoText)node.textContent=' Auto candidate';
        wrapper.style.setProperty('display','inline-flex');wrapper.style.alignItems='center';wrapper.style.gap='5px';
        autoSlot.append(wrapper);
      }
      const control=ctx.nativeControl?.(/^Print(?: |$)/i)||anchor;
      const nativeStyle=getComputedStyle(control),height=Math.max(40,Math.min(56,anchor.getBoundingClientRect().height||48));
      Object.assign(autoSlot.style,{height:`${height}px`,margin:'0 8px'});
      Object.assign(wrapper.style,{height:'100%',margin:'0',gap:'8px',fontFamily:nativeStyle.fontFamily,fontSize:`${Math.max(14,parseFloat(nativeStyle.fontSize)||16)}px`,fontWeight:nativeStyle.fontWeight,lineHeight:'1.2',cursor:'pointer'});
      Object.assign(autoCandidate.style,{width:'18px',height:'18px',margin:'0',accentColor:'#121212',flex:'0 0 18px'});
      if(autoSlot.parentNode!==anchor.parentNode)anchor.before(autoSlot);
    }
    function nativeSettingChanged(event) { if (event.target === autoCandidate) queueMicrotask(syncAutoCandidate); }
    function restoreNativeModes() {
      if (replacedModeBar?.style.getPropertyValue('display') === 'none' && replacedModeBar.style.getPropertyPriority('display') === 'important') {
        if (originalModeDisplay) replacedModeBar.style.setProperty('display', originalModeDisplay, originalModePriority);
        else replacedModeBar.style.removeProperty('display');
      }
      replacedModeBar = null; nativeNormal = null;
    }
    function modeBar() {
      const normal = document.querySelector('[data-testid="normal-mode"]');
      const candidate = document.querySelector('[data-testid="candidate-mode"]');
      const bar = normal?.closest('.su-keyboard__split');
      if (!bar || !candidate || candidate.closest('.su-keyboard__split') !== bar || bar.querySelector('.su-candidate-button') ||
          bar.closest('dialog,[role="dialog"],[aria-modal="true"],#margin-host,[data-margin-inline]') ||
          normal.textContent.trim() !== 'Normal' || candidate.textContent.trim() !== 'Candidate' ||
          bar.textContent.replace(/\s+/g, '') !== 'NormalCandidate' || (bar !== replacedModeBar && !visible(bar))) return null;
      return { bar, normal };
    }
    function placeTools() {
      const keys = Array.from(document.querySelectorAll(DIGIT_SELECTOR)).filter(node => nativeDigit(node) !== null);
      nativePad = new Set(keys.map(nativeDigit)).size === 9 ? keys[0].closest('.su-candidates,.su-keyboard,[data-margin-sudoku-keypad],[data-testid="sudoku-keypad"]') || keys[0].parentElement : null;
      const anyNotes = modeEnabled('corner') || modeEnabled('center');
      const replacement = ctx.inline && board.length && nativePad && anyNotes ? modeBar() : null;
      if (replacedModeBar && replacedModeBar !== replacement?.bar) restoreNativeModes();
      tools.hidden = !anyNotes;
      if (!ctx.inline || !board.length) return;
      let anchor = replacement?.bar || nativePad || board[0].closest('.su-board,[data-margin-game="sudoku"],[data-testid="sudoku-board"],.sudoku-board');
      if (!anchor) {
        anchor = board[0].parentElement;
        while (anchor && !board.every(cell => anchor.contains(cell))) anchor = anchor.parentElement;
        if (anchor?.namespaceURI === SVG) anchor = anchor.closest('svg');
      }
      if (!anchor || anchor === document.body || anchor === document.documentElement) return;
      const destination = ctx.inline('sudoku-pencil', anchor, nativePad ? 'before' : 'after');
      if (destination && tools.parentNode !== destination) destination.append(tools);
      if (destination && replacement && replacedModeBar !== replacement.bar) {
        replacedModeBar = replacement.bar; nativeNormal = replacement.normal;
        originalModeDisplay = replacedModeBar.style.getPropertyValue('display'); originalModePriority = replacedModeBar.style.getPropertyPriority('display');
        replacedModeBar.style.setProperty('display', 'none', 'important');
      }
      tools.classList.toggle('native-keypad', !!replacedModeBar);
      clearCell.textContent='⌫';
      if(clearCell.parentNode!==tools)tools.insertBefore(clearCell,digits);
    }
    function render() {
      if (destroyed) return;
      if (!placeOverlay()) return;
      layerVisibility();
      const origin = overlay.getBoundingClientRect();
      const drawings = [], nativeHighlight=board.some(isNativeSelected);
      board.forEach((cell, index) => {
        if (filled(cell)) return;
        const rect = cell.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return;
        const note = ctx.state.sudokuNotes[index] || {};
        drawings.push({ index, x: rect.x-origin.x, y: rect.y-origin.y, width: rect.width, height: rect.height, corner: modeEnabled('corner') ? note.corner || [] : [], center: modeEnabled('center') ? note.center || [] : [], active: selected === index && mode !== 'play' && !nativeHighlight });
      });
      const signature = JSON.stringify(drawings);
      if (signature === lastDrawing) return;
      lastDrawing = signature;
      const fragment = document.createDocumentFragment();
      for (const cell of drawings) {
        if (cell.active) fragment.append(svgNode('rect', { x: cell.x + 2, y: cell.y + 2, width: cell.width - 4, height: cell.height - 4, rx: 2, fill: '#bbd5f0', 'fill-opacity': '.2', stroke: '#6b8ba7', 'stroke-width': 2 }));
        const fontSize = Math.max(8, Math.min(12, cell.width * .22));
        const cornerValues = cell.corner.filter(digit => Number.isInteger(digit) && digit >= 1 && digit <= 9);
        // Sequential marks occupy the top and bottom edges, leaving the center independent.
        cornerValues.forEach((digit, index) => {
          const top = index < 5;
          const slot = top ? index : index - 5;
          const mark = svgNode('text', { x: cell.x + 4 + slot * (cell.width - 8) / 5, y: top ? cell.y + fontSize + 1 : cell.y + cell.height - 3, fill: '#444', 'font-size': fontSize, 'font-family': 'Arial, sans-serif', 'font-weight': 600 });
          mark.textContent = String(digit); fragment.append(mark);
        });
        const centerValues = cell.center.filter(digit => Number.isInteger(digit) && digit >= 1 && digit <= 9);
        if (centerValues.length) {
          const text = svgNode('text', { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2, 'dominant-baseline': 'central', 'text-anchor': 'middle', fill: '#444', 'font-size': Math.max(6, Math.min(fontSize + 1, (cell.width - 6) / (centerValues.length * .62))), 'font-family': 'Arial, sans-serif', 'font-weight': 600 });
          text.textContent = centerValues.join(''); fragment.append(text);
        }
      }
      overlay.replaceChildren(fragment);
    }
    function isOwnEvent(event) { return event.composedPath().some(node => node?.id === 'margin-host' || node?.hasAttribute?.('data-margin-inline')); }
    function nativeKey(event) {
      if (mode === 'play' || isOwnEvent(event) || event.button !== 0) return;
      const target = event.target?.closest?.(DIGIT_SELECTOR);
      const digit = nativeDigit(target);
      const erase = event.target?.closest?.('[data-testid="clear-cell"], [data-margin-sudoku-erase]');
      const undoTarget = event.target?.closest?.(UNDO_SELECTOR);
      const undoKey = undoTarget?.textContent.trim() === 'Undo' ? undoTarget : null;
      const action = erase || undoKey;
      if (digit === null && (!action || !visible(action) || action.closest('dialog,[role="dialog"],[aria-modal="true"]'))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type === 'click') { if (digit !== null) toggleDigit(digit); else if (undoKey) undoNotes(); else eraseCell(); }
    }
    function pick(event) {
      if(isOwnEvent(event)||event.button!==0||event.target?.closest?.('dialog,[role="dialog"],[aria-modal="true"]'))return;
      const index=board.findIndex(cell=>cell===event.target||cell.contains(event.target));
      if(index<0)return;
      selected=index;
      // Native selection and focus must still move to the square in every mode.
      // Only digit/erase input is intercepted while adding our marks.
      if(mode!=='play')focusBoard();
      updateSelection();render();
    }
    function keys(event) {
      if (isOwnEvent(event) || event.target?.closest?.('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"],[aria-modal="true"]') || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || mode === 'play') return;
      const digit = nativeDigit(event.target?.closest?.(DIGIT_SELECTOR));
      if (digit !== null && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopImmediatePropagation(); toggleDigit(digit); return; }
      const erase = event.target?.closest?.('[data-testid="clear-cell"], [data-margin-sudoku-erase]');
      if (erase && visible(erase) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopImmediatePropagation(); eraseCell(); return; }
      const undoTarget = event.target?.closest?.(UNDO_SELECTOR);
      const undoKey = undoTarget?.textContent.trim() === 'Undo' ? undoTarget : null;
      if (undoKey && visible(undoKey) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopImmediatePropagation(); undoNotes(); return; }
      if (event.key === 'Escape') { chooseMode('play', true); event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (selected < 0) {if(/^[1-9]$/.test(event.key)){event.preventDefault();event.stopImmediatePropagation();ctx.notice('Select an empty cell first.');}return;}
      if (/^[1-9]$/.test(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); toggleDigit(Number(event.key)); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); event.stopImmediatePropagation(); eraseCell(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[event.key];
        const next = selected + delta;
        if (next >= 0 && next < 81 && (Math.abs(delta) === 9 || Math.floor(next / 9) === Math.floor(selected / 9))) selected = next;
        nativeSelect(selected);event.preventDefault(); event.stopImmediatePropagation(); updateSelection(); render();
      }
    }
    function refresh() {
      board = cells();
      for (const value of ['corner', 'center']) modeButtons[value].hidden = !modeEnabled(value);
      if (!modeEnabled(mode) || !board.length) chooseMode('play');
      placeTools();
      syncAutoCandidate();
      const text = board.length ? 'Board connected · notes saved on this device' : 'Open a Sudoku puzzle to connect its board. If NYT’s layout changed, pencil tools stay inactive.';
      if (status.textContent !== text) status.textContent = text;
      updateSelection(); render();
    }
    const geometry = () => render();
    // See combined key presses before the pencil handlers can consume them.
    const unbindShortcut = ctx.bindModeShortcuts?.({play:()=>selectMode('play'),corner:()=>selectMode('corner'),center:()=>selectMode('center')},shortcutReady);
    window.addEventListener('pointerdown', nativeKey, true);
    window.addEventListener('pointerup', nativeKey, true);
    window.addEventListener('click', nativeKey, true);
    window.addEventListener('pointerdown', pick, true);
    window.addEventListener('click', pick, true);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('change', nativeSettingChanged, true);
    window.addEventListener('scroll', geometry, true);
    window.addEventListener('resize', geometry);
    chooseMode('play'); refresh();
    return { refresh, destroy() { destroyed = true; modalObserver.disconnect();restoreBoardLayer(); unbindShortcut?.();for(const [node]of focusAttributes)if(node.getAttribute('tabindex')==='-1')node.removeAttribute('tabindex');focusAttributes.clear(); restoreNativeModes(); restoreNativeUndo(); restoreAutoCandidate(); window.removeEventListener('pointerdown', nativeKey, true); window.removeEventListener('pointerup', nativeKey, true); window.removeEventListener('click', nativeKey, true); window.removeEventListener('pointerdown', pick, true); window.removeEventListener('click', pick, true); window.removeEventListener('keydown', keys, true); window.removeEventListener('change', nativeSettingChanged, true); window.removeEventListener('scroll', geometry, true); window.removeEventListener('resize', geometry); tools.remove(); overlay.remove(); } };
  } };
})();
