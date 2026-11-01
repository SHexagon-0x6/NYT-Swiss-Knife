/* Rasterize the bundled SVG at each exact Chrome icon size. No network. */
'use strict';
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const root = resolve(__dirname, '..');
const profile = mkdtempSync(join(tmpdir(), 'swiss-icons-'));
const chrome = spawn('google-chrome', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--allow-file-access-from-files','--user-data-dir='+profile,'--remote-debugging-pipe'], {stdio:['ignore','ignore','ignore','pipe','pipe']});
let nextId=0, buffer='';
const pending = new Map();
chrome.stdio[4].on('data', chunk => {
  buffer+=chunk.toString(); let end;
  while((end=buffer.indexOf('\0'))>=0){
    const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;
    const message=JSON.parse(raw), task=pending.get(message.id);
    if(task){pending.delete(message.id);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}
  }
});
const fail=error=>{for(const task of pending.values())task.reject(error);pending.clear();};
chrome.on('error',fail);chrome.on('exit',()=>fail(Error('Chrome closed')));
function send(method, params={}, sessionId){return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
const deadline=setTimeout(()=>{fail(Error('Icon rendering timed out'));chrome.kill();},55000);
(async()=>{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const source=readFileSync(join(root,'icons/mark.svg'),'utf8');
  for(const size of [16,32,48,128,512]){
    const expression=`(async()=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(${JSON.stringify(source)});await i.decode();const c=document.createElement('canvas');c.width=c.height=${size};c.getContext('2d').drawImage(i,0,0,${size},${size});return c.toDataURL('image/png').split(',')[1]})()`;
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
    const data=Buffer.from(r.result.value,'base64');writeFileSync(join(root,'icons',size+'.png'),data);
  }
  console.log('Rendered vector toolbar icons at 16, 32, 48, 128 and 512 px.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  clearTimeout(deadline);await send('Browser.close').catch(()=>{});setTimeout(()=>{chrome.kill();rmSync(profile,{recursive:true,force:true});},100);
});
