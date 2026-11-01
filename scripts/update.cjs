/* Use only this repository's isolated GitHub account. Never change global Git auth. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),owner='SHexagon-0x6',repo=owner+'/NYT-Swiss-Knife';
const ghLocal=path.join(os.homedir(),'.local/bin/gh');
const gh=fs.existsSync(ghLocal)?ghLocal:'gh';
const auth=path.join(os.homedir(),'.config/nyt-swiss-knife/github');
const env={...process.env,GH_CONFIG_DIR:auth};
delete env.GH_TOKEN;delete env.GITHUB_TOKEN;
const run=(bin,args)=>execFileSync(bin,args,{cwd:root,env,stdio:'inherit'});
const read=(bin,args)=>execFileSync(bin,args,{cwd:root,env,encoding:'utf8'}).trim();
try{
  const release=process.argv[2]==='--release';
  const message=release?'Update extension source':process.argv.slice(2).join(' ')||'Update extension';
  const version=release?process.argv[3]:null;
  if(release&&!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version||''))throw Error('Usage: npm run release -- 0.7.3');
  if(read('git',['remote','get-url','origin'])!=='https://github.com/'+repo+'.git')throw Error('Origin must be https://github.com/'+repo+'.git');
  if(read('git',['branch','--show-current'])!=='main')throw Error('Run this command from main.');
  if(read(gh,['api','user','--jq','.login'])!==owner)throw Error('This repository requires the isolated SHexagon-0x6 login.');
  const git=['-c','credential.helper=','-c',`credential.helper=!GH_CONFIG_DIR=${JSON.stringify(auth)} ${JSON.stringify(gh)} auth git-credential`];
  run('git',[...git,'fetch','origin','main']);
  run('git',['add','--all']);
  const changed=spawnSync('git',['diff','--cached','--quiet'],{cwd:root}).status;
  if(changed===1)run('git',['commit','-m',message]);else if(changed!==0)throw Error('Could not inspect staged changes.');
  // Replay local commits over versions created by the Release workflow.
  run('git',['rebase','origin/main']);
  run('npm',['test']);run('npm',['run','check']);
  run('git',[...git,'push','origin','main']);
  if(release){run(gh,['workflow','run','release.yml','--repo',repo,'--ref','main','-f','version='+version]);console.log('Release requested. Follow it at https://github.com/'+repo+'/actions/workflows/release.yml');}
}catch(error){console.error(error.message);process.exitCode=1;}
