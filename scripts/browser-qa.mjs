import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {createServer} from 'node:http';
const profile=await mkdtemp(path.join(process.cwd(),'qa/browser-profile-'));let child,ws,err='',timer,server;const errors=[];
// Layout viewports: phones (touch emulated; 360x300 stands in for 360x460 with the on-screen keyboard open) and one desktop width. Screenshots go to QA_SHOT_DIR (gitignored qa/).
const VIEWPORTS=[{w:360,h:300,touch:true},{w:360,h:460,touch:true},{w:360,h:640,touch:true},{w:390,h:844,touch:true},{w:1280,h:800,touch:false}];
const shotDir=process.env.QA_SHOT_DIR||'qa/screens/current';const reportOnly=process.env.QA_LAYOUT_REPORT_ONLY==='1';
try{
 server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}const file=path.resolve('.'+pathname);if(!file.startsWith(process.cwd()+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end('not found');}});await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 child=spawn(process.env.CHROMIUM_BIN||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--allow-file-access-from-files',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('browser startup timeout')),10000);child.once('error',reject);child.once('exit',(code,signal)=>reject(Error(`browser exited during startup: code=${code} signal=${signal}`)));child.stderr.on('data',d=>{err+=d;const m=err.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});});clearTimeout(timer);
 const origin=endpoint.replace('ws:','http:').split('/devtools')[0];const page=await (await fetch(origin+'/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails));if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(JSON.stringify(m.params.args));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const waitResult=async(ms=20000)=>{let result='RUNNING';const deadline=Date.now()+ms;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,100));result=await evaluate('document.querySelector("#qa-result")?.textContent')||'RUNNING';if(result!=='RUNNING')break;}return result;};
 await call('Runtime.enable');await call('Log.enable');await call('Emulation.setFocusEmulationEnabled',{enabled:true});await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/qa/harness.html`});const result=await waitResult();
 const dom=await call('Runtime.evaluate',{expression:'document.documentElement.outerHTML',returnByValue:true});await writeFile('qa/browser-dom.html',dom.result.value);console.log(result);if(!result.startsWith('PASS:'))process.exitCode=1;
 // Layout pass: per viewport and view, measure overflow, font sizes, tap targets and action reachability, and save a screenshot.
 await mkdir(shotDir,{recursive:true});const report=[],failures=[];
 for(const vp of VIEWPORTS){
  const tag=`${vp.w}x${vp.h}`;
  await call('Emulation.setDeviceMetricsOverride',{width:vp.w,height:vp.h,deviceScaleFactor:2,mobile:vp.touch});await call('Emulation.setTouchEmulationEnabled',{enabled:vp.touch,maxTouchPoints:vp.touch?5:1});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/qa/layout.html`});const ready=await waitResult();if(ready!=='READY'){failures.push(`${tag}: harness ${ready}`);continue;}
  const coarse=await evaluate('matchMedia("(pointer:coarse)").matches');
  for(const view of await evaluate('qa.views')){
   await evaluate(`qa.view(${JSON.stringify(view)})`);await new Promise(r=>setTimeout(r,120));const m=await evaluate('qa.measure()');
   const shot=await call('Page.captureScreenshot',{format:'png'});const file=path.join(shotDir,`${tag}-${view}.png`);await writeFile(file,Buffer.from(shot.data,'base64'));
   report.push({viewport:tag,coarse,view,screenshot:file,...m});
   const fail=msg=>failures.push(`${tag} ${view}: ${msg}`);
   if(m.overflow.length)fail('horizontal overflow: '+m.overflow.slice(0,5).join(' | '));
   if(vp.w<=400){
    if(m.appFont<15)fail(`body font ${m.appFont}px < 15px`);
    if(m.smallFonts.length)fail('text < 14px: '+m.smallFonts.slice(0,6).map(x=>`${x.el}=${x.size}`).join(' | '));
    if(m.smallControls.length)fail('controls/prose < 15px: '+m.smallControls.slice(0,6).map(x=>`${x.el}=${x.size}`).join(' | '));
    if(m.shortTaps.length)fail('tap targets < 44px: '+m.shortTaps.slice(0,6).map(x=>`${x.el}=${x.h}`).join(' | '));
    if(vp.h<=560&&m.folders&&m.folders.scrollWidth>m.folders.clientWidth+1)fail(`merged tab row scrolls ${m.folders.scrollWidth}/${m.folders.clientWidth}`);
    if(view==='compose')for(const [k,a] of Object.entries(m.actions))if(!a.visible||!a.inViewport||!a.onTop)fail(`${k} button not visible without scrolling ${JSON.stringify(a)}`);
    if(view==='compose'&&vp.h>=400&&vp.h<=560&&m.content.height<m.rootHeight*0.5)fail(`compose content ${m.content.height}px < half of extension height ${m.rootHeight}px`);
    if(view==='typing'&&vp.h<400&&(!m.requestVisible||m.content.height<m.rootHeight*0.5))fail(`typing: request field visible=${m.requestVisible}, content ${m.content.height}px of ${m.rootHeight}px`);
   }else if(view==='compose'&&(!m.twoPane||!m.brandVisible))fail('desktop layout changed (two panes and brand header expected)');
  }
 }
 await writeFile('qa/layout-report.json',JSON.stringify(report,null,2));
 for(const r of report.filter(r=>r.view==='compose'))console.log(`layout ${r.viewport} compose: body ${r.appFont}px, min text ${r.minFont}px, taps<44 ${r.shortTaps.length}/${r.tapCount}, overflow ${r.overflow.length}, content ${r.content?.height}px/${r.vh}px, run button ${r.actions.run.inViewport?'in view':'NOT in view'}`);
 if(failures.length){console.error((reportOnly?'LAYOUT REPORT (not enforced):\n':'LAYOUT FAIL:\n')+failures.join('\n'));if(!reportOnly)process.exitCode=1;}else console.log(`LAYOUT PASS: ${report.length} view captures in ${shotDir}`);
 if(errors.length){console.error(errors);process.exitCode=1;}
}catch(e){errors.push(e.message);console.error(e.message);process.exitCode=1;}finally{await writeFile('qa/browser-errors.json',JSON.stringify(errors,null,2));if(server)await new Promise(r=>server.close(r));clearTimeout(timer);ws?.close();if(child&&child.pid&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await closed;}await writeFile('qa/browser-stderr.log',err);await rm(profile,{recursive:true,force:true});}
