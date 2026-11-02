'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../stats.js');
test('only valid dates and positive, bounded final durations are accepted', () => {
  assert(S.validDate('2024-02-29'));assert(!S.validDate('2026-02-29'));assert(!S.validDate('2026-13-01'));
  for (const [input,expected] of [['12:34',754],['1:02:03',3723],['in 1 hour 2 minutes 3 seconds.',3723],['2m 4s',124],['00:00',null],['1:99',null],['12',null],['playing',null]]) assert.equal(S.parseTime(input),expected,input);
  assert.equal(S.formatTime(3723),'1:02:03');assert.equal(S.formatTime(null),'—');
  assert.equal(S.nytDate(new Date('2026-11-02T02:00:00Z')),'2026-11-01');
  assert.deepEqual(S.normalize({records:{'mini:2026-11-01':[10,1],'sudoku-hard:2026-02-30':[10,1],'sudoku-hard:2026-11-01':[0,1]}}).records,{});
});
const record = (date,time,stamp = 1) => ({records:{['sudoku-hard:'+date]:[time,stamp]}});
test('a lone result is normal and distinct results rank immediately within each game', () => {
  const colors = data => S.summarize(data,'sudoku-hard').days.map(day => day.color);
  let data = record('2026-10-01',100);
  assert.deepEqual(colors(data),['yellow']);
  data = S.merge(data,record('2026-10-02',200));
  assert.deepEqual(colors(data),['green','red']);
  data = S.merge(data,record('2026-10-03',150));
  assert.deepEqual(colors(data),['green','red','yellow']);
  const summary = S.summarize(data,'sudoku-hard');
  assert.equal(summary.count,3);assert.equal(summary.average,150);assert.equal(summary.best,100);
  data = S.merge(data,{records:{'crossword-daily:2026-10-01':10}});
  assert.deepEqual(colors(data),['green','red','yellow']);
  assert.equal(S.summarize(data,'crossword-daily').days[0].color,'yellow');
});
test('equal times share a band and deleting the comparison returns the remaining result to normal', () => {
  const data = S.merge(...Array.from({length:12},(_,i) => record(`2026-10-${String(i+1).padStart(2,'0')}`,100)));
  assert(S.summarize(data,'sudoku-hard').days.every(day => day.color === 'yellow'));
  const ranked = S.summarize(S.merge(data,record('2026-10-13',50),record('2026-10-14',200)),'sudoku-hard');
  assert(ranked.days.slice(0,12).every(day => day.color === 'yellow'));
  assert.equal(ranked.days[12].color,'green');assert.equal(ranked.days[13].color,'red');
  const twoDays = S.merge(record('2026-10-01',100),record('2026-10-02',200));
  const removed = S.merge(twoDays,{edits:{'sudoku-hard:2026-10-02':[0,1000]}});
  assert.equal(S.summarize(removed,'sudoku-hard').days[0].color,'yellow');
  const tied = S.merge(twoDays,{edits:{'sudoku-hard:2026-10-02':[100,1000]}});
  assert(S.summarize(tied,'sudoku-hard').days.every(day => day.color === 'yellow'));
});
test('offline conflicts converge on one faster result; resets invalidate older generations', () => {
  const a = record('2026-10-01',500,1000), b = S.merge(record('2026-10-01',300,2000),record('2026-10-02',600,2000));
  assert.deepEqual(S.merge(a,b),S.merge(b,a));assert.equal(Object.keys(S.merge(a,b).records).length,2);
  assert.equal(S.merge(a,b).records['sudoku-hard:2026-10-01'],300);
  const reset = {resetAt:1500,records:{}};
  assert.deepEqual(S.merge(reset,a,b).records,{});
  assert.equal(S.merge(reset,{resetAt:1500,records:{'sudoku-hard:2026-10-03':200}}).records['sudoku-hard:2026-10-03'],200);
});
function history(years,seconds) {
  const records = {};
  for(let t=Date.UTC(2025-years,0,1);t<Date.UTC(2025,0,1);t+=86400000) for(const game of Object.keys(S.CODES)) records[game+':'+new Date(t).toISOString().slice(0,10)] = seconds;
  return S.normalize({resetAt:1700000000000,records});
}
test('15 years at six daily results fit sync, without losing seconds or lifetime totals', () => {
  const data = history(15,65534), packed = S.pack(data), restored = S.unpack(packed);
  assert(S.syncBytes(packed) < S.SYNC_BUDGET);
  assert(Object.keys(packed).length < 512);
  for(const [key,value] of Object.entries(packed)) assert(Buffer.byteLength(key+JSON.stringify(value)) < 8192);
  assert.deepEqual(restored,data);
  assert.deepEqual(restored.totals['sudoku-hard'],{sum:5479*65534,count:5479});
});
test('20 years with six ordinary hour-long daily results also fit', () => {
  const data=history(20,3600),packed=S.pack(data);
  assert(S.syncBytes(packed)<S.SYNC_BUDGET);assert.deepEqual(S.unpack(packed),data);
});
test('sparse days, leap years, long-duration escapes and old history round trip exactly', () => {
  const data=S.normalize({records:{'sudoku-hard:2000-02-29':1,'sudoku-hard:2024-02-29':604800,'sudoku-hard:2024-12-31':255,'crossword-daily:2026-11-01':3600}});
  assert.deepEqual(S.unpack(S.pack(data)),data);
  assert.equal(S.summarize(data,'sudoku-hard').average,(1+604800+255)/3);
});
test('v1 monthly arrays migrate without per-solve timestamps or date strings in the payload', () => {
  const remote={'swiss:stats:1:reset':1000,'swiss:stats:1:2026-10':{'s:01':[500,2000],'c:02':[1500,900]}};
  const decoded=S.unpack(remote);assert.equal(decoded.records['sudoku-hard:2026-10-01'],500);assert.equal(Object.keys(decoded.records).length,1);
  const packed=S.pack(decoded);assert(!JSON.stringify(packed).includes('2026-10-01'));assert.deepEqual(S.unpack(packed),decoded);
});
test('malformed compact history fails rather than silently overwriting remote records', () => {
  for(const value of ['???','AA==','AQ==','////']) assert.throws(()=>S.unpack({[S.PREFIX+'h:2026']:[0,value]}));
});
test('manual edits override older automatic times and deletions survive stale devices', () => {
  const key = 'sudoku-hard:2026-10-01', original = {records:{[key]:500}}, edited = {edits:{[key]:[800,1000]}};
  assert.equal(S.merge(original,edited).records[key],800);
  const deleted = {edits:{[key]:[0,2000]}};
  assert.deepEqual(S.merge(original,edited,deleted).records,{});
  assert.deepEqual(S.merge(deleted,edited,original),S.merge(original,edited,deleted));
  assert.equal(S.merge(original,deleted,{edits:{[key]:[736,3000]}}).records[key],736);
  assert.deepEqual(S.merge(deleted,{resetAt:4000,records:{}}).edits,{});
  const other = {'crossword-daily:2026-10-02':[900,2500]};
  assert.equal(S.merge(edited,{edits:other}).records['crossword-daily:2026-10-02'],900);
});
test('compact manual revisions round trip and stay below each sync-item quota', () => {
  const edits = {};
  for(let i=0;i<500;i++) edits['sudoku-hard:'+new Date(Date.UTC(2024,0,1)+i*86400000).toISOString().slice(0,10)] = [i%4 ? 700+i : 0,1700000000000+i];
  const data = S.normalize({edits}), packed = S.pack(data);
  assert.deepEqual(S.unpack(packed),data);
  for (const [key,value] of Object.entries(packed)) assert(Buffer.byteLength(key+JSON.stringify(value))<8192);
  for (const value of [[[0,-1,1000]],[[0,100,0]],[[999999,100,1000]],[[0,604801,1000]]]) assert.throws(() => S.unpack({[S.PREFIX+'edits:0']:[0,value]}));
});
