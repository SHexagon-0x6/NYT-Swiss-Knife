(() => {
  'use strict';
  if (!globalThis.chrome?.runtime?.id || chrome.extension?.inIncognitoContext) return;
  const {el} = globalThis.Margin;
  const owned = '#margin-host,[data-margin-inline],[data-margin-overlay]';
  const visible = node => node?.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const logo = el('div',{'data-margin-inline':'stats-logo','data-margin-order':'90'});
  Object.assign(logo.style,{display:'inline-flex',verticalAlign:'middle',alignItems:'center',flex:'0 0 auto',margin:'0 3px'});
  const panel = el('div',{'data-margin-overlay':'stats-calendar',popover:'manual'});
  Object.assign(panel.style,{display:'none',position:'fixed',inset:'auto',margin:'0',padding:'0',border:'0',background:'transparent',zIndex:'2147483647',maxWidth:'calc(100vw - 20px)',overflow:'visible'});
  function shadow(host) {
    const root = host.attachShadow({mode:'closed'});
    root.append(el('link',{rel:'stylesheet',href:chrome.runtime.getURL('stats.css')}));
    for (const event of ['click','pointerdown','pointerup','keydown','keyup']) root.addEventListener(event,e => e.stopPropagation());
    return root;
  }
  const logoRoot = shadow(logo), panelRoot = shadow(panel);
  const trigger = el('button',{type:'button',className:'stats-logo-button','aria-label':'Your puzzle stats','aria-haspopup':'dialog','aria-expanded':'false',title:'Your stats'},el('img',{src:chrome.runtime.getURL('icons/32.png'),width:26,height:26,alt:''}));
  logoRoot.append(trigger);
  const closeButton = el('button',{type:'button',className:'popover-close','aria-label':'Close stats',textContent:'×'});
  const status = el('p',{className:'popover-status',role:'status','aria-live':'polite'});
  const reload = el('button',{type:'button',className:'popover-reload',textContent:'Refresh tab',hidden:true,onClick:() => location.reload()});
  const container = el('div');
  const box = el('section',{className:'stats-popover',role:'dialog','aria-label':'Your puzzle stats'},el('div',{className:'popover-heading'},el('span',{textContent:'Your stats'}),closeButton),container,status,reload);
  panelRoot.append(box);document.documentElement.append(panel);
  const calendar = globalThis.MarginStatsCalendar.mount(container,{markPuzzleDate:true,onEdit:async ({game,date,seconds}) => {
    try {
      const result = await chrome.runtime.sendMessage({type:'swiss-stats',action:seconds === null ? 'delete-day' : 'save-day',game,date,seconds});
      if (!result?.ok) throw Error('Could not save. Try again.');
      return result.data;
    } catch (error) {
      if (!chrome.runtime?.id || /extension context invalidated/i.test(error.message)) throw Error('Refresh this puzzle tab, then try again.');
      throw error;
    }
  }});
  let open = false, current = '', url = '', scheduled, reading = false, disposed = false, keyboardOpen = false, rememberedDate = '', puzzleDates = {};
  function updatePuzzleDates(dates = puzzleDates) {
    const date = current && globalThis.Margin.puzzleDate(current);
    puzzleDates = {...dates,...(current ? {[current]:date} : {})};
    calendar.setPuzzleDates(current && date ? {[current]:date} : {});
    const key = `${current}:${date}`;
    if (!date || key === rememberedDate || !chrome.runtime?.id) return;
    rememberedDate = key;
    chrome.runtime.sendMessage({type:'swiss-stats',action:'puzzle-date',game:current,date}).then(result => {
      if (!result?.ok) rememberedDate = '';
    }).catch(() => {rememberedDate = '';});
  }
  function gameForRoute() {
    if (/^\/(?:games|puzzles)\/sudoku\/hard\/?$/.test(location.pathname)) return 'sudoku-hard';
    if (/^\/(?:crosswords\/game|games\/crosswords)\/daily(?:\/\d{4}\/\d{2}\/\d{2})?\/?$/.test(location.pathname)) return 'crossword-daily';
    return null;
  }
  function position() {
    if (!open) return;
    const anchor = logo.getBoundingClientRect();
    panel.style.maxHeight = `${Math.max(100,innerHeight-20)}px`;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(10,Math.min(anchor.right-rect.width,innerWidth-rect.width-10))}px`;
    const below = anchor.bottom+8;
    panel.style.top = `${Math.max(10,below+rect.height <= innerHeight-10 ? below : Math.min(anchor.top-rect.height-8,innerHeight-rect.height-10))}px`;
  }
  function close(focus = false) {
    if (panel.matches(':popover-open')) panel.hidePopover();
    open = false;panel.style.display = 'none';trigger.setAttribute('aria-expanded','false');
    if (focus && logo.isConnected) trigger.focus({preventScroll:true});
  }
  async function load() {
    if (reading || !open) return;
    reading = true;
    try {
      const result = await chrome.runtime.sendMessage({type:'swiss-stats',action:'view'});
      if (!result?.ok) throw Error('Could not load your stats. Close and reopen to retry.');
      calendar.setData(result.data);updatePuzzleDates(result.data.puzzleDates);status.textContent = '';reload.hidden = true;
      if (keyboardOpen && open) {keyboardOpen = false;container.querySelector('[aria-pressed="true"]')?.focus();}
    } catch (error) {
      const disconnected = !chrome.runtime?.id || /extension context invalidated/i.test(error.message);
      status.textContent = disconnected ? 'The extension was reloaded. Refresh this puzzle tab to reconnect.' : error.message;
      reload.hidden = !disconnected;
    }
    finally {reading = false;position();}
  }
  trigger.addEventListener('click',event => {
    if (open) {close();return;}
    open = true;keyboardOpen = event.detail === 0;panel.style.display = 'block';panel.showPopover();trigger.setAttribute('aria-expanded','true');
    calendar.setGame(current);status.textContent = 'Loading…';position();load();
  });
  closeButton.addEventListener('click',() => close(true));
  function outside(event) {if (open && !event.composedPath().includes(logo) && !event.composedPath().includes(panel)) close();}
  function escape(event) {if (open && event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();close(true);}}
  document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  const size = new ResizeObserver(position);size.observe(box);
  function refresh() {
    scheduled = null;if (disposed) return;
    const game = gameForRoute();
    if (current !== game || url !== location.href) {close();current = game;url = location.href;}
    if (!game) {logo.remove();return;}
    updatePuzzleDates();
    const settings = [...document.querySelectorAll('button,[role="button"]')].find(node => !node.closest(owned) && visible(node) && /\bsettings\b/i.test([node.getAttribute('aria-label'),node.title,node.textContent].filter(Boolean).join(' ')));
    if (!settings) {logo.remove();close();return;}
    const anchor = settings.closest('li') || settings;
    if (anchor.nextSibling !== logo) anchor.after(logo);
    position();
  }
  function schedule() {if (!scheduled) scheduled = setTimeout(refresh,150);}
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(owned)) return false;
      const changed = [...record.addedNodes,...record.removedNodes];
      return !changed.length || changed.some(node => node.nodeType !== 1 || !node.matches(owned));
    })) schedule();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','aria-label']});
  const interval = setInterval(schedule,1500);
  function changed(changes,area) {if (area === 'local' && changes.statsLocalV1) load();}
  chrome.storage.onChanged.addListener(changed);
  window.addEventListener('pagehide',event => {
    if (event.persisted) return;
    disposed = true;clearTimeout(scheduled);clearInterval(interval);observer.disconnect();size.disconnect();
    document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);
    window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);chrome.storage.onChanged.removeListener(changed);
    logo.remove();panel.remove();
  });
  refresh();
})();
