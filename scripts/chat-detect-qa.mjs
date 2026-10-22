// Active-chat detection QA: does the Side Story drawer find the open chat however the host reports it?
// The 0.2.1 report: on a phone over plain http (Tailscale), the drawer kept saying “채팅을 열면 Side Story를 쓸 수
// 있어요” while a chat was open. qa/harness.html?scenario=… (see qa/harness.js) plays each host behaviour:
//  late      the chat arrives while Side Story is still starting and the drawer is reopened on Side Story without a
//            tab switch, so the host never calls onActivate
//  closed    the chat was already open, the drawer was closed when Side Story started and is reopened the same way
//  silent    the chat opens and the drawer shows Side Story with no host notification at all (only visibility)
//  fallback  ctx.state.get('chat.active') throws; only ctx.getActiveChat() knows the chat
//  event     no 'chat.active' selector and no getActiveChat; only a CHAT_SWITCHED {chatId} event
//  none      no chat: the notice with its diagnostic line, then a chat is opened
// Same insecure origin as qa:insecure (http://sidestory.test:<port>, not a secure context). No network, no model calls.
// PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs; FIREFOX_BIN / CHROMIUM_BIN pick browser executables.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright').catch(e=>{console.error('Playwright not found (set PLAYWRIGHT_MODULE):',e.message);process.exit(2);});
const HOST='sidestory.test';
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json'};
const server=createServer(async(req,res)=>{try{const file=path.resolve('.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(process.cwd()+path.sep))throw 0;res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://${HOST}:${server.address().port}/qa/harness.html`;
const browsers=[
 ['chromium',()=>pw.chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:[`--host-resolver-rules=MAP ${HOST} 127.0.0.1`]})],
 ['firefox',()=>pw.firefox.launch({executablePath:process.env.FIREFOX_BIN||undefined,firefoxUserPrefs:{'network.dns.localDomains':HOST,'network.proxy.type':0}})],
];
const OPEN=`!!qa.shadow()?.querySelector('.window:not([hidden])')`;
const NOTICE=`(()=>{const n=document.querySelector('#tab-host [role=status]');return n&&!n.hidden&&n.getClientRects().length?n.textContent:'';})()`;
const scenarios={
 async late(page){
  await page.waitForTimeout(1500);
  // Drawer handle: the drawer opens on the tab it last showed; the selected tab does not change.
  await page.evaluate(()=>qa.setState('ui.drawer',{open:true,tabId:'side_story:tab'}));
  await page.waitForFunction(OPEN,null,{timeout:6000});
 },
 async closed(page){
  await page.waitForTimeout(1500);
  await page.evaluate(()=>qa.setState('ui.drawer',{open:true,tabId:'side_story:tab'}));
  await page.waitForFunction(OPEN,null,{timeout:6000});
 },
 async silent(page){
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{qa.setSilently('chat.active',{chatId:'chat-1',characterId:'char-a'});qa.setSilently('ui.drawer',{open:true,tabId:'side_story:tab'});});
  await page.waitForFunction(OPEN,null,{timeout:6000});
 },
 async fallback(page){await page.waitForFunction(OPEN,null,{timeout:10000});},
 async event(page){
  await page.waitForTimeout(1500);
  const before=await page.evaluate(NOTICE);
  if(!/채팅을 열면/.test(before))throw Error('notice before the event: '+JSON.stringify(before));
  await page.evaluate(()=>qa.emit('CHAT_SWITCHED',{chatId:'chat-1'}));
  await page.waitForFunction(OPEN,null,{timeout:6000});
  return {before};
 },
 async none(page){
  await page.waitForTimeout(1500);
  const before=await page.evaluate(NOTICE);
  if(!/채팅을 열면/.test(before))throw Error('notice: '+JSON.stringify(before));
  if(!/1\.2\.5/.test(before)||!/채팅 감지/.test(before))throw Error('diagnostic line missing: '+JSON.stringify(before));
  if(await page.evaluate(OPEN))throw Error('app opened without a chat');
  await page.evaluate(()=>qa.setState('chat.active',{chatId:'chat-1',characterId:'char-a'}));
  await page.waitForFunction(OPEN,null,{timeout:6000});
  return {before};
 },
};
const failures=[],rows=[];
for(const [name,launch] of browsers){
 let browser;
 try{
  browser=await launch();
  for(const [scenario,run] of Object.entries(scenarios)){
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:name==='chromium'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
   try{
    await page.goto(`${base}?scenario=${scenario}`);
    await page.waitForFunction('!!window.qa',null,{timeout:10000});
    const secure=await page.evaluate(()=>window.isSecureContext);
    if(secure!==false)throw Error('page is a secure context; the check proves nothing');
    const extra=await run(page)||{};
    // The opened app must have asked the backend for the chat (not just shown the shell).
    await page.waitForFunction(`qa.api.calls.some(c=>/^chats\\./.test(c.name))`,null,{timeout:6000});
    const after=await page.evaluate(NOTICE);
    if(after)throw Error('notice still visible after opening: '+after);
    rows.push({browser:name,scenario,ok:true,...extra,errors});
    if(errors.length)failures.push(`${name} ${scenario}: page errors ${errors.join(' | ')}`);
   }catch(e){
    const notice=await page.evaluate(NOTICE).catch(()=>'');
    rows.push({browser:name,scenario,ok:false,error:e.message.split('\n')[0],notice,errors});
    failures.push(`${name} ${scenario}: ${e.message.split('\n')[0]}${notice?' · 화면 알림: '+notice:''}${errors.length?' · errors: '+errors.join(' | '):''}`);
   }finally{await page.close();}
  }
 }catch(e){failures.push(`${name}: ${e.message.split('\n')[0]}`);}
 finally{await browser?.close();}
}
server.close();
console.log(JSON.stringify(rows,null,1));
if(failures.length){console.error('FAIL\n'+failures.join('\n'));process.exit(1);}
console.log(`chat-detection QA passed (${rows.length} runs: ${Object.keys(scenarios).join(', ')} × ${browsers.map(b=>b[0]).join(', ')})`);
