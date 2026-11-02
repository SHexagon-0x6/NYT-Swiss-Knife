(() => {
  'use strict';
  const GAMES = {
    connections: {name: 'Connections', icon: 'icons/games/connections.svg', url: 'https://www.nytimes.com/games/connections'},
    sudoku: {name: 'Sudoku', icon: 'icons/games/sudoku.svg', url: 'https://www.nytimes.com/puzzles/sudoku/easy'},
    wordle: {name: 'Wordle', icon: 'icons/games/wordle.png', url: 'https://www.nytimes.com/games/wordle/index.html'},
    crossword: {name: 'Crossword', icon: 'icons/games/crossword.svg', url: 'https://www.nytimes.com/crosswords/game/daily'}
  };
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key in node && !key.startsWith('aria-') && !key.startsWith('data-')) node[key] = value;
      else if (value !== false && value != null) node.setAttribute(key, String(value));
    }
    for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  const extension = typeof chrome !== 'undefined' && !!chrome.storage?.local;
  const storage = {
    async all() { return extension ? chrome.storage.local.get(null) : JSON.parse(localStorage.getItem('margin-preview') || '{}'); },
    async get(key) { const values = extension ? await chrome.storage.local.get(key) : await this.all(); return values[key]; },
    async set(key, value) {
      if (typeof key !== 'string' || key.length > 1024) throw new RangeError('Notebook key is too long.');
      if (new TextEncoder().encode(JSON.stringify(value)).length > 256 * 1024) throw new RangeError('Notebook record is too large.');
      if (extension) return chrome.storage.local.set({[key]: value});
      const values = await this.all(); values[key] = value; localStorage.setItem('margin-preview', JSON.stringify(values));
    },
    async remove(keys) {
      if (extension) return chrome.storage.local.remove(keys);
      const values = await this.all(); for (const key of keys) delete values[key]; localStorage.setItem('margin-preview', JSON.stringify(values));
    },
    async prune() {
      const cutoff = Date.now() - 90 * 86400000;
      const entries = Object.entries(await this.all());
      await this.remove(entries.filter(([key, value]) => key.startsWith('puzzle:') && value.updatedAt < cutoff).map(([key]) => key));
    }
  };
  function localDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function puzzleDate(game) {
    const valid = value => globalThis.MarginStats.validDate(value);
    const path = location.pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
    const archive = path && valid(path.slice(1).join('-')) ? path.slice(1).join('-') : null;
    const selectors = game === 'crossword-daily' ? '.xwd__details--date' : '.pz-game-date,.pz-game-header__date,.pz-game-title-bar__date,[data-testid="game-date"]';
    for (const node of document.querySelectorAll(selectors)) {
      if (node.closest('[hidden],[aria-hidden="true"]') || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
      const text = node.textContent.trim(), iso = text.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
      if (valid(iso)) return archive && archive !== iso ? null : iso;
      const printed = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}\b/)?.[0];
      if (!printed) continue;
      const parsed = new Date(printed);
      if (Number.isFinite(+parsed)) {
        const date = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
        return archive && archive !== date ? null : date;
      }
    }
    return archive;
  }
  function gameForPath(path) {
    if (/^\/games\/bonus\/crossword\//.test(path)) return 'crossword';
    if (/connections(?:\/|$)/.test(path)) return 'connections';
    if (/wordle(?:\/|$)/.test(path)) return 'wordle';
    if (/sudoku(?:\/|$)/.test(path)) return 'sudoku';
    if (/crosswords\/(?:game|daily|mini)/.test(path)) return 'crossword';
    return null;
  }
  function shortcutLabel(value){
    if(!value?.key)return 'Off';
    return [value.ctrlKey?'Ctrl':null,value.altKey?'Alt':null,value.shiftKey?'Shift':null,value.metaKey?'Meta':null,
      ({Control:'Ctrl',Meta:'Command / Windows'})[value.key]||value.key].filter(Boolean).join(' + ');
  }
  function bindShortcut(callback, readOptions = () => ({ enabled: true, key: 'Shift' })) {
    const modifiers=new Set(['Shift','Control','Alt','Meta']), held=new Set();
    let pending=null;
    const cancel=()=>{pending=null;},reset=()=>{cancel();held.clear();};
    const blocked=event=>event.composedPath().some(node=>node?.nodeType===1&&(node.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""],#margin-host,[data-margin-inline],[data-margin-overlay],dialog,[role="dialog"]')||node.isContentEditable));
    const normalized=()=>{const options=readOptions();return {...options,key:typeof options.key==='string'?options.key:'Shift'};};
    const same=(event,options)=>event.key.toLowerCase()===options.key.toLowerCase()&&(!options.code||options.code===event.code)&&
      ['ctrlKey','altKey','shiftKey','metaKey'].every(flag=>event.key===({ctrlKey:'Control',altKey:'Alt',shiftKey:'Shift',metaKey:'Meta'})[flag]||!!event[flag]===!!options[flag]);
    function down(event){
      const code=event.code||event.key,otherHeld=[...held].some(value=>value!==code&&!/^(?:Control|Shift|Alt|Meta)(?:Left|Right)?$/.test(value));
      held.add(code);const options=normalized();
      if(!options.enabled||!options.key||!same(event,options)||otherHeld||event.repeat||event.isComposing||event.defaultPrevented||blocked(event)){cancel();return;}
      if(pending){cancel();return;}
      pending={key:event.key,code:event.code,url:location.href,options:JSON.stringify(options)};
      // Modifier taps keep the native release intact. Explicit letter/combo
      // shortcuts consume their key so the game cannot also enter that letter.
      if(!modifiers.has(event.key)){event.preventDefault();event.stopImmediatePropagation();}
    }
    function up(event){
      held.delete(event.code||event.key);const tap=pending;cancel();
      if(!tap||event.key!==tap.key||event.code!==tap.code||event.isComposing||event.defaultPrevented||blocked(event))return;
      const options=normalized();
      if(!options.enabled||!same(event,options)||JSON.stringify(options)!==tap.options||location.href!==tap.url)return;
      if(callback()===true){event.preventDefault();if(!modifiers.has(event.key))event.stopImmediatePropagation();}
    }
    const events=[['keydown',down],['keyup',up],['pointerdown',cancel],['blur',reset],['pagehide',reset],['visibilitychange',reset]];
    for(const [name,handler] of events)window.addEventListener(name,handler,true);
    return()=>{reset();for(const [name,handler] of events)window.removeEventListener(name,handler,true);};
  }
  window.Margin = {el, storage, GAMES, localDate, puzzleDate, gameForPath, extension, bindShortcut, shortcutLabel};
})();
