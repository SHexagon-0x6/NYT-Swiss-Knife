'use strict';
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const manifest=require('../manifest.json'),pkg=require('../package.json');
if(manifest.version!==pkg.version)throw Error('Manifest and package versions differ');
const tag='v'+manifest.version;
if(process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF_NAME!==tag)throw Error('Release tag must match manifest version '+tag);
if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'){
  const refs=execFileSync('git',['ls-remote','--tags','origin','refs/tags/'+tag],{encoding:'utf8'}).trim();
  if(refs)throw Error(tag+' already exists. Use a new version.');
}
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'RELEASE_TAG='+tag+'\n');
console.log('Release version verified: '+tag);
