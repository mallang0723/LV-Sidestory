// Headless Chromium QA of the built extension (dist/frontend.js) in a Lumiverse drawer stand-in (qa/harness.html).
// Walks the main screens per viewport, checks layout basics, and saves screenshots to qa/screens/v020/.
// Uses only the in-memory fake Spindle API: no network and no model calls.
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {createServer} from 'node:http';
const VIEWPORTS=[{w:360,h:460,touch:true},{w:390,h:844,touch:true},{w:1280,h:800,touch:false}];
const shotDir=process.env.QA_SHOT_DIR||'qa/screens/v020';
const profile=await mkdtemp(path.join(process.cwd(),'qa/browser-profile-'));let child,ws,err='',timer,server;const errors=[],report=[],failures=[];
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'};
try{
 server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}const file=path.resolve('.'+pathname);if(!file.startsWith(process.cwd()+path.sep))throw Error('path');res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end('not found');}});
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 child=spawn(process.env.CHROMIUM_BIN||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--lang=ko-KR',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('browser startup timeout')),15000);child.once('error',reject);child.once('exit',(code,signal)=>reject(Error(`browser exited: code=${code} signal=${signal}`)));child.stderr.on('data',d=>{err+=d;const m=err.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});});clearTimeout(timer);
 const origin=endpoint.replace('ws:','http:').split('/devtools')[0];const page=await (await fetch(origin+'/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let seq=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description).join(' '));if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&!/cdn\.jsdelivr|net::ERR|\/api\/v1\/characters\/.*\/avatar/.test(m.params.entry.text+m.params.entry.url))errors.push(m.params.entry.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(expr,ms=8000,label=expr)=>{const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expr))return true;await sleep(80);}throw Error('timeout: '+label);};
 const S='qa.shadow()';
 const click=async sel=>{const ok=await evaluate(`(()=>{const b=${S}.querySelector(${JSON.stringify(sel)});if(!b)return false;b.scrollIntoView?.({block:'center'});b.click();return true;})()`);if(!ok)throw Error('missing '+sel);await sleep(250);};
 const typeInto=async(sel,value)=>{await evaluate(`(()=>{const t=${S}.querySelector(${JSON.stringify(sel)});t.value=${JSON.stringify(value)};t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(150);};
 await call('Runtime.enable');await call('Log.enable');
 await mkdir(shotDir,{recursive:true});
 for(const vp of VIEWPORTS){
  const tag=`${vp.w}x${vp.h}`;
  await call('Emulation.setDeviceMetricsOverride',{width:vp.w,height:vp.h,deviceScaleFactor:2,mobile:vp.touch});await call('Emulation.setTouchEmulationEnabled',{enabled:vp.touch,maxTouchPoints:vp.touch?5:1});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/qa/harness.html?vp=${tag}`});
  try{await until(`!!window.qa&&!!${S}?.querySelector('.window:not([hidden])')`,10000,'app open');}catch(e){failures.push(`${tag}: ${e.message}`);continue;}
  await sleep(700);
  const measure=async view=>{
   const m=await evaluate(`(()=>{const sh=${S},vh=innerHeight,host=document.getElementById('st-sidestory-root').getBoundingClientRect();
    const all=[...sh.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden';});
    const overflow=all.filter(e=>{const r=e.getBoundingClientRect();return r.right>host.right+1&&!e.closest('[data-ui-scroll],.chips,.scroll-x,.tabs,.speak-news-stage');}).slice(0,5).map(e=>e.tagName.toLowerCase()+'.'+[...e.classList].join('.'));
    const taps=[...sh.querySelectorAll('button,select,input:not([type=hidden]),textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<vh;});
    const short=taps.filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.height,r.width)<32&&!e.matches('input[type=checkbox],.speak-news-dot,.swatch,input[type=color]');}).slice(0,6).map(e=>(e.id||e.className||e.tagName)+'='+Math.round(e.getBoundingClientRect().height));
    const fonts=[...sh.querySelectorAll('p,span,small,button,label,h1,h2,h3,b')].filter(e=>e.textContent.trim()&&e.getBoundingClientRect().height).map(e=>parseFloat(getComputedStyle(e).fontSize));
    const gen=sh.getElementById('generate');const g=gen?.getBoundingClientRect();
    return {host:{w:Math.round(host.width),h:Math.round(host.height)},overflow,shortTaps:short,minFont:Math.min(...fonts),generateVisible:g?g.bottom<=vh+1&&g.top>=0:null};})()`);
   const shot=await call('Page.captureScreenshot',{format:'png'});const file=path.join(shotDir,`${tag}-${view}.png`);await writeFile(file,Buffer.from(shot.data,'base64'));
   report.push({viewport:tag,view,screenshot:file,...m});
   if(m.overflow.length)failures.push(`${tag} ${view}: horizontal overflow ${m.overflow.join(' | ')}`);
   if(view==='compose'&&m.generateVisible===false)failures.push(`${tag} compose: 생성 button not visible`);
   if(m.host.h<200)failures.push(`${tag} ${view}: app height ${m.host.h}px`);
  };
  const step=async(name,fn)=>{try{await fn();}catch(e){failures.push(`${tag} ${name}: ${e.message}`);}};
  await step('archive',async()=>{await measure('archive');});
  await step('compose',async()=>{await click('[data-pane="compose"]');await until(`!!${S}.getElementById('request')`);await click('[data-mode="story"]');await measure('compose');});
  await step('references',async()=>{await click('#open-references');await until(`!!${S}.querySelector('.sheet')`);await sleep(300);await measure('references');});
  await step('lore',async()=>{await click('[data-sheet="lore"]');await until(`!!${S}.querySelector('[data-lore-mode]')`);await click('[data-lore-mode="selected"]');await evaluate(`(()=>{const c=${S}.querySelector('input[data-pick="loreIds"][value="book-char"]');if(c&&!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}})()`);await until(`!!${S}.querySelector('[data-lore-entry]')`,8000,'entries');await sleep(200);await measure('lore');await click('[data-lore-mode="st"]');await click('[data-sheet-close="x"]');});
  await step('generate story',async()=>{await evaluate('window.qaReply="story"');await typeInto('#request','비가 그친 뒤 두 사람이 솔직하게 이야기하는 장면');await click('#generate');await until(`!!${S}.querySelector('#result iframe, #result .speak-news')`,10000,'story result');await sleep(900);await measure('result');});
  await step('more',async()=>{await click('[data-sheet="more"]');await until(`!!${S}.querySelector('.sheet .more')`);await measure('more');await click('[data-sheet-close="x"]');});
  await step('html',async()=>{await click('[data-pane="compose"]');await click('[data-mode="visual"]');await evaluate('window.qaReply="visual"');await typeInto('#request','에이든의 핸드폰');await click('#generate');await until(`!!${S}.querySelector('#result iframe.html-viewer:not(.prose-frame)')`,10000,'html result');await sleep(900);await measure('html');});
  await step('speak',async()=>{await click('[data-pane="compose"]');await click('[data-mode="speak"]');await evaluate('window.qaReply="speak"');await typeInto('#request','민트초코 vs 하와이안 피자');await click('#generate');await until(`!!${S}.querySelector('#result .speak-news')`,10000,'speak cards');await sleep(300);await measure('speak');});
  await step('settings',async()=>{await click('[data-page="settings"]');await until(`!!${S}.querySelector('.settings-home')`);await measure('settings');});
  await step('archive-full',async()=>{await click('[data-page="archive"]');await sleep(400);await measure('archive-full');});
  await step('chat switch',async()=>{await evaluate(`qa.setState('chat.active',{chatId:'chat-2'})`);await sleep(900);const open=await evaluate(`!!${S}.querySelector('.window:not([hidden])')`);if(!open)throw Error('app not reopened after chat switch');await measure('chat-switch');});
 }
 await writeFile('qa/layout-report.json',JSON.stringify(report,null,2));
 for(const r of report)console.log(`${r.viewport} ${r.view}: app ${r.host.w}x${r.host.h}, min font ${r.minFont}px, overflow ${r.overflow.length}, short taps ${r.shortTaps.length}${r.shortTaps.length?' ('+r.shortTaps.join(', ')+')':''}${r.generateVisible===null?'':', generate '+(r.generateVisible?'visible':'HIDDEN')}`);
 if(failures.length){console.error('QA FAIL:\n'+failures.join('\n'));process.exitCode=1;}else console.log(`QA PASS: ${report.length} screenshots in ${shotDir}`);
 if(errors.length){console.error('browser errors:',errors);process.exitCode=1;}
}catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally{await writeFile('qa/browser-errors.json',JSON.stringify(errors,null,2));if(server)await new Promise(r=>server.close(r));clearTimeout(timer);ws?.close();if(child&&child.pid&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await closed;}await rm(profile,{recursive:true,force:true});}
