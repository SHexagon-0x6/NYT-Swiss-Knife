'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const requested=process.argv[2];
function valid(value){return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value||'')&&value.split('.').every(n=>Number(n)<=65535);}
if(!valid(requested)){console.error('Use a version such as 0.7.3, with three numbers between 0 and 65535.');process.exit(1);}
const files=['manifest.json','package.json'].map(name=>({name,data:JSON.parse(fs.readFileSync(path.join(root,name),'utf8'))}));
const old=files[0].data.version.split('.').map(Number),next=requested.split('.').map(Number);
const difference=next.map((n,i)=>n-old[i]).find(n=>n!==0)||0;
if(difference<0){console.error('The release version must not go backwards.');process.exit(1);}
for(const {name,data}of files){data.version=requested;fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2)+'\n');}
console.log('Version '+requested);
