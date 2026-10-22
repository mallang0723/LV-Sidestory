// Lumiverse host adapter: the object upstream's code calls `stHost` (upstream/src/st-host.js is the
// SillyTavern version). Same surface, Lumiverse underneath: reads go to the backend worker
// (src/lumiverse/service.js), the active chat/persona/connection come from Spindle state selectors.
import {createArchiveIDB} from './idb.js';
import {uuid} from './ids.js';

const abortError=()=>new DOMException('중단됨','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError();};
const estimate=text=>{let a=0,b=0;for(const ch of text){if(ch.codePointAt(0)<128)a++;else b++;}return Math.ceil(a/3.5+b*1.5);};
export const CURRENT='st-current';

export function createLumiverseHost({ctx,rpc,tab,document:doc=globalThis.document,realIndexedDB=globalThis.indexedDB,setTimer=globalThis.setTimeout.bind(globalThis),clearTimer=globalThis.clearTimeout.bind(globalThis)}){
 const cleanups=[];let previewNext=false,previewShown=false,running=null,isOpen=false,boundChat='',messageTimer=null,migrationNotice='';
 const state=key=>{try{return ctx.state?.get?.(key);}catch{return null;}};
 const activeChatId=()=>String(state('chat.active')?.chatId||'');
 const activePersonaId=()=>String(state('persona.activeId')||'');
 const activeProfileId=()=>String(state('connections.active')?.activeProfileId||'');
 const call=(op,args,opts)=>rpc.call(op,args,opts);

 // ---- chat messages, cached so upstream's synchronous reads (series anchor, keyword scan) work
 let cache={chatId:'',rows:[]};
 async function loadMessages(chatId=activeChatId()){
  if(!chatId){cache={chatId:'',rows:[]};return [];}
  const rows=await call('messages',{chatId});
  if(chatId===activeChatId())cache={chatId,rows};
  return rows;
 }
 const scheduleMessages=()=>{if(!isOpen)return;clearTimer(messageTimer);messageTimer=setTimer(()=>{messageTimer=null;loadMessages().catch(()=>{});},700);};
 const rows=()=>cache.chatId===activeChatId()?cache.rows:[];
 const visible=r=>!r.system&&!r.extra?.hiddenFromAI;
 function currentAnchor(){const all=rows();for(let i=all.length-1;i>=0;i--)if(visible(all[i]))return {index:Number(all[i].id),sendDate:String(all[i].messageId||''),name:String(all[i].name||'')};return null;}
 function resolveAnchor(anchor){if(!anchor||!Number.isInteger(anchor.index))return -1;const hit=anchor.sendDate&&rows().find(r=>r.messageId===anchor.sendDate);return hit?Number(hit.id):-1;}

 // ---- SillyTavern.getContext() as far as upstream reads it directly
 const listeners=new Map();
 const eventSource={on(e,fn){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(fn);},removeListener(e,fn){listeners.get(e)?.delete(fn);},emit(e,...a){for(const fn of [...(listeners.get(e)||[])])try{fn(...a);}catch(err){console.error('[Side Story]',err);}}};
 const context={eventTypes:{CHAT_CHANGED:'CHAT_CHANGED'},eventSource,
  get chat(){return rows().map(r=>({mes:r.content,is_user:r.role==='user',is_system:!visible(r),name:r.name,send_date:r.sendDate}));},
  getThumbnailUrl:(type,avatar)=>avatar?'/api/v1/characters/'+encodeURIComponent(avatar)+'/avatar':''};
 const SillyTavern={getContext:()=>context};

 const onChat=()=>{const next=activeChatId();if(next===boundChat)return;boundChat=next;cache={chatId:'',rows:[]};running?.abort?.();eventSource.emit('CHAT_CHANGED',next);};
 boundChat=activeChatId();
 const personaHandlers=new Set();
 if(ctx.state?.subscribe){cleanups.push(ctx.state.subscribe('chat.active',onChat));cleanups.push(ctx.state.subscribe('persona.activeId',()=>{for(const fn of personaHandlers)try{fn();}catch{}}));cleanups.push(ctx.state.subscribe('chat.messageCount',scheduleMessages));}
 if(ctx.events?.on){for(const e of ['CHAT_SWITCHED'])cleanups.push(ctx.events.on(e,onChat));for(const e of ['MESSAGE_SENT','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED'])cleanups.push(ctx.events.on(e,scheduleMessages));}

 // ---- upstream stHost.request routes
 async function request(path,body,signal){
  check(signal);const [route]=String(path).split('?');const chatId=activeChatId(),personaId=activePersonaId();
  const done=async p=>{const v=await p;check(signal);return v;};
  if(route==='/chats'){if(!chatId)return [];const [chat]=await Promise.all([call('chat',{chatId,personaId}),loadMessages(chatId).catch(()=>[])]);check(signal);return [chat];}
  if(route==='/connections')return done(call('connections',{activeProfileId:activeProfileId()}));
  if(route==='/characters'){if(!chatId)return [];const v=await done(call('characters',{chatId}));if(chatId!==activeChatId())throw abortError();return v;}
  if(route==='/characters/personas/list')return done(call('personas',{personaId}));
  if(route==='/lorebooks')return done(call('lorebooks',{chatId,personaId}));
  if(route==='/prompts')return [];
  let m=route.match(/^\/chats\/([^/]+)(\/messages)?$/);
  if(m){if(decodeURIComponent(m[1])!==chatId)throw Error('참고 채팅이 바뀌었어요. 해당 채팅을 열고 새로고침해 주세요.');return done(m[2]?loadMessages(chatId):call('chat',{chatId,personaId}));}
  m=route.match(/^\/characters\/personas\/([^/]+)$/);if(m)return done(call('persona',{personaId:decodeURIComponent(m[1])}));
  m=route.match(/^\/characters\/([^/]+)$/);if(m)return done(call('character',{characterId:decodeURIComponent(m[1])}));
  m=route.match(/^\/lorebooks\/([^/]+)\/entries$/);if(m)return done(call('entries',{bookId:decodeURIComponent(m[1])}));
  throw Error('루미버스 이식판에서 지원하지 않는 요청: '+route);
 }

 function tokenCounter(connectionId){
  const cache=new Map();let fallback=false,tokenizer='',model='';
  const remember=(k,n)=>{if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(k,n);};
  async function count(strings){
   const want=[...new Set(strings.filter(s=>s&&!cache.has(s)&&s.length<=400000))];
   for(let i=0;i<want.length;i+=32){
    const part=want.slice(i,i+32);
    try{const r=await call('tokens',{texts:part,connectionId,activeProfileId:activeProfileId()});part.forEach((s,k)=>{const n=Number(r.counts?.[k]);if(Number.isFinite(n)&&n>0)remember(s,n);});tokenizer=r.tokenizer||tokenizer;model=r.model||model;if(r.approximate)fallback=true;}
    catch{fallback=true;}
   }
   return strings.map(s=>{if(!s)return 0;if(cache.has(s))return cache.get(s);fallback=true;return estimate(s);});
  }
  const str=v=>typeof v==='string'?v:JSON.stringify(v??'');
  return {
   async text(value){return (await count([str(value)]))[0];},
   async messages(list){const n=await count((list||[]).map(m=>str(m.content)));return 3+n.reduce((a,b)=>a+b+8,0);},
   info(){return {source:fallback?'estimate':'lumiverse',model,label:fallback?'글자 수 추정 포함 (루미버스 토크나이저를 쓰지 못한 부분)':`루미버스 토크나이저${tokenizer?' · '+tokenizer:''}${model?' · '+model:''}`};},
  };
 }

 async function generate(payload,signal){
  check(signal);
  if(running)throw Error('이전 API 요청이 종료될 때까지 잠시 기다려 주세요.');
  const runId=uuid(),{onPromptReady,onHistory,...rest}=payload;
  const clean=JSON.parse(JSON.stringify(rest)),preview=previewNext;previewNext=false;
  if(preview)clean.previewOnly=true;
  let handler;const job={abort(){call('abort',{runId}).catch(()=>{});}};running=job;
  try{
   const cancelled=new Promise((_,reject)=>{handler=()=>{job.abort();reject(abortError());};signal?.addEventListener('abort',handler,{once:true});if(signal?.aborted)handler();});
   const result=await Promise.race([call('generate',{runId,chatId:activeChatId(),activeProfileId:activeProfileId(),personaId:activePersonaId(),payload:clean},{timeout:0}),cancelled]);
   check(signal);
   try{onPromptReady?.({messages:result.finalPrompt||null,history:result.history||null,meta:result.meta||null});}catch{}
   if(preview){previewShown=true;throw Error('미리보기만 만들었어요. 보내지 않았어요. 아래 “최종 전송 프롬프트”에서 확인하세요.');}
   if(typeof result?.text!=='string')throw Error('루미버스에서 텍스트 결과를 받지 못했어요.');
   return result.text;
  }finally{signal?.removeEventListener('abort',handler);if(running===job)running=null;}
 }

 async function appendToCurrentChat(record,parts){
  const list=(Array.isArray(parts)&&parts.length?parts:[record]).filter(Boolean);
  if(running)throw Error('생성이 끝난 뒤 채팅에 추가해 주세요.');
  if(!record||list.some(r=>!r?.content?.trim()))throw Error('채팅에 넣을 아티클이 없어요.');
  if(record.chatId!==activeChatId())throw Error('이 아티클을 만든 채팅에서만 추가할 수 있어요.');
  const n=await call('append',{chatId:record.chatId,items:list.map(r=>({content:r.content,recordId:r.id}))});
  scheduleMessages();return n;
 }
 async function createChatFromRecord(){
  throw Error('루미버스 확장 API에는 새 채팅을 만드는 기능이 없어요. 캐릭터에서 새 채팅을 연 뒤, 이 아티클을 “복사”해 첫 메시지로 붙여 넣어 주세요.');
 }

 // ---- drawer mounting (used by src/lumiverse/glue.inc.js)
 const root=tab.root;
 root.classList?.add('side-story-lumiverse');
 Object.assign(root.style,{display:'block',position:'relative',height:'calc(100% + 12px)',margin:'-12px -12px 0',minHeight:'320px'});
 const placeholder=doc.createElement('div');
 placeholder.setAttribute('role','status');
 Object.assign(placeholder.style,{padding:'32px 20px',textAlign:'center',color:'var(--lumiverse-text-muted, #999)',font:'15px/1.6 var(--lumiverse-font-family, system-ui, sans-serif)'});
 placeholder.textContent='채팅을 열면 Side Story를 쓸 수 있어요.';
 root.append(placeholder);
 const drawerOnUs=()=>{const d=state('ui.drawer');return !!d?.open&&d.tabId===tab.tabId;};

 const host={
  embedded:true,SillyTavern,
  indexedDB:createArchiveIDB({rpc,real:realIndexedDB,onMigration:m=>{if(m?.error)migrationNotice=`이전 버전(0.1.x)의 결과를 옮기지 못했어요. 다음에 열 때 다시 시도해요. (${m.error})`;else if(m?.migrated&&!m.already)migrationNotice=`이전 버전(0.1.x)의 결과 ${m.migrated}개를 새 보관함으로 옮겼어요. 원래 기록도 그대로 남겨 뒀어요.`;}}),
  request,generate,tokenCounter,currentAnchor,resolveAnchor,appendToCurrentChat,createChatFromRecord,
  presetNames:()=>[],currentPresetName:()=>'',
  currentChatId:activeChatId,activeChatId,currentPersona:activePersonaId,
  linked:()=>[],connections:()=>[],
  createCharacterFromProfile:({name,description})=>{if(!String(name||'').trim()||!String(description||'').trim())throw Error('캐릭터 이름과 프로필이 필요해요.');return call('createCharacter',{name:String(name).trim().slice(0,120),description:String(description)});},
  createPersonaFromProfile:({name,description})=>{if(!String(name||'').trim()||!String(description||'').trim())throw Error('페르소나 이름과 프로필이 필요해요.');return call('createPersona',{name:String(name).trim().slice(0,120),description:String(description)});},
  storage:{async get(){return {sideStory:await call('settingsGet',{})||{}};},async patch(value){await call('settingsSet',{value:value.sideStory});}},
  setTimeout:setTimer,clearTimeout:clearTimer,
  width:()=>root.clientWidth||0,
  opened(flag){isOpen=!!flag;placeholder.hidden=isOpen;if(isOpen&&cache.chatId!==activeChatId())loadMessages().catch(()=>{});},
  onPersonaChange(fn){personaHandlers.add(fn);cleanups.push(()=>personaHandlers.delete(fn));},
  onActivate(fn){const off=tab.onActivate?.(fn);if(typeof off==='function')cleanups.push(off);},
  mount(element,open){root.insertBefore(element,placeholder);if(drawerOnUs())open();},
  requestPreview(){previewNext=true;previewShown=false;},
  takePreviewShown(){const v=previewShown;previewShown=false;previewNext=false;return v;},
  takeMigrationNotice(){const n=migrationNotice;migrationNotice='';return n;},
  fail(error){placeholder.hidden=false;placeholder.textContent='Side Story를 시작하지 못했어요: '+(error?.message||error);},
  onCleanup(fn){cleanups.push(fn);},
  cleanup(){clearTimer(messageTimer);running?.abort?.();for(const fn of cleanups.splice(0).reverse())try{fn?.();}catch{}placeholder.remove();},
 };
 return host;
}
