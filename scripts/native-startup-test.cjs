/* Browser validation on public games, using an unsigned-in disposable profile. */
'use strict';
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');
const root=resolve(__dirname,'..'),profile=mkdtempSync(join(tmpdir(),'swiss-native-'));
const chrome=spawn('google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=1440,1100','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-pipe','--enable-unsafe-extension-debugging'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let seq=0,buffer='',session;const pending=new Map(),results=[];
chrome.stdio[4].on('data',data=>{buffer+=data.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}});
const send=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})})+'\0');});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const assert=(condition,message)=>{if(!condition)throw Error(message);console.log('PASS '+message);results.push('PASS '+message);};
async function inside(selector,fn){const {root}=await send('DOM.getDocument',{depth:0});const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector});if(!nodeId)return null;const {node}=await send('DOM.describeNode',{nodeId,depth:1,pierce:true});const shadow=node.shadowRoots?.[0];if(!shadow)return null;const {object}=await send('DOM.resolveNode',{backendNodeId:shadow.backendNodeId});const r=await send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function click(point){if(!point)throw Error('Missing clickable control');await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await wait(150);await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await wait(120);}
async function nativeClick(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',behavior:'instant'})`);await wait(250);await click(await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`));}
async function ownClick(host,selector){await inside(host,`function(){this.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',behavior:'instant'});return true}`);await wait(250);await click(await inside(host,`function(){const n=this.querySelector(${JSON.stringify(selector)});if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}}`));}
async function key(key,code=key.length===1?'Key'+key.toUpperCase():key,modifiers=0){const windowsVirtualKeyCode=key.length===1?key.toUpperCase().charCodeAt(0):({Backspace:8,Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Delete:46}[key]||0);await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode,...(key.length===1&&!modifiers?{text:key,unmodifiedText:key}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode});await wait(70);}
async function dismiss(){
 for(let i=0;i<45;i++){
  const p=await evaluate(`(()=>{if(/access denied|verify you are human|unusual traffic/i.test(document.body.innerText))return{blocked:true};const visible=n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(n===hit||n.contains(hit))};const n=[...document.querySelectorAll('button,[role=button]')].find(n=>!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&visible(n)&&[n.innerText.trim(),n.getAttribute('aria-label'),n.title].some(text=>/^(?:play|close|got it|continue to (?:wordle|connections|puzzle)|no thanks)$/i.test(text||'')));if(n){const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}}return null})()`);
  if(p?.blocked)throw Error('Public page presented an access challenge');if(p)await click(p);else await evaluate(`(()=>{const n=[...document.querySelectorAll('button,[role=button]')].find(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&[n.innerText.trim(),n.getAttribute('aria-label'),n.title].some(text=>/^(?:play|close|got it|continue to (?:wordle|connections|puzzle)|no thanks)$/i.test(text||'')));n?.click()})()`);
  if(!p)await evaluate(`(()=>{const n=document.querySelector('[data-testid="card-label"],.su-board .su-cell,[class*="Tile-module_tile"],[role="gridcell"]');if(n){const r=n.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)n.scrollIntoView({block:'center',behavior:'instant'})}})()`);
  const ready=await evaluate(`(()=>{return [...document.querySelectorAll('[data-testid="card-label"],.su-board .su-cell,[class*="Tile-module_tile"],[role="gridcell"]')].some(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!r.width&&(n===hit||n.contains(hit))})})()`);
  if(ready&&!p){await wait(500);return;}await wait(350);
 }
 throw Error('Public game did not become playable after normal overlay dismissal');
}
async function closeNative(){const selector=await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.getClientRects().length&&!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&/^(?:close|save and close)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()));if(n){n.setAttribute('data-native-test-close','');return '[data-native-test-close]'}return null})()`);if(selector)await nativeClick(selector);await wait(200);}

const deadline=setTimeout(()=>{console.error('Focused live checks timed out');chrome.kill();process.exit(1)},180000);
async function attach(url,context){const {targetId}=await send('Target.createTarget',{url,...(context?{browserContextId:context}:{})},null);({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));await send('Page.enable');return targetId;}
async function gameReady(url){await send('Page.navigate',{url});await wait(1000);await dismiss();await wait(300);await dismiss();}
(async()=>{
 const loaded=await send('Extensions.loadUnpacked',{path:root,enableInIncognito:true},null);
 await attach('chrome://extensions');await wait(700);
 const access=await evaluate(`new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},items=>{const item=items.find(n=>n.id==='${loaded.id}');resolve(item?.state==='ENABLED'&&item.incognitoAccess?.isActive)}))`);
 assert(access===true,'Chrome allows this disposable extension in Incognito');
 await attach('chrome-extension://'+loaded.id+'/popup.html');await wait(700);
 const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const storageKey='puzzle:connections:'+date+':/games/connections::date=&puzzle=&puzzleId=&difficulty=';
 await evaluate(`chrome.storage.local.set(${JSON.stringify({[storageKey]:{game:'connections',updatedAt:Date.now(),state:{solvedColors:[0,1,2,3],marks:{},labels:['A','B','C','D'],attempts:[]}}})})`);
 const {browserContextId}=await send('Target.createBrowserContext',{},null);await attach('about:blank',browserContextId);
 await gameReady('https://www.nytimes.com/games/connections');
 const groups=await inside('[data-margin-inline="connections-tools"]',`function(){return [...this.querySelectorAll('.connection-group')].filter(n=>!n.hidden).length}`);
 assert(groups===4,'A fresh Incognito Connections game shows all four categories despite old solved flags in shared storage');
 await evaluate(`document.querySelector('[data-testid="card-label"]').scrollIntoView({block:'center',behavior:'instant'})`);await wait(450);
 const point=await evaluate(`(()=>{const r=document.querySelector('[data-testid="card-label"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await wait(350);
 assert(await inside('[data-margin-overlay="connections"]',`function(){return this.querySelectorAll('button').length>=4&&this.querySelectorAll('.empty.revealed').length===4}`),'Incognito hover reveals all four usable tile corners after the start screen');
 await ownClick('[data-margin-overlay="connections"]','[data-corner="tl"]');
 assert(await inside('[data-margin-overlay="connections"]',`function(){return !!this.querySelector('[data-corner="tl"][aria-pressed="true"]')}`),'A real Incognito click creates a yellow mark');
 const saved=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'},session)).data;
 assert(!Object.values(saved).some(n=>n?.state?.solvedColors),'Solved display state is removed from shared extension records');
 // Submit groups: three more yellow marks make a ready group, then the extension picks and submits it.
 await evaluate(`[...document.querySelectorAll('[data-margin-overlay="connections"]')].forEach((n,i)=>n.setAttribute('data-live-tile',i))`);
 for(const i of [1,2,3]){await evaluate(`document.querySelector('[data-live-tile="${i}"]').parentElement.scrollIntoView({block:'center',behavior:'instant'})`);await wait(200);const p=await evaluate(`(()=>{const r=document.querySelector('[data-live-tile="${i}"]').parentElement.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await wait(250);await ownClick(`[data-live-tile="${i}"]`,'[data-corner="tl"]');}
 const ready=await inside('[data-margin-inline="connections-undo"]',`function(){const b=this.querySelector('.connection-submit-groups');return{text:b.textContent,disabled:b.disabled}}`);
 console.log(JSON.stringify({ready}));assert(ready.text==='Submit 1 group'&&!ready.disabled,'Four yellow marks make Submit groups ready on the live board');
 const before=await evaluate(`[...document.querySelectorAll('[class*="Mistakes-module_bubble__"]')].filter(n=>n.getClientRects().length).length`);
 await ownClick('[data-margin-inline="connections-undo"]','.connection-submit-groups');
 let outcome;for(let i=0;i<60;i++){await wait(150);outcome=await inside('[data-margin-inline="connections-undo"]',`function(){return this.querySelector('.connection-submit-groups').textContent}`);if(!/^Submitting|^Submit /.test(outcome))break;}
 const after=await evaluate(`({mistakes:[...document.querySelectorAll('[class*="Mistakes-module_bubble__"]')].filter(n=>n.getClientRects().length).length,solved:document.querySelectorAll('[class*="SolvedCategory-module_solvedCategory"]').length,selected:[...document.querySelectorAll('[data-testid="card-label"]')].filter(n=>/(?:^|[\\s_-])selected(?:[\\s_-]|$)/i.test(n.className)).length})`);
 const tries=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'},session)).data;
 console.log(JSON.stringify({outcome,before,after}));
 assert(after.solved===1&&/1 group solved/.test(outcome)||after.mistakes===before-1&&/One away|Not a group/.test(outcome),'Submit groups selects the marked words and submits them through the live game');
 assert(Object.values(tries).find(n=>n?.game==='connections')?.state.attempts?.length===1,'The automatic submission appears in Previous tries');
 await gameReady('https://www.nytimes.com/puzzles/sudoku/easy');
 const layout=await evaluate(`(()=>{const auto=document.querySelector('label.su-keyboard__auto'),row=auto?.nextElementSibling,key=document.querySelector('.su-keyboard__number');return{inKeypad:!!auto?.closest('.su-keyboard__container'),below:!!(auto&&key&&auto.getBoundingClientRect().top>key.getBoundingClientRect().top),row:row?.getAttribute('data-margin-inline'),rowBelow:!!(row&&row.getBoundingClientRect().top>=auto.getBoundingClientRect().bottom-1),old:!!document.querySelector('[data-margin-inline="sudoku-pencil"],[data-margin-inline="sudoku-candidates"],[data-margin-overlay="sudoku"]')}})()`);
 console.log(JSON.stringify({sudokuLayout:layout}));
 assert(layout.inKeypad&&layout.below&&layout.row==='sudoku-colored'&&layout.rowBelow&&!layout.old,'Auto candidate stays below the keypad with Colored candidate on the next line');
 const cellIndex=await evaluate(`(()=>{const cells=[...document.querySelectorAll('.su-board .su-cell')],i=cells.findIndex(n=>!n.querySelector('.su-cell__value')&&!/(?:^|\\s)selected(?:\\s|$)/.test(n.className));cells[i].setAttribute('data-live-empty','');return i})()`);
 const within=`((node)=>{const c=document.querySelector('[data-live-empty]').getBoundingClientRect(),r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>=c.left&&x<c.right&&y>=c.top&&y<c.bottom})`;
 const marks=`[...document.querySelectorAll('.su-candidates > svg.su-candidate')].filter(${within})`;
 const mark=digit=>evaluate(`(()=>{const m=${marks}.find(n=>n.getAttribute('data-candidate')==='${digit}');return m?{colored:m.hasAttribute('data-margin-colored'),fill:getComputedStyle(m.querySelector('path,text')).fill}:null})()`);
 const coloredChecked=()=>inside('[data-margin-inline="sudoku-colored"]',`function(){return this.querySelector('input').checked}`);
 const pressed=name=>evaluate(`document.querySelector('[data-testid="${name}-mode"]').getAttribute('aria-pressed')==='true'`);
 await nativeClick('[data-live-empty]');await wait(300);
 await key('b','KeyB');await wait(250);
 assert(await coloredChecked()&&await pressed('candidate'),'The B hotkey turns on Colored candidate in native Candidate mode');
 await key('8','Digit8');await wait(450);
 let found=await mark(8);
 assert(found?.colored&&found.fill==='rgb(47, 111, 219)','A real key press adds a colored candidate on the live board');
 await key('8','Digit8');await wait(450);found=await mark(8);
 assert(found&&!found.colored,'Pressing it again keeps the candidate and removes only the blue');
 await key('8','Digit8');await wait(450);assert((await mark(8))?.colored,'A third press paints it blue again');
 await key('b','KeyB');await wait(250);
 assert(!await coloredChecked()&&await pressed('candidate'),'B again turns colors off and keeps native Candidate');
 await nativeClick('[data-testid="candidate-mode"]');await key('8','Digit8');await wait(450);
 let data=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'},session)).data;
 assert(!(await mark(8))&&!Object.values(data).find(n=>n?.game==='sudoku')?.state.sudokuColored?.[cellIndex]?.includes(8),'Removing a colored candidate the normal way also forgets its color');
 await nativeClick('label.su-keyboard__auto');await wait(600);
 const autoDigit=await evaluate(`Number(${marks}[0]?.getAttribute('data-candidate'))||0`);
 assert(autoDigit>0,'Auto candidate fills candidates into the empty square');
 await key('b','KeyB');await wait(200);await key(String(autoDigit),'Digit'+autoDigit);await wait(450);
 assert((await mark(autoDigit))?.colored,'Blue paints an Auto candidate without eliminating it');
 await ownClick('[data-margin-inline="sudoku-colored"]','.colored-eye');await wait(250);
 assert(await evaluate(`getComputedStyle(${marks}.find(n=>n.hasAttribute('data-margin-colored'))).visibility==='hidden'`),'The eye hides colored candidates on the live board');
 await ownClick('[data-margin-inline="sudoku-colored"]','.colored-eye');await wait(250);
 assert(await evaluate(`getComputedStyle(${marks}.find(n=>n.hasAttribute('data-margin-colored'))).visibility!=='hidden'`),'The eye shows them again');
 assert(await evaluate(`getComputedStyle(${marks}.find(n=>n.hasAttribute('data-margin-colored')).querySelector('path')).transform!=='none'`),'Colored candidates are italic on the live board');
 data=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'},session)).data;
 assert(Object.values(data).find(n=>n?.game==='sudoku')?.state.sudokuColored?.[cellIndex]?.includes(autoDigit),'Colored marks are saved with the puzzle');
 const wiped=await inside('#margin-host',`function(){const b=this.querySelector('button[aria-label="Delete all colored candidates from the board"]');b.click();const asked=b.textContent;b.click();return asked}`);
 for(let i=0;i<30&&await mark(autoDigit);i++)await wait(100);
 data=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'},session)).data;
 console.log(JSON.stringify({wiped}));
 assert(/^Delete 1\? Click again$/.test(wiped)&&!(await mark(autoDigit))&&!Object.keys(Object.values(data).find(n=>n?.game==='sudoku')?.state.sudokuColored||{}).length,'Clear all colored candidates asks once, then deletes them through the live game');
 await nativeClick('label.su-keyboard__auto');await wait(400);
 console.log(`PASS ${results.length} focused Incognito and Sudoku checks.`);
})().catch(error=>{console.error('FAIL '+error.stack);process.exitCode=1}).finally(async()=>{clearTimeout(deadline);await send('Browser.close',{},null).catch(()=>{});setTimeout(()=>{chrome.kill();try{rmSync(profile,{recursive:true,force:true})}catch{}},150)});
