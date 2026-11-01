/* Browser validation on public games, using an unsigned-in disposable profile. */
'use strict';
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,writeFileSync}=require('node:fs');
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
async function key(key,code=key.length===1?'Key'+key.toUpperCase():key,modifiers=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(key.length===1&&!modifiers?{text:key,unmodifiedText:key}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await wait(70);}
async function dismiss(){
 for(let i=0;i<45;i++){
  const p=await evaluate(`(()=>{if(/access denied|verify you are human|unusual traffic/i.test(document.body.innerText))return{blocked:true};const visible=n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(n===hit||n.contains(hit))};const n=[...document.querySelectorAll('button,[role=button]')].find(n=>!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&visible(n)&&[n.innerText.trim(),n.getAttribute('aria-label'),n.title].some(text=>/^(?:play|close|got it|continue to (?:wordle|connections|strands|puzzle)|no thanks)$/i.test(text||'')));if(n){const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}}return null})()`);
  if(p?.blocked)throw Error('Public page presented an access challenge');if(p)await click(p);else await evaluate(`(()=>{const n=[...document.querySelectorAll('button,[role=button]')].find(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&[n.innerText.trim(),n.getAttribute('aria-label'),n.title].some(text=>/^(?:play|close|got it|continue to (?:wordle|connections|strands|puzzle)|no thanks)$/i.test(text||'')));n?.click()})()`);
  if(!p)await evaluate(`(()=>{const n=document.querySelector('[data-testid="card-label"],.su-board .su-cell,[data-testid="strands-board"],[class*="Tile-module_tile"],[role="gridcell"]');if(n){const r=n.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)n.scrollIntoView({block:'center',behavior:'instant'})}})()`);
  const ready=await evaluate(`(()=>{return [...document.querySelectorAll('[data-testid="card-label"],.su-board .su-cell,[data-testid="strands-board"],[class*="Tile-module_tile"],[role="gridcell"]')].some(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!r.width&&(n===hit||n.contains(hit))})})()`);
  if(ready&&!p){await wait(500);return;}await wait(350);
 }
 throw Error('Public game did not become playable after normal overlay dismissal');
}
async function closeNative(){const selector=await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.getClientRects().length&&!n.closest('#margin-host,[data-margin-inline],[data-margin-overlay]')&&/^(?:close|save and close)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()));if(n){n.setAttribute('data-native-test-close','');return '[data-native-test-close]'}return null})()`);if(selector)await nativeClick(selector);await wait(200);}
async function settings(game){
 const selector='button[data-testid="settings-button"],button[aria-label="Puzzle Settings Menu"]';
 await nativeClick(selector);await wait(450);if(!await evaluate(`/\\bsettings\\b/i.test(document.body.innerText)`)){await evaluate(`document.querySelector('button[data-testid="settings-button"],button[aria-label="Puzzle Settings Menu"]')?.click()`);await wait(450);}console.log(JSON.stringify({game,nativeSettings:await evaluate(`(()=>{const n=document.querySelector('button[data-testid="settings-button"],button[aria-label="Puzzle Settings Menu"]'),r=n.getBoundingClientRect();return{rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,160),modals:[...document.querySelectorAll('[role="dialog"],[class*="Modal-module"]')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,cls:n.className,text:n.innerText?.slice(0,100)})).slice(-10)}})()`)}));
 const details=await inside('#margin-host',`function(){return {embedded:this.host.parentElement?.outerHTML.slice(0,150),native:this.querySelector('.native-settings')!==null,summaryHidden:this.querySelector('summary').hidden,features:[...this.querySelectorAll('[data-feature]')].map(n=>n.dataset.feature),shortcut:this.querySelector('.shortcut-key')?.textContent,rect:this.host.getBoundingClientRect().toJSON()}}`);
 console.log(JSON.stringify({game,settings:details}));assert(details?.native&&details.summaryHidden,game+' adds tools below original settings without another gear');
 const font=await inside('#margin-host',`function(){return parseFloat(getComputedStyle(this.querySelector('.feature-toggle')).fontSize)}`);assert(font>=14&&details.rect.width>300,game+' settings keep readable native-sized labels and full content width');
 if(game==='wordle'){
  const typography=await inside('#margin-host',`function(){const native=[...this.host.parentElement.querySelectorAll('div,span,label,h3')].find(n=>!n.children.length&&/^hard mode$/i.test(n.textContent.trim()));const own=getComputedStyle(this.querySelector('.feature-toggle'));return native?{native:getComputedStyle(native).fontFamily,own:own.fontFamily,nativeSize:getComputedStyle(native).fontSize,ownSize:own.fontSize}:null}`);
  console.log(JSON.stringify({typography,labels:await evaluate(`(()=>{const p=document.querySelector('#margin-host')?.parentElement;return [...p.querySelectorAll('div,span,label,p,strong,h3')].filter(n=>!n.children.length&&!n.closest('#margin-host')&&n.textContent.trim()).slice(0,10).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent.trim(),font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize}))})()`)}));
  assert(typography&&typography.native===typography.own&&typography.nativeSize===typography.ownSize,'Wordle extension settings match the native Hard Mode font family and size');
 }
 const first=details.features[0];if(first){await ownClick('#margin-host','[data-feature="'+first+'"]');await ownClick('#margin-host','[data-feature="'+first+'"]');}
 if(['wordle','sudoku'].includes(game)){
  const indent=await inside('#margin-host',`function(){const native=this.host.parentElement.querySelector('${game==='wordle'?'[class*="Settings-module_title"]':'label.su-modal-system-label'}'),own=this.querySelector('.feature-toggle');return {native:native.getBoundingClientRect().left,own:own.getBoundingClientRect().left,ownFont:getComputedStyle(own).fontFamily,nativeFont:getComputedStyle(native).fontFamily}}`);
  console.log(JSON.stringify({game,indent}));assert(Math.abs(indent.own-indent.native)<1&&indent.ownFont===indent.nativeFont,game+' extension preferences align with native settings indentation and font');
 }
 if(['sudoku','crossword'].includes(game)){
  const choices=game==='sudoku'?[['corner','F8'],['center','F9'],['play','F10']]:[['','F8']];
  for(const [mode,hotkey]of choices){
   const selector=mode?'[data-shortcut-mode="'+mode+'"] .shortcut-key':'.shortcut-key';
   await ownClick('#margin-host',selector);await key(hotkey,hotkey);
   const label=await inside('#margin-host',`function(){return this.querySelector('${selector}').textContent}`);assert(label===hotkey,game+' captures '+(mode||'Pencil')+' hotkey in original settings');
  }
 }
 await closeNative();
}
const deadline=setTimeout(()=>{console.error('Native browser test deadline');chrome.kill('SIGTERM');process.exit(1)},220000);
(async()=>{
 const loaded=await send('Extensions.loadUnpacked',{path:root},null);
 const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));await send('Page.enable');
 const games={wordle:'https://www.nytimes.com/games/wordle/index.html',connections:'https://www.nytimes.com/games/connections',strands:'https://www.nytimes.com/games/strands',sudoku:'https://www.nytimes.com/puzzles/sudoku/easy',crossword:'https://www.nytimes.com/games/bonus/crossword/mini/2026-08-25'};
 for(const [game,url]of Object.entries(games)){
  if(process.argv[2]&&game!==process.argv[2])continue;
  try{
   await send('Page.navigate',{url});await send('Page.bringToFront');await wait(7000);await dismiss();await wait(400);
   if(['wordle','sudoku','crossword'].includes(game))await settings(game);
   if(game==='wordle'){
    await evaluate(`window.testRow=[...document.querySelectorAll('[class*="Row-module_row"]')].find(n=>n.querySelector('[data-margin-wordle-editable]'));window.testTiles=[...window.testRow.querySelectorAll('[class*="Tile-module_tile"]')];window.testTiles.forEach((n,i)=>n.setAttribute('data-native-test-tile',i));`);
    await nativeClick('[data-native-test-tile="4"]');await key('e');
    assert(await evaluate(`testTiles[4].getAttribute('data-margin-wordle-letter')==='E'&&testTiles.every(n=>!n.textContent.trim())`),'Wordle accepts a letter in the fifth blank draft tile without fake native letters');
    await nativeClick('[data-native-test-tile="0"]');for(const letter of 'cran'){await key(letter);console.log(JSON.stringify({letter,tiles:await evaluate(`testTiles.map(n=>({native:n.textContent.trim(),draft:n.getAttribute('data-margin-wordle-letter'),selected:n.hasAttribute('data-margin-wordle-selected')}))`)}));}
    await wait(350);assert(await evaluate(`testTiles.map(n=>n.textContent.trim()).join('').toUpperCase()==='CRANE'`),'Wordle synchronizes a fully filled positional row to its native answer');
    await nativeClick('[data-native-test-tile="2"]');await key('Backspace');await wait(250);
    assert(await evaluate(`testTiles.map(n=>n.getAttribute('data-margin-wordle-letter')||'_').join('')==='CR_NE'`),'Wordle deletes the selected tile while preserving its neighbors');
    await key('a');await wait(350);assert(await evaluate(`testTiles.map(n=>n.textContent.trim()).join('').toUpperCase()==='CRANE'`),'Wordle refilling a hole restores the native word without submission');
   }
   if(game==='connections'){
    const layout=await evaluate(`(()=>{const tools=document.querySelector('[data-margin-inline="connections-tools"]'),tries=document.querySelector('[data-margin-inline="connections-tries"]'),tile=document.querySelector('[data-testid="card-label"]'),settings=document.querySelector('#margin-host');return{tools:tools?.getBoundingClientRect().toJSON(),tile:tile?.getBoundingClientRect().toJSON(),tries:tries?.getBoundingClientRect().toJSON(),settings:settings?.getBoundingClientRect().toJSON()}})()`);console.log(JSON.stringify({game,layout}));
    assert(layout.tools?.height>25&&layout.tools.bottom<=layout.tile.top+2,'Connections category controls are visible above the tiles');
    const undo=await inside('[data-margin-inline="connections-undo"]',`function(){const n=this.querySelector('button'),native=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Shuffle'),submit=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Submit');return {sameParent:this.host.parentElement===submit.parentElement,before:this.host.nextElementSibling===submit,radius:getComputedStyle(n).borderRadius,nativeRadius:getComputedStyle(native).borderRadius,font:getComputedStyle(n).fontFamily,nativeFont:getComputedStyle(native).fontFamily}}`);
    assert(undo.sameParent&&undo.before&&undo.radius===undo.nativeRadius&&undo.font===undo.nativeFont,'Connections Undo is beside Submit and matches native action styling');
    const alignment=await inside('[data-margin-inline="connections-undo"]',`function(){const own=this.querySelector('button'),native=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Shuffle');const measure=n=>{const r=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const t=range.getBoundingClientRect();return{centerY:r.y+r.height/2,textX:t.x+t.width/2-r.x-r.width/2,textY:t.y+t.height/2-r.y-r.height/2}};return{own:measure(own),native:measure(native)}}`);
    console.log(JSON.stringify({connectionsUndoAlignment:alignment}));
    assert(Math.abs(alignment.own.centerY-alignment.native.centerY)<1&&Math.abs(alignment.own.textX)<1&&Math.abs(alignment.own.textY-alignment.native.textY)<1,'Connections Undo button and its label are centered with the native actions');
    assert(layout.tries?.height>20&&layout.tries.top<layout.tile.top,'Connections Tries sits in the native top toolbar');
    await evaluate(`(()=>{window.nativeClickTrace=[];for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])window.addEventListener(type,e=>nativeClickTrace.push({type,target:e.target.tagName,html:e.target.outerHTML?.slice(0,120),x:e.clientX,y:e.clientY}),true)})()`);
    await inside('[data-margin-inline="connections-tries"]',`function(){this.testEvents=[];for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])this.addEventListener(type,e=>this.testEvents.push({type,tag:e.target.tagName}),true);this.testClicks=0;this.querySelector('button').addEventListener('click',()=>this.testClicks++);return true}`);await ownClick('[data-margin-inline="connections-tries"]','button');console.log(JSON.stringify({tries:await inside('[data-margin-inline="connections-tries"]',`function(){const n=this.querySelector('button'),r=n.getBoundingClientRect();return{events:this.testEvents,clicked:this.testClicks,expanded:n.getAttribute('aria-expanded'),rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,220),inner:this.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,180),pointer:getComputedStyle(n).pointerEvents}}`),popup:await inside('[data-margin-overlay="connections-popups"]',`function(){return [...this.querySelectorAll('[role="dialog"]')].map(n=>({hidden:n.hidden,rect:n.getBoundingClientRect().toJSON()}))}`)}));
    console.log(JSON.stringify({eventTrace:await evaluate('({focused:document.hasFocus(),events:nativeClickTrace})')}));
    // A native welcome overlay can arrive after the board becomes visible.
    // Retry only when the first click demonstrably dismissed that overlay
    // without reaching the extension button; never retry an extension failure.
    const overlayIntercepted=await evaluate(`nativeClickTrace.some(e=>e.type==='click'&&e.html?.includes('modalWrapper-overlay'))`);
    if(overlayIntercepted&&await inside('[data-margin-inline="connections-tries"]',`function(){return this.testClicks===0}`)){
      console.log('NOTE Native welcome overlay consumed the first click; it is now dismissed.');
      await wait(350);await ownClick('[data-margin-inline="connections-tries"]','button');
    }

    assert(await inside('[data-margin-overlay="connections-popups"]',`function(){return [...this.querySelectorAll('[role="dialog"]')].some(n=>!n.hidden&&n.getBoundingClientRect().height>0)}`),'Connections Tries popup opens from the native toolbar');
   }
   if(game==='connections'){
    assert(await inside('[data-margin-overlay="connections-popups"]',`function(){const p=this.querySelector('.connection-history');return !p.querySelector('input,select')&&p.querySelectorAll('button').length===1}`),'Connections Tries contains only recorded attempts and its close button');
    await ownClick('[data-margin-overlay="connections-popups"]','[aria-label="Close previous tries"]');
    await evaluate(`document.querySelector('[data-testid="card-label"]').scrollIntoView({block:'center',behavior:'instant'})`);await wait(300);
    const center=await evaluate(`(()=>{const r=document.querySelector('[data-testid="card-label"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...center});await wait(100);
    await ownClick('#margin-connections-overlay','[data-corner="tl"]');await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:15,y:15});await wait(150);
    assert(await inside('#margin-connections-overlay',`function(){return !this.querySelector('.empty.revealed')&&this.querySelector('[aria-pressed="true"]')&&this.querySelector('button').getBoundingClientRect().width>24}`),'Connections larger corners keep saved marks while clearing hover shades after a click and exit');
   }
   if(game==='strands'){
    const placement=await evaluate(`(()=>{const h=document.querySelector('#margin-host'),stats=document.querySelector('[data-testid="toolbar-stats"]');return{settings:h?.getBoundingClientRect().toJSON(),stats:stats?.getBoundingClientRect().toJSON()}})()`);console.log(JSON.stringify({game,placement}));
    assert(Math.abs(placement.settings?.height-placement.stats.height)<2&&Math.abs(placement.settings.top-placement.stats.top)<20,'Strands gear sits alongside native statistics and help');
    await ownClick('#margin-host','summary');if(!await inside('#margin-host',`function(){return this.querySelector('details').open}`)){await inside('#margin-host',`function(){this.querySelector('summary').click();return true}`);await wait(150);}assert(await inside('#margin-host',`function(){return this.querySelector('details').open&&this.querySelector('[data-feature="pathDrawing"]').getBoundingClientRect().height>0}`),'Strands toolbar gear opens drawing settings');
   }
   if(game==='sudoku'){
    const identity=await evaluate(`(()=>{const n=document.querySelector('[data-margin-inline="sudoku-candidates"] input');return{exists:!!n,checked:n?.checked,top:n?.getBoundingClientRect().top,boardTop:document.querySelector('.su-board')?.getBoundingClientRect().top}})()`);
    assert(identity.exists&&identity.top<identity.boardTop,'Sudoku retains the original candidate checkbox in its top toolbar');
    await nativeClick('[data-margin-inline="sudoku-candidates"] input');assert(await evaluate(`document.querySelector('[data-margin-inline="sudoku-candidates"] input').checked`)!==identity.checked,'Sudoku original candidate checkbox toggles normally');await nativeClick('[data-margin-inline="sudoku-candidates"] input');
    await nativeClick('.su-board .su-cell');
    assert(await evaluate(`parseFloat(getComputedStyle(document.querySelector('[data-margin-inline="sudoku-candidates"] label')).fontSize)>=14`),'Sudoku Auto candidate text matches the scale of top controls');
    await key('F8','F8');assert(await inside('[data-margin-inline="sudoku-pencil"]',`function(){return this.querySelector('.sudoku-modes [aria-pressed="true"]').textContent==='Snyder'}`),'Sudoku configured hotkey enters Snyder');
    const index=await evaluate(`(()=>{const cells=[...document.querySelectorAll('.su-board .su-cell')];const i=cells.findIndex(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !n.querySelector('.su-cell__value')&&!!r.width&&(n===hit||n.contains(hit))});if(i>=0)cells[i].setAttribute('data-native-test-empty','');return i})()`);assert(index>=0,'Sudoku has an editable square for mark testing');await nativeClick('[data-native-test-empty]');await key('1');await key('F8','F8');assert(await inside('[data-margin-inline="sudoku-pencil"]',`function(){return this.querySelector('.sudoku-modes [aria-pressed="true"]').textContent==='Snyder'}`),'Sudoku repeated key stays in the selected mode');await key('F9','F9');await key('2');
    assert(await inside('[data-margin-inline="sudoku-pencil"]',`function(){return this.querySelector('[aria-label="Undo marks"]').hidden&&this.querySelector('[aria-label="Erase selected marks"]').hidden}`),'Sudoku removes duplicate Undo and erase buttons above the keypad');
    const state=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'})).data;const record=Object.values(state).find(n=>n?.game==='sudoku');
    assert(record?.state.sudokuNotes[index]?.corner?.includes(1)&&record.state.sudokuNotes[index]?.center?.includes(2),'Sudoku saves independent Snyder and Center through native keyboard input');
    await evaluate(`(()=>{const n=[...document.querySelectorAll('button.su-keyboard__undo')].find(n=>n.getClientRects().length);n?.setAttribute('data-native-test-undo','')})()`);await nativeClick('[data-native-test-undo]');await nativeClick('[data-native-test-undo]');
    const after=(await send('Extensions.getStorageItems',{id:loaded.id,storageArea:'local'})).data;assert(!Object.values(after).find(n=>n?.game==='sudoku')?.state.sudokuNotes[index],'Sudoku always-available Undo restores both modes');await key('F10','F10');assert(await inside('[data-margin-inline="sudoku-pencil"]',`function(){return this.querySelector('.sudoku-modes [aria-pressed="true"]').textContent==='Play'}`),'Sudoku Play shortcut restores normal entry');
   }
   if(game==='crossword'){
    const pencil=await evaluate(`document.querySelector('button[aria-label="Pencil"]').innerHTML`);await key('F8','F8');const changed=await evaluate(`document.querySelector('button[aria-label="Pencil"]').innerHTML`);assert(pencil!==changed,'Crossword custom hotkey toggles native Pencil');await key('F8','F8');
    await nativeClick('[role="gridcell"]');
    const hover=await inside('#margin-crossword-tooltip',`function(){const r=this.host.getBoundingClientRect();return{visible:!this.host.hidden,entries:this.querySelectorAll('.entry').length,rect:r.toJSON()}}`);
    const square=await evaluate(`document.querySelector('[role="gridcell"]').getBoundingClientRect().toJSON()`);
    assert(hover?.visible&&hover.entries>0&&(hover.rect.top>=square.bottom+4||hover.rect.bottom<=square.top-4),'Crossword shows relevant native clues beside the hovered square without covering it');
    assert(await inside('#margin-crossword-tooltip',`function(){return [...this.querySelectorAll('.entry')].every(n=>n.querySelectorAll('.letter-box').length>0&&/blank/.test(n.querySelector('.blank-count').textContent))}`),'Crossword hover shows boxed word lengths and remaining blank counts');
    await key('x');assert(await evaluate(`document.querySelector('#margin-crossword-tooltip').hidden&&document.querySelector('[role="gridcell"]').textContent.toUpperCase().includes('X')`),'Crossword typing reaches the native square while dismissing hover');
    await nativeClick('[role="gridcell"]');await key('Backspace');
    const layout=await evaluate(`(()=>{const a=document.querySelector('#margin-crossword-cycle').getBoundingClientRect(),b=document.querySelector('button[aria-label="Rebus"]').getBoundingClientRect();return{cycle:a.toJSON(),rebus:b.toJSON()}})()`);assert(layout.cycle.right<=layout.rebus.left+4&&Math.abs(layout.cycle.top-layout.rebus.top)<20,'Crossword A-Z sits beside Rebus in the native toolbar');
    await ownClick('#margin-crossword-cycle','[data-cycle-action="toggle"]');await wait(1500);await ownClick('#margin-crossword-cycle','[data-cycle-action="toggle"]');
    const letters=await evaluate(`[...document.querySelectorAll('[role="gridcell"]')].map(n=>[...n.querySelectorAll('text[text-anchor="middle"]')].map(t=>[...t.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('')).join('')).filter(Boolean)`);
    assert(letters.length===1&&/^[C-D]$/.test(letters[0]),'Crossword A-Z enters successive letters only in the selected native square');
   }
  }catch(error){console.log(JSON.stringify({game,debug:await evaluate(`(()=>{const visible=n=>!!n.getClientRects().length;return{visibleText:document.body.innerText.slice(0,1400),nativeCells:[...document.querySelectorAll('.su-cell,[class*="Card-module"],[role="gridcell"]')].slice(0,3).map(n=>({html:n.outerHTML.slice(0,350),rect:n.getBoundingClientRect().toJSON()})),heads:[...document.querySelectorAll('h1,h2,h3,[class*=Settings],[class*=settings],[class*=Modal],[class*=modal]')].filter(n=>visible(n)&&/settings/i.test(n.textContent)&&n.textContent.length<5000).map(n=>({tag:n.tagName,cls:n.getAttribute('class'),role:n.getAttribute('role'),text:n.innerText?.slice(0,120)})).slice(-14),board:[...document.querySelectorAll('[data-testid="card-label"],[data-testid="strands-board"]')].slice(0,1).map(n=>{const r=n.getBoundingClientRect();return{rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,120)}})}})()`),own:await inside('#margin-host',`function(){const s=this.querySelector('details'),r=this.querySelector('summary').getBoundingClientRect();return{open:s.open,embedded:s.className,rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,120),features:[...this.querySelectorAll('[data-feature]')].map(n=>({feature:n.dataset.feature,height:n.getBoundingClientRect().height}))}}`)}));const message='FAIL '+game+': '+error.message;console.error(message);results.push(message);process.exitCode=1;}
 }
 writeFileSync('/tmp/swiss-native-ui-results.txt',results.join('\n')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{clearTimeout(deadline);await send('Browser.close',{},null).catch(()=>{});setTimeout(()=>{chrome.kill('SIGTERM');try{rmSync(profile,{recursive:true,force:true})}catch{}},150)});
