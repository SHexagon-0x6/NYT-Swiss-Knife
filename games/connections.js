(() => {
  'use strict';

  const COLORS = ['#f1d56b', '#add49b', '#a5b8eb', '#ceb2e2'];
  const INK = ['#514009', '#264b20', '#253b70', '#503164'];
  const CORNERS = [
    ['tl', '↖', 'Top left'], ['tr', '↗', 'Top right'],
    ['bl', '↙', 'Bottom left'], ['br', '↘', 'Bottom right'],
  ];
  const TILE_SELECTORS = [
    '[data-margin-word]', '[data-testid="connections-board"] [data-testid="card-label"]',
    '[data-testid="card-label"]', '[class*="Card-module_label__"]', '[data-testid="connections-card"]',
    '[data-testid="card"]', '[class*="Card-module_card__"]',
    '[class*="Card_card__"]',
  ];
  const FEEDBACK_SELECTORS = '[data-margin-feedback], [role="status"], [role="alert"], [class*="Toast-module"], [class*="Toast_toast"], [class*="toast-message"]';
  const MISTAKE_SELECTORS = '[data-margin-mistakes], [class*="Mistakes-module_mistakesRemainingBubbles__"]';
  const OWN_UI = '#margin-host, [data-margin-overlay], [data-margin-inline]';
  const visible = node => !!(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();
  function wordOf(node) {
    if (!node) return '';
    // NYT's current label also contains a checkbox and a keyboard-reference span.
    // Use the visible word span, keeping shortcut labels out of saved annotations.
    const word = node.matches('[data-testid="card-label"], [class*="Card-module_label__"]')
      ? Array.from(node.children).find(child => child.tagName === 'SPAN' && !/reference/i.test(child.className) && visible(child))
      : null;
    return clean(node.getAttribute('data-margin-word') || word?.innerText || node.innerText).toUpperCase();
  }

  function tiles() {
    for (const selector of TILE_SELECTORS) {
      const found = Array.from(document.querySelectorAll(selector)).filter(node =>
        !node.closest(OWN_UI) && visible(node) &&
        wordOf(node).length > 0 && wordOf(node).length <= 70);
      if (found.length >= 4 && found.length <= 16 && found.length % 4 === 0) return found;
    }
    return [];
  }

  function selected(node) {
    return node.getAttribute('aria-pressed') === 'true' || node.getAttribute('data-selected') === 'true' ||
      /(?:^|[\s_-])selected(?:[\s_-]|$)/i.test(node.className || '') ||
      node.querySelector('input[type="checkbox"]:checked') !== null ||
      node.querySelector('[aria-pressed="true"]') !== null;
  }

  function selectedWords() {
    return tiles().filter(selected).map(wordOf);
  }

  function feedbackText() {
    return Array.from(document.querySelectorAll(FEEDBACK_SELECTORS))
      .filter(node => !node.closest(OWN_UI) && visible(node))
      .map(node => clean(node.innerText)).join(' ');
  }

  function feedbackKind(text) {
    if (/already\s+(?:been\s+)?(?:guessed|tried)|already\s+(?:guessed|tried)\s+that/i.test(text)) return 'duplicate';
    if (/one\s+away/i.test(text)) return 'one-away';
    if (/not\s+quite|incorrect|try\s+again|not\s+a\s+(?:valid\s+)?(?:group|connection)|not\s+a\s+match/i.test(text)) return 'incorrect';
    return null;
  }

  function remainingMistakes() {
    for (const wrapper of document.querySelectorAll(MISTAKE_SELECTORS)) {
      if (!visible(wrapper) || wrapper.closest(OWN_UI)) continue;
      const dots = Array.from(wrapper.querySelectorAll('[data-margin-mistake], [class*="Mistakes-module_bubble__"]'));
      if (dots.length <= 4) return dots.filter(visible).length;
    }
    return null;
  }

  function publicDifficulty() {
    const candidates = document.querySelectorAll('[data-margin-difficulty], [data-testid*="difficulty"], [class*="Difficulty"], [class*="difficulty"]');
    for (const node of candidates) {
      if (!visible(node) || node.closest(OWN_UI)) continue;
      const match = clean(node.innerText).match(/(?:difficulty[^\d]{0,45})?(\d(?:\.\d+)?)\s*(?:\/\s*5|out\s+of\s+5)/i);
      if (match && Number(match[1]) <= 5) return match[1];
    }
    return null;
  }

  function mount(ctx) {
    const { el, panel, state } = ctx;
    const feature = name => typeof ctx.feature !== 'function' || ctx.feature(name) !== false;
    const integrated = typeof ctx.inline === 'function';
    state.attempts ||= [];
    state.labels = Array.from({ length: 4 }, (_, index) => clean(String(state.labels?.[index] || 'ABCD'[index])).slice(0, 60) || 'ABCD'[index]);
    // Keep existing category memberships when moving older marks to fixed corners.
    const normalized = {};
    for (const [word, marks] of Object.entries(state.marks || {})) {
      for (const [position, value] of Object.entries(marks || {})) {
        if (!CORNERS.some(([key]) => key === position) || !Number.isInteger(value) || value < 0 || value > 3) continue;
        normalized[word] ||= {};
        normalized[word][CORNERS[value][0]] = value;
      }
    }
    const migrated = JSON.stringify(state.marks || {}) !== JSON.stringify(normalized)||Object.hasOwn(state,'solvedColors');
    delete state.solvedColors;
    state.marks = normalized;
    let board = [], toolbarSlot = null, triesSlot = null, filter = null;
    let hoveredWord = null, focusedWord = null, overlaySignature = '';
    let publishedRating = null, ratingPending = false, ratingCheckedAt = 0;
    let pending = null, deadline = null, destroyed = false;
    let activePopup = null, popupTrigger = null, editingGroup = null, filterBeforeClick = null;
    const undoStack = [], listeners = [];
    // Solved groups belong to this game view, not shared extension storage.
    const solvedColors = new Set();
    let undoSlot=null, actionRow=null, actionWrap='';
    function stripSolved(marks) {
      for(const [word,tags] of Object.entries(marks)){
        for(const [position,index] of Object.entries(tags))if(solvedColors.has(index))delete tags[position];
        if(!Object.keys(tags).length)delete marks[word];
      }
    }
    function pruneUndo() {
      stripSolved(state.marks);
      undoStack.forEach(stripSolved);
      for(let i=undoStack.length-1;i>=0;i--){
        const next=undoStack[i+1]||state.marks;
        if(JSON.stringify(undoStack[i])===JSON.stringify(next))undoStack.splice(i,1);
      }
      undoButton.disabled=!undoStack.length;
    }
    function syncSolvedColors() {
      // Inspect only rendered solved categories; never read the puzzle's answers.
      const palette=[[249,223,109],[160,195,90],[176,196,239],[186,129,197]];
      const before=JSON.stringify(state.marks), observed=new Set();
      for(const row of document.querySelectorAll('[class*="SolvedCategory-module_solvedCategory"],[data-testid="solved-category"]')){
        if(!visible(row)||row.closest(OWN_UI))continue;
        const words=row.querySelectorAll('[class*="SolvedCategory-module_cardListItem"],[data-solved-word]');
        if(words.length!==4)continue;
        for(const node of [row,...row.querySelectorAll('[class*="SolvedCategory-module_textSide"],[data-solved-text]')]){
          const rgb=getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
          if(!rgb||rgb.length>3&&rgb[3]<0.95)continue;
          const index=palette.findIndex(color=>color.every((channel,i)=>Math.abs(channel-rgb[i])<=10));
          if(index>=0){observed.add(index);break;}
        }
      }
      if(board.length===16&&!observed.size)solvedColors.clear();
      for(const index of observed)solvedColors.add(index);
      pruneUndo();
      if(solvedColors.has(filter))filter=null;
      if(solvedColors.has(editingGroup))closePopup();
      if(before!==JSON.stringify(state.marks))ctx.save();
    }
    const listen = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      listeners.push(() => target.removeEventListener(type, fn, options));
    };
    const css = `
      *{box-sizing:border-box}[hidden]{display:none!important}button,input,select{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #4b83b4;outline-offset:2px}
      .connection-inline-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;min-height:40px;width:100%;margin:0;color:var(--ink,#121212);font:14px/1.35 var(--tool-font,Arial,Helvetica,sans-serif)}
      .connection-inline-difficulty{font-size:12px;color:var(--muted,#666);max-width:110px;margin-right:auto}
      .connection-undo{display:flex;align-items:center;justify-content:center;text-align:center}
      .connection-swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;flex:1;min-width:250px}.connection-group{display:flex;align-items:stretch;min-width:0;background:var(--group-bg);border-radius:5px;border:1px solid transparent}
      .connection-group:has(.connection-swatch[aria-pressed=true]){border-color:var(--ink,#121212)}
      .connection-swatch{display:flex;align-items:center;justify-content:center;min-width:0;min-height:38px;flex:1;padding:7px 6px;border:0;border-radius:5px;background:transparent;font:600 13px/1.3 var(--tool-font,Arial,Helvetica,sans-serif);cursor:pointer}
      .connection-swatch>span{display:block;overflow-wrap:anywhere;white-space:normal;text-align:center}
      .connection-clear-group{display:grid;place-items:center;width:28px;min-height:38px;flex:0 0 28px;padding:0;border:0;border-left:1px solid #0002;border-radius:0 4px 4px 0;background:transparent;color:inherit;font:22px/1 Arial,sans-serif}.connection-clear-group:hover{background:#0001}
      .connection-tries{display:grid;place-items:center;width:var(--toolbar-width,48px);height:var(--toolbar-height,48px);flex-shrink:0;border:0;border-radius:0;padding:0;background:transparent;color:var(--ink,#121212)}.connection-tries:hover,.connection-tries[aria-expanded=true]{background:var(--surface,#f6f6f6)}.connection-tries svg{width:var(--toolbar-icon-size,28px);height:var(--toolbar-icon-size,28px);fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .connection-popup{position:fixed;pointer-events:auto;box-sizing:border-box;max-width:calc(100vw - 24px);overflow-y:auto;overscroll-behavior:contain;padding:14px 16px;border:1px solid var(--line,#d3d6da);border-radius:8px;background:var(--paper,#fff);color:var(--ink,#121212);font:12px/1.5 Arial,Helvetica,sans-serif;box-shadow:0 6px 24px #0002}
      .connection-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:14px}.connection-popup-close{border:0;background:transparent;padding:0;width:28px;height:28px;font-size:22px;line-height:1}
      .connection-popup .button{border:1px solid var(--line,#d3d6da);border-radius:4px;background:var(--paper,#fff);color:inherit;padding:6px 10px;font-size:12px}.connection-popup .button.primary{background:var(--ink,#121212);color:var(--paper,#fff);border-color:var(--ink,#121212)}
      .connection-popup .muted{color:var(--muted,#666);font-size:11px}.connection-popup p{margin:6px 0}.connection-popup .field{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--line,#d3d6da);border-radius:4px;background:var(--paper,#fff);color:inherit;font:13px Arial,sans-serif}
      .connection-popup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.connection-attempt{padding:10px 0;border-top:1px solid var(--line,#d3d6da)}.connection-attempt:first-child{border-top:0}.connection-attempt-head{display:flex;align-items:center;gap:8px}.connection-attempt-head>span{margin-right:auto;font-size:10px}.connection-attempt .field{width:auto;max-width:170px;font-size:11px;padding:4px 6px}.connection-words{font-size:11px;font-weight:600;line-height:1.7;margin:5px 0}.connection-popup .empty{color:var(--muted,#666);padding:8px 0}
      @media(max-width:430px){.connection-inline-toolbar{gap:8px}.connection-inline-difficulty{font-size:12px}.connection-swatches{gap:4px}.connection-swatch{font-size:12px;padding:6px 4px}.connection-clear-group{width:24px;flex-basis:24px}}
      .connection-popup{font-family:var(--tool-font,Arial,Helvetica,sans-serif);font-size:14px}.connection-words{font-size:14px;line-height:1.5}.connection-one-away{font-size:12px;font-weight:600;padding:3px 7px;border:1px solid var(--line,#d3d6da);border-radius:3px}.connection-attempt-head{margin-bottom:6px}

    `;
    const style = el('style', { textContent: css });
    const undoButton = el('button', { className: 'button', type: 'button', textContent: 'Undo mark', disabled: true, onClick: () => {
      if (!feature('cornerLabels') || !undoStack.length) return;
      state.marks = undoStack.pop(); pruneUndo();
      ctx.save(); renderOverlay();
    } });
    panel.append(style);
    if(!integrated)panel.append(undoButton);

    const inlineDifficulty = el('span', { className: 'connection-inline-difficulty', role: 'status', 'aria-live': 'polite' });
    const swatches = el('div', { className: 'connection-swatches', role: 'group', 'aria-label': 'Your four categories' });
    const swatchButtons = [], clearButtons = [];
    function paintGroups() {
      swatches.hidden=!feature('cornerLabels')||solvedColors.size===4;
      swatches.style.gridTemplateColumns=`repeat(${Math.max(1,4-solvedColors.size)},minmax(0,1fr))`;
      swatchButtons.forEach((button, index) => {
        button.parentElement.hidden=solvedColors.has(index);
        button.firstElementChild.textContent = state.labels[index];
        button.setAttribute('aria-pressed', String(filter === index));
        button.setAttribute('aria-label', `Group ${'ABCD'[index]}: ${state.labels[index]}`);
        button.title = `${state.labels[index]} · Click to show only this color. Double-click to rename.`;
        clearButtons[index].hidden = filter !== index;
      });
    }
    function snapshotMarks() {
      undoStack.push(JSON.parse(JSON.stringify(state.marks)));
      if (undoStack.length > 30) undoStack.shift();
      undoButton.disabled = false;
    }
    function clearGroup(index) {
      if (!feature('cornerLabels')||solvedColors.has(index)) return;
      const position = CORNERS[index][0];
      if (!Object.values(state.marks).some(marks => marks[position] === index)) return;
      snapshotMarks();
      for (const [word, marks] of Object.entries(state.marks)) {
        delete marks[position];
        if (!Object.keys(marks).length) delete state.marks[word];
      }
      ctx.save(); renderOverlay();
    }
    for (let index = 0; index < 4; index++) {
      const button = el('button', { className: 'connection-swatch', type: 'button', 'data-group': String(index), onClick: event => {
        if (!feature('cornerLabels')||solvedColors.has(index)) return;
        if (event.detail < 2) filterBeforeClick = filter;
        closePopup(); filter = filter === index ? null : index; paintGroups(); renderOverlay();
      }, onDblclick: event => {
        event.preventDefault(); filter = filterBeforeClick; paintGroups(); renderOverlay(); openRename(index);
      }, onKeydown: event => {
        if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); openRename(index); }
      } }, el('span', { textContent: 'ABCD'[index] }));
      button.style.color = INK[index];
      const clear = el('button', { className: 'connection-clear-group', type: 'button', textContent: '×', hidden: true,
        'aria-label': `Clear group ${'ABCD'[index]} marks`, title: `Clear all ${['yellow','green','blue','purple'][index]} marks`, onClick: () => clearGroup(index) });
      swatchButtons.push(button); clearButtons.push(clear);
      const group=el('div',{className:'connection-group'},button,clear);group.style.setProperty('--group-bg',COLORS[index]);group.style.color=INK[index];swatches.append(group);
    }
    const historyIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    historyIcon.setAttribute('viewBox','0 0 24 24');historyIcon.setAttribute('aria-hidden','true');
    const historyPath=document.createElementNS('http://www.w3.org/2000/svg','path');
    historyPath.setAttribute('d','M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2');historyIcon.append(historyPath);
    const triesButton = el('button', { className: 'connection-tries', type: 'button', 'aria-label': 'Previous tries', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onClick: () => {
      if (!feature('attemptHistory')) return;
      if (activePopup === historyPopup) closePopup(true);
      else openPopup(historyPopup, triesButton);
    }, title:'Previous tries' }, historyIcon);
    const toolbar = el('div', { className: 'connection-inline-toolbar' }, inlineDifficulty, swatches, triesButton);
    if (!integrated) panel.prepend(toolbar);

    const popupHost = el('div', { 'data-margin-overlay': 'connections-popups' });
    Object.assign(popupHost.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483002' });
    const popupRoot = popupHost.attachShadow({ mode: ctx.shadowMode || (ctx.isPreview ? 'open' : 'closed') });
    popupRoot.append(el('style', { textContent: css }));
    document.documentElement.append(popupHost);
    const history = el('div');
    const historyPopup = el('section', { className: 'connection-popup connection-history', role: 'dialog', 'aria-label': 'Previous tries', hidden: true },
      el('div', { className: 'connection-popup-heading' }, el('strong', { textContent: 'Previous tries' }),
        el('button', { className: 'connection-popup-close', type: 'button', textContent: '×', 'aria-label': 'Close previous tries', onClick: () => closePopup(true) })),
      history);
    const renameTitle = el('strong');
    const nameInput = el('input', { className: 'field', type: 'text', maxLength: 60, autocomplete: 'off', spellcheck: false });
    function saveName() {
      if (editingGroup === null || solvedColors.has(editingGroup) || !feature('cornerLabels')) return;
      state.labels[editingGroup] = clean(nameInput.value).slice(0, 60) || 'ABCD'[editingGroup];
      ctx.save(); paintGroups(); renderOverlay(); closePopup(true);
    }
    const renamePopup = el('section', { className: 'connection-popup connection-rename', role: 'dialog', 'aria-label': 'Rename group', hidden: true },
      el('div', { className: 'connection-popup-heading' }, renameTitle,
        el('button', { className: 'connection-popup-close', type: 'button', textContent: '×', 'aria-label': 'Close group name', onClick: () => closePopup(true) })),
      nameInput, el('div', { className: 'connection-popup-actions' },
        el('button', { className: 'button', type: 'button', textContent: 'Cancel', onClick: () => closePopup(true) }),
        el('button', { className: 'button primary', type: 'button', textContent: 'Save', onClick: saveName })));
    popupRoot.append(historyPopup, renamePopup);
    listen(nameInput, 'keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); saveName(); } });
    for (const type of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'click']) listen(popupRoot, type, event => event.stopPropagation());
    function closePopup(restoreFocus = false) {
      const trigger = popupTrigger;
      const wasOpen = !!activePopup;
      if (activePopup) activePopup.hidden = true;
      activePopup = null; popupTrigger = null; editingGroup = null;
      triesButton.setAttribute('aria-expanded', 'false');
      if (wasOpen) renderOverlay();
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
    function positionPopup() {
      if (!activePopup || !popupTrigger?.isConnected) return;
      const source = toolbarSlot?.getRootNode().host || panel.host || panel;
      const sourceStyle = getComputedStyle(source);
      for (const key of ['--ink', '--muted', '--line', '--paper', '--surface']) {
        const value = sourceStyle.getPropertyValue(key);
        if (value) popupHost.style.setProperty(key, value);
      }
      const rect = popupTrigger.getBoundingClientRect();
      const width = Math.min(activePopup === historyPopup ? 400 : 300, innerWidth - 24);
      const top = Math.max(12, Math.min(innerHeight - 132, rect.bottom + 8));
      Object.assign(activePopup.style, { width: `${width}px`, maxHeight: `${Math.max(100, innerHeight - top - 12)}px`,
        left: `${Math.max(12, Math.min(innerWidth - width - 12, rect.right - width))}px`, top: `${top}px` });
    }
    function openPopup(popup, trigger) {
      closePopup(); activePopup = popup; popupTrigger = trigger; popup.hidden = false;
      triesButton.setAttribute('aria-expanded', String(popup === historyPopup));
      positionPopup(); popup.querySelector('button,input')?.focus({ preventScroll: true });
    }
    function openRename(index) {
      if(solvedColors.has(index))return;
      if (!feature('cornerLabels')) return;
      renameTitle.textContent = `Group ${'ABCD'[index]} name`;
      nameInput.setAttribute('aria-label', `Group ${'ABCD'[index]} name`);
      nameInput.value = state.labels[index];
      openPopup(renamePopup, swatchButtons[index]); editingGroup = index;
      nameInput.focus({ preventScroll: true }); nameInput.select();
    }
    listen(window, 'pointerdown', event => {
      if (!activePopup) return;
      const path = event.composedPath();
      if (path.includes(popupHost) || path.includes(toolbarSlot?.getRootNode().host) || path.includes(triesSlot?.getRootNode().host) || path.includes(toolbar)) return;
      closePopup();
    }, true);
    listen(window, 'keydown', event => {
      if (activePopup && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closePopup(true); }
    }, true);

    const overlay = el('div', { id: 'margin-connections-overlay', 'data-margin-overlay': 'connections' });
    Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000' });
    const overlayRoot = overlay.attachShadow({ mode: ctx.shadowMode || (ctx.isPreview ? 'open' : 'closed') });
    const overlayContent = el('div');
    overlayRoot.append(el('style', { textContent: `
      :host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}.corner-handle{position:absolute;width:var(--corner-size,32px);height:var(--corner-size,32px);padding:0;border:0;background:none;border-radius:0;pointer-events:auto;cursor:pointer}.corner-handle::before{content:'';position:absolute;inset:0;background:var(--tag-bg);clip-path:polygon(0 0,100% 0,0 100%)}
      [data-corner=tr]::before{clip-path:polygon(0 0,100% 0,100% 100%)}[data-corner=bl]::before{clip-path:polygon(0 0,0 100%,100% 100%)}[data-corner=br]::before{clip-path:polygon(100% 0,0 100%,100% 100%)}
      .corner-handle.empty{opacity:0;pointer-events:none}.corner-handle.empty.revealed,.corner-handle.empty:focus-visible{opacity:.38;pointer-events:auto}.corner-handle:hover::before{filter:brightness(.92)}.corner-handle:focus-visible{outline:2px solid #111;outline-offset:1px}
      @media(pointer:coarse){.corner-handle.empty{opacity:.38;pointer-events:auto}}
    ` }), overlayContent);
    document.body.append(overlay);
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) listen(overlayRoot, type, event => event.stopPropagation());
    listen(overlayRoot, 'pointerover', event => {
      const word = event.target.closest?.('[data-word]')?.dataset.word;
      if (word) { hoveredWord = word; paintCornerHover(); }
    });
    listen(overlayRoot, 'pointerout', event => {
      const next = event.relatedTarget;
      if (next && overlayRoot.contains(next)) return;
      const tile = board.find(node => node === next || node.contains(next));
      hoveredWord = tile ? wordOf(tile) : null; if(tile)renderOverlay();paintCornerHover();
    });
    listen(overlayRoot, 'focusin', event => {
      const word = event.target.closest?.('[data-word]')?.dataset.word;
      focusedWord=word&&event.target.matches(':focus-visible')?word:null;paintCornerHover();
    });
    listen(overlayRoot,'focusout',event=>{
      if(!overlayRoot.contains(event.relatedTarget)){focusedWord=null;paintCornerHover();}
    });
    listen(window,'pointerdown',()=>{focusedWord=null;paintCornerHover();},true);
    function renderOverlay() {
      if (destroyed) return;
      overlay.hidden = !feature('cornerLabels');
      if (overlay.hidden) return;
      const drawn = [];
      for (const tile of board) {
        if (!visible(tile)) continue;
        const rect = tile.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
        if (centerX < 0 || centerX > innerWidth || centerY < 0 || centerY > innerHeight) continue;
        const hit = document.elementFromPoint(centerX, centerY);
        if (hit !== tile && !tile.contains(hit)) continue;
        const word = wordOf(tile), marks = state.marks[word] || {}, size=Math.max(18,Math.min(34,Math.floor((Math.min(rect.width,rect.height)-4)/2)));
        CORNERS.forEach(([position], index) => { if(solvedColors.has(index))return; drawn.push({ word, position, index, size, marked: marks[position] === index,
          left: Math.round(position.endsWith('r') ? rect.right - size - 1 : rect.left + 1),
          top: Math.round(position.startsWith('b') ? rect.bottom - size - 1 : rect.top + 1) }); });
      }
      const signature = JSON.stringify({ drawn, filter, labels: state.labels });
      if (signature === overlaySignature) return;
      overlaySignature = signature;
      const focused = overlayRoot.activeElement;
      const restore = focused?.matches(':focus-visible') ? `${focused.dataset.word}:${focused.dataset.corner}` : null;
      overlayContent.replaceChildren(...drawn.map(mark => {
        const cornerName = CORNERS[mark.index][2].toLowerCase();
        const badge = el('button', { className: `corner-handle${mark.marked ? '' : ' empty'}`, type: 'button', hidden: filter !== null && filter !== mark.index,
          'data-word': mark.word, 'data-corner': mark.position, 'data-color': String(mark.index),
          'aria-label': `${mark.marked ? 'Remove' : 'Add'} group ${'ABCD'[mark.index]}: ${state.labels[mark.index]}, ${cornerName} on ${mark.word}`,
          'aria-pressed': String(mark.marked), title: `${state.labels[mark.index]} · ${['Yellow','Green','Blue','Purple'][mark.index]} · ${mark.word}. Click to ${mark.marked ? 'remove' : 'mark'}.`,
          onClick: event => { event.preventDefault(); event.stopPropagation(); changeMark(mark.word, mark.position); } });
        Object.assign(badge.style, { left: `${mark.left}px`, top: `${mark.top}px` });badge.style.setProperty('--corner-size',`${mark.size}px`);
        badge.style.setProperty('--tag-bg', COLORS[mark.index]);
        return badge;
      }));
      paintCornerHover();
      if (restore) Array.from(overlayContent.children).find(node => !node.hidden && `${node.dataset.word}:${node.dataset.corner}` === restore)?.focus({ preventScroll: true });
    }
    function paintCornerHover() {
      for (const button of overlayContent.querySelectorAll('.corner-handle.empty')) button.classList.toggle('revealed', button.dataset.word === hoveredWord || button.dataset.word === focusedWord);
    }
    function trackWordHover(event) {
      if (event.target.closest?.('#margin-connections-overlay')) return;
      const tile = board.find(node => node === event.target || node.contains(event.target));
      hoveredWord = tile ? wordOf(tile) : null; if(tile)renderOverlay();paintCornerHover();
    }
    function trackWordFocus(event) {
      if (event.target.closest?.('#margin-connections-overlay')) return;
      const tile = board.find(node => node === event.target || node.contains(event.target));
      focusedWord = tile&&event.target.matches?.(':focus-visible') ? wordOf(tile) : null; paintCornerHover();
    }
    function syncUndo() {
      if(!integrated)return;
      const nativeButtons=[...document.querySelectorAll('button')].filter(node=>visible(node)&&!node.closest(OWN_UI));
      const submit=nativeButtons.find(node=>/^submit$/i.test(clean(node.textContent)));
      if(!submit){if(undoSlot)undoSlot.getRootNode().host.hidden=true;return;}
      undoSlot=ctx.inline('connections-undo',submit,'before',{width:'auto',display:'inline-block'});
      if(undoButton.parentNode!==undoSlot)undoSlot.replaceChildren(el('style',{textContent:css+' .connection-undo:disabled{opacity:.5;cursor:default}'}),undoButton);
      const host=undoSlot.getRootNode().host;
      host.hidden=!feature('cornerLabels');
      Object.assign(host.style,{width:'auto',maxWidth:'none',margin:'0',display:'inline-flex',flex:'0 0 auto',alignSelf:'center',alignItems:'center'});
      Object.assign(undoSlot.style,{display:'flex',alignItems:'center',justifyContent:'center'});
      undoButton.classList.add('connection-undo');
      const sample=nativeButtons.find(node=>/^shuffle$/i.test(clean(node.textContent)))||submit;
      const styles=getComputedStyle(sample);
      for(const prop of ['fontFamily','fontSize','fontWeight','lineHeight','border','borderRadius','backgroundColor','color','padding','height','minWidth','boxSizing'])undoButton.style[prop]=styles[prop];
      undoButton.style.margin='0';
      const row=submit.parentElement;
      if(actionRow!==row){
        if(actionRow)actionRow.style.flexWrap=actionWrap;
        actionRow=row;actionWrap=row.style.flexWrap;
      }
      if(getComputedStyle(row).display==='flex'&&getComputedStyle(row).flexWrap==='nowrap')row.style.flexWrap='wrap';
    }
    function syncInline() {
      if (!integrated) return;
      let anchor = null;
      if (board.length) {
        anchor = board[0].parentElement;
        while (anchor && !board.every(tile => anchor.contains(tile))) anchor = anchor.parentElement;
        if (anchor === document.body || anchor === document.documentElement) anchor = null;
      }
      anchor ||= document.querySelector('[data-testid="connections-board"], [data-margin-game="connections"]');
      if (!anchor || !visible(anchor)) {
        if (toolbarSlot) toolbarSlot.getRootNode().host.hidden = true;
        closePopup(); return;
      }
      const instruction=[...document.querySelectorAll('p,h2,h3')].find(node=>visible(node)&&/^Create four groups of four!?$/i.test(clean(node.textContent)));
      toolbarSlot = ctx.inline('connections-tools', instruction||anchor, instruction?'after':'before');
      if (toolbar.parentNode !== toolbarSlot) toolbarSlot.replaceChildren(el('style', { textContent: css }), toolbar);
      toolbarSlot.getRootNode().host.hidden = false;
      const bounds=anchor.getBoundingClientRect();
      Object.assign(toolbarSlot.getRootNode().host.style,{width:'100%',maxWidth:`${Math.max(280,bounds.width)}px`,position:'relative',zIndex:'2',margin:'8px auto 12px'});
      const stats=ctx.nativeControl?.(/^(?:Statistics|Stats|Help)(?: |$)/i);
      if(stats&&ctx.toolbar){
        triesSlot=ctx.toolbar('connections-tries',stats);
        if(triesButton.parentNode!==triesSlot)triesSlot.append(el('style',{textContent:css}),triesButton);
      }else if(triesButton.parentNode!==toolbar)toolbar.append(triesButton);
      positionPopup();
    }
    function changeMark(word, position) {
      if (!feature('cornerLabels')) return;
      const index = CORNERS.findIndex(([key]) => key === position);
      if (index < 0 || solvedColors.has(index)) return;
      if (!Object.hasOwn(state.marks, word) && Object.keys(state.marks).length >= 64) {
        ctx.notice('This puzzle already has marks on 64 words. Erase a word’s marks before adding another.'); return;
      }
      snapshotMarks(); state.marks[word] ||= {};
      if (state.marks[word][position] === index) delete state.marks[word][position];
      else state.marks[word][position] = index;
      if (!Object.keys(state.marks[word]).length) delete state.marks[word];
      ctx.save(); renderOverlay();
    }
    function requestDifficulty() {
      const helper = window.MarginConnectionsRating;
      if (!feature('difficulty') || publishedRating !== null || ratingPending || !helper?.read || Date.now() - ratingCheckedAt < 10000) return;
      ratingPending = true; ratingCheckedAt = Date.now();
      Promise.resolve().then(() => helper.read({ enabled: true })).then(result => {
        if (destroyed || !feature('difficulty')) return;
        if (typeof result?.rating === 'number' && result.rating >= 0 && result.rating <= 5) publishedRating = result.rating;
      }).catch(() => {}).finally(() => { ratingPending = false; if (!destroyed) refresh(); });
    }

    function rememberSubmission() {
      if (pending || !feature('attemptHistory')) return;
      const words = selectedWords();
      if (words.length !== 4) return;
      pending = { words, initialWords:tiles().map(wordOf), initialFeedback: feedbackText(), initialMistakes: remainingMistakes(), lossTimer: null,
        seenClear: false, observedFeedbackMutation: false, started: Date.now() };
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        if (pending) {
          // Keep the submitted words even when no feedback text was observed.
          const count = remainingMistakes();
          if (pending.initialMistakes !== null && count !== null && count < pending.initialMistakes) addAttempt(pending.words, 'incorrect', 'nyt-mistake-count');
          else addAttempt(pending.words, 'unconfirmed', 'observed-submit');
          clearTimeout(pending.lossTimer);
          pending = null;
        }
      }, 4500);
    }

    function onSubmitClick(event) {
      const button = event.target.closest?.('button, [role="button"], [data-margin-submit]');
      if (!button || button.closest(OWN_UI) || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      if (button.matches('[data-margin-submit]') || /^submit$/i.test(clean(button.textContent))) rememberSubmission();
    }

    function onKey(event) {
      if (event.key !== 'Enter' || event.repeat || event.isComposing || event.defaultPrevented ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
          event.target.closest?.(`${OWN_UI}, input, textarea, select, [contenteditable="true"]`)) return;
      const control = event.target.closest?.('button, a, [role="button"], [data-margin-submit]');
      // Enter activates a focused control. Shuffle, Deselect, and tile selection are not submissions.
      if (control && (!control.matches('[data-margin-submit]') && !/^submit$/i.test(clean(control.textContent)))) return;
      if (control?.disabled || control?.getAttribute('aria-disabled') === 'true') return;
      rememberSubmission();
    }

    function captureFeedback() {
      if (!pending || !feature('attemptHistory')) return;
      const text = feedbackText();
      if (!text) pending.seenClear = true;
      const kind = feedbackKind(text);
      if (kind && (text !== pending.initialFeedback || pending.seenClear || pending.observedFeedbackMutation)) {
        if (kind !== 'duplicate') addAttempt(pending.words, kind, 'nyt-feedback');
        clearTimeout(pending.lossTimer);
        pending = null;
        clearTimeout(deadline);
        return;
      }
      const remaining=tiles().map(wordOf);
      if(remaining.length===pending.initialWords.length-4&&pending.words.every(word=>!remaining.includes(word))&&remaining.every(word=>pending.initialWords.includes(word))){
        addAttempt(pending.words,'unconfirmed','observed-submit');clearTimeout(pending.lossTimer);clearTimeout(deadline);pending=null;return;
      }
      const count = remainingMistakes();
      if (pending.initialMistakes !== null && count !== null && count < pending.initialMistakes && pending.lossTimer === null) {
        // Ordinary NYT misses may only remove a visible dot. Allow a brief window
        // for a more specific One away toast before recording that known miss.
        const attempt = pending;
        attempt.lossTimer = setTimeout(() => {
          if (pending !== attempt) return;
          const current = remainingMistakes();
          if (current !== null && current < attempt.initialMistakes) {
            addAttempt(attempt.words, 'incorrect', 'nyt-mistake-count');
            pending = null;
            clearTimeout(deadline);
          }
        }, 750);
      }
    }

    function addAttempt(words, result, source) {
      if (!feature('attemptHistory')) return;
      state.attempts.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, words: words.slice(), result, source, time: Date.now() });
      if (state.attempts.length > 50) state.attempts.shift();
      ctx.save();
      renderHistory();
    }

    function renderHistory() {
      triesButton.title=`Previous tries (${state.attempts.length})`;
      if(!state.attempts.length){history.replaceChildren(el('p',{className:'empty',textContent:'No tries yet.'}));return;}
      history.replaceChildren(...state.attempts.slice().reverse().map((attempt,index)=>{
        const heading=el('div',{className:'connection-attempt-head'},el('span',{textContent:`Try ${state.attempts.length-index}`}));
        if(attempt.result==='one-away'&&attempt.source!=='manual')heading.append(el('span',{className:'connection-one-away',textContent:'One away'}));
        return el('div',{className:'connection-attempt'},heading,el('div',{className:'connection-words',textContent:attempt.words.join(' · ')}));
      }));
    }


    function refresh() {
      board = tiles();
      syncSolvedColors();syncUndo();
      if (!feature('attemptHistory') && pending) { clearTimeout(deadline); clearTimeout(pending.lossTimer); pending = null; }
      swatches.hidden = !feature('cornerLabels'); undoButton.hidden = !feature('cornerLabels');
      inlineDifficulty.hidden = !feature('difficulty'); triesButton.hidden = !feature('attemptHistory');
      if (activePopup === historyPopup && !feature('attemptHistory') || activePopup === renamePopup && !feature('cornerLabels')) closePopup();
      paintGroups(); syncInline();
      let rating = feature('difficulty') ? publicDifficulty() : null;
      const visibleRating = rating !== null;
      if (feature('difficulty') && rating === null) { requestDifficulty(); rating = publishedRating; }
      const hasRating = rating !== null;
      const loading = !hasRating && ratingPending;
      const text = hasRating ? `Difficulty ${rating}/5` : loading ? 'Difficulty loading…' : 'Difficulty unavailable';
      if (inlineDifficulty.textContent !== text) inlineDifficulty.textContent = text;
      inlineDifficulty.setAttribute('aria-busy',String(loading));
      inlineDifficulty.title = hasRating ? visibleRating ? 'Rating visible on this puzzle page' : 'Published NYT difficulty rating' : loading ? 'Loading the published difficulty rating.' : 'A published difficulty rating is not available.';
      captureFeedback(); renderOverlay(); positionPopup();
    }
    const geometry = () => { renderOverlay(); positionPopup(); };
    listen(document, 'pointerover', trackWordHover, true);
    listen(document, 'focusin', trackWordFocus, true);
    listen(window, 'blur', () => { hoveredWord = null; focusedWord = null; paintCornerHover(); closePopup(); });
    listen(document, 'pointerout', event => { if (!event.relatedTarget) { hoveredWord = null; paintCornerHover(); } }, true);
    listen(document, 'click', onSubmitClick, true);
    listen(document, 'keydown', onKey, true);
    listen(window, 'resize', geometry);
    listen(window, 'scroll', geometry, true);
    const feedbackObserver = new MutationObserver(records => {
      if (!pending) return;
      const changedWithin = selectors => records.some(record => {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target?.closest(OWN_UI)) return false;
        return target?.closest(selectors) || Array.from(record.addedNodes).some(node =>
          node.nodeType === Node.ELEMENT_NODE && (node.matches(selectors) || node.querySelector(selectors)));
      });
      const feedbackChanged = changedWithin(FEEDBACK_SELECTORS);
      if (feedbackChanged || changedWithin(MISTAKE_SELECTORS)) {
        if (feedbackChanged) pending.observedFeedbackMutation = true;
        captureFeedback();
      }
    });
    feedbackObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    renderHistory(); refresh();
    if (migrated) ctx.save();
    return { refresh, settingsChanged: refresh, destroy() {
      destroyed = true;
      clearTimeout(deadline); clearTimeout(pending?.lossTimer);
      feedbackObserver.disconnect(); listeners.forEach(remove => remove());
      closePopup(); overlay.remove(); popupHost.remove(); toolbar.remove();undoButton.remove();
      if(actionRow)actionRow.style.flexWrap=actionWrap;
    } };
  }

  window.MarginGames ||= {};
  window.MarginGames.connections = { mount };
})();
