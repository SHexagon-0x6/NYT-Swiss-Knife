/* Exercise the real extension, worker, isolated content script, and closed prompt.
   NYT routes are fulfilled locally with result-screen markup; no puzzle is solved. */
'use strict';
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,readdirSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {join,resolve} = require('node:path');
const {tmpdir} = require('node:os');
const root = resolve(__dirname,'..'), profile = mkdtempSync(join(tmpdir(),'swiss-stats-'));
const extensionPath = resolve(process.argv[2] || root);
const screenshots = process.env.STATS_SCREENSHOTS !== '0';
const chrome = spawn('google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--enable-unsafe-extension-debugging','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let seq = 0, buffer = ''; const pending = new Map(), events = new Map();
function send(method,params={},sessionId) {return new Promise((resolve,reject) => {const id = ++seq;pending.set(id,{resolve,reject});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');}); }
chrome.stdio[4].on('data',chunk => {
  buffer += chunk;let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const raw = buffer.slice(0,end);buffer = buffer.slice(end+1);if (!raw) continue;
    const message = JSON.parse(raw), task = pending.get(message.id);
    if (task) {pending.delete(message.id);message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result);}
    else if (message.method) events.get(message.method)?.(message);
  }
});
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(fn,label) {for (let i=0;i<70;i++) {if (await fn()) return;await wait(100);}throw Error('Timed out: '+label);}
async function evaluate(session,expression) {const r = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;}
async function tab() {const {targetId} = await send('Target.createTarget',{url:'about:blank'});return (await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;}
async function inside(session,expression,selector = '[data-margin-inline="stats-prompt"]') {
  const {root} = await send('DOM.getDocument',{depth:0},session), {nodeId} = await send('DOM.querySelector',{nodeId:root.nodeId,selector},session);
  if (!nodeId) return null;
  const {node} = await send('DOM.describeNode',{nodeId,depth:1,pierce:true},session);
  const {object} = await send('DOM.resolveNode',{backendNodeId:node.shadowRoots[0].backendNodeId},session);
  const result = await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:`function(){${expression}}`,returnByValue:true,awaitPromise:true},session);
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const fixture = path => `<!doctype html><html><head><meta charset="utf-8"><title>Local result fixture</title><style>body{font:16px Arial;margin:30px}.xwd__modal--content{padding:20px;max-width:500px;border:1px solid #ccc}</style></head><body><main><h1>${path.includes('sudoku')?'Sudoku':'The Crossword'}</h1><div class="${path.includes('sudoku')?'pz-game-date':'xwd__details--date'}">October 30, 2026</div><div class="su-timer__value timer-count">12:34</div><button>Settings</button><div id="result" class="xwd__modal--content ${path.includes('sudoku')?'':'xwd__congrats-modal'}" hidden><h2>Congratulations!</h2><p class="modal-system-subheader xwd__congrats-modal--message">${path.includes('sudoku')?'You finished a <em>hard</em><br> puzzle in <em>12:34</em>.':'You solved the crossword<br>in <strong>25:06</strong>.'}</p></div></main></body></html>`;
const report = message => console.log('PASS '+message);
const deadline = setTimeout(() => {console.error('Stats extension checks timed out');chrome.kill();process.exitCode=1;},90000);
(async () => {
  const {id} = await send('Extensions.loadUnpacked',{path:extensionPath});
  const manifest = JSON.parse(readFileSync(join(extensionPath,'manifest.json'),'utf8'));
  if (manifest.key) {
    const expected = [...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32)].map(c => String.fromCharCode(97+parseInt(c,16))).join('');
    assert.equal(id,expected);report('Prepared local build loads with its fixed preview extension ID');
  }
  let stats = await tab();const game = await tab();
  events.set('Fetch.requestPaused',message => {
    const path = new URL(message.params.request.url).pathname;
    send('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture(path)).toString('base64')},message.sessionId).catch(() => {});
  });
  await send('Fetch.enable',{patterns:[{urlPattern:'https://www.nytimes.com/*',resourceType:'Document'}]},game);
  await send('Page.navigate',{url:`chrome-extension://${id}/popup.html`},stats);
  await until(() => evaluate(stats,`document.getElementById('month-title')?.textContent && !document.getElementById('stats-status').textContent.includes('Loading')`),'stats startup');
  // A tab cannot reproduce Chrome action-popup auto-sizing. In particular,
  // max-width:100vw previously squeezed the actual 300 px popup down to 210 px.
  const beforePopup = new Set((await send('Target.getTargets')).targetInfos.map(target => target.targetId));
  await evaluate(stats,'chrome.action.openPopup()');
  let popupTarget;
  await until(async () => {
    popupTarget = (await send('Target.getTargets')).targetInfos.find(target => !beforePopup.has(target.targetId) && target.url === `chrome-extension://${id}/popup.html`);
    return !!popupTarget;
  },'Chrome action popup');
  const popup = (await send('Target.attachToTarget',{targetId:popupTarget.targetId,flatten:true})).sessionId;
  await until(() => evaluate(popup,`document.readyState === 'complete' && innerWidth === 300 && document.getElementById('stats-section')`),'original popup width');
  assert.equal(await evaluate(popup,'document.body.getBoundingClientRect().width'),300);
  assert(await evaluate(popup,`!document.getElementById('stats-section').open && !document.querySelector('#stats-panel a')`));
  mkdirSync(join(root,'test-results'),{recursive:true});
  if (screenshots) {const closedPopup = await send('Page.captureScreenshot',{format:'png'},popup);
  writeFileSync(join(root,'test-results','popup-closed.png'),Buffer.from(closedPopup.data,'base64'));}
  await evaluate(popup,`document.getElementById('stats-toggle').click()`);
  await until(() => evaluate(popup,`document.getElementById('stats-section').open && document.getElementById('stats-toggle').getAttribute('aria-expanded') === 'true'`),'calendar disclosure');
  assert.equal(await evaluate(popup,'document.body.getBoundingClientRect().width'),300);
  await evaluate(popup,`document.getElementById('stats-toggle').click()`);
  await until(() => evaluate(popup,`!document.getElementById('stats-section').open && innerWidth === 300`),'collapsed popup width');
  await send('Target.closeTarget',{targetId:popupTarget.targetId});
  report('Actual Chrome popup keeps the original 300 px width; calendar disclosure opens and closes without duplicate links');
  await evaluate(stats,`document.getElementById('stats-toggle').click()`);
  const local = () => evaluate(stats,`chrome.storage.local.get('statsLocalV1').then(d=>d.statsLocalV1?.records||{})`);
  assert.deepEqual(await local(),{});report('Empty stats page uses real storage without sample records');
  async function navigate(path) {
    await send('Page.navigate',{url:'https://www.nytimes.com'+path},game);
    await until(() => evaluate(game,`document.readyState === 'complete' && !!document.getElementById('result')`),'fixture ready');await wait(250);
  }
  await navigate('/puzzles/sudoku/hard');
  await send('Emulation.setTimezoneOverride',{timezoneId:'Pacific/Honolulu'},game);
  assert.equal(await inside(game,'return this.textContent'),null);assert.deepEqual(await local(),{});report('A running timer and hidden result do not offer or store a time');
  await evaluate(game,`document.getElementById('result').hidden=false`);
  await until(() => inside(game,'return !!this.querySelector("input[type=checkbox]")?.checked'),'Sudoku default recording');
  await until(async () => (await local())['sudoku-hard:2026-10-30'] === 754,'automatic Sudoku save');
  await until(() => evaluate(stats,`document.querySelector('.day[data-date="2026-10-30"]')?.classList.contains('yellow')`),'first result is normal');
  assert.match(await inside(game,'return this.textContent'),/12:34/);
  assert(await inside(game,'const s=getComputedStyle(this.querySelector(".stats-offer"));return s.backgroundColor==="rgba(0, 0, 0, 0)" && s.borderRadius==="0px"'));
  report('Congratulations saves by default with a plain checked recording control');
  await evaluate(game,`document.getElementById('result').hidden=true`);await wait(200);
  assert.equal((await local())['sudoku-hard:2026-10-30'],754);report('Closing congratulations keeps the saved time');
  await evaluate(game,`document.getElementById('result').hidden=false`);
  await until(() => inside(game,'return !!this.querySelector("input")?.checked'),'saved result');
  await inside(game,'this.querySelector("input").click()');
  await until(async () => Object.keys(await local()).length === 0,'unchecked result deletion');
  await navigate('/puzzles/sudoku/hard');await evaluate(game,`document.getElementById('result').hidden=false`);
  await until(() => inside(game,'return !!this.querySelector("input")'),'deleted result control');
  assert.equal(await inside(game,'return this.querySelector("input").checked'),false);assert.deepEqual(await local(),{});
  report('Unchecking removes the day and reopening does not silently restore it');
  await inside(game,'this.querySelector("input").click()');await until(async () => (await local())['sudoku-hard:2026-10-30'] === 754,'restored record');
  await evaluate(stats,`document.getElementById('stats-section').open=true`);
  await until(() => evaluate(stats,`document.querySelector('.day[data-date="2026-10-30"]')?.classList.contains('yellow')`),'popup updates');
  assert(await evaluate(stats,`!document.querySelector('.day.today,.day[aria-current="date"]')`));
  report('The main popup has no date dot, including after NYT dates and saved times update');
  async function repeatSolve(gameName,date,seconds,hideFirst = true) {
    if (hideFirst) {
      await evaluate(game,`document.getElementById('result').hidden=true`);
      await until(() => evaluate(game,`!document.querySelector('[data-margin-inline="stats-prompt"]')`),'old completion closes');
    }
    const label = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    const message = `You finished a hard puzzle in ${label}.`;
    await evaluate(game,`document.querySelector('.modal-system-subheader').textContent=${JSON.stringify(message)};document.getElementById('result').hidden=false`);
    await until(async () => (await local())[gameName+':'+date] === seconds,'repeat completion replaces time');
    await until(async () => await inside(game,`return !!this.querySelector('input')?.checked && this.querySelector('.stats-offer-detail').textContent.includes(${JSON.stringify(label)})`),'repeat control displays new time');
    assert.equal(await evaluate(stats,`chrome.storage.sync.get(null).then(d=>MarginStats.unpack(d).records[${JSON.stringify(gameName+':'+date)}])`),seconds);
    const total = await evaluate(stats,`chrome.storage.local.get('statsLocalV1').then(d=>d.statsLocalV1.totals[${JSON.stringify(gameName)}])`);
    assert.deepEqual(total,{sum:seconds,count:1});
  }
  await repeatSolve('sudoku-hard','2026-10-30',600);
  await repeatSolve('sudoku-hard','2026-10-30',900,false);
  await until(() => evaluate(stats,`document.getElementById('average').textContent==='15:00'`),'repeat average updates');
  report('Sudoku repeat solves replace faster and slower times, including reused dialogs; checkbox, average and sync agree');
  await inside(game,'this.querySelector("input").click()');
  await until(async () => (await local())['sudoku-hard:2026-10-30'] === 600,'declined repeat restores previous time');
  await until(() => inside(game,`return !this.querySelector('input').checked && this.querySelector('.stats-offer-status').textContent.includes('10:00')`),'previous time explained');
  await navigate('/puzzles/sudoku/hard');
  await evaluate(game,`document.querySelector('.modal-system-subheader').textContent='You finished a hard puzzle in 15:00.';document.getElementById('result').hidden=false`);
  await until(() => inside(game,`return this.querySelector('.stats-offer-status')?.textContent.includes('10:00')`),'declined repeat survives reload');
  assert.equal(await inside(game,`return this.querySelector('input').checked`),false);
  await inside(game,'this.querySelector("input").click()');
  await until(async () => (await local())['sudoku-hard:2026-10-30'] === 900,'rechecked repeat saved');
  await inside(game,'this.querySelector("input").click()');
  await until(async () => (await local())['sudoku-hard:2026-10-30'] === 600,'second decline retains original time');
  report('Declining a repeat restores the previous time, including after reload and repeated checkbox changes');
  await evaluate(stats,`chrome.runtime.sendMessage({type:'swiss-stats',action:'save-day',game:'sudoku-hard',date:'2026-10-30',seconds:950})`);
  await navigate('/puzzles/sudoku/hard');
  await evaluate(game,`document.querySelector('.modal-system-subheader').textContent='You finished a hard puzzle in 15:00.';document.getElementById('result').hidden=false`);
  await until(async () => await inside(game,`return this.querySelector('.stats-offer-status')?.textContent.includes('15:50')`),'reopened result keeps manual correction');
  assert.equal((await local())['sudoku-hard:2026-10-30'],950);
  report('Reopening a previously captured result after refresh preserves manual calendar corrections');
  for (const path of ['/puzzles/sudoku/easy','/puzzles/sudoku/medium','/crosswords/game/daily','/crosswords/game/daily/2026/10/31','/games/crosswords/daily','/crosswords/game/mini','/crosswords/game/midi','/games/bonus/crossword/november']) {
    await navigate(path);await evaluate(game,`document.getElementById('result').hidden=false`);await wait(250);assert.equal(await inside(game,'return true'),null,path);
  }
  assert.equal(Object.keys(await local()).length,1);report('Easy, Medium and every crossword result (Daily, Mini, Midi, Bonus) are excluded');
  await navigate('/crosswords/game/daily/2026/10/31');await wait(250);
  assert.equal(await inside(game,'return true','[data-margin-inline="stats-logo"]'),null);
  report('Daily Crossword pages show no stats logo');
  await navigate('/puzzles/sudoku/hard');await evaluate(game,`document.querySelector('.pz-game-date').remove();document.getElementById('result').hidden=false`);await wait(400);assert.equal(await inside(game,'return true'),null);report('A missing Sudoku puzzle date is never replaced by the computer date');
  await navigate('/puzzles/sudoku/hard');
  await evaluate(game,`document.querySelector('.pz-game-date').textContent='October 31, 2026'`);
  // Verify the actual UI with enough data to exercise all calendar colors.
  await send('Page.bringToFront',{},stats);
  await evaluate(stats,`(async()=>{await chrome.runtime.sendMessage({type:'swiss-stats',action:'clear'});const records={};for(let i=1;i<=25;i++){const date='2026-10-'+String(i).padStart(2,'0');records['sudoku-hard:'+date]=i<=10?400+i*30:i%3===0?200+i:i%3===1?1100+i:600+i;}const previous=await chrome.storage.local.get('statsLocalV1');await chrome.storage.local.set({statsLocalV1:{records,resetAt:previous.statsLocalV1.resetAt}});})()`);
  await until(() => evaluate(stats,`document.getElementById('average').textContent==='10:17'`),'UI live update');
  await evaluate(stats,`(()=>{const current=new Date(document.getElementById('month-title').textContent+' 1'),year=current.getFullYear(),month=current.getMonth()+1,delta=(year-2026)*12+month-10;for(let i=0;i<Math.abs(delta);i++)document.getElementById(delta>0?'previous':'next').click();})()`);
  for (const [color,count] of [['green',6],['yellow',13],['red',6]]) assert.equal(await evaluate(stats,`document.querySelectorAll('.calendar .${color}').length`),count,color);
  assert.equal(await evaluate(stats,`document.querySelectorAll('.legend li').length`),3);
  assert(await evaluate(stats,`[...document.querySelectorAll('.day')].every(day => /^\\d+$/.test(day.textContent) && !day.title) && document.getElementById('day-detail').hidden && !document.getElementById('best') && !document.getElementById('recent')`));
  await evaluate(stats,`document.querySelector('[data-date="2026-10-12"]').focus()`);
  assert(await evaluate(stats,`document.getElementById('day-detail').hidden`));
  await evaluate(stats,`document.querySelector('[data-date="2026-10-12"]').click()`);
  assert.equal(await evaluate(stats,`document.querySelector('#day-detail strong').textContent`),'3:32');
  assert(await evaluate(stats,`document.querySelector('.stats-game').textContent==='Sudoku · Hard' && !document.querySelector('.stats-calendar button[data-game]')`));
  report('Compact calendar shows colored dates and one average; only a date click reveals its time');
  mkdirSync(join(root,'test-results'),{recursive:true});
  for (const [width,height,name] of [[1280,1100,'stats-desktop'],[390,1100,'stats-mobile']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},stats);
    assert(await evaluate(stats,'document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow');
    if (screenshots) {const shot = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},stats);writeFileSync(join(root,'test-results',name+'.png'),Buffer.from(shot.data,'base64'));}
  }
  report('Desktop and mobile layouts fit the viewport');
  await send('Page.bringToFront',{},game);
  const logoSelector = '[data-margin-inline="stats-logo"]', panelSelector = '[data-margin-overlay="stats-calendar"]';
  await until(() => inside(game,'return !!this.querySelector("button")',logoSelector),'toolbar logo');
  await inside(game,'this.querySelector("button").dispatchEvent(new MouseEvent("click",{bubbles:true,detail:1}))',logoSelector);
  await until(() => inside(game,'return this.querySelector(".popover-status").textContent === ""',panelSelector),'popover data');
  assert.equal(await inside(game,'return this.querySelector(".day[aria-current=date]")?.dataset.date',panelSelector),'2026-10-31');
  report('Sudoku calendar dot follows the displayed puzzle date');
  await inside(game,`const current=new Date(this.querySelector('#month-title').textContent+' 1'),year=current.getFullYear(),month=current.getMonth()+1,delta=(year-2026)*12+month-10;for(let i=0;i<Math.abs(delta);i++)this.querySelector(delta>0?'#previous':'#next').click();`,panelSelector);
  assert.equal(await inside(game,'return this.querySelector("#average").textContent',panelSelector),'10:17');
  assert(await inside(game,'return this.querySelector("#day-detail").hidden && [...this.querySelectorAll(".day")].every(day => /^\\d+$/.test(day.textContent))',panelSelector));
  await send('Emulation.setDeviceMetricsOverride',{width:780,height:650,deviceScaleFactor:1,mobile:false},game);
  if (screenshots) {const floatingShot = await send('Page.captureScreenshot',{format:'png'},game);writeFileSync(join(root,'test-results','stats-popover.png'),Buffer.from(floatingShot.data,'base64'));}
  await inside(game,`this.querySelector('[data-date="2026-10-12"]').click()`,panelSelector);
  assert.equal(await inside(game,'return this.querySelector("#day-detail strong").textContent',panelSelector),'3:32');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:600,deviceScaleFactor:1,mobile:false},game);await wait(100);
  assert(await inside(game,'const r=this.host.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;',panelSelector));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},game);
  assert.equal(await inside(game,'return this.querySelector("button").getAttribute("aria-expanded")',logoSelector),'false');
  report('Toolbar logo opens a floating calendar; date clicks, narrow-screen placement and Escape work');
  await send('Page.bringToFront',{},stats);
  // Storage refreshes can briefly disable controls between separate CDP calls.
  await until(() => evaluate(stats,`(()=>{const button=document.getElementById('clear');if(!button.disabled)button.click();return document.getElementById('clear-dialog').open})()`),'clear confirmation ready');
  await evaluate(stats,`document.getElementById('clear-dialog').close('cancel')`);await wait(250);assert.equal(Object.keys(await local()).length,25);
  await until(() => evaluate(stats,`(()=>{const button=document.getElementById('clear');if(!button.disabled)button.click();return document.getElementById('clear-dialog').open})()`),'clear confirmation reopened');
  await evaluate(stats,`document.getElementById('clear-dialog').close('clear')`);
  await until(async () => Object.keys(await local()).length === 0,'clear history').catch(async error=>{console.error(await evaluate(stats,`(async()=>({status:document.getElementById('stats-status').textContent,dialog:document.getElementById('clear-dialog').open,disabled:document.getElementById('clear').disabled,local:await chrome.storage.local.get(['statsLocalV1','statsSyncStatusV1']),sync:await chrome.storage.sync.get(null)}))()`));throw error;});report('Clear confirmation supports cancel and deletes only after confirming');
  await navigate('/puzzles/sudoku/hard');
  await evaluate(game,`document.querySelector('.pz-game-date').textContent='November 2, 2026'`);
  await evaluate(stats,`document.getElementById('stats-section').open=true`);
  await until(() => evaluate(stats,`chrome.storage.local.get('statsPuzzleDatesV1').then(d=>d.statsPuzzleDatesV1?.['sudoku-hard']==='2026-11-02')`),'current NYT puzzle date');
  await evaluate(stats,`(()=>{const d=new Date(document.getElementById('month-title').textContent+' 1'),delta=(2026-d.getFullYear())*12+10-d.getMonth();for(let i=0;i<Math.abs(delta);i++)document.getElementById(delta>0?'next':'previous').click()})()`);
  assert(await evaluate(stats,`!document.querySelector('.day.today,.day[aria-current="date"]')`));
  await inside(game,'this.querySelector("button").click()',logoSelector);
  await until(() => inside(game,`return this.querySelector('.day[aria-current="date"]')?.dataset.date === '2026-11-02'`,panelSelector),'Sudoku page marks its printed puzzle date');
  await inside(game,`this.querySelector('.popover-close').click()`,panelSelector);
  report('Only the puzzle open on the NYT page gets a dot; cached dates never mark the main popup');
  await evaluate(stats,`document.querySelector('[data-date="2026-11-02"]').click();document.querySelector('.day-editor input').value='12:16';document.querySelector('.day-editor').requestSubmit()`);
  await until(async () => (await local())['sudoku-hard:2026-11-02'] === 736,'manual add');
  await until(() => evaluate(stats,`!document.querySelector('.day-editor input').disabled`),'editor ready');
  await evaluate(stats,`document.querySelector('.day-editor input').value='12:30';document.querySelector('.day-editor').requestSubmit()`);
  await until(async () => (await local())['sudoku-hard:2026-11-02'] === 750,'manual correction');
  await until(() => evaluate(stats,`document.getElementById('average').textContent==='12:30' && !document.querySelector('.delete-day').disabled`),'corrected average');
  await evaluate(stats,`document.querySelector('.delete-day').click()`);
  await until(async () => Object.keys(await local()).length === 0,'delete selected day');
  await until(() => evaluate(stats,`!document.querySelector('.day-editor input').disabled`),'empty date editor');
  await evaluate(stats,`document.querySelector('.day-editor input').value='12:16';document.querySelector('.day-editor').requestSubmit()`);
  await until(async () => (await local())['sudoku-hard:2026-11-02'] === 736,'manual replacement');
  report('Calendar dates support adding, increasing, deleting and restoring a time; averages update');
  const beforeExport = await local();
  const downloads = join(profile,'downloads');mkdirSync(downloads);
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await until(()=>evaluate(stats,`!document.getElementById('export').disabled`),'export ready');
  await evaluate(stats,`document.getElementById('export').click()`);let exportedFile;
  await until(()=>{exportedFile=readdirSync(downloads).find(name=>name.endsWith('.json'));return !!exportedFile;},'JSON export downloaded');
  const exported=JSON.parse(readFileSync(join(downloads,exportedFile),'utf8'));
  assert.equal(exported.version,1);assert(Number.isFinite(Date.parse(exported.exportedAt)));
  assert.deepEqual(exported.records,[{game:'sudoku-hard',date:'2026-11-02',seconds:736}]);
  assert.deepEqual(await local(),beforeExport);
  report('Export downloads exact puzzle dates and times as JSON without changing saved history');
  await evaluate(stats,`chrome.storage.local.set({'puzzle:retention-check':{scratch:'keep'}})`);
  await send('Page.reload',{},stats);
  await until(() => evaluate(stats,`document.readyState==='complete' && !!globalThis.MarginStats`),'reopened extension popup');
  assert.equal((await local())['sudoku-hard:2026-11-02'],736);
  assert.equal(await evaluate(stats,`chrome.storage.local.get('puzzle:retention-check').then(d=>d['puzzle:retention-check'].scratch)`),'keep');
  report('Reopening the popup preserves recorded times and puzzle notes');
  await navigate('/puzzles/sudoku/hard');
  await evaluate(stats,'chrome.runtime.reload()').catch(() => {});
  await inside(game,'this.querySelector("button").click()',logoSelector);
  await until(() => inside(game,'return this.querySelector(".popover-status").textContent.includes("Refresh this puzzle tab")',panelSelector),'disconnected calendar guidance');
  assert(await inside(game,'return !this.querySelector(".popover-reload").hidden',panelSelector));
  await evaluate(game,`document.getElementById('result').hidden=false`);
  await until(() => inside(game,'return !this.querySelector("button").hidden && this.querySelector("button").textContent === "Refresh tab"'),'disconnected completion guidance');
  report('An invalidated tab displays a reconnect action instead of a silent missed result');

})().catch(error => {console.error(error.stack);process.exitCode=1;}).finally(async () => {
  clearTimeout(deadline);await send('Browser.close').catch(() => {});setTimeout(() => {chrome.kill();rmSync(profile,{recursive:true,force:true});},100);
});
