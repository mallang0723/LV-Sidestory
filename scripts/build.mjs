import {spawnSync} from 'node:child_process';import {existsSync,mkdirSync,rmSync} from 'node:fs';
const bun=process.env.BUN_BIN||'bun';
mkdirSync('dist',{recursive:true});
for(const [entry,target] of [['backend','bun'],['frontend','browser']]){const p=spawnSync(bun,['build',`src/${entry}.js`,'--outfile',`dist/${entry}.js`,'--target',target],{stdio:'inherit'});if(p.error||p.status!==0)throw p.error||Error(`Bun build failed: status=${p.status} signal=${p.signal}`);}
for(const file of ['README.md','NOTICE.md','LICENSE','QA.md'])if(!existsSync(file))throw Error('Missing package document: '+file);
rmSync('side-story-install-candidate.zip',{force:true});
const zip=spawnSync('zip',['-qr','side-story-install-candidate.zip','spindle.json','dist','src','vendor','UPSTREAM.json','README.md','LICENSE','NOTICE.md','QA.md','package.json','scripts','tests','qa/harness.html','qa/harness.js'],{stdio:'inherit'});if(zip.error||zip.status!==0)throw zip.error||Error(`ZIP failed: status=${zip.status} signal=${zip.signal}`);
