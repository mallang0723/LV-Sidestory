import {spawnSync} from 'node:child_process';import {existsSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {buildApp} from './build-app.mjs';
// 1) upstream sources + Lumiverse patches → src/generated/side-story-app.js  2) Bun bundles → dist/
writeFileSync('src/generated/side-story-app.js',buildApp());
const bun=process.env.BUN_BIN||'bun';
mkdirSync('dist',{recursive:true});
for(const [entry,target] of [['backend','bun'],['frontend','browser']]){const p=spawnSync(bun,['build',`src/${entry}.ts`,'--outfile',`dist/${entry}.js`,'--target',target],{stdio:'inherit'});if(p.error||p.status!==0)throw p.error||Error(`Bun build failed: status=${p.status} signal=${p.signal}`);}
for(const file of ['README.md','NOTICE.md','LICENSE','QA.md','CHANGELOG.md'])if(!existsSync(file))throw Error('Missing package document: '+file);
rmSync('side-story-install-candidate.zip',{force:true});
if(process.argv.includes('--zip')){const zip=spawnSync('zip',['-qr','side-story-install-candidate.zip','spindle.json','dist','src','upstream','scripts','tests','UPSTREAM.json','README.md','LICENSE','NOTICE.md','QA.md','CHANGELOG.md','package.json'],{stdio:'inherit'});if(zip.error||zip.status!==0)throw zip.error||Error(`ZIP failed: status=${zip.status}`);}
console.log('built dist/backend.js and dist/frontend.js');
