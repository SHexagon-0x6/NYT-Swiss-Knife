'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {releaseNotes}=require('../scripts/release-notes.cjs');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swiss-version-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.copyFileSync(path.resolve(__dirname,'../scripts/version.cjs'),path.join(dir,'scripts/version.cjs'));
  for(const file of ['manifest.json','package.json'])fs.writeFileSync(path.join(dir,file),JSON.stringify({name:'Preserve name',version:'0.7.2'}));
  return {read:file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),run:version=>spawnSync(process.execPath,[path.join(dir,'scripts/version.cjs'),version],{encoding:'utf8'})};
}
test('a release updates both versions and preserves metadata',t=>{
  const f=fixture(t);assert.equal(f.run('0.8.0').status,0);
  for(const file of ['manifest.json','package.json'])assert.deepEqual(f.read(file),{name:'Preserve name',version:'0.8.0'});
});
test('bad or decreasing releases leave both files unchanged',t=>{
  const f=fixture(t);
  for(const version of ['0.7.1','01.2.3','1.2','1.2.3.4','65536.0.0','v0.8.0','0.8.0; echo unsafe']){
    assert.notEqual(f.run(version).status,0,version);
    for(const file of ['manifest.json','package.json'])assert.equal(f.read(file).version,'0.7.2');
  }
});
test('the current version can be used for its first release',t=>{
  const f=fixture(t);assert.equal(f.run('0.7.2').status,0);
});
test('release notes include only the requested version changes',()=>{
  assert.equal(releaseNotes('# Changes\n\n## 0.8.0\n\n- New feature.\n\n## 0.7.2\n\n- Fixed startup.\n','0.7.2'),'- Fixed startup.\n');
});
test('release notes reject missing or empty version entries',()=>{
  assert.throws(()=>releaseNotes('# Changes\n\n## 0.7.2\n- Fixed startup.\n','0.8.0'),/0\.8\.0/);
  assert.throws(()=>releaseNotes('# Changes\n\n## 0.8.0\n\n','0.8.0'),/0\.8\.0/);
  assert.throws(()=>releaseNotes('# Changes\n\n## 0.8.0','0.8.0'),/0\.8\.0/);
});
