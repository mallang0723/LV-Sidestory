// Scroll QA with Playwright in Firefox and Chromium (touch-enabled phone viewports) inside the drawer stand-in.
// For each screen it finds the scroll container under the finger, then checks that
//  - a wheel gesture scrolls it (both browsers),
//  - a touch drag scrolls it (Chromium: real touch events via CDP Input.dispatchTouchEvent; Playwright cannot synthesize a
//    touch drag in Firefox, so there the scroll position is set directly and the chain is checked instead),
//  - no "dead" scroll container sits between the finger and the scroller: an overflow:auto/scroll box that has
//    nothing to scroll but has overscroll-behavior:contain swallows the gesture (the 0.2.0 phone bug).
// Playwright is not a project dependency: PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs
// (default: import 'playwright'); FIREFOX_BIN / CHROMIUM_BIN pick browser executables.
import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright').catch(e=>{console.error('Playwright not found (set PLAYWRIGHT_MODULE):',e.message);process.exit(2);});
const VIEWPORTS=[{width:360,height:460},{width:390,height:844}];
const RECORDS={identity:'5d1c2a10-0000-4000-8000-000000000002',au:'5d1c2a10-0000-4000-8000-000000000004',story:'5d1c2a10-0000-4000-8000-000000000001',html:'5d1c2a10-0000-4000-8000-000000000003',speak:'qa-speak'};
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json'};
const server=createServer(async(req,res)=>{try{const file=path.resolve('.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(process.cwd()+path.sep))throw 0;res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/qa/harness.html`;
const failures=[],rows=[];
const browsers=[['chromium',pw.chromium,process.env.CHROMIUM_BIN||'/usr/bin/chromium'],['firefox',pw.firefox,process.env.FIREFOX_BIN||undefined]];
// In the page: describe the scroller under (x,y) and the dead scroll containers on the way up.
const inspect=([x,y])=>{const sh=qa.shadow();let el=sh.elementFromPoint(x,y);if(el?.tagName==='IFRAME'){const r=el.getBoundingClientRect();el=sh.elementFromPoint(x,Math.max(1,r.top-6))||el;}
 const dead=[];let scroller=null;
 for(let n=el;n&&n!==sh.host;n=n.parentElement){const cs=getComputedStyle(n),auto=/(auto|scroll)/.test(cs.overflowY);const room=n.scrollHeight-n.clientHeight;
  if(auto&&room>2){scroller=n;break;}
  if(auto&&room<=2&&/contain|none/.test(cs.overscrollBehaviorY))dead.push((n.id?'#'+n.id:'')+'.'+[...n.classList].join('.'));}
 if(scroller){scroller.dataset.qaScroller='1';}
 return {hit:el?(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.')):null,scroller:scroller?(scroller.id?'#'+scroller.id:'.'+[...scroller.classList].join('.')):null,room:scroller?scroller.scrollHeight-scroller.clientHeight:0,dead};};
const top=()=>qa.shadow().querySelector('[data-qa-scroller]')?.scrollTop??-1;
const reset=()=>{const s=qa.shadow().querySelector('[data-qa-scroller]');if(s)s.scrollTop=0;};
try{
 for(const [name,type,exe] of browsers){
  let browser;try{browser=await type.launch(exe?{executablePath:exe}:{});}catch(e){failures.push(`${name}: launch failed ${e.message.split('\n')[0]}`);continue;}
  for(const vp of VIEWPORTS){
   const ctx=await browser.newContext({viewport:vp,hasTouch:true,...(name==='chromium'?{isMobile:true,deviceScaleFactor:2}:{})});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>window.qa?.shadow()?.querySelector('.window:not([hidden])'),null,{timeout:15000});await page.waitForTimeout(900);
   const tag=`${name} ${vp.width}x${vp.height}`;
   const click=sel=>page.evaluate(s=>{const b=qa.shadow().querySelector(s);if(!b)throw Error('missing '+s);b.click();},sel);
   const views=[['archive',async()=>{await click('[data-page="archive"]');}],['compose',async()=>{await click('[data-pane="compose"]');}],['references',async()=>{await click('#open-references');}],['settings',async()=>{await page.evaluate(()=>qa.shadow().querySelector('[data-sheet-close="x"],[data-sheet-close]')?.click());await click('[data-page="settings"]');}],
    ['identity-edit',async()=>{await click('[data-page="archive"]');await page.waitForTimeout(250);await click(`[data-open="${RECORDS.identity}"]`);await page.waitForTimeout(300);await click('#facet-identity-edit');}],
    ...Object.entries(RECORDS).map(([k,id])=>[k,async()=>{await click('[data-page="archive"]');await page.waitForTimeout(250);await page.evaluate(()=>{const s=qa.shadow().getElementById('search');});await click(`[data-open="${id}"]`);}])];
   for(const [view,open] of views){
    try{
     await open();await page.waitForTimeout(view==='html'||view==='story'?900:450);
     await page.evaluate(()=>qa.shadow().querySelectorAll('[data-qa-scroller]').forEach(e=>delete e.dataset.qaScroller));
     const box=await page.evaluate(()=>{const sh=qa.shadow();const s=sh.querySelector('.sheet .sheet-body')||sh.querySelector('#reader')||sh.querySelector('.main .scroll');const r=s.getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+Math.min(r.height/2,r.height-30))];});
     const info=await page.evaluate(inspect,box);
     const row={browser:name,viewport:`${vp.width}x${vp.height}`,view,...info};
     if(info.dead.length&&info.scroller)failures.push(`${tag} ${view}: dead scroll container(s) swallow the gesture: ${info.dead.join(', ')}`);
     if(!info.scroller){row.result='content fits'+(info.dead.length?' (outer scroller with nothing to scroll: '+info.dead.join(', ')+')':'');if(!['archive','settings','compose','references'].includes(view))failures.push(`${tag} ${view}: nothing scrollable under the finger (hit ${info.hit})`);rows.push(row);continue;}
     await page.evaluate(reset);await page.mouse.move(box[0],box[1]);await page.mouse.wheel(0,260);await page.waitForTimeout(400);row.wheel=await page.evaluate(top);
     if(!(row.wheel>0))failures.push(`${tag} ${view}: wheel did not scroll ${info.scroller}`);
     await page.evaluate(reset);
     if(name==='chromium'){const cdp=await ctx.newCDPSession(page);const [x,y]=box,d=Math.min(150,y-20);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-d*i/10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);row.touch=await page.evaluate(top);if(!(row.touch>0))failures.push(`${tag} ${view}: touch drag did not scroll ${info.scroller}`);}
     else{row.touch=await page.evaluate(()=>{const s=qa.shadow().querySelector('[data-qa-scroller]');s.scrollTop=120;return s.scrollTop;});if(!(row.touch>0))failures.push(`${tag} ${view}: ${info.scroller} cannot be scrolled`);}
     row.result='ok';rows.push(row);
    }catch(e){failures.push(`${tag} ${view}: ${e.message.split('\n')[0]}`);}
   }
   if(errors.length)failures.push(`${tag}: page errors ${errors.join(' | ')}`);
   await ctx.close();
  }
  await browser.close();
 }
}finally{server.close();}
await mkdir('qa',{recursive:true});await writeFile('qa/scroll-report.json',JSON.stringify(rows,null,2));
for(const r of rows)console.log(`${r.browser} ${r.viewport} ${r.view}: ${r.result}${r.scroller?` · ${r.scroller} room ${r.room}px · wheel→${r.wheel} · touch→${r.touch}`:''}`);
if(failures.length){console.error('SCROLL QA FAIL:\n'+failures.join('\n'));process.exitCode=1;}else console.log(`SCROLL QA PASS: ${rows.length} checks`);
