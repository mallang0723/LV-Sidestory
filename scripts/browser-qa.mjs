// Headless Chromium QA of the built extension (dist/frontend.js) in a Lumiverse drawer stand-in (qa/harness.html).
// Walks the main screens per viewport, checks layout basics, and saves screenshots to qa/screens/v020/.
// Uses only the in-memory fake Spindle API: no network and no model calls.
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {createServer} from 'node:http';
import {SECONDARY_SELECTOR} from '../src/lumiverse/css-floor.mjs';
const VIEWPORTS=[{w:360,h:460,touch:true},{w:390,h:844,touch:true},{w:1280,h:800,touch:false}];
const shotDir=process.env.QA_SHOT_DIR||'qa/screens/v020';
// Text that counts as secondary/meta (>=13px); everything else is primary (>=15px).
const SECONDARY='small,.hint,.facet-source-heading>span,.label,.section-label,.page-meta,#count,.thread-meta,.kind,.val,.note,.bar-text p,.bar-note,.speak-index,.speak-news-live,.speak-inner-hint,.tr-n,.chip small,.hrow small,.card-meta,.meta,time,.side-toast';
// Class words the CSS floor treats as secondary (src/lumiverse/css-floor.mjs).
const SECONDARY_WORDS=SECONDARY_SELECTOR.source;
// Things allowed to stay small, with the reason (reported, not hidden).
const EXEMPT=[{selector:'.sr-only',reason:'screen-reader only'},{selector:'.side-toast',reason:'transient toast'},{selector:'.swatch',reason:'theme colour circles (24px); seven 44px circles do not fit one row on a 360px phone, and the row itself is 44px'},{selector:'.speak-news-dot',reason:'card position dots; the 44px previous/next arrows and swipe do the same'}];
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
    // Phone readability (the reason for 0.1.6): primary text >=15px, secondary/meta text >=13px, tap targets >=44px tall.
    const SECONDARY=${JSON.stringify(SECONDARY)},EXEMPT=${JSON.stringify(EXEMPT.map(x=>x.selector))};
    const shown=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
    const exempt=e=>EXEMPT.some(s=>e.closest(s));
    const name=e=>(e.id?'#'+e.id:e.tagName.toLowerCase()+([...e.classList].length?'.'+[...e.classList].join('.'):''))+(e.textContent.trim()?'「'+e.textContent.trim().slice(0,12)+'」':'');
    const texts=[...sh.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&shown(e)&&!exempt(e));
    const SEC_WORDS=new RegExp(${JSON.stringify(SECONDARY_WORDS)},'i');const isSecondary=e=>{for(let n=e;n&&!n.classList?.contains('window');n=n.parentElement){if(n.tagName==='SMALL'||n.matches?.(SECONDARY)||SEC_WORDS.test(n.className&&typeof n.className==='string'?n.className:''))return true;}return false;};
    const fontRows=texts.map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),secondary:isSecondary(e)}));
    const smallPrimary=fontRows.filter(x=>!x.secondary&&x.size<15),smallSecondary=fontRows.filter(x=>x.secondary&&x.size<13);
    const taps=[...sh.querySelectorAll('button,select,input:not([type=hidden]):not([type=checkbox]):not([type=color]):not([type=file]),textarea,summary,label.row,label.check')].filter(e=>shown(e)&&!exempt(e));
    const shortTaps=taps.filter(e=>e.getBoundingClientRect().height<44-0.5);
    const gen=sh.getElementById('generate');const g=gen?.getBoundingClientRect();
    const fmt=rows=>rows.slice(0,8).map(x=>name(x.e||x)+'='+Math.round(((x.size??x.getBoundingClientRect().height))*10)/10);
    return {host:{w:Math.round(host.width),h:Math.round(host.height)},overflow,
     minPrimary:Math.min(...fontRows.filter(x=>!x.secondary).map(x=>x.size)),minSecondary:Math.min(...fontRows.filter(x=>x.secondary).map(x=>x.size)),minTap:Math.round(Math.min(...taps.map(e=>e.getBoundingClientRect().height))),
     smallPrimary:smallPrimary.length,smallSecondary:smallSecondary.length,shortTaps:shortTaps.length,examples:[...fmt(smallPrimary),...fmt(smallSecondary),...fmt(shortTaps)],
     generateVisible:g?g.bottom<=vh+1&&g.top>=0:null};})()`);
   const shot=await call('Page.captureScreenshot',{format:'png'});const file=path.join(shotDir,`${tag}-${view}.png`);await writeFile(file,Buffer.from(shot.data,'base64'));
   report.push({viewport:tag,view,screenshot:file,...m});
   if(m.overflow.length)failures.push(`${tag} ${view}: horizontal overflow ${m.overflow.join(' | ')}`);
   if(view==='compose'&&m.generateVisible===false)failures.push(`${tag} compose: 생성 button not visible`);
   if(m.host.h<200)failures.push(`${tag} ${view}: app height ${m.host.h}px`);
   if(vp.w<=400&&(m.smallPrimary||m.smallSecondary||m.shortTaps))failures.push(`${tag} ${view}: text<15 ${m.smallPrimary}, meta<13 ${m.smallSecondary}, taps<44 ${m.shortTaps} · ${m.examples.join(' | ')}`);
  };
  const step=async(name,fn)=>{try{await fn();}catch(e){const notice=await evaluate(`${S}?.getElementById('notice')?.textContent||''`).catch(()=>'');failures.push(`${tag} ${name}: ${e.message}${notice?' · 화면 알림: '+notice:''}`);}};
  await step('archive',async()=>{await measure('archive');});
  await step('host theme',async()=>{
   const read=()=>evaluate(`(()=>{const ui=${S}.querySelector('.app'),w=${S}.querySelector('.window');const probe=n=>{const i=document.createElement('i');i.style.color=getComputedStyle(document.documentElement).getPropertyValue(n);document.body.append(i);const c=getComputedStyle(i).color;i.remove();return c;};return {theme:ui.dataset.theme,host:ui.dataset.hostTheme,bg:getComputedStyle(w).backgroundColor,want:probe('--lumiverse-bg-opaque'),ink:getComputedStyle(${S}.querySelector('.bar h1, .bar-title, h1')).color,wantInk:probe('--lumiverse-text')};})()`);
   const dark=await read();if(dark.theme!=='dark'||dark.host!=='match'||dark.bg!==dark.want||dark.ink!==dark.wantInk)throw Error('dark host theme not applied '+JSON.stringify(dark));
   await evaluate(`document.documentElement.classList.add('lv-light')`);await sleep(500);
   const light=await read();if(light.theme!=='light'||light.host!=='match'||light.bg!==light.want||light.ink!==light.wantInk)throw Error('light host theme not followed '+JSON.stringify(light));
   await measure('theme-light');await evaluate(`document.documentElement.classList.remove('lv-light')`);await sleep(500);
  });
  await step('compose',async()=>{await click('[data-pane="compose"]');await until(`!!${S}.getElementById('request')`);await click('[data-mode="story"]');await measure('compose');});
  await step('references',async()=>{await click('#open-references');await until(`!!${S}.querySelector('.sheet')`);await sleep(300);await measure('references');});
  await step('lore',async()=>{await click('[data-sheet="lore"]');await until(`!!${S}.querySelector('[data-lore-mode]')`);await click('[data-lore-mode="selected"]');await evaluate(`(()=>{const c=${S}.querySelector('input[data-pick="loreIds"][value="book-char"]');if(c&&!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}})()`);await until(`!!${S}.querySelector('[data-lore-entry]')`,8000,'entries');await sleep(200);await measure('lore');await click('[data-lore-mode="st"]');await click('[data-sheet-close="x"]');});
  await step('preview',async()=>{await typeInto('#request','미리보기 확인용 요청');const before=await evaluate(`qa.api.calls.filter(c=>c.name==='generate.raw').length`);await click('#lv-preview');await until(`!!${S}.querySelector('.request-page')`,10000,'prompt history page');const after=await evaluate(`qa.api.calls.filter(c=>c.name==='generate.raw').length`);if(after!==before)throw Error('preview called the model');await sleep(300);await measure('preview');await click('[data-pane="compose"]');await until(`!!${S}.getElementById('request')`);});
  await step('generate story',async()=>{await evaluate('window.qaReply="story"');await typeInto('#request','비가 그친 뒤 두 사람이 솔직하게 이야기하는 장면');await click('#generate');await until(`!!${S}.querySelector('#result iframe, #result .speak-news')`,10000,'story result');await sleep(900);const page=await evaluate(`${S}.querySelector('#result iframe')?.srcdoc.match(/html,body\\{background:(#[0-9a-f]+)/i)?.[1]||''`);if(page!=='#1c1826')throw Error('reading page does not follow the dark host theme: '+page);await measure('result');});
  await step('more',async()=>{await click('[data-sheet="more"]');await until(`!!${S}.querySelector('.sheet .more')`);await measure('more');await click('[data-sheet-close="x"]');});
  await step('translate',async()=>{await evaluate('window.qaReply="translate"');await click('#translate');await until(`${S}.querySelector('#translate')?.getAttribute('aria-pressed')==='true'`,10000,'translation shown');await sleep(700);await measure('translated');await click('#translate');});
  await step('continue',async()=>{await evaluate('window.qaReply="story"');await evaluate(`(()=>{const t=${S}.getElementById('followup');t.focus();t.value='다음 날 아침';t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('#continue');await until(`${S}.querySelectorAll('.read .part').length>=2`,10000,'second part');const sent=await evaluate(`(()=>{const raws=qa.api.calls.filter(c=>c.name==='generate.raw');const last=raws.at(-1).args.messages;return {prior:last.some(m=>m.role==='assistant'&&m.content.includes('폐허의 지붕')),final:last.at(-1).role,model:raws.at(-1).args.model};})()`);if(!sent.prior||sent.final!=='user'||sent.model!=='model-main')throw Error('continue prompt '+JSON.stringify(sent));await sleep(600);await measure('series');});
  await step('add to chat',async()=>{const before=await evaluate(`qa.api.messages.get('chat-1').length`);await click('[data-sheet="more"]');await click('#add-to-chat');if(await evaluate(`!!${S}.querySelector('[data-chat-add-range]')`))await click('[data-chat-add-range="line"]');await until(`!!${S}.getElementById('side-dialog-confirm')`);await click('#side-dialog-confirm');await until(`qa.api.messages.get('chat-1').length>${before}`,8000,'appended');});
  await step('html',async()=>{await click('[data-pane="compose"]');await click('[data-mode="visual"]');await evaluate('window.qaReply="visual"');await typeInto('#request','에이든의 핸드폰');await click('#generate');await until(`!!${S}.querySelector('#result iframe.html-viewer:not(.prose-frame)')`,10000,'html result');await sleep(900);await measure('html');});
  await step('speak',async()=>{await click('[data-pane="compose"]');await click('[data-mode="speak"]');await evaluate('window.qaReply="speak"');await typeInto('#request','민트초코 vs 하와이안 피자');await click('#generate');await until(`!!${S}.querySelector('#result .speak-news')`,10000,'speak cards');await sleep(300);await measure('speak');});
  await step('settings',async()=>{await click('[data-page="settings"]');await until(`!!${S}.querySelector('.settings-home')`);await measure('settings');});
  await step('archive-full',async()=>{await click('[data-page="archive"]');await sleep(400);await measure('archive-full');});
  await step('identity reader scrolls',async()=>{await click('[data-open="5d1c2a10-0000-4000-8000-000000000002"]');await until(`!!${S}.querySelector('#reader .identity-preview')`);await sleep(300);const [x,y]=await evaluate(`(()=>{const r=${S}.getElementById('reader').getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)];})()`);await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++)await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-12*i}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(400);const top=await evaluate(`${S}.getElementById('reader').scrollTop`);if(!(top>0))throw Error('identity reader did not scroll on touch');await measure('identity');await click('[data-page="archive"]');});
  await step('identity sources (group chat + persona)',async()=>{
   // Group [레온, 아드리안] with 아드리안 second, persona 정수빈; a solo chat of 아드리안; chat-1 is 에이든 alone.
   const G='0c0c0c0c-4444-4f00-8000-00000000000a',SOLO='0c0c0c0c-5555-4f00-8000-00000000000b',JUNG='9a8b7c6d-3333-4e5f-8a9b-000000000003';
   const sources=()=>evaluate(`[...${S}.querySelectorAll('.facet-source-person')].map(e=>e.querySelector('.facet-source-heading')?.textContent.trim()||'')`);
   const openAU=async()=>{await click('[data-pane="compose"]');await click('[data-mode="facet"]');await click('[data-facet-work="au"]');await sleep(200);if(await evaluate(`${S}.querySelector('[data-facet-choice="target"][data-value="both"]')?.getAttribute('aria-pressed')!=='true'`))await click('[data-facet-choice="target"][data-value="both"]');await sleep(300);};
   const go=async(chat,persona=JUNG)=>{await evaluate(`qa.setState('persona.activeId','${persona}');qa.setState('chat.active',{chatId:'${chat}'})`);await sleep(1100);await openAU();};
   const expect=async(label,character,persona)=>{const s=await sources();const ok=s.length===2&&(character?s[0].includes(character)&&!/미추출/.test(s[0]):/미추출/.test(s[0]))&&(persona?s[1].includes(persona)&&!/미추출/.test(s[1]):/미추출/.test(s[1]));if(!ok)throw Error(label+': '+JSON.stringify(s));};
   await go(G);await expect('group before extraction',null,null);
   await click('[data-facet-work="identity"]');await click('[data-facet-extract-target="both"]');await evaluate('window.qaReply="identity"');await click('#generate');await until(`!!${S}.querySelector('.identity-preview')`,10000,'identity result');await sleep(300);
   await openAU();await expect('group after extraction','아드리안','정수빈');await measure('identity-sources');
   await go(SOLO);await expect('아드리안 solo chat','아드리안','정수빈');
   await go('chat-1');await expect('에이든 chat (only 에이든 extraction)','에이든','정수빈');
   await go('chat-1','persona-1');await expect('other persona','에이든',null);
   await go(G);await expect('back to group','아드리안','정수빈');
   await evaluate('qa.remount()');await until(`!!${S}?.querySelector('.window:not([hidden])')`,10000,'remount');await sleep(900);await openAU();await expect('after reopen','아드리안','정수빈');
   await go(SOLO);await expect('solo after reopen','아드리안','정수빈');
   await evaluate(`qa.setState('persona.activeId','persona-1');qa.setState('chat.active',{chatId:'chat-1'})`);await sleep(900);await click('[data-page="archive"]');
  });
  await step('chat switch',async()=>{await evaluate(`qa.setState('chat.active',{chatId:'chat-2'})`);await sleep(900);const open=await evaluate(`!!${S}.querySelector('.window:not([hidden])')`);if(!open)throw Error('app not reopened after chat switch');await measure('chat-switch');});
 }
 await writeFile('qa/layout-report.json',JSON.stringify(report,null,2));
 for(const r of report)console.log(`${r.viewport} ${r.view}: app ${r.host.w}x${r.host.h}, min text ${r.minPrimary}px, min meta ${r.minSecondary}px, min tap ${r.minTap}px, text<15 ${r.smallPrimary}, meta<13 ${r.smallSecondary}, taps<44 ${r.shortTaps}, overflow ${r.overflow.length}${r.generateVisible===null?'':', generate '+(r.generateVisible?'visible':'HIDDEN')}`);
 console.log('exempt:',EXEMPT.map(x=>x.selector+' ('+x.reason+')').join(', '));
 if(failures.length){console.error('QA FAIL:\n'+failures.join('\n'));process.exitCode=1;}else console.log(`QA PASS: ${report.length} screenshots in ${shotDir}`);
 if(errors.length){console.error('browser errors:',errors);process.exitCode=1;}
}catch(e){errors.push(e.message);console.error(e);process.exitCode=1;}
finally{await writeFile('qa/browser-errors.json',JSON.stringify(errors,null,2));if(server)await new Promise(r=>server.close(r));clearTimeout(timer);ws?.close();if(child&&child.pid&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await closed;}await rm(profile,{recursive:true,force:true});}
