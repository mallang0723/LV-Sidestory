// Lumiverse host adapter: the object upstream's code calls `stHost` (upstream/src/st-host.js is the
// SillyTavern version). Same surface, Lumiverse underneath: reads go to the backend worker
// (src/lumiverse/service.js), the active chat/persona/connection come from Spindle state selectors.
//
// Which chat is open (0.2.2). Lumiverse 1.2.5 and the staging branch expose the same three sources, read in
// this order: ctx.state.get('chat.active').chatId, ctx.getActiveChat().chatId, and the CHAT_SWITCHED {chatId}
// event. A source that throws or answers in an unknown shape is skipped, not taken as "no chat". Upstream
// opens only when told (CHAT_CHANGED, tab activation); the host's tab activation fires only when the selected
// drawer tab CHANGES, so reopening the drawer on Side Story (drawer handle) or a chat that was restored while
// Side Story was still loading its settings left the "open a chat" notice up with a chat open. So the open
// chat is also checked when the app mounts, when the drawer opens on this tab, when the notice comes into
// view, and every 1.5 s while the notice is on screen; the notice says what the host answered.
import {createArchiveIDB} from './idb.js';
import {uuid} from './ids.js';

const abortError=()=>new DOMException('중단됨','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError();};
// Chat id from a host answer: a string, or an object with chatId (1.2.5/staging), activeChatId or id.
// ok:false means "this source did not answer", so the next one is asked.
export function chatIdFrom(value){
 if(typeof value==='string')return {ok:true,id:value};
 if(value&&typeof value==='object')for(const k of ['chatId','activeChatId','id'])if(k in value)return {ok:true,id:value[k]==null?'':String(value[k])};
 return {ok:false,id:''};
}
const tabKey=id=>String(id??'').replace(/:\d+$/,'');
const estimate=text=>{let a=0,b=0;for(const ch of text){if(ch.codePointAt(0)<128)a++;else b++;}return Math.ceil(a/3.5+b*1.5);};
export const CURRENT='st-current';

export function createLumiverseHost({ctx,rpc,tab,document:doc=globalThis.document,realIndexedDB=globalThis.indexedDB,setTimer=globalThis.setTimeout.bind(globalThis),clearTimer=globalThis.clearTimeout.bind(globalThis)}){
 const cleanups=[];let previewNext=false,previewShown=false,running=null,isOpen=false,boundChat='',messageTimer=null,migrationNotice='';
 const state=key=>{try{return ctx.state?.get?.(key);}catch{return null;}};
 // ---- the open chat (see the note at the top)
 const said={subscribe:{ok:false,id:''},event:{ok:false,id:''}},seen={};
 let openApp=null,failed=false,noticeVisible=false,pollTimer=null;
 const onUs=d=>!!d?.open&&!!d.tabId&&tabKey(d.tabId)===tabKey(tab.tabId);
 const short=e=>String(e?.message||e).slice(0,80);
 function ask(name,read){
  let r;try{r=read();}catch(e){seen[name]='오류: '+short(e);return {ok:false,id:''};}
  if(r===undefined){seen[name]='없음';return {ok:false,id:''};}
  const v=chatIdFrom(r);seen[name]=v.ok?(v.id?'있음':'빈 값'):'모름('+(r===null?'null':typeof r)+')';return v;
 }
 function activeChatId(){
  // Live reads of the host store come first; when either answers, an empty answer means "no chat".
  const live=[ask('state',()=>ctx.state?.get?ctx.state.get('chat.active'):undefined),ask('getActiveChat',()=>typeof ctx.getActiveChat==='function'?ctx.getActiveChat():undefined)];
  const hit=live.find(v=>v.ok&&v.id);if(hit)return hit.id;
  if(live.some(v=>v.ok))return '';
  // Neither works on this host: the last value the host pushed.
  for(const v of [said.subscribe,said.event])if(v.ok&&v.id)return v.id;
  return '';
 }
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

 const onChat=()=>{const next=activeChatId();if(next===boundChat){paintNotice();return;}boundChat=next;cache={chatId:'',rows:[]};running?.abort?.();eventSource.emit('CHAT_CHANGED',next);paintNotice();};
 boundChat=activeChatId();
 const personaHandlers=new Set(),hooked={};
 const subscribe=(key,fn)=>{try{const off=ctx.state.subscribe(key,fn);if(typeof off==='function')cleanups.push(off);hooked[key]=true;}catch(e){hooked[key]='오류: '+short(e);}};
 const listen=(event,fn)=>{try{const off=ctx.events.on(event,fn);if(typeof off==='function')cleanups.push(off);hooked[event]=true;}catch(e){hooked[event]='오류: '+short(e);}};
 if(ctx.state?.subscribe){
  subscribe('chat.active',v=>{said.subscribe=chatIdFrom(v);onChat();});
  subscribe('persona.activeId',()=>{for(const fn of personaHandlers)try{fn();}catch{}});
  subscribe('chat.messageCount',scheduleMessages);
  subscribe('ui.drawer',v=>{if(onUs(v))reconcile();});
 }
 if(ctx.events?.on){
  listen('CHAT_SWITCHED',p=>{said.event=chatIdFrom(p&&typeof p==='object'&&'chatId' in p?p.chatId??'':p);onChat();});
  for(const e of ['MESSAGE_SENT','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED'])listen(e,scheduleMessages);
 }

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
 // The notice shown while the app is closed. Until upstream has mounted it says "loading"; after that, with no
 // chat found, it asks to open a chat and shows one small line on what the host answered (for bug reports),
 // plus a button that checks again.
 const placeholder=doc.createElement('div');
 placeholder.setAttribute('role','status');placeholder.className='side-story-lumiverse-notice';
 Object.assign(placeholder.style,{padding:'32px 20px',textAlign:'center',color:'var(--lumiverse-text-muted, #999)',font:'15px/1.6 var(--lumiverse-font-family, system-ui, sans-serif)'});
 const noticeText=doc.createElement('p'),noticeInfo=doc.createElement('small'),noticeRetry=doc.createElement('button');
 Object.assign(noticeText.style,{margin:'0 0 12px'});
 Object.assign(noticeInfo.style,{display:'block',fontSize:'13px',lineHeight:'1.5',opacity:'0.8',wordBreak:'break-word',userSelect:'text'});
 noticeRetry.type='button';noticeRetry.textContent='다시 확인';
 Object.assign(noticeRetry.style,{marginTop:'12px',minHeight:'44px',padding:'0 16px',font:'inherit',fontSize:'15px',color:'var(--lumiverse-text, inherit)',background:'transparent',border:'1px solid var(--lumiverse-border-neutral, rgba(128,128,128,.4))',borderRadius:'8px',cursor:'pointer'});
 noticeRetry.addEventListener?.('click',()=>reconcile());
 noticeText.textContent='Side Story를 불러오는 중이에요…';noticeInfo.hidden=true;noticeRetry.hidden=true;
 placeholder.append(noticeText,noticeInfo,noticeRetry);
 root.append(placeholder);
 const version=String(ctx.host?.lumiverseVersion||'?');
 const extras=['composer','tts'].filter(k=>ctx[k]&&typeof ctx[k]==='object');
 /** What the host answered about the open chat, in one line. */
 function chatDiagnostics(){
  activeChatId();
  const sub=hooked['chat.active']===true?(said.subscribe.ok?(said.subscribe.id?'있음':'빈 값'):'알림 없음'):(hooked['chat.active']||'없음');
  const ev=hooked.CHAT_SWITCHED===true?(said.event.ok?(said.event.id?'있음':'빈 값'):'알림 없음'):(hooked.CHAT_SWITCHED||'없음');
  return `루미버스 ${version}${extras.length?' ('+extras.join('·')+' API 있음)':''} · 채팅 감지: state ${seen.state||'없음'}, getActiveChat ${seen.getActiveChat||'없음'}, 구독 ${sub}, 이벤트 ${ev}`;
 }
 function paintNotice(){
  if(failed||!openApp)return;
  noticeText.textContent='채팅을 열면 Side Story를 쓸 수 있어요.';
  noticeInfo.textContent=chatDiagnostics();noticeInfo.hidden=false;noticeRetry.hidden=false;
 }
 /** Opens the app when a chat is open and it is not showing; catches up on a chat change nobody heard. */
 function reconcile(){
  if(!openApp||failed)return;
  const id=activeChatId();
  if(id!==boundChat){onChat();return;}
  if(id&&!isOpen){openApp();return;}
  if(!isOpen)paintNotice();
 }
 // While the notice is on screen, look again now and then (a host whose notifications never arrive).
 function poll(){clearTimer(pollTimer);pollTimer=null;if(!noticeVisible||isOpen||!openApp||failed)return;pollTimer=setTimer(()=>{pollTimer=null;reconcile();poll();},1500);}
 if(typeof globalThis.IntersectionObserver==='function'&&typeof placeholder.nodeType==='number'){
  const seenObserver=new IntersectionObserver(entries=>{noticeVisible=entries.some(e=>e.isIntersecting);if(noticeVisible)reconcile();poll();});
  seenObserver.observe(placeholder);cleanups.push(()=>seenObserver.disconnect());
 }

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
  opened(flag){isOpen=!!flag;placeholder.hidden=isOpen;if(isOpen&&cache.chatId!==activeChatId())loadMessages().catch(()=>{});if(!isOpen)paintNotice();poll();},
  onPersonaChange(fn){personaHandlers.add(fn);cleanups.push(()=>personaHandlers.delete(fn));},
  onActivate(fn){const off=tab.onActivate?.(()=>{if(boundChat!==activeChatId())onChat();fn();});if(typeof off==='function')cleanups.push(off);},
  // Upstream is ready: open now when a chat is open (whether or not the drawer shows this tab, the same as on a
  // chat change), and catch up on a chat change that came while upstream was still loading.
  mount(element,open){root.insertBefore(element,placeholder);openApp=open;reconcile();if(!isOpen)paintNotice();},
  chatDiagnostics,
  requestPreview(){previewNext=true;previewShown=false;},
  takePreviewShown(){const v=previewShown;previewShown=false;previewNext=false;return v;},
  takeMigrationNotice(){const n=migrationNotice;migrationNotice='';return n;},
  fail(error){failed=true;placeholder.hidden=false;noticeText.textContent='Side Story를 시작하지 못했어요: '+(error?.message||error);noticeInfo.textContent=chatDiagnostics();noticeInfo.hidden=false;noticeRetry.hidden=true;},
  onCleanup(fn){cleanups.push(fn);},
  cleanup(){clearTimer(messageTimer);clearTimer(pollTimer);pollTimer=null;openApp=null;running?.abort?.();for(const fn of cleanups.splice(0).reverse())try{fn?.();}catch{}placeholder.remove();},
 };
 return host;
}
