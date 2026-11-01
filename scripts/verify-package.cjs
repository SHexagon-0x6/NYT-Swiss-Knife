/* Load the actual upload archive in disposable Chrome and verify bundled pages. */
'use strict';
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const {execFileSync}=require('node:child_process');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const root = resolve(__dirname, '..');
const profile = mkdtempSync(join(tmpdir(), 'swiss-icons-'));
const unpacked=mkdtempSync(join(tmpdir(),'swiss-upload-'));
const archive=resolve(process.argv[2]||join(root,'publish/nyt-games-swiss-knife-upload.zip'));
execFileSync('python3',['-c',`import json, sys, zipfile
from pathlib import PurePosixPath
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 assert 'manifest.json' in names, 'Manifest must be at ZIP root'
 assert len(set(names))==len(names) and z.testzip() is None
 assert all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and not n.endswith('.zip') for n in names)
 assert json.loads(z.read('manifest.json'))['manifest_version']==3
 z.extractall(sys.argv[2])`,archive,unpacked]);
const chrome = spawn('google-chrome', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--allow-file-access-from-files','--user-data-dir='+profile,'--remote-debugging-pipe','--enable-unsafe-extension-debugging'], {stdio:['ignore','ignore','ignore','pipe','pipe']});
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
const deadline=setTimeout(()=>{fail(Error('Upload verification timed out'));chrome.kill();},55000);
(async()=>{
  const manifest=JSON.parse(readFileSync(join(unpacked,'manifest.json'),'utf8'));
  const {id}=await send('Extensions.loadUnpacked',{path:unpacked});
  if(!/^[a-p]{32}$/.test(id))throw Error('Chrome did not load the extracted ZIP');
  console.log('PASS Chrome loads the extracted upload ZIP and recognizes its root manifest');
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  for(const page of ['popup.html','help.html']){
    await send('Page.navigate',{url:`chrome-extension://${id}/${page}`},sessionId);
    let result;
    for(let attempt=0;attempt<50;attempt++){
      const r=await send('Runtime.evaluate',{expression:`({version:globalThis.chrome?.runtime?.getManifest().version,loaded:document.readyState==='complete',images:[...document.images].map(i=>i.complete&&i.naturalWidth>0),title:document.title,text:document.body?.innerText,styles:[...document.styleSheets].length})`,returnByValue:true},sessionId);
      result=r.result.value;
      if(result?.loaded&&result.version)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(result?.version!==manifest.version||!result.loaded||!result.title?.includes('NYT Games Swiss Knife')||!result.styles||!result.images.length||!result.images.every(Boolean))throw Error(page+' or its bundled resources failed to load');
    console.log(`PASS Packaged ${page}, styles and all images load in Chrome (v${manifest.version})`);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  clearTimeout(deadline);await send('Browser.close').catch(()=>{});setTimeout(()=>{chrome.kill();rmSync(profile,{recursive:true,force:true});rmSync(unpacked,{recursive:true,force:true});},100);
});
