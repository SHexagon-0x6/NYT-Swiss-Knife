/* One writer per browser profile prevents competing tabs from losing records. */
'use strict';
importScripts('stats.js');
const S = globalThis.MarginStats;
const DATA = 'statsLocalV1', PREFS = 'statsPreferencesV1', STATUS = 'statsSyncStatusV1', DATES = 'statsPuzzleDatesV1';
const CAPTURED = 'statsCapturedV1';
let queue = Promise.resolve();
function serial(task) { const next = queue.then(task); queue = next.catch(() => {}); return next; }
const preferences = value => ({enabled:value?.enabled !== false, sync:value?.sync !== false});
const revision = (data,key) => data.edits[key]?.[1] || 0;
function revise(data,key,seconds) {
  data.edits[key] = [seconds,Math.max(Date.now(),data.resetAt+1,revision(data,key)+1)];
}
async function capturedFor(data) {
  const local = await chrome.storage.local.get(CAPTURED), cached = local[CAPTURED];
  return cached?.resetAt === data.resetAt ? {...cached,offers:cached.offers || {}} : {resetAt:data.resetAt,records:{},offers:{}};
}
function ownsCompletion(data,key,captured) {
  const offer = captured.offers[key];
  return offer && offer.stamp === revision(data,key) && (data.records[key] || 0) === (offer.accepted ? captured.records[key] : offer.previous);
}
function completionState(data,key,captured) {
  return {enabled:true,saved:!!data.records[key],seconds:data.records[key] || null,deleted:data.edits[key]?.[0] === 0,
    accepted:!!(ownsCompletion(data,key,captured) && captured.offers[key].accepted)};
}
async function read() {
  const local = await chrome.storage.local.get([DATA,PREFS,STATUS,DATES]);
  const puzzleDates = Object.fromEntries(Object.entries(local[DATES] || {}).filter(([game,date]) => Object.hasOwn(S.GAMES,game) && S.validDate(date)));
  return {data:S.normalize(local[DATA]), preferences:preferences(local[PREFS]), sync:local[STATUS] || {state:'pending'},puzzleDates};
}
async function reconcile() {
  const state = await read();
  if (!state.preferences.sync) return state;
  try {
    const remote = await chrome.storage.sync.get(null);
    const data = S.merge(state.data,S.unpack(remote));
    const desired = S.pack(data), writes = {};
    for (const [key,value] of Object.entries(desired)) if (JSON.stringify(remote[key]) !== JSON.stringify(value)) writes[key] = value;
    const stale = Object.keys(remote).filter(key => (key.startsWith(S.PREFIX) || key.startsWith(S.LEGACY_PREFIX)) && !(key in desired));
    // The local archive is durable even when Chrome's sync quota or network fails.
    if (JSON.stringify(data) !== JSON.stringify(state.data)) await chrome.storage.local.set({[DATA]:data});
    const unrelated = Object.fromEntries(Object.entries(remote).filter(([key]) => !key.startsWith(S.PREFIX) && !key.startsWith(S.LEGACY_PREFIX)));
    if (S.syncBytes(desired) > Math.min(S.SYNC_BUDGET,102400-S.syncBytes(unrelated)) || Object.keys(desired).length+Object.keys(unrelated).length > 512) {
      const sync = {state:'full'};
      if (state.sync.state !== 'full') await chrome.storage.local.set({[STATUS]:sync});
      return {...state,data,sync};
    }
    if (stale.length) await chrome.storage.sync.remove(stale);
    if (Object.keys(writes).length) await chrome.storage.sync.set(writes);
    const sync = {state:'ready'};
    if (state.sync.state !== 'ready') await chrome.storage.local.set({[STATUS]:sync});
    return {...state,data,sync};
  } catch {
    const sync = {state:'retry'};
    if (state.sync.state !== 'retry') await chrome.storage.local.set({[STATUS]:sync});
    return {...await read(),sync};
  }
}
// Give this sender.tab.url: NYT's Easy, Medium and Hard buttons change the route
// without loading a document, and sender.url keeps the URL the document loaded with.
function eligible(url, game) {
  try {
    const u = new URL(url);
    if (u.origin !== 'https://www.nytimes.com') return false;
    return game === 'sudoku-hard' && /^\/(?:puzzles|games)\/sudoku\/hard\/?$/.test(u.pathname);
  } catch { return false; }
}
async function dispatch(message, sender) {
  if (sender.id !== chrome.runtime.id) throw Error('Unknown sender.');
  const popup = sender.url === chrome.runtime.getURL('popup.html');
  if (message.action === 'puzzle-date') {
    if (!sender.tab || sender.tab.incognito || !eligible(sender.tab.url,message.game) || !S.validDate(message.date) || message.date > S.nytDate(new Date(Date.now()+86400000))) throw Error('Invalid puzzle date.');
    const {puzzleDates} = await read();
    if (puzzleDates[message.game] !== message.date) {
      puzzleDates[message.game] = message.date;
      await chrome.storage.local.set({[DATES]:puzzleDates});
    }
    return puzzleDates;
  }
  if (message.action === 'view') {
    if (!sender.tab || sender.tab.incognito || !Object.keys(S.GAMES).some(game => eligible(sender.tab.url,game))) throw Error('Unsupported puzzle.');
    const state = await reconcile();
    return {...state.data,puzzleDates:state.puzzleDates};
  }
  if (message.action === 'save-day' || message.action === 'delete-day') {
    if (!popup && (!sender.tab || sender.tab.incognito || !Object.keys(S.GAMES).some(game => eligible(sender.tab.url,game)))) throw Error('Unsupported page.');
    const seconds = message.action === 'delete-day' ? 0 : message.seconds, key = `${message.game}:${message.date}`;
    if (!Object.hasOwn(S.GAMES,message.game) || !S.validRecord(key,seconds || 1) || !Number.isInteger(seconds) || seconds < 0 || message.action === 'save-day' && !seconds || message.date > S.nytDate(new Date(Date.now()+86400000))) throw Error('Invalid time.');
    const state = await reconcile();
    const stamp = Math.max(Date.now(),state.data.resetAt+1,(state.data.edits[key]?.[1] || 0)+1);
    state.data.edits[key] = [seconds,stamp];
    const writes = {[DATA]:S.normalize(state.data)};
    if (!seconds) {
      const local = await chrome.storage.local.get(CAPTURED), captured = local[CAPTURED];
      if (captured?.records && Object.hasOwn(captured.records,key)) {
        delete captured.records[key];if (captured.offers) delete captured.offers[key];writes[CAPTURED] = captured;
      }
    }
    await chrome.storage.local.set(writes);
    return (await reconcile()).data;
  }
  if (message.action === 'record' || message.action === 'offer' || message.action === 'completion-choice') {
    if (!sender.tab || sender.tab.incognito || !eligible(sender.tab.url,message.game)) throw Error('Unsupported puzzle.');
    const date = message.date, seconds = message.seconds, now = Date.now();
    const key = `${message.game}:${date}`;
    if (!S.validRecord(key,[seconds,now])) throw Error('Invalid completion.');
    // Tomorrow's puzzle is available in the evening. Reject implausible future dates.
    if (date > S.nytDate(new Date(now + 86400000))) throw Error('Invalid puzzle date.');
    const state = await read();
    const {settings} = await chrome.storage.local.get('settings');
    const choosing = message.action === 'completion-choice';
    if (choosing && typeof message.keep !== 'boolean') throw Error('Invalid choice.');
    if (!choosing && (!state.preferences.enabled || settings?.disabled?.includes('sudoku'))) return {saved:false,enabled:false};
    if (message.action === 'offer') return {enabled:true,recorded:!!state.data.records[key],seconds:state.data.records[key] || null,deleted:state.data.edits[key]?.[0] === 0};
    // Read the latest synced revision before replacing a day, but do not write
    // anything to sync until the completion has been saved locally.
    if (state.preferences.sync) {
      try {state.data = S.merge(state.data,S.unpack(await chrome.storage.sync.get(null)));} catch { /* Keep recording offline. */ }
    }
    const captured = await capturedFor(state.data);
    if (choosing) {
      const same = captured.records[key] === seconds && ownsCompletion(state.data,key,captured);
      // An old dialog cannot undo a later calendar edit or completion.
      if (!same && !message.keep) return {...completionState(state.data,key,captured),accepted:false};
      if (!same) {
        captured.records[key] = seconds;
        captured.offers[key] = {previous:state.data.records[key] || 0,accepted:false,stamp:revision(state.data,key)};
      }
      const offer = captured.offers[key];
      if (offer.accepted !== message.keep) {
        revise(state.data,key,message.keep ? seconds : offer.previous);
        offer.accepted = message.keep;offer.stamp = revision(state.data,key);
        await chrome.storage.local.set({[DATA]:S.normalize(state.data),[CAPTURED]:captured});
      }
      return completionState((await reconcile()).data,key,captured);
    }
    if (state.data.edits[key]?.[0] === 0) return completionState(state.data,key,captured);
    // Reopening the same result must not undo a calendar correction. A different
    // final time is a new completion and replaces the day's value, even if slower.
    if (captured.records[key] !== seconds) {
      const previous = state.data.records[key] || 0;
      if (state.data.records[key] && state.data.records[key] !== seconds) {
        revise(state.data,key,seconds);
      } else if (!state.data.records[key]) state.data.records[key] = seconds;
      captured.records[key] = seconds;
      captured.offers[key] = {previous,accepted:true,stamp:revision(state.data,key)};
      await chrome.storage.local.set({[DATA]:S.normalize(state.data),[CAPTURED]:captured});
    } else if (!captured.offers[key]) {
      // Older builds did not retain an undo value; preserve their saved time.
      captured.offers[key] = {previous:state.data.records[key] || 0,accepted:state.data.records[key] === seconds,stamp:revision(state.data,key)};
      await chrome.storage.local.set({[CAPTURED]:captured});
    }
    const updated = await reconcile();
    return completionState(updated.data,key,captured);
  }
  if (!popup) throw Error('Open the extension popup to manage records.');
  if (message.action === 'get' || message.action === 'sync') return reconcile();
  if (message.action === 'preferences') {
    const state = await read();
    for (const name of ['enabled','sync']) if (typeof message[name] === 'boolean') state.preferences[name] = message[name];
    await chrome.storage.local.set({[PREFS]:state.preferences});
    return reconcile();
  }
  if (message.action === 'clear') {
    const state = await read();
    const resetAt = Math.max(Date.now(), state.data.resetAt+1);
    await chrome.storage.local.set({[DATA]:S.normalize({resetAt,records:{}}),[CAPTURED]:{resetAt,records:{}}});
    // The popup's Done status is part of your play history too.
    await chrome.storage.local.remove(Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith('daily:')));
    // The reset marker prevents offline devices restoring deleted history on reconnect.
    return reconcile();
  }
  throw Error('Unknown stats action.');
}
chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if (message?.type !== 'swiss-stats') return;
  serial(() => dispatch(message,sender)).then(data => reply({ok:true,data}), () => reply({ok:false,error:'Could not save or load your stats. Please retry.'}));
  return true;
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'sync' && Object.keys(changes).some(k => (k.startsWith(S.PREFIX) || k.startsWith(S.LEGACY_PREFIX)))) serial(reconcile);
});
chrome.runtime.onStartup.addListener(() => serial(reconcile));
chrome.runtime.onInstalled.addListener(() => serial(reconcile));
