// Insecure-origin QA: the 이면(Side Story) drawer over plain http on a non-localhost host name, the way a phone
// reaches Lumiverse on a PC over Tailscale (http://100.x.y.z:7860). Such a page is not a secure context, so
// crypto.randomUUID, crypto.subtle, navigator.clipboard, navigator.storage and navigator.share are missing.
// The host name sidestory.test is mapped to the local QA server (Chromium: --host-resolver-rules, Firefox:
// network.dns.localDomains); no other network. Checks per browser that the page really is insecure, the app opens
// without errors, and the connection list loads (the 0.2.0 report: "crypto.randomUUID is not a function").
// Playwright is not a project dependency: PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs
// (default: import 'playwright'); FIREFOX_BIN / CHROMIUM_BIN pick browser executables.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright').catch(e=>{console.error('Playwright not found (set PLAYWRIGHT_MODULE):',e.message);process.exit(2);});
const HOST='sidestory.test';
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json'};
const server=createServer(async(req,res)=>{try{const file=path.resolve('.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(process.cwd()+path.sep))throw 0;res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://${HOST}:${server.address().port}/qa/harness.html`;
const browsers=[
 ['chromium',()=>pw.chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:[`--host-resolver-rules=MAP ${HOST} 127.0.0.1`]})],
 ['firefox',()=>pw.firefox.launch({executablePath:process.env.FIREFOX_BIN||undefined,firefoxUserPrefs:{'network.dns.localDomains':HOST,'network.proxy.type':0}})],
];
const failures=[],rows=[];
for(const [name,launch] of browsers){
 let browser;
 try{
  browser=await launch();
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:name==='chromium'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);
  const S='qa.shadow()';
  await page.waitForFunction(`!!window.qa&&!!${S}?.querySelector('.window:not([hidden])')`,null,{timeout:15000});
  const context=await page.evaluate(()=>({secure:window.isSecureContext,randomUUID:typeof globalThis.crypto?.randomUUID,getRandomValues:typeof globalThis.crypto?.getRandomValues,subtle:typeof globalThis.crypto?.subtle,clipboard:typeof navigator.clipboard,storage:typeof navigator.storage,origin:location.origin}));
  if(context.secure!==false||context.randomUUID!=='undefined'){failures.push(`${name}: page is not an insecure context (${JSON.stringify(context)}); the check proves nothing`);continue;}
  // Settings → connections: the generation connection select lists the host's connection profiles.
  await page.waitForTimeout(600);
  await page.evaluate(`${S}.querySelector('[data-page="settings"]').click()`);
  await page.waitForFunction(`!!${S}.querySelector('[data-settings-tab="connections"]')`,null,{timeout:8000});
  await page.evaluate(`${S}.querySelector('[data-settings-tab="connections"]').click()`);
  let options=[];
  try{await page.waitForFunction(`${S}.querySelectorAll('select[data-setting="connectionId"] option').length>=3`,null,{timeout:8000});}catch{}
  options=await page.evaluate(`[...(${S}.querySelector('select[data-setting="connectionId"]')?.options||[])].map(o=>o.textContent)`);
  const connectionNotice=await page.evaluate(`${S}.getElementById('notice')?.textContent||''`);
  // Generate once: rpc ids and the generation run id are both made on this insecure page.
  let generated=null;
  try{
   await page.evaluate(`${S}.querySelector('[data-pane="compose"]').click()`);
   await page.waitForFunction(`!!${S}.getElementById('request')&&!!${S}.getElementById('generate')`,null,{timeout:8000});
   await page.evaluate(`${S}.querySelector('[data-mode="story"]').click()`);await page.waitForTimeout(250);
   await page.evaluate(`(()=>{window.qaReply='story';const t=${S}.getElementById('request');t.value='비가 그친 뒤 두 사람이 이야기하는 장면';t.dispatchEvent(new Event('input',{bubbles:true}));${S}.getElementById('generate').click();})()`);
   await page.waitForFunction(`!!${S}.querySelector('#result iframe, #result .speak-news')&&qa.api.calls.some(c=>c.name==='generate.raw')`,null,{timeout:15000});
   generated=true;
  }catch(e){generated='no: '+e.message.split('\n')[0];}
  const notice=await page.evaluate(`${S}.getElementById('notice')?.textContent||''`);
  const bad=[...errors,connectionNotice,notice].filter(t=>/randomUUID|is not a function/i.test(t));
  rows.push({browser:name,context,options,connectionNotice,notice,generated,errors});
  if(bad.length)failures.push(`${name}: ${bad.join(' | ')}`);
  if(options.filter(o=>/메인 연결|번역 연결/.test(o)).length<2)failures.push(`${name}: connection list did not load (${JSON.stringify(options)}) · 화면 알림: ${connectionNotice}`);
  if(generated!==true)failures.push(`${name}: generation on the insecure page: ${generated} · 화면 알림: ${notice}`);
 }catch(e){failures.push(`${name}: ${e.message.split('\n')[0]}`);}
 finally{await browser?.close();}
}
server.close();
console.log(JSON.stringify(rows,null,1));
if(failures.length){console.error('FAIL\n'+failures.join('\n'));process.exit(1);}
console.log(`insecure-origin QA passed (${rows.map(r=>r.browser+' '+r.context.origin).join(', ')})`);
