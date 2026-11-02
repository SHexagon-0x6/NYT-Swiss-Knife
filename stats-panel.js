(() => {
  'use strict';
  const S = globalThis.MarginStats, $ = id => document.getElementById(id);
  const extension = !!globalThis.chrome?.runtime?.id;
  const demo = !extension && new URL(location.href).searchParams.get('demo') === '1';
  const today = S.nytDate();
  let state = {data:S.normalize({}),preferences:{enabled:true,sync:true},sync:{state:'pending'}}, busy = false, month = today.slice(0,7);
  let initializing = extension;
  if (demo) {
    $('demo-banner').hidden = false;
    for (const [index,id] of Object.keys(S.GAMES).entries()) for (let i=43;i>=0;i--) {
      if (i%7 === 2) continue;
      const date = new Date(today+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()-i);
      state.data.records[id+':'+date.toISOString().slice(0,10)] = index ? 840+(i*157%1800) : 300+(i*73%660);
    }
    if (today.slice(8) < '12') {const date = new Date(today+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);month = date.toISOString().slice(0,7);}
    state.data = S.normalize(state.data);
  }
  const calendar = globalThis.MarginStatsCalendar.mount($('calendar-root'),{data:state.data,...(demo ? {month,puzzleDates:Object.fromEntries(Object.keys(S.GAMES).map(game => [game,today]))} : {}),onEdit:extension || demo ? async ({game,date,seconds}) => {
    if (demo) {
      const key = game+':'+date;
      if (seconds === null) delete state.data.records[key];else state.data.records[key] = seconds;
      return state.data = S.normalize(state.data);
    }
    const data = await request(seconds === null ? 'delete-day' : 'save-day',{game,date,seconds});
    state.data = data;return data;
  } : null});
  async function request(action, values = {}) {
    if (!extension) return state;
    const result = await chrome.runtime.sendMessage({type:'swiss-stats',action,...values});
    if (!result?.ok) throw Error(result?.error || 'Could not load stats. Reload the extension and try again.');
    return result.data;
  }
  function renderSettings() {
    $('tracking').checked = state.preferences.enabled; $('sync-enabled').checked = state.preferences.sync;
    $('sync-detail').textContent = !extension ? 'Load the extension to record real times.' : !state.preferences.sync ? 'Saved on this device.' : state.sync.state === 'ready' ? 'Available to Chrome sync.' : state.sync.state === 'full' ? 'Chrome sync is full. New times and your lifetime average remain saved on this device.' : 'Saved locally. Chrome sync needs a retry.';
    $('retry').hidden = !extension || !state.preferences.sync || state.sync.state === 'ready';
    for (const id of ['tracking','sync-enabled','clear']) $(id).disabled = !extension || busy;
    $('export').disabled = busy || !Object.keys(state.data.records).length;
    $('stats-status').textContent = state.preferences.enabled ? '' : 'Automatic recording is paused.';
  }
  async function update(action, values) {
    busy = true; renderSettings();
    try {state = await request(action,values);calendar.setData(state.data);if (!demo) calendar.setPuzzleDates(state.puzzleDates);}
    catch (error) {busy = false;renderSettings();$('stats-status').textContent = error.message;return;}
    busy = false;renderSettings();
  }
  $('tracking').addEventListener('change',() => update('preferences',{enabled:$('tracking').checked}));
  $('sync-enabled').addEventListener('change',() => update('preferences',{sync:$('sync-enabled').checked}));
  $('retry').addEventListener('click',() => update('sync'));
  $('clear').addEventListener('click',() => $('clear-dialog').showModal());
  $('clear-dialog').addEventListener('close',() => {if ($('clear-dialog').returnValue === 'clear') update('clear');});
  $('export').addEventListener('click',async () => {
    if (busy) return;
    busy = true;renderSettings();
    try {
      if (extension) {state = await request('get');calendar.setData(state.data);calendar.setPuzzleDates(state.puzzleDates);}
      const records = Object.entries(state.data.records).map(([key,seconds]) => ({game:key.split(':')[0],date:key.split(':')[1],seconds}));
      const url = URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}));
      const link = document.createElement('a');link.href = url;link.download = 'swiss-knife-stats-'+today+'.json';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (error) {busy = false;renderSettings();$('stats-status').textContent = error.message;return;}
    busy = false;renderSettings();
  });
  if (extension) {
    let refresh;
    chrome.storage.onChanged.addListener((changes,area) => {
      if (area === 'local' && Object.keys(changes).some(k => /^stats/.test(k))) {clearTimeout(refresh);refresh = setTimeout(() => {if (!busy && !initializing) update('get');},200);}
    });
  }
  const toggle = $('stats-toggle'), section = $('stats-section');
  section.addEventListener('toggle',() => {
    toggle.setAttribute('aria-expanded',String(section.open));
    if (section.open) update('get');
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && section.open && !$('clear-dialog').open) {event.preventDefault();section.open = false;toggle.focus();}
  });
  renderSettings();
  if (demo) section.open = true;
  (async () => {
    await globalThis.MarginPopupReady;
    renderSettings();
    initializing = false;
    document.documentElement.dataset.popupReady = 'true';
  })();
})();
