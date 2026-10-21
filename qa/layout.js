// Synthetic layout harness: mounts the built frontend in a fake host drawer so
// scripts/browser-qa.mjs can switch views, measure and screenshot per viewport.
import {setup} from '../dist/frontend.js';import {install} from '../dist/backend.js';import {fake} from '../tests/fake.js';
const f=fake();let backend,frontend;const root=document.querySelector('#root');
f.api.onFrontendMessage=fn=>{backend=fn;return()=>backend=null;};f.api.sendToFrontend=m=>frontend?.(m);
f.api.presets={list:async()=>({data:[]}),get:async()=>null};
f.api.world_books.list=async()=>({data:Array.from({length:20},(_,i)=>({id:'book-'+i,name:`가상 세계관 ${i+1}`})),total:20});
f.api.world_books.get=async id=>({id});
f.api.world_books.entries.list=async()=>({data:[['e1','도시의 오래된 규칙'],['e2','두 사람이 처음 만난 장소'],['e3','긴 이름을 가진 엔트리가 줄바꿈되어도 화면 밖으로 나가지 않는지 확인하는 항목']].map(([id,comment])=>({id,comment})),total:3});
const ctx={ui:{registerDrawerTab:()=>({root,destroy:()=>root.replaceChildren()})},state:{get:()=>({activeProfileId:'conn'})},events:{on:()=>()=>{}},onBackendMessage:fn=>{frontend=fn;return()=>frontend=null;},sendToBackend:m=>backend?.(m,'fixture-user','fixture-session'),dom:{createSandboxFrame:({html})=>{const element=document.createElement('iframe');element.sandbox='';element.srcdoc=html;return {element,destroy:()=>element.remove()};}}};
install(f.api);setup(ctx);
const q=s=>root.querySelector(s);const tick=()=>new Promise(r=>setTimeout(r,30));
const button=s=>[...root.querySelectorAll('button')].find(e=>e.dataset.action===s||e.textContent===s);
const click=async s=>{const b=button(s);if(!b)throw Error('missing button '+s);b.click();await tick();for(let i=0;b.disabled&&i<300;i++)await tick();await tick();};
const closeAll=()=>{for(const d of root.querySelectorAll('details'))d.open=false;for(const s of root.querySelectorAll('.ss-compose-scroll,.ss-reader,.ss-page'))s.scrollTop=0;};
const views={
 async compose(){await click('Side Story');q('button[data-pane="compose"]').click();closeAll();},
 async 'compose-ref'(){await views.compose();const ref=[...root.querySelectorAll('details')].find(d=>d.firstChild.textContent==='참고 자료');ref.open=true;ref.querySelector('details').open=true;await click('World Books 목록');await click('선택한 책 엔트리');const raw=q('[aria-label="원문 일부 넣기"]');if(!raw.checked)raw.click();await tick();await tick();},
 async preview(){await views.compose();q('[aria-label="요청"]').value='비가 그친 뒤의 짧은 장면';await click('프롬프트 미리보기');},
 async result(){await views.preview();await click('확인한 입력으로 생성');closeAll();},
 async typing(){await views.compose();const t=q('[aria-label="요청"]');t.focus();t.scrollIntoView({block:'nearest'});},
 async archive(){await click('보관함');closeAll();},
 async settings(){await click('설정');},
};
const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
const label=e=>(e.getAttribute('aria-label')||e.dataset.action||e.textContent||e.className||e.tagName).trim().replace(/\s+/g,' ').slice(0,40)+` <${e.tagName.toLowerCase()}${e.className?'.'+String(e.className).split(' ')[0]:''}>`;
function measure(){
 const app=q('.ss-app'),vw=innerWidth,vh=innerHeight,all=[...app.querySelectorAll('*')].filter(visible);
 const inFolders=e=>!!e.closest('.ss-folders');
 const overflow=[];if(document.scrollingElement.scrollWidth>vw+1)overflow.push(`document scrollWidth ${document.scrollingElement.scrollWidth} > ${vw}`);
 for(const e of all){const r=e.getBoundingClientRect();if(!inFolders(e)&&(r.right>vw+1||r.left<-1))overflow.push(`${label(e)} x ${Math.round(r.left)}–${Math.round(r.right)}`);const ox=getComputedStyle(e).overflowX;if(['auto','scroll'].includes(ox)&&!e.matches('.ss-folders')&&e.scrollWidth>e.clientWidth+1)overflow.push(`${label(e)} scrolls sideways ${e.scrollWidth}/${e.clientWidth}`);}
 for(const e of all.filter(e=>e.matches('button,label')))if(e.scrollWidth>e.clientWidth+1)overflow.push(`${label(e)} text clipped ${e.scrollWidth}/${e.clientWidth}`);
 const fonts=[];let minFont=Infinity;
 for(const e of all){const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own&&!e.matches('input:not([type=checkbox]),select,textarea'))continue;const size=parseFloat(getComputedStyle(e).fontSize);minFont=Math.min(minFont,size);fonts.push({el:label(e),size,control:e.matches('input,select,textarea,.ss-prose')});}
 const taps=[];for(const e of all.filter(e=>e.matches('button,select,input:not([type=checkbox]):not([type=radio]),summary,label:has(> input[type=checkbox])'))){const h=e.getBoundingClientRect().height;taps.push({el:label(e),h:Math.round(h*10)/10});}
 const box=s=>{const e=document.querySelector(s);if(!e||!visible(e))return null;const r=e.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)};};
 const reachable=s=>{const b=button(s);if(!b||!visible(b))return {visible:false};const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {visible:true,inViewport:r.top>=0&&r.bottom<=vh+0.5&&r.left>=0&&r.right<=vw+0.5,onTop:!!hit&&(hit===b||b.contains(hit)),top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)};};
 const contentSel=['.ss-compose-scroll','.ss-reader','.ss-page:not([hidden])'].find(s=>q(s)&&visible(q(s)));
 const folders=q('.ss-folders');
 return {vw,vh,page:app.dataset.page,pane:app.dataset.pane,appFont:parseFloat(getComputedStyle(q('.ss-content')).fontSize),brandVisible:visible(q('.ss-brand')),
  twoPane:visible(q('.ss-composer'))&&visible(q('.ss-reader')),
  chrome:{host:box('[data-qa=host-head]'),topbar:box('.ss-topbar'),paneNav:box('.ss-pane-nav'),generate:box('.ss-generate'),status:box('.ss-status')},
  content:contentSel?{sel:contentSel,...box(contentSel)}:null,rootHeight:Math.round(root.getBoundingClientRect().height),requestVisible:(()=>{const t=q('[aria-label="요청"]');if(!t||!visible(t))return false;const r=t.getBoundingClientRect(),c=q('.ss-compose-scroll').getBoundingClientRect();return r.top<c.bottom&&r.bottom>c.top;})(),folders:folders?{scrollWidth:folders.scrollWidth,clientWidth:folders.clientWidth}:null,
  overflow,minFont,smallFonts:fonts.filter(x=>x.size<14),smallControls:fonts.filter(x=>x.control&&x.size<15),shortTaps:taps.filter(t=>t.h<44),tapCount:taps.length,
  actions:{preview:reachable('프롬프트 미리보기'),run:reachable('확인한 입력으로 생성'),cancel:reachable('취소')}};
}
window.qa={views:Object.keys(views),async view(name){await views[name]();await tick();return app().dataset.page;},measure};
const app=()=>q('.ss-app');
try{await click('자료 불러오기');document.querySelector('#qa-result').textContent='READY';}catch(e){document.querySelector('#qa-result').textContent='FAIL: '+e.stack;}
