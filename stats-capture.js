(() => {
  'use strict';
  if (!globalThis.chrome?.runtime?.id || chrome.extension?.inIncognitoContext) return;
  const S = globalThis.MarginStats, {el,puzzleDate} = globalThis.Margin;
  const cssURL = chrome.runtime.getURL('ui.css');
  const disconnected = error => !chrome.runtime?.id || /extension context invalidated/i.test(error?.message || '');
  const visible = node => node && !node.closest('[hidden],[aria-hidden="true"]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  let timer, pending = false, retryAfter = 0, prompt = null;
  function inspect() {
    const path = location.pathname;
    const game = /^\/(?:games|puzzles)\/sudoku\/hard\/?$/.test(path) ? 'sudoku-hard' : null;
    const date = game && puzzleDate(game);
    if (!date) return null;
    for (const modal of document.querySelectorAll('.xwd__modal--content')) {
      if (!visible(modal)) continue;
      const text = modal.innerText.replace(/\s+/g,' ');
      const match = text.match(/You finished a hard\s+puzzle\b[\s\S]*?\bin\s+(.+?)(?:\.|$)/i);
      const seconds = match && S.parseTime(match[1]);
      if (seconds) return {game,date,seconds,modal};
    }
    return null;
  }
  function showPrompt(record, outcome = {}, reload = false) {
    const host = el('div',{'data-margin-inline':'stats-prompt'}), root = host.attachShadow({mode:'closed'});
    const nativeButton = record.modal.querySelector('button');
    host.style.setProperty('--stats-font',nativeButton ? getComputedStyle(nativeButton).fontFamily : 'Arial, Helvetica, sans-serif');
    root.append(el('link',{rel:'stylesheet',href:cssURL}));
    const checkbox = el('input',{type:'checkbox',checked:!!outcome.accepted,'aria-label':'Record this time'});
    const label = el('label',{className:'stats-offer-toggle'},checkbox,el('span',{textContent:'Record this time'}));
    const date = new Date(record.date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const detail = el('p',{className:'stats-offer-detail',textContent:date+' · '+S.formatTime(record.seconds)});
    const status = el('p',{className:'stats-offer-status',role:'status','aria-live':'polite'});
    function showOutcome(value) {
      checkbox.checked = !!value.accepted;
      status.textContent = value.accepted ? 'Saved to your calendar' : value.seconds ? 'Previous time kept · '+S.formatTime(value.seconds) : 'Not recorded';
    }
    showOutcome(outcome);
    const refresh = el('button',{type:'button',textContent:'Refresh tab',hidden:true,onClick:() => location.reload()});
    function showReload() {
      checkbox.disabled = true;refresh.hidden = false;
      status.textContent = 'Refresh this tab to reconnect. You can add a missed time in your calendar.';
    }
    if (reload) showReload();
    checkbox.addEventListener('change',async () => {
      const checked = checkbox.checked;checkbox.disabled = true;status.textContent = 'Saving…';
      try {
        const result = await chrome.runtime.sendMessage({type:'swiss-stats',action:'completion-choice',keep:checked,game:record.game,date:record.date,seconds:record.seconds});
        if (!result?.ok) throw Error('Could not update this time. Try again.');
        showOutcome(result.data);
      } catch (error) {
        checkbox.checked = !checked;
        if (disconnected(error)) {showReload();return;}
        status.textContent = error.message;
      }
      checkbox.disabled = false;
    });
    root.append(el('section',{className:'stats-offer','aria-label':'Record your puzzle time'},label,detail,status,refresh));
    for (const event of ['click','keydown','keyup','pointerdown','pointerup']) root.addEventListener(event,e => e.stopPropagation());
    const message = [...record.modal.querySelectorAll('.xwd__congrats-modal--message,.modal-system-subheader,.modal-system-description,.xwd__center')].find(n => /You (?:finished|solved)/.test(n.textContent));
    if (message) message.after(host); else record.modal.append(host);
    prompt = {host,key:record.game+':'+record.date+':'+record.seconds};
  }
  async function capture() {
    clearTimeout(timer);timer = null;
    if (pending || Date.now() < retryAfter) return;
    const record = inspect();
    if (!record) {prompt?.host.remove();prompt = null;return;}
    const key = record.game+':'+record.date+':'+record.seconds;
    if (prompt && (!prompt.host.isConnected || prompt.key !== key)) {prompt.host.remove();prompt = null;}
    if (prompt) return;
    pending = true;
    try {
      // Closing an observed result keeps its default save. A filled board or
      // running timer is never used to infer completion.
      const result = await chrome.runtime.sendMessage({type:'swiss-stats',action:'record',game:record.game,date:record.date,seconds:record.seconds});
      if (!result?.ok) throw Error('Could not record the result.');
      if (!result.data.enabled) {retryAfter = Date.now()+30000;return;}
      const current = inspect();
      if (current && current.game+':'+current.date+':'+current.seconds === key && current.modal === record.modal) showPrompt(record,result.data);
    } catch (error) {
      if (disconnected(error)) {
        const current = inspect();
        if (current && current.game+':'+current.date+':'+current.seconds === key && current.modal === record.modal) showPrompt(record,{},true);
      } else retryAfter = Date.now()+5000;
    } finally {pending = false;}
  }
  function schedule() {if (!timer) timer = setTimeout(capture,50);}
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
  const interval = setInterval(schedule,1500);
  // Start saving before a native close button removes the completion message.
  window.addEventListener('pointerdown',capture,true);
  window.addEventListener('keydown',event => {if (event.key === 'Escape') capture();},true);
  window.addEventListener('pagehide',event => {
    if (!event.persisted) {clearTimeout(timer);clearInterval(interval);observer.disconnect();}
  });
  schedule();
})();
