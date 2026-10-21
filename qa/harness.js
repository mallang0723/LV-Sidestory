// Browser QA: the built dist/frontend.js inside a drawer stand-in, talking to the real backend entry
// (src/backend.js) over an in-page channel. The Spindle API underneath is the in-memory fake; no network,
// no model calls.
import {setup} from '../dist/frontend.js';
import {createFakeSpindle} from '../tests/fake-spindle.js';
import {install} from '../src/backend.js';

const replies={
 story:'# 비 그친 뒤\n\n폐허의 지붕에서 빗물이 떨어졌다. 에이든은 칼을 내려놓고 처음으로 웃었다.\n\n"길을 잃은 게 아니야. 여기 오고 싶었어."\n\n유리는 대답 대신 수첩을 덮었다.',
 visual:'<!doctype html><html><head><title>에이든의 핸드폰</title><style>body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:16px}.msg{background:#2a2a35;border-radius:12px;padding:10px;margin:8px 0}</style></head><body><h1>에이든의 핸드폰</h1><div class="msg">유리: 오늘 어디야?</div><div class="msg">에이든: 폐허. 금방 갈게.</div></body></html>',
 speak:'<sideb-response><request>민트초코 vs 하와이안 피자</request><spoken>…민트초코. 이유는 묻지 마.</spoken><inner>사실 둘 다 먹어 본 적이 없다.</inner></sideb-response>',
};
window.qaReply='story';
let frontend=null;
// Results saved by Side Story 0.1.x (records/<id>.json), to watch the migration into the new archive.
const old=[
 {id:'5d1c2a10-0000-4000-8000-000000000001',revision:1,schema:1,mode:'story',content:'# 옛 결과\n\n0.1.x에서 만든 이야기입니다.\n\n두 번째 문단.',host:{chatId:'chat-1',connectionId:'conn-1'},parentId:null,seriesId:null,createdAt:Date.now()-86400000,requestId:'r1',sourceVersion:'0.9.8',translation:{complete:true,segments:[{id:'s0',text:'# Old result'},{id:'s1',text:'A story made in 0.1.x.'},{id:'s2',text:'Second paragraph.'}]}},
 {id:'5d1c2a10-0000-4000-8000-000000000002',revision:2,schema:1,mode:'identity',content:'{}',facetPlan:{schema:'sidestory-identity-v1',subjects:[{kind:'character',name:'에이든',gender:'남성',age:'20대',relative_age:'',alignment:'중립',background_context:'원본에 명시 없음',hair:'검은색',eyes:'회색',height:'큰 편',build:'마른 체형',design:'차분한 인상',temperament:['과묵함'],speech:'짧게 말함',interpersonal:['경계심'],sheet_layout:['이름','성격']}],relationship:'',counterpart:null},identityApproved:true,host:{chatId:'chat-1'},createdAt:Date.now()-7200000,requestId:'r2'},
 {id:'5d1c2a10-0000-4000-8000-000000000003',revision:1,schema:1,mode:'html',content:'<h2>메모</h2><p>정적 HTML 결과</p>',host:{chatId:'chat-1'},createdAt:Date.now()-3600000,requestId:'r3'},
];
const api=createFakeSpindle({storage:Object.fromEntries(old.map(r=>['records/'+r.id+'.json',JSON.stringify(r)])),onSend:p=>setTimeout(()=>frontend?.(p),5),rawText:()=>replies[window.qaReply]||replies.story,rawDelay:120});
install(api);
const state={'chat.active':{chatId:'chat-1',characterId:'char-a'},'persona.activeId':'persona-1','connections.active':{activeProfileId:'conn-1'},'ui.drawer':{open:true,tabId:'side_story:tab'}};
const subs=new Map(),activators=new Set();
const ctx={
 ui:{registerDrawerTab(){const root=document.createElement('div');document.getElementById('tab-host').append(root);return {root,tabId:'side_story:tab',onActivate(fn){activators.add(fn);return()=>activators.delete(fn);},destroy(){root.remove();}};}},
 onBackendMessage(fn){frontend=fn;return()=>{frontend=null;};},
 sendToBackend(m){setTimeout(()=>api.deliver(m),5);},
 state:{get:k=>state[k],subscribe(k,fn){if(!subs.has(k))subs.set(k,new Set());subs.get(k).add(fn);return()=>subs.get(k).delete(fn);}},
 events:{on(){return()=>{};}},
};
const dispose=setup(ctx);
window.qa={api,ctx,dispose,
 shadow:()=>document.getElementById('st-sidestory-root')?.shadowRoot,
 setState(k,v){state[k]=v;for(const fn of subs.get(k)||[])fn(v);},
 activate(){for(const fn of activators)fn();},
};
