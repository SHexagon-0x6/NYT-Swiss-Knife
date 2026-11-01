/* Margin only reads letters and feedback that are already visible on the board. */
(function (global) {
  'use strict';
  const evaluated = new Set(['correct', 'present', 'absent']);
  const ENTER_SELECTOR = '[data-margin-enter], button[data-key="↵"], button[data-key="Enter"], button[data-key="ENTER"], button[aria-label="enter" i]';

  function normalizeRow(row) {
    if (Array.isArray(row)) return row.map(tile => ({ letter: String(tile.letter || '').toUpperCase(), state: tile.state }));
    const letters = Array.from(row.letters || row.word || '');
    return letters.map((letter, i) => ({ letter: String(letter).toUpperCase(), state: (row.states || [])[i] }));
  }

  function constraints(rows) {
    const fixed = Array(5).fill(null);
    const forbidden = Array.from({ length: 5 }, () => new Set());
    const minimum = {};
    const maximum = {};
    for (const source of rows) {
      const row = normalizeRow(source);
      if (row.length !== 5 || row.some(tile => !/^[A-Z]$/.test(tile.letter) || !evaluated.has(tile.state))) continue;
      const counts = {};
      const grays = new Set();
      row.forEach(({ letter, state }, i) => {
        if (state === 'correct') fixed[i] = letter;
        else forbidden[i].add(letter);
        if (state === 'absent') grays.add(letter);
        else counts[letter] = (counts[letter] || 0) + 1;
      });
      for (const [letter, count] of Object.entries(counts)) minimum[letter] = Math.max(minimum[letter] || 0, count);
      for (const letter of grays) maximum[letter] = Math.min(maximum[letter] ?? Infinity, counts[letter] || 0);
    }
    return { fixed, forbidden, minimum, maximum };
  }

  function guessIssues(value, rows, partial = false) {
    const guess = (partial?String(value):String(value).trim()).toUpperCase();
    if (!(partial ? /^[A-Z ]{0,5}$/ : /^[A-Z]{5}$/).test(guess)) return [{ code: 'length', message: 'Enter five letters to check your word.' }];
    const rules = constraints(rows);
    const counts = {};
    Array.from(guess).filter(letter=>letter!==' ').forEach(letter => { counts[letter] = (counts[letter] || 0) + 1; });
    const issues = [];
    for (const [letter, count] of Object.entries(counts)) {
      if (rules.maximum[letter] === 0) issues.push({ code: 'eliminated', letter, message: `${letter} was already ruled out.` });
      else if (count > (rules.maximum[letter] ?? Infinity)) issues.push({ code: 'excess', letter, message: `Earlier feedback allows only ${rules.maximum[letter]} ${letter}${rules.maximum[letter] === 1 ? '' : 's'}.` });
    }
    rules.fixed.forEach((letter, index) => {
      if (letter && (guess[index] && guess[index]!==' ' || !partial) && guess[index] !== letter) issues.push({ code: 'fixed', letter, position: index + 1, message: `${letter} is already green in position ${index + 1}.` });
    });
    Array.from(guess).forEach((letter, index) => {
      if (rules.maximum[letter] !== 0 && rules.forbidden[index].has(letter)) issues.push({ code: 'misplaced', letter, position: index + 1, message: `${letter} was ruled out of position ${index + 1}.` });
    });
    for (const [letter, count] of Object.entries(rules.minimum)) {
      if ((!partial || /^[A-Z]{5}$/.test(guess)) && (counts[letter] || 0) < count) issues.push({ code: 'missing', letter, message: count === 1 ? `Earlier feedback requires the letter ${letter}.` : `Earlier feedback requires at least ${count} ${letter}s.` });
    }
    return issues;
  }

  function validateGuess(value, rows) { return guessIssues(value, rows); }

  const api = { constraints, validateGuess };
  global.MarginWordle = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  function visible(node) {
    if (!node || !node.getClientRects().length) return false;
    const css = getComputedStyle(node);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }

  function roots() {
    const list = [document];
    for (let i = 0; i < list.length; i++) {
      list[i].querySelectorAll('game-app, game-row, game-keyboard').forEach(node => {
        if (node.shadowRoot) list.push(node.shadowRoot);
      });
    }
    return list;
  }

  function readBoard() {
    let rowNodes = [];
    for (const root of roots()) {
      rowNodes = Array.from(root.querySelectorAll('[data-margin-row], [class*="Row-module_row"], game-row')).filter(visible);
      if (rowNodes.length) break;
    }
    if (!rowNodes.length) return null;
    const rows = rowNodes.map(node => {
      const scope = node.shadowRoot || node;
      const nodes = Array.from(scope.querySelectorAll('[data-margin-tile], [class*="Tile-module_tile"], game-tile')).slice(0, 5);
      const tiles = nodes.map(tile => ({
        letter: (tile.getAttribute('letter') || tile.textContent || '').trim().toUpperCase(),
        state: tile.getAttribute('data-state') || tile.getAttribute('evaluation') || 'empty'
      }));
      const animating = nodes.some(tile => /flip/i.test(tile.getAttribute('data-animation') || '') ||
        (typeof tile.getAnimations === 'function' && tile.getAnimations().some(a => a.playState === 'running' && /flip/i.test(a.animationName || ''))));
      return { nodes, tiles, animating, done: tiles.length === 5 && tiles.every(tile => evaluated.has(tile.state)) };
    });
    if (rows.some(row => row.nodes.length !== 5)) return null;
    const completed = [];
    let current = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].animating) return { rows: completed, current: null, busy: true, rowNodes };
      if (rows[i].done) completed.push(rows[i].tiles);
      else { current = { index: i, guess: rows[i].tiles.map(tile => tile.letter).join(''), nodes: rows[i].nodes }; break; }
    }
    if (completed.some(row => row.every(tile => tile.state === 'correct'))) current = null;
    return { rows: completed, current, busy: false, rowNodes };
  }

  function keyButton(key) {
    for (const root of roots()) {
      const buttons = root.querySelectorAll('button[data-key],button[aria-label],[data-margin-enter]');
      const button = Array.from(buttons).find(node => {
        if (!visible(node) || node.disabled || node.closest('#margin-host,[data-margin-inline]')) return false;
        if (key === 'Enter') return node.matches(ENTER_SELECTOR);
        const value = node.getAttribute('data-key') || node.getAttribute('aria-label') || '';
        return key === 'Backspace' ? /^(Backspace|Delete|←|⌫|backspace)$/i.test(value) : value.toUpperCase() === key;
      });
      if (button) return button;
    }
    return null;
  }
  const enterButton = () => keyButton('Enter');

  function inlineAnchor() {
    for (const root of roots()) {
      const keyboard = Array.from(root.querySelectorAll('[data-margin-keyboard],[class*="Keyboard-module_keyboard__"],game-keyboard')).find(visible);
      if (keyboard) return { node: keyboard, position: 'before' };
    }
    const button = enterButton();
    if (button) return { node: button, position: 'before' };
    const board = Array.from(document.querySelectorAll('[data-margin-game="wordle"],[class*="Board-module_boardContainer__"],[class*="Board-module_board__"]')).find(visible);
    return board ? { node: board, position: 'after' } : null;
  }

  function mount(ctx) {
    let draft=null, draftEnter=null;

    const { panel, el } = ctx;
    const disposers = [], tileState = new Map(), styles = new Map();
    let bypass = null, pending = null, selected = null, edit = null;
    let inputVersion = 0, lastNativeInputAt = 0, deferredEnter = null, replayingDeferred = false, nativeReplay = false;
    let warningContainer = null, featureState = '', refreshFrame = 0, destroyed = false, observedRows = [];
    const feature = (name, fallback) => ctx.feature ? ctx.feature(name, fallback) : fallback;
    const protectionEnabled = () => feature('letterProtection', ctx.state.wordle?.protect ?? true);
    const editingEnabled = () => feature('clickToEdit', true);
    const tileCSS = '[data-margin-wordle-editable]{cursor:text}[data-margin-wordle-selected]{outline:2px solid #878a8c!important;outline-offset:3px}[data-margin-wordle-conflict]{color:#b42318!important;border-color:#d92d20!important;background-color:#fff0ee!important}[data-margin-wordle-conflict][data-margin-wordle-selected]{outline-color:#d92d20!important}@media(prefers-color-scheme:dark){[data-margin-wordle-conflict]{color:#ffb4ab!important;background-color:#421b1a!important;border-color:#ff7b72!important}}';
    const warningCSS = '.mw-alert{box-sizing:border-box;max-width:500px;margin:8px auto;padding:16px;background:var(--paper,#fff);color:var(--ink,#121212);border:1px solid var(--line,#d3d6da);border-radius:6px;box-shadow:0 4px 18px #0002;font:14px/1.4 Arial,sans-serif}.mw-alert[hidden]{display:none}.mw-alert h3{margin:0 0 6px;font-size:18px}.mw-alert p{margin:0}.mw-alert ul{margin:8px 0 14px;padding-left:20px;font-size:13px}.mw-actions{display:flex;gap:8px;flex-wrap:wrap}.mw-alert button{padding:9px 14px;border:1px solid var(--ink,#121212);border-radius:4px;background:var(--paper,#fff);color:var(--ink,#121212);font:600 13px Arial,sans-serif;cursor:pointer}.mw-alert .primary{background:var(--ink,#121212);color:var(--paper,#fff)}.mw-alert button:focus-visible{outline:2px solid var(--ink,#121212);outline-offset:2px}';
    const style = el('style', { textContent: warningCSS });
    const warning = el('div', { className: 'mw-alert', role: 'alertdialog', 'aria-label': 'Review your Wordle guess', hidden: true });
    panel.append(style, warning);
    const observer = new MutationObserver(() => { if (edit) advanceEdit(); refresh(); });

    function signature(value) { return JSON.stringify([location.href, value.rows, value.current?.index]); }
    function scheduleRefresh() { if (!destroyed && !refreshFrame) refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; refresh(); }); }
    function placeInline() {
      if (!ctx.inline) return;
      const anchor = inlineAnchor();
      if (!anchor) return;
      const slot = ctx.inline('wordle-warning', anchor.node, anchor.position);
      if (!slot) return;
      if (warning.parentNode !== slot) slot.append(style, warning);
      warningContainer = slot;
      const host = slot.getRootNode().host;
      if (host?.hasAttribute('data-margin-inline')) {
        // The confirmation floats over the game so showing its reasons never
        // resizes Wordle's fixed-height board or moves the native keyboard.
        Object.assign(host.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100vw - 32px)', maxWidth: '420px', margin: '0', zIndex: '2147483002' });
        Object.assign(warning.style, { margin: '0', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' });
      }
      setWarningVisibility(!warning.hidden);
    }
    function setWarningVisibility(show) {
      if (!warningContainer) return;
      warningContainer.hidden = !show;
      const host = warningContainer.getRootNode().host;
      if (host?.hasAttribute('data-margin-inline')) host.style.display = show ? 'block' : 'none';
    }
    function hideWarning() { pending = null; warning.hidden = true; warning.replaceChildren(); setWarningVisibility(false); }
    function showWarning(snapshot, issues, target) {
      placeInline();
      pending = { guess: snapshot.current.guess, signature: signature(snapshot), target };
      warning.hidden = false;
      setWarningVisibility(true);
      const keep = el('button', { className: 'primary', type: 'button', textContent: 'Keep editing', onClick: () => {
        hideWarning();
        snapshot.current.nodes.at(-1)?.focus({ preventScroll: true });
        selected = null; scheduleRefresh();
      } });
      const submit = el('button', { type: 'button', textContent: 'Submit anyway', onClick: () => {
        const now = readBoard();
        if (!pending || !now?.current || now.busy || now.current.guess !== pending.guess || signature(now) !== pending.signature) {
          hideWarning(); ctx.notice('Your guess changed. Review it and press Enter again.'); return;
        }
        const targetButton = pending.target?.isConnected && visible(pending.target) ? pending.target : enterButton();
        bypass = { guess: pending.guess, signature: pending.signature, expires: Date.now() + 15000 };
        hideWarning(); selected = null;
        if (targetButton) targetButton.click();
        else ctx.notice('Press Enter once more to submit this guess.');
      } });
      warning.replaceChildren(el('h3', { textContent: 'Are you sure?' }),
        el('p', { textContent: `${snapshot.current.guess} conflicts with earlier clues:` }),
        el('ul', {}, ...issues.map(issue => el('li', { textContent: issue.message }))),
        el('div', { className: 'mw-actions' }, keep, submit));
      ctx.reveal?.(warning);
      keep.focus({ preventScroll: true });
    }
    function inMargin(event) {
      return event.composedPath().some(node => node.id === 'margin-host' || node === panel || (node.nodeType === 1 && (node.hasAttribute('data-margin-overlay') || node.hasAttribute('data-margin-inline'))));
    }
    function editableTarget(event) { return event.composedPath().some(node => node.nodeType === 1 && node.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')); }
    function stop(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function cancelDeferred() {
      if (!deferredEnter) return;
      clearTimeout(deferredEnter.timeout); cancelAnimationFrame(deferredEnter.frame); deferredEnter = null;
    }
    function observeInput() {
      clearTimeout(draftEnter);draftEnter=null;
      inputVersion++; lastNativeInputAt = Date.now(); bypass = null; hideWarning();
      if (deferredEnter) { cancelDeferred(); ctx.notice('Your guess changed. Press Enter when ready.'); }
      scheduleRefresh();
    }
    function deferSubmission(snapshot, target) {
      const job = { version: inputVersion, signature: signature(snapshot), target, frame: null, timeout: null };
      deferredEnter = job;
      const retry = () => {
        if (deferredEnter !== job) return;
        cancelDeferred();
        const now = readBoard();
        if (inputVersion !== job.version || !now?.current || now.busy || signature(now) !== job.signature) return;
        if (!/^[A-Z]{5}$/.test(now.current.guess)) { ctx.notice('Wait until all five letters appear, then press Enter again.'); return; }
        const nativeEnter = job.target?.isConnected ? job.target : enterButton();
        if (!nativeEnter) return;
        replayingDeferred = true;
        try { nativeEnter.click(); } finally { replayingDeferred = false; }
      };
      job.frame = requestAnimationFrame(() => { if (deferredEnter === job) job.frame = requestAnimationFrame(retry); });
      job.timeout = setTimeout(retry, 80);
    }

    // Replay native keys one at a time, after their rendered result is visible.
    // This keeps the game's own state and the tile text in agreement under React batching.
    function sendNative(key) {
      nativeReplay = true;
      try {
        const button = keyButton(key);
        if (button) button.click();
        else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: key.length === 1 ? key.toLowerCase() : key, code: key.length === 1 ? `Key${key}` : key, bubbles: true, cancelable: true, composed: true }));
      } finally { nativeReplay = false; }
    }
    function cancelEdit(message) {
      if (!edit) return;
      clearTimeout(edit.timer); edit = null; selected = null; draft=null;
      if (message) ctx.notice(message);
      scheduleRefresh();
    }
    function advanceEdit() {
      const job = edit;
      if (!job || job.advancing || destroyed) return;
      job.advancing = true;
      clearTimeout(job.timer);
      try {
        let snapshot = readBoard();
        if (!snapshot?.current || snapshot.busy || signature(snapshot) !== job.signature) { cancelEdit(); return; }
        if (job.waiting) {
          if (snapshot.current.guess !== job.expected) {
            if (snapshot.current.guess !== job.before || Date.now() > job.deadline) { cancelEdit('The game could not finish that edit. Check your letters before submitting.'); return; }
            job.timer = setTimeout(advanceEdit, 8); return;
          }
          job.waiting = false;
        } else if (snapshot.current.guess !== job.expected) { cancelEdit(); return; }
        while (!job.steps.length && job.queue.length) {
          const key = job.queue.shift();
          if (key === 'Enter') { job.submit = true; break; }
          const next = key === 'Backspace' ? job.expected.slice(0, -1) : (job.expected + key).slice(0, 5);
          if (next !== job.expected) job.steps.push({ key, expected: next });
        }
        if (!job.steps.length) {
          edit = null;
          if(draft){syncDraft();refresh();return;}
          selected = null;
          lastNativeInputAt = Date.now(); refresh();
          if (job.submit) {
            const target = enterButton();
            if (target) target.click();
            else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          }
          return;
        }
        const step = job.steps.shift();
        job.before = job.expected; job.expected = step.expected; job.waiting = true; job.deadline = Date.now() + 800;
        sendNative(step.key);
        job.timer = setTimeout(advanceEdit, 0);
      } finally { job.advancing = false; }
    }
    function rewriteNative(snapshot,next){
      const old=snapshot.current.guess;
      if(old===next)return;
      let index=0;while(index<old.length&&index<next.length&&old[index]===next[index])index++;
      const steps=[];let expected=old;
      while(expected.length>index){expected=expected.slice(0,-1);steps.push({key:'Backspace',expected});}
      for(const key of next.slice(index)){expected+=key;steps.push({key,expected});}
      edit={signature:signature(snapshot),expected:old,steps,queue:[],waiting:false,timer:null};advanceEdit();
    }
    function syncDraft(){
      if(!draft||edit)return;
      const snapshot=readBoard();
      if(!snapshot?.current||snapshot.busy||signature(snapshot)!==draft.signature){draft=null;selected=null;return;}
      let prefix='';for(const letter of draft.letters){if(!letter)break;prefix+=letter;}
      draft.expectedNative=prefix;
      if(snapshot.current.guess!==prefix){rewriteNative(snapshot,prefix);return;}
      if(draft.submit&&draft.letters.every(Boolean)){
        draft=null;selected=null;refresh();
        const before=signature(snapshot),guess=snapshot.current.guess;
        // Finish the first click before invoking the native Enter button again.
        draftEnter=setTimeout(()=>{
          draftEnter=null;const now=readBoard();
          if(!destroyed&&now?.current&&!now.busy&&signature(now)===before&&now.current.guess===guess)enterButton()?.click();
        },0);
      }
    }
    function editDraft(key){
      observeInput();draft.submit=false;
      let index=draft.cursor;
      if(key==='Backspace'){
        if(!draft.letters[index]&&index>0)index--;
        draft.letters[index]='';draft.cursor=index;
      }else{draft.letters[index]=key;draft.cursor=Math.min(4,index+1);}
      selected={index:draft.cursor,signature:draft.signature};
      syncDraft();refresh();
    }
    function eventKey(event) {
      if (event.type === 'keydown') return event.key === 'Delete' ? 'Backspace' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const target = event.composedPath().find(node => node.nodeType === 1 && node.matches?.('button[data-key],button[aria-label],[data-margin-enter]'));
      if (!target) return null;
      if (target.matches(ENTER_SELECTOR)) return 'Enter';
      const value = target.getAttribute('data-key') || target.getAttribute('aria-label') || '';
      return /^(Backspace|Delete|←|⌫)$/i.test(value) ? 'Backspace' : /^[a-z]$/i.test(value) ? value.toUpperCase() : null;
    }
    function selectTile(event) {
      if (!editingEnabled() || inMargin(event) || editableTarget(event)) return false;
      const snapshot = readBoard();
      if (!snapshot?.current || snapshot.busy) return false;
      const index = snapshot.current.nodes.findIndex(tile => event.composedPath().includes(tile));
      if(index<0)return false;
      if(!draft||draft.signature!==signature(snapshot))draft={signature:signature(snapshot),letters:Array.from({length:5},(_,i)=>snapshot.current.guess[i]||''),expectedNative:snapshot.current.guess};
      draft.cursor=index;
      selected={index,signature:signature(snapshot)};
      cancelDeferred(); bypass = null; hideWarning();
      if (event.type === 'click') { stop(event); snapshot.current.nodes[index].focus({ preventScroll: true }); }
      refresh(); return true;
    }
    function guard(event) {
      if (destroyed || nativeReplay) return;
      if (event.type === 'keydown' && event.key === 'Escape' && !warning.hidden) {
        stop(event); hideWarning(); selected = null; scheduleRefresh(); return;
      }
      if (event.type === 'click' && selectTile(event)) return;
      const key = eventKey(event);
      const input = /^[A-Z]$/.test(key || '') || key === 'Backspace';
      if (inMargin(event) || editableTarget(event)) {
        if (input && deferredEnter) { inputVersion++; cancelDeferred(); }
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.type === 'keydown' && key === 'Enter') {
        if (event.shiftKey) return;
        const control = event.composedPath().find(node => node.nodeType === 1 && node.matches?.('button,a,[role="button"]'));
        if (control && !control.matches(ENTER_SELECTOR) && !control.hasAttribute('data-margin-wordle-editable')) return;
      }
      if (key === 'Escape') { selected = null; hideWarning(); scheduleRefresh(); return; }
      if(editingEnabled()&&draft){
        if(input){stop(event);editDraft(key);return;}
        if(key==='ArrowLeft'||key==='ArrowRight'){
          stop(event);draft.cursor=Math.max(0,Math.min(4,draft.cursor+(key==='ArrowLeft'?-1:1)));selected={index:draft.cursor,signature:draft.signature};refresh();return;
        }
        if(key==='Enter'){
          stop(event);
          if(!draft.letters.every(Boolean)){ctx.notice('Fill all five tiles before submitting.');return;}
          draft.submit=true;syncDraft();return;
        }
      }
      if (edit && (input || key === 'Enter')) {
        stop(event);
        if (input) edit.queue = edit.queue.filter(value => value !== 'Enter');
        if (edit.queue.length < 32 && (key !== 'Enter' || !edit.queue.includes('Enter'))) edit.queue.push(key);
        return;
      }
      if (input) {
        const snapshot = readBoard();
        selected = null; observeInput(); return;
      }
      if (key !== 'Enter') {
        if (event.type === 'click') { selected = null; scheduleRefresh(); }
        return;
      }
      selected = null; scheduleRefresh();
      if (!protectionEnabled()) return;
      if (deferredEnter) { stop(event); return; }
      const snapshot = readBoard();
      if (!snapshot?.current || snapshot.busy) return;
      const target = event.type === 'click' ? event.composedPath().find(node => node.nodeType === 1 && node.matches?.(ENTER_SELECTOR)) : null;
      const nativeEnter = target || enterButton();
      const sig = signature(snapshot);
      if (bypass && bypass.expires > Date.now() && bypass.guess === snapshot.current.guess && bypass.signature === sig) { bypass = null; hideWarning(); return; }
      bypass = null;
      if (!replayingDeferred && nativeEnter && Date.now() - lastNativeInputAt < 120) { stop(event); deferSubmission(snapshot, nativeEnter); return; }
      if (!/^[A-Z]{5}$/.test(snapshot.current.guess)) return;
      const issues = validateGuess(snapshot.current.guess, snapshot.rows);
      if (!issues.length) return;
      stop(event); showWarning(snapshot, issues, nativeEnter);
    }
    function restoreTile(tile, attrs) {
      for (const name of ['data-margin-wordle-conflict', 'data-margin-wordle-selected', 'data-margin-wordle-editable','data-margin-wordle-draft','data-margin-wordle-letter']) tile.removeAttribute(name);
      for (const [name, value] of Object.entries(attrs)) {
        if (value === null) tile.removeAttribute(name); else tile.setAttribute(name, value);
      }
    }
    function paintTiles(snapshot) {
      const current = snapshot?.current;
      const nodes = current && !snapshot.busy ? current.nodes : [];
      const conflicts = new Map();
      if(protectionEnabled()&&current&&(draft||current.guess)&&(!edit||draft)){
        const guess=draft?draft.letters.map(letter=>letter||' ').join(''):current.guess;
        const rules=constraints(snapshot.rows);
        const issues=guessIssues(guess,snapshot.rows,true);
        for (const issue of issues) {
          let positions=issue.position?[issue.position-1]:issue.code==='missing'?[]:
            [...guess].flatMap((letter,i)=>letter===issue.letter?[i]:[]);
          if(issue.code==='excess'){
            const keep=[...positions].sort((a,b)=>Number(rules.fixed[b]===issue.letter)-Number(rules.fixed[a]===issue.letter)).slice(0,rules.maximum[issue.letter]);
            positions=positions.filter(index=>!keep.includes(index));
          }
          for (const index of positions) conflicts.set(index, [...(conflicts.get(index) || []), issue.message]);
        }
      }
      for (const [tile, attrs] of tileState) {
        if (!nodes.includes(tile)) { restoreTile(tile, attrs); tileState.delete(tile); }
      }
      nodes.forEach((tile, index) => {
        if (!tileState.has(tile)) tileState.set(tile, { title: tile.getAttribute('title'), tabindex: tile.getAttribute('tabindex'), 'aria-invalid': tile.getAttribute('aria-invalid') });
        const attrs = tileState.get(tile), errors = conflicts.get(index);
        tile.toggleAttribute('data-margin-wordle-conflict', !!errors);
        if (errors) { tile.setAttribute('title', errors.join(' ')); tile.setAttribute('aria-invalid', 'true'); }
        else for (const name of ['title', 'aria-invalid']) { if (attrs[name] === null) tile.removeAttribute(name); else tile.setAttribute(name, attrs[name]); }
        const editable=editingEnabled();
        tile.toggleAttribute('data-margin-wordle-draft',!!draft);
        if(draft)tile.setAttribute('data-margin-wordle-letter',draft.letters[index]||'');else tile.removeAttribute('data-margin-wordle-letter');
        tile.toggleAttribute('data-margin-wordle-editable', editable);
        if (editable) tile.setAttribute('tabindex', '0');
        else if (attrs.tabindex === null) tile.removeAttribute('tabindex'); else tile.setAttribute('tabindex', attrs.tabindex);
        tile.toggleAttribute('data-margin-wordle-selected', !!selected && selected.index === index);
        const root = tile.getRootNode();
        if (!styles.has(root)) {
          const css = el('style', { 'data-margin-wordle-style': '', textContent: tileCSS+'[data-margin-wordle-draft]{position:relative;color:transparent!important}[data-margin-wordle-draft]::after{content:attr(data-margin-wordle-letter);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-tone-1,#121212);font:inherit;pointer-events:none}' });
          (root === document ? document.head : root).append(css); styles.set(root, css);
        }
      });
    }
    function refresh() {
      if (destroyed) return;
      const nextFeatures = JSON.stringify([protectionEnabled(), editingEnabled()]);
      if (featureState && featureState !== nextFeatures) {
        clearTimeout(draftEnter);draftEnter=null;
        cancelDeferred(); bypass = null; selected = null; draft=null; hideWarning();
        // Finish a replacement already in progress so its suffix is preserved,
        // but never carry a queued submission across a preference change.
        if (edit) { edit.queue = []; edit.submit = false; }
      }
      featureState = nextFeatures;
      const snapshot = readBoard();
      const rowNodes = snapshot?.rowNodes || [];
      if (rowNodes.length !== observedRows.length || rowNodes.some((node, i) => node !== observedRows[i])) {
        observer.disconnect(); observedRows = rowNodes;
        for (const row of rowNodes) observer.observe(row.shadowRoot || row, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-state', 'data-animation', 'letter', 'evaluation'] });
      }
      if(draft&&(!editingEnabled()||!snapshot?.current||snapshot.busy||draft.signature!==signature(snapshot))){draft=null;selected=null;}
      if(selected&&(!editingEnabled()||!snapshot?.current||snapshot.busy||selected.signature!==signature(snapshot)))selected=null;
      if (pending && (!protectionEnabled() || !snapshot?.current || snapshot.busy || snapshot.current.guess !== pending.guess || signature(snapshot) !== pending.signature)) hideWarning();
      paintTiles(snapshot); placeInline();
    }
    const cancelOnLeave = event => {
      clearTimeout(draftEnter);draftEnter=null;
      cancelDeferred(); bypass = null; selected = null; hideWarning();
      if(draft){draft.submit=false;draft=null;}
      if(event.type==='pagehide'){cancelEdit();draft=null;}
      else if (edit) { edit.queue = []; edit.submit = false; }
      scheduleRefresh();
    };
    const focus = event => { selectTile(event); };
    window.addEventListener('keydown', guard, true); window.addEventListener('click', guard, true); window.addEventListener('focusin', focus, true);
    window.addEventListener('pagehide', cancelOnLeave); window.addEventListener('blur', cancelOnLeave);
    disposers.push(() => window.removeEventListener('keydown', guard, true), () => window.removeEventListener('click', guard, true), () => window.removeEventListener('focusin', focus, true),
      () => window.removeEventListener('pagehide', cancelOnLeave), () => window.removeEventListener('blur', cancelOnLeave));
    refresh();
    return { refresh, destroy() {
      clearTimeout(draftEnter);draftEnter=null;
      destroyed = true; cancelDeferred(); cancelEdit(); cancelAnimationFrame(refreshFrame); observer.disconnect(); disposers.forEach(fn => fn()); hideWarning();
      for (const [tile, attrs] of tileState) restoreTile(tile, attrs);
      for (const css of styles.values()) css.remove();
      tileState.clear(); styles.clear(); style.remove(); warning.remove();
    } };
  }
  global.MarginGames = global.MarginGames || {};
  global.MarginGames.wordle = { mount };
})(typeof window === 'object' ? window : globalThis);
