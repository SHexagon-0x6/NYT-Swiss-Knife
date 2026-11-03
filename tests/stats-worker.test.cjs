'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const S = require('../stats.js');
function worker() {
  const listeners = {}, data = {local:{},sync:{}}, flags = {failSync:false,failLocal:false};
  const event = name => ({addListener(fn) { listeners[name] = fn; },removeListener(fn) {if (listeners[name] === fn) delete listeners[name];}});
  const area = name => ({
    async get(keys) { if (name === 'sync' && flags.failSync) throw Error('Offline');return structuredClone(keys === null ? data[name] : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data[name]).map(k => [k,data[name][k]]))); },
    async set(values) { if (name === 'sync' && flags.failSync || name === 'local' && flags.failLocal) throw Error('Quota');Object.assign(data[name],structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[name][key]; }
  });
  const chrome = {runtime:{id:'test',getURL:p => 'chrome-extension://test/'+p,onMessage:event('message'),onStartup:event('startup'),onInstalled:event('installed')},
    storage:{local:area('local'),sync:area('sync'),onChanged:event('changed')}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../stats-worker.js'),'utf8'),{chrome,MarginStats:S,importScripts(){},URL,Date,console,setTimeout,clearTimeout});
  const page = {id:'test',url:'chrome-extension://test/popup.html',documentId:'popup-document'}, tab = {id:'test',url:'https://www.nytimes.com/puzzles/sudoku/hard',tab:{incognito:false}};
  const request = (action, values = {}, sender = page) => new Promise(resolve => listeners.message({type:'swiss-stats',action,...values},sender,value => resolve(structuredClone(value))));
  return {data,flags,request,page,tab,listeners};
}
const solve = {game:'sudoku-hard',date:'2026-10-01',seconds:500};
test('declining a repeat restores its prior time across reopenings, checkbox toggles and sync', async () => {
  for (const game of ['sudoku-hard','crossword-daily']) {
    const f = worker(), first = {...solve,game}, second = {...first,seconds:800}, key = `${game}:${solve.date}`;
    const sender = game === 'sudoku-hard' ? f.tab : {...f.tab,url:'https://www.nytimes.com/crosswords/game/daily/2026/10/01'};
    await f.request('save-day',first);
    assert.equal((await f.request('record',second,sender)).data.accepted,true);
    await f.request('record',second,sender); // Reopen before making a choice.
    const newCopy = structuredClone(f.data.sync);
    const declined = await f.request('completion-choice',{...second,keep:false},sender);
    assert.equal(declined.data.accepted,false);assert.equal(declined.data.seconds,500);
    assert.equal(f.data.local.statsLocalV1.records[key],500);
    assert.deepEqual(f.data.local.statsLocalV1.totals[game],{sum:500,count:1});
    Object.assign(f.data.sync,newCopy);await f.request('sync');
    assert.equal(S.unpack(f.data.sync).records[key],500);
    assert.equal((await f.request('record',second,sender)).data.accepted,false);
    for (const keep of [true,false,true,false]) {
      const response = await f.request('completion-choice',{...second,keep},sender);
      assert.equal(response.data.accepted,keep);assert.equal(response.data.seconds,keep ? 800 : 500);
      assert.equal(S.unpack(f.data.sync).records[key],keep ? 800 : 500);
    }
    f.flags.failSync = true;
    await f.request('completion-choice',{...second,keep:true},sender);
    await f.request('completion-choice',{...second,keep:false},sender);
    f.flags.failSync = false;await f.request('sync');assert.equal(S.unpack(f.data.sync).records[key],500);
  }
});
test('declining the first result leaves the date empty, stays declined, and can be rechecked', async () => {
  const f = worker();await f.request('record',solve,f.tab);
  assert.equal((await f.request('completion-choice',{...solve,keep:false},f.tab)).data.saved,false);
  assert.deepEqual(f.data.local.statsLocalV1.records,{});
  assert.equal((await f.request('record',solve,f.tab)).data.accepted,false);
  assert.equal((await f.request('completion-choice',{...solve,keep:true},f.tab)).data.seconds,500);
  assert.equal((await f.request('completion-choice',{...solve,keep:false},f.tab)).data.saved,false);
});
test('an old completion cannot undo a later calendar edit, another solve, or cleared history', async () => {
  const f = worker();await f.request('record',solve,f.tab);
  await f.request('save-day',{...solve,seconds:900});
  assert.equal((await f.request('completion-choice',{...solve,keep:false},f.tab)).data.seconds,900);
  await f.request('record',{...solve,seconds:700},f.tab);
  const stale = await f.request('completion-choice',{...solve,keep:false},f.tab);
  assert.equal(stale.data.seconds,700);assert.equal(stale.data.accepted,false);
  await f.request('clear');await f.request('completion-choice',{...solve,seconds:700,keep:false},f.tab);
  assert.deepEqual(f.data.local.statsLocalV1.records,{});
  for (const sender of [f.page,{...f.tab,tab:{incognito:true}},{...f.tab,url:'https://example.com/'}]) assert.equal((await f.request('completion-choice',{...solve,keep:false},sender)).ok,false);
});
test('calendar dates come from eligible NYT pages and remain local without recording a solve', async () => {
  const f = worker();
  assert((await f.request('puzzle-date',{game:'sudoku-hard',date:'2026-10-31'},f.tab)).ok);
  const crossword = {...f.tab,url:'https://www.nytimes.com/crosswords/game/daily/2026/10/30'};
  assert((await f.request('puzzle-date',{game:'crossword-daily',date:'2026-10-30'},crossword)).ok);
  const expected = {'sudoku-hard':'2026-10-31','crossword-daily':'2026-10-30'};
  assert.deepEqual(f.data.local.statsPuzzleDatesV1,expected);
  assert.equal(f.data.local.statsLocalV1,undefined);assert.deepEqual(f.data.sync,{});
  assert.deepEqual((await f.request('get')).data.puzzleDates,expected);
  for (const sender of [f.page,{...f.tab,tab:{incognito:true}},{...f.tab,url:'https://example.com/'}]) assert.equal((await f.request('puzzle-date',{game:'sudoku-hard',date:'2026-10-31'},sender)).ok,false);
  assert.equal((await f.request('puzzle-date',{game:'crossword-daily',date:'2026-10-31'},f.tab)).ok,false);
  assert.equal((await f.request('puzzle-date',{game:'sudoku-hard',date:'2026-02-30'},f.tab)).ok,false);
});
test('checking a completion is read-only; simultaneous recordings keep one current value per day', async () => {
  const f = worker();
  assert.deepEqual((await f.request('offer',solve,f.tab)).data,{enabled:true,recorded:false,seconds:null,deleted:false});
  assert.deepEqual(f.data.local,{});assert.deepEqual(f.data.sync,{});
  const responses = await Promise.all([f.request('record',solve,f.tab),f.request('record',{...solve,seconds:100},f.tab),f.request('record',{...solve,date:'2026-10-02'},f.tab)]);
  assert(responses.every(r => r.ok && r.data.saved));
  assert.equal(Object.keys(f.data.local.statsLocalV1.records).length,2);
  assert.equal(f.data.local.statsLocalV1.records['sudoku-hard:2026-10-01'],100);
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2026-10-02'],500);
});
test('repeat completions replace faster and slower times, update totals, and survive stale sync', async () => {
  for (const game of ['sudoku-hard','crossword-daily']) {
    const f = worker(), result = {...solve,game}, key = `${game}:${solve.date}`;
    const sender = game === 'sudoku-hard' ? f.tab : {...f.tab,url:'https://www.nytimes.com/crosswords/game/daily/2026/10/01'};
    await f.request('record',result,sender);const stale = structuredClone(f.data.sync);
    for (const seconds of [200,800]) {
      const response = await f.request('record',{...result,seconds},sender);
      assert(response.ok && response.data.saved);assert.equal(response.data.seconds,seconds);
      assert.equal(f.data.local.statsLocalV1.records[key],seconds);
      assert.equal(S.unpack(f.data.sync).records[key],seconds);
      assert.deepEqual(f.data.local.statsLocalV1.totals[game],{sum:seconds,count:1});
      assert.equal(S.summarize(f.data.local.statsLocalV1,game).average,seconds);
    }
    Object.assign(f.data.sync,stale);await f.request('sync');
    assert.equal(S.unpack(f.data.sync).records[key],800);
    f.flags.failSync = true;
    assert.equal((await f.request('record',{...result,seconds:900},sender)).data.seconds,900);
    f.flags.failSync = false;await f.request('sync');
    assert.equal(S.unpack(f.data.sync).records[key],900);
    const another = worker();another.data.sync = structuredClone(f.data.sync);
    const nextSender = {...sender,id:another.tab.id};
    assert.equal((await another.request('record',{...result,seconds:1100},nextSender)).data.seconds,1100);
    assert.equal(S.unpack(another.data.sync).records[key],1100);
  }
});
test('reopening the same result preserves manual corrections but a new completion replaces them', async () => {
  const f = worker();await f.request('record',solve,f.tab);
  const first = structuredClone(f.data.local);
  await f.request('record',solve,f.tab);assert.deepEqual(f.data.local,first);
  await f.request('save-day',{...solve,seconds:800});
  const edited = structuredClone(f.data.local);
  assert.equal((await f.request('record',solve,f.tab)).data.seconds,800);
  assert.deepEqual(f.data.local,edited);
  assert.equal((await f.request('record',{...solve,seconds:700},f.tab)).data.seconds,700);
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01'],700);
});
test('disabled games, paused capture, Mini, foreign pages and Incognito cannot save', async () => {
  const f = worker();
  for (const sender of [{...f.tab,url:'https://example.com/puzzles/sudoku/hard'},{...f.tab,url:'https://www.nytimes.com/puzzles/sudoku/easy'},{...f.tab,tab:{incognito:true}},f.page,{...f.tab,id:'bad'}]) assert.equal((await f.request('record',solve,sender)).ok,false);
  assert.equal((await f.request('record',{...solve,game:'crossword-daily'},{...f.tab,url:'https://www.nytimes.com/crosswords/game/mini'})).ok,false);
  f.data.local.settings = {disabled:['sudoku']};assert.equal((await f.request('offer',solve,f.tab)).data.enabled,false);
  f.data.local.settings = {};await f.request('preferences',{enabled:false});assert.equal((await f.request('record',solve,f.tab)).data.saved,false);
  assert(!f.data.local.statsLocalV1);
  assert.equal((await f.request('clear',{},f.tab)).ok,false);
});
test('game calendars can read history but cannot change global preferences or clear it', async () => {
  const f = worker();await f.request('record',solve,f.tab);
  assert.equal((await f.request('view',{},f.tab)).data.records['sudoku-hard:2026-10-01'],500);
  assert.equal((await f.request('view',{}, {...f.tab,url:'https://example.com/'})).ok,false);
  assert.equal((await f.request('view',{}, {...f.tab,tab:{incognito:true}})).ok,false);
  assert.equal((await f.request('preferences',{enabled:false},f.tab)).ok,false);
});
test('sync failures keep durable local data and retry successfully', async () => {
  const f = worker();f.flags.failSync = true;
  assert((await f.request('record',solve,f.tab)).data.saved);
  assert.equal(f.data.local.statsSyncStatusV1.state,'retry');assert(f.data.local.statsLocalV1.records['sudoku-hard:2026-10-01']);
  f.flags.failSync = false;await f.request('sync');
  assert.equal(f.data.local.statsSyncStatusV1.state,'ready');assert(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01']);
});
test('local failures are reported and cannot cause a sync-only save', async () => {
  const f = worker();f.flags.failLocal = true;
  assert.equal((await f.request('record',solve,f.tab)).ok,false);assert.deepEqual(f.data.sync,{});
});
test('offline device history merges; reset markers keep deleted results deleted', async () => {
  const f = worker();await f.request('record',solve,f.tab);const offline = structuredClone(f.data.sync);
  const remote = {records:{'crossword-daily:2026-10-02':[1500,Date.now()]}};Object.assign(f.data.sync,S.pack(remote));
  await f.request('sync');assert.equal(Object.keys(f.data.local.statsLocalV1.records).length,2);
  f.data.local['puzzle:keep'] = {notes:'retain'};f.data.local['daily:sudoku'] = '2026-10-01';f.data.local['daily:wordle'] = '2026-10-01';
  await f.request('clear');assert.deepEqual(f.data.local.statsLocalV1.records,{});const reset = f.data.sync[S.RESET];
  assert(!Object.keys(f.data.local).some(key => key.startsWith('daily:')),'Clear history also removes the popup Done dates');
  assert.deepEqual(f.data.local.statsCapturedV1.records,{});
  Object.assign(f.data.sync,offline);f.data.sync[S.RESET] = reset;
  await f.request('sync');assert.deepEqual(f.data.local.statsLocalV1.records,{});assert.deepEqual(f.data.local['puzzle:keep'],{notes:'retain'});
  assert.deepEqual(S.unpack(f.data.sync).records,{});
});
test('sync can be disabled without removing local data, then resumed', async () => {
  const f = worker();await f.request('preferences',{sync:false});await f.request('record',solve,f.tab);
  assert.deepEqual(f.data.sync,{});assert(f.data.local.statsLocalV1.records['sudoku-hard:2026-10-01']);
  await f.request('preferences',{sync:true});assert(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01']);
});

test('a full sync quota preserves cloud history and keeps new local times and totals', async () => {
  const f = worker();await f.request('record',solve,f.tab);
  const previous = structuredClone(f.data.sync);
  f.data.sync.unrelated = 'x'.repeat(102400-S.syncBytes(previous)-S.syncBytes({unrelated:''}));
  const remote = structuredClone(f.data.sync);
  await f.request('record',{...solve,date:'2025-10-02',seconds:700},f.tab);
  assert.equal(f.data.local.statsSyncStatusV1.state,'full');
  assert.deepEqual(f.data.sync,remote);
  assert.deepEqual(f.data.local.statsLocalV1.totals['sudoku-hard'],{sum:1200,count:2});
  assert.equal(S.summarize(f.data.local.statsLocalV1,'sudoku-hard').average,600);
  delete f.data.sync.unrelated;await f.request('sync');
  assert.equal(f.data.local.statsSyncStatusV1.state,'ready');
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2025-10-02'],700);
  assert.equal(S.unpack(previous).records['sudoku-hard:2026-10-01'],500);
});
test('calendar edits and deletes sync without stale times reappearing', async () => {
  const f = worker();await f.request('record',solve,f.tab);const stale = structuredClone(f.data.sync);
  assert((await f.request('save-day',{...solve,seconds:800},f.tab)).ok);
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01'],800);
  assert((await f.request('delete-day',solve)).ok);
  assert.equal(f.data.local.statsCapturedV1.records['sudoku-hard:2026-10-01'],undefined);
  Object.assign(f.data.sync,stale);await f.request('sync');
  assert.deepEqual(f.data.local.statsLocalV1.records,{});
  assert.equal((await f.request('record',solve,f.tab)).data.deleted,true);
  assert.equal((await f.request('offer',solve,f.tab)).data.deleted,true);
  assert((await f.request('save-day',{...solve,seconds:736})).ok);
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01'],736);
  assert.equal(f.data.local.statsLocalV1.totals['sudoku-hard'].sum,736);
  for (const sender of [{...f.tab,url:'https://example.com/'},{...f.tab,tab:{incognito:true}}]) assert.equal((await f.request('delete-day',solve,sender)).ok,false);
});
test('the extension update handler preserves records, manual revisions, notes and preferences', async () => {
  const f = worker();await f.request('record',solve,f.tab);await f.request('save-day',{...solve,seconds:736});
  f.data.local['puzzle:keep'] = {scratch:'Keep my notes'};
  f.data.local.settings = {disabled:['wordle']};
  const before = structuredClone(f.data.local);
  await f.listeners.installed({reason:'update'});
  assert.deepEqual(f.data.local,before);
  assert.equal(S.unpack(f.data.sync).records['sudoku-hard:2026-10-01'],736);
});
