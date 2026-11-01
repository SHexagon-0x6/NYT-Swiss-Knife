'use strict';
const fs=require('node:fs');
const path=require('node:path');
function releaseNotes(changelog,version){
  const sections=changelog.split(/^##\s+/m).slice(1);
  const section=sections.find(part=>part.split('\n')[0].trim()===version);
  const newline=section?.indexOf('\n')??-1;
  const notes=newline>=0?section.slice(newline+1).trim():'';
  if(!notes)throw Error(`Add a ## ${version} section with the changes for this release to CHANGELOG.md.`);
  return notes+'\n';
}
module.exports={releaseNotes};
if(require.main===module){
  try{
    const root=path.resolve(__dirname,'..');
    process.stdout.write(releaseNotes(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),require('../manifest.json').version));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
