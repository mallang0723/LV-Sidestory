// Browser QA: the built dist/frontend.js inside a drawer stand-in, talking to the real backend entry
// (src/backend.js) over an in-page channel. The Spindle API underneath is the in-memory fake; no network,
// no model calls.
import {setup} from '../dist/frontend.js';
import {createFakeSpindle} from '../tests/fake-spindle.js';
import {install} from '../src/backend.js';

const replies={
 story:'# 비 그친 뒤\n\n폐허의 지붕에서 빗물이 떨어졌다. 에이든은 칼을 내려놓고 처음으로 웃었다.\n\n"길을 잃은 게 아니야. 여기 오고 싶었어."\n\n유리는 대답 대신 수첩을 덮었다.',
 visual:'<!doctype html><html><head><title>에이든의 핸드폰</title><style>body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:16px}.msg{background:#2a2a35;border-radius:12px;padding:10px;margin:8px 0}</style></head><body><h1>에이든의 핸드폰</h1><div class="msg">유리: 오늘 어디야?</div><div class="msg">에이든: 폐허. 금방 갈게.</div></body></html>',
 identity:JSON.stringify({schema:'sidestory-identity-v1',subjects:[{kind:'character',name:'아드리안 폰 아이젠베르크',gender:'남성',age:'33세',relative_age:'상대보다 5세 연하',alignment:'질서',background_context:'원본에 명시 없음',hair:'은발',eyes:'청색',height:'큰 편',build:'단단함',design:'단정함',temperament:['엄격함'],speech:'존댓말',interpersonal:['거리를 둠'],sheet_layout:['이름']},{kind:'user',name:'정수빈',gender:'여성',age:'28세',relative_age:'상대보다 5세 연상',alignment:'중립',background_context:'원본에 명시 없음',hair:'흑발',eyes:'갈색',height:'보통',build:'보통',design:'차분함',temperament:['꼼꼼함'],speech:'반말',interpersonal:['솔직함'],sheet_layout:['이름']}],relationship:'상관과 서기',counterpart:null}),
 speak:'<sideb-response><request>민트초코 vs 하와이안 피자</request><spoken>…민트초코. 이유는 묻지 마.</spoken><inner>사실 둘 다 먹어 본 적이 없다.</inner></sideb-response>',
};
window.qaReply='story';
// Echoes the translation items back as JSON, the way the translation prompt asks for.
function translate(input){const src=input.messages.at(-1).content;const items=[];const re=/⟦([^⟧]+)⟧\n([\s\S]*?)(?=\n\n⟦|$)/g;for(const m of src.matchAll(re))items.push({id:/^\d+$/.test(m[1])?Number(m[1]):m[1],text:'[EN] '+m[2]});return JSON.stringify({items});}
let frontend=null;
// Results saved by Side Story 0.1.x (records/<id>.json), to watch the migration into the new archive.
const old=[
 {id:'5d1c2a10-0000-4000-8000-000000000001',revision:1,schema:1,mode:'story',content:'# 옛 결과\n\n'+Array.from({length:24},(_,i)=>`0.1.x에서 만든 이야기의 ${i+1}번째 문단입니다. 비가 그친 폐허에서 두 사람은 오래 이야기를 나눴다.`).join('\n\n'),host:{chatId:'chat-1',connectionId:'conn-1'},parentId:null,seriesId:null,createdAt:Date.now()-86400000,requestId:'r1',sourceVersion:'0.9.8',translation:null},
 {id:'5d1c2a10-0000-4000-8000-000000000002',revision:2,schema:1,mode:'identity',content:'{}',facetPlan:{schema:'sidestory-identity-v1',subjects:[{kind:'character',name:'에이든',gender:'남성',age:'20대',relative_age:'',alignment:'중립',background_context:'원본에 명시 없음',hair:'검은색',eyes:'회색',height:'큰 편',build:'마른 체형',design:'차분한 인상',temperament:['과묵함'],speech:'짧게 말함',interpersonal:['경계심'],sheet_layout:['이름','성격']}],relationship:'',counterpart:null},identityApproved:true,host:{chatId:'chat-1'},createdAt:Date.now()-7200000,requestId:'r2'},
 {id:'5d1c2a10-0000-4000-8000-000000000004',revision:1,schema:1,mode:'au',content:Array.from({length:14},(_,i)=>`## 항목 ${i+1}\n\nAU 프로필 문단 ${i+1}. 다른 세계에서의 에이든은 조용한 기록관이다.`).join('\n\n'),host:{chatId:'chat-1'},createdAt:Date.now()-5400000,requestId:'r5'},
 {id:'5d1c2a10-0000-4000-8000-000000000003',revision:1,schema:1,mode:'html',content:'<h2>메모</h2><p>정적 HTML 결과</p>',host:{chatId:'chat-1'},createdAt:Date.now()-3600000,requestId:'r3'},
];
const speak={id:'qa-speak',mode:'speak',title:'말하기 카드',request:'질문들',chatId:'chat-1',chatName:'첫 채팅',characterIds:['char-a'],characterNames:['에이든'],content:Array.from({length:3},(_,i)=>`<sideb-response><request>질문 ${i+1}</request><spoken>${Array.from({length:12},(_,j)=>`대답 ${i+1}-${j+1}. 에이든은 천천히 말을 골랐다.`).join('\n\n')}</spoken><inner>속마음 ${i+1}</inner></sideb-response>`).join('\n'),status:'complete',createdAt:Date.now()-1000,favorite:false,settings:{mode:'speak'},action:'new',parentId:null,seriesId:null,tags:[]};
const api=createFakeSpindle({storage:{...Object.fromEntries(old.map(r=>['records/'+r.id+'.json',JSON.stringify(r)])),'archive/qa-speak.json':JSON.stringify(speak)},onSend:p=>setTimeout(()=>frontend?.(p),5),rawText:input=>window.qaReply==='translate'?translate(input):replies[window.qaReply]||replies.story,rawDelay:()=>window.qaDelay??120});
install(api);
// ?scenario= picks how the host reports the active chat (scripts/chat-detect-qa.mjs):
//  (none)    chat-1 open, drawer open on Side Story — the usual screens.
//  late      no chat and drawer closed at setup; the chat arrives while Side Story is still starting, then the
//            drawer is reopened on Side Story without a tab switch (the drawer handle) — no onActivate.
//  closed    chat-1 already open but the drawer closed at setup; later reopened on Side Story the same way.
//  silent    no chat and drawer closed at setup; the chat opens and the drawer shows Side Story without any
//            host notification (no subscription callback, no event, no onActivate).
//  fallback  ctx.state.get('chat.active') throws; the chat is only in ctx.getActiveChat().
//  event     ctx.state has no 'chat.active' and there is no getActiveChat; only CHAT_SWITCHED {chatId} says it.
//  none      no chat anywhere: the notice and its diagnostic line.
const drawer=document.querySelector('.wrapper'),tabHost=document.getElementById('tab-host');
const scenario=new URLSearchParams(location.search).get('scenario')||'';
const noChat={chatId:null,characterId:null};
const state={'chat.active':['late','none','silent'].includes(scenario)?noChat:{chatId:'chat-1',characterId:'char-a'},'persona.activeId':'persona-1','connections.active':{activeProfileId:'conn-1'},'ui.drawer':{open:!['late','closed','silent'].includes(scenario),tabId:'side_story:tab'}};
const subs=new Map(),activators=new Set(),eventHandlers=new Map();
const readState=k=>{
 if(k==='chat.active'&&scenario==='fallback')throw Error('PERMISSION_DENIED:chats — QA stand-in');
 if(k==='chat.active'&&scenario==='event')throw Error('SELECTOR_UNKNOWN:chat.active');
 return state[k];
};
const ctx={
 ui:{registerDrawerTab(){const root=document.createElement('div');tabHost.append(root);return {root,tabId:'side_story:tab',onActivate(fn){activators.add(fn);return()=>activators.delete(fn);},destroy(){root.remove();}};}},
 onBackendMessage(fn){frontend=fn;return()=>{frontend=null;};},
 sendToBackend(m){setTimeout(()=>api.deliver(m),5);},
 state:{get:readState,subscribe(k,fn){readState(k);if(!subs.has(k))subs.set(k,new Set());subs.get(k).add(fn);return()=>subs.get(k).delete(fn);}},
 events:{on(e,fn){if(!eventHandlers.has(e))eventHandlers.set(e,new Set());eventHandlers.get(e).add(fn);return()=>eventHandlers.get(e).delete(fn);}},
 host:{descriptorVersion:1,lumiverseVersion:'1.2.5'},
};
if(scenario==='fallback')ctx.getActiveChat=()=>({chatId:'chat-1',characterId:'char-a'});
// A closed drawer is not in the page: Lumiverse unmounts the drawer panel (ViewportDrawer renders it only while
// drawerOpen), so the tab root is detached and attached again, not just hidden.
const showDrawer=()=>{if(state['ui.drawer']?.open){if(!drawer.isConnected)document.body.append(drawer);}else drawer.remove();};
showDrawer();
let dispose=setup(ctx);
// The chat restored by the host while Side Story is still loading its settings from the backend.
if(scenario==='late')state['chat.active']={chatId:'chat-1',characterId:'char-a'},[...(subs.get('chat.active')||[])].forEach(fn=>fn(state['chat.active']));
// Host theme variable sets produced by the host's own theme engine (see qa/host-themes.json).
const hostThemes=await (await fetch('./host-themes.json')).json();
function setTheme(name){const set=hostThemes[name];if(!set)throw Error('unknown theme '+name);const root=document.documentElement;for(const p of [...root.style])if(p.startsWith('--lumiverse-'))root.style.removeProperty(p);for(const [k,v] of Object.entries(set))root.style.setProperty(k,v);}
setTheme('default-dark');
window.qa={api,ctx,setTheme,themes:Object.keys(hostThemes).filter(k=>!k.startsWith('_')),get dispose(){return dispose;},
 // Simulates closing and reopening Lumiverse: the extension is set up again on the same server data.
 remount(){dispose();tabHost.replaceChildren();dispose=setup(ctx);},
 shadow:()=>document.getElementById('st-sidestory-root')?.shadowRoot,
 scenario,
 setState(k,v){state[k]=v;if(k==='ui.drawer')showDrawer();for(const fn of subs.get(k)||[])fn(v);},
 // Changes host state without telling anyone (a host whose notifications never arrive).
 setSilently(k,v){state[k]=v;if(k==='ui.drawer')showDrawer();},
 emit(e,payload){for(const fn of eventHandlers.get(e)||[])fn(payload);},
 activate(){for(const fn of activators)fn();},
};
