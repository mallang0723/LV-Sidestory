// Backend half of the Lumiverse host adapter. The frontend adapter (host.js) turns upstream's
// stHost.request('/chats/…') calls into these operations; everything that needs a Spindle permission
// happens here. Lumiverse data comes back in the shapes upstream's st-host.js produces.
import {shapeHostPrompt,fillNames,eligibleHistory} from './assembly.js';
import {migrateRecords,identitySourceIds} from './migrate.js';

export const CURRENT='st-current'; // upstream's id for "use the host's own prompt assembly"
const PAGE=100;
const ID=/^[A-Za-z0-9_.:-]{1,200}$/;
export const id=v=>{if(typeof v!=='string'||!ID.test(v))throw Error('잘못된 ID예요.');return v;};
const text=(v,max=2_000_000)=>{if(typeof v!=='string'||v.length>max)throw Error('잘못된 입력이에요.');return v;};

/** Reads every page of a paginated Spindle list. */
export async function allPages(fetchPage,limit=PAGE,max=5000){
 const out=[];
 for(let offset=0;offset<max;offset+=limit){
  const page=await fetchPage({limit,offset});const rows=Array.isArray(page?.data)?page.data:[];
  out.push(...rows);
  if(rows.length<limit||(Number.isFinite(page?.total)&&out.length>=page.total))break;
 }
 return out;
}

// ---- DTO mapping into upstream's shapes (see upstream/src/st-host.js)
export function characterCard(c){
 if(!c)return null;
 const data={name:c.name||'',description:c.description||'',personality:c.personality||'',scenario:c.scenario||'',first_mes:c.first_mes||'',mes_example:c.mes_example||'',extensions:c.extensions||{}};
 return {id:c.id,name:c.name||'',avatar:c.image_id?c.id:'',data};
}
export function personaCard(p){
 if(!p)return null;
 return {id:p.id,name:p.name||'',avatar:p.image_id?p.id:'',data:{name:p.name||'',description:p.description||''}};
}
export function loreEntry(e){
 return {...e,id:e.id,uid:e.uid,name:e.comment||e.uid||e.id,comment:e.comment||'',content:String(e.content||''),enabled:!e.disabled,key:Array.isArray(e.key)?e.key:[],keysecondary:Array.isArray(e.keysecondary)?e.keysecondary:[],constant:!!e.constant,selective:!!e.selective,selectiveLogic:Number(e.selective_logic)||0,caseSensitive:!!e.case_sensitive};
}
/** Chat rows as upstream expects: ids are positions in the chat so series cut-offs can compare them. */
export function messageRow(m){
 const extra=m.extra||{};
 return {id:String(m.index_in_chat),messageId:m.id,role:m.role==='system'?'system':m.is_user?'user':(m.name||'assistant'),name:m.name||'',content:String(m.content??''),characterId:typeof extra.character_id==='string'?extra.character_id:'',system:m.role==='system',sendDate:m.send_date??null,extra:{hiddenFromAI:extra.hidden===true,hiddenFromUser:false}};
}
const characterWorldBooks=c=>{const x=c?.extensions||{};return Array.isArray(x.world_book_ids)?x.world_book_ids.filter(v=>typeof v==='string'):typeof x.world_book_id==='string'&&x.world_book_id?[x.world_book_id]:[];};
const groupIds=chat=>chat?.metadata?.group===true||chat?.metadata?.group===1?(Array.isArray(chat.metadata.character_ids)?chat.metadata.character_ids.filter(x=>typeof x==='string'):[]):[];

export function createService(api,{now=()=>Date.now()}={}){
 const runs=new Map();let alive=true;
 const ownChat=async(u,chatId)=>{const chat=await api.chats.get(id(chatId),u);if(!chat)throw Error('채팅을 찾지 못했어요. 채팅을 다시 열어 주세요.');return chat;};
 const characterIdsOf=chat=>{const g=groupIds(chat);return g.length?g:chat?.character_id?[chat.character_id]:[];};
 async function activePersona(u,personaId){
  if(personaId){const p=await api.personas.get(id(personaId),u).catch(()=>null);if(p)return p;}
  return api.personas.getActive(u).catch(()=>null);
 }
 async function linkedBooks(u,chat,personaId){
  const ids=new Set();
  for(const cid of characterIdsOf(chat)){const c=await api.characters.get(cid,u).catch(()=>null);for(const b of characterWorldBooks(c))ids.add(b);}
  const persona=await activePersona(u,personaId);if(persona?.attached_world_book_id)ids.add(persona.attached_world_book_id);
  for(const b of Array.isArray(chat?.metadata?.chat_world_book_ids)?chat.metadata.chat_world_book_ids:[])if(typeof b==='string')ids.add(b);
  try{for(const b of await api.world_books.getGlobal(u)||[])ids.add(b);}catch{}
  return [...ids];
 }
 async function chatView(u,{chatId,personaId}){
  const chat=await ownChat(u,chatId),persona=await activePersona(u,personaId);
  const summary=typeof chat.metadata?.loom_summary==='string'?chat.metadata.loom_summary:'';
  return {id:chat.id,name:chat.name||'현재 채팅',mode:'roleplay',connectionId:CURRENT,characterIds:characterIdsOf(chat),personaId:persona?.id||'',metadata:{summary,activeLorebookIds:await linkedBooks(u,chat,persona?.id)}};
 }
 async function connections(u,{activeProfileId}={}){
  const list=await api.connections.list(u);
  const active=list.find(c=>c.id===activeProfileId)||list.find(c=>c.is_default)||null;
  return [{id:CURRENT,name:'현재 루미버스 연결'+(active?.name?' · '+active.name:''),model:active?.model||'',isDefault:true},...list.map(c=>({id:c.id,name:c.name||c.id,model:c.model||'',provider:c.provider||''}))];
 }
 async function characters(u,{chatId}){const chat=await ownChat(u,chatId);const rows=[];for(const cid of characterIdsOf(chat)){const c=await api.characters.get(cid,u).catch(()=>null);if(c)rows.push(characterCard(c));}return rows;}
 async function personas(u,{personaId}){const p=await activePersona(u,personaId);return p?[personaCard(p)]:[];}
 async function character(u,{characterId}){const c=await api.characters.get(id(characterId),u);if(!c)throw Error('선택한 카드를 찾지 못했어요. 참고 자료를 다시 선택해 주세요.');return characterCard(c);}
 async function persona(u,{personaId}){const p=await api.personas.get(id(personaId),u);if(!p)throw Error('선택한 카드를 찾지 못했어요. 참고 자료를 다시 선택해 주세요.');return personaCard(p);}
 async function lorebooks(u,{chatId,personaId}={}){
  const books=await allPages(o=>api.world_books.list({...o,userId:u}));
  let linked=new Set();if(chatId){try{linked=new Set(await linkedBooks(u,await ownChat(u,chatId),personaId));}catch{}}
  return books.map(b=>({id:b.id,name:b.name||b.id,enabled:true,isGlobal:linked.has(b.id)}));
 }
 async function entries(u,{bookId}){
  if(!await api.world_books.get(id(bookId),u))throw Error('로어북을 찾을 수 없어요: '+bookId);
  return (await allPages(o=>api.world_books.entries.list(bookId,{...o,userId:u}))).map(loreEntry);
 }
 async function messages(u,{chatId}){await ownChat(u,chatId);return (await api.chat.getMessages(chatId)).map(messageRow);}
 async function modelOf(u,connectionId,activeProfileId){
  const cid=connectionId===CURRENT?(activeProfileId||(await api.connections.list(u)).find(c=>c.is_default)?.id):connectionId;
  if(!cid)throw Error('루미버스의 API 연결을 설정해 주세요.');
  const c=await api.connections.get(id(cid),u);if(!c)throw Error('선택한 연결 프로필을 찾을 수 없어요. 설정에서 다시 선택해 주세요.');
  return {connectionId:c.id,model:c.model||'',name:c.name||c.id};
 }
 async function tokens(u,{texts,connectionId,activeProfileId}){
  let model;try{model=(await modelOf(u,connectionId||CURRENT,activeProfileId)).model||undefined;}catch{model=undefined;}
  const out=[];let approximate=false,tokenizer='';
  for(const t of Array.isArray(texts)?texts.slice(0,64):[]){const r=await api.tokens.countText(text(t),{model,userId:u});out.push(r.total_tokens);approximate||=!!r.approximate;tokenizer=r.tokenizer_name||tokenizer;}
  return {counts:out,approximate,tokenizer,model:model||''};
 }
 async function names(u,chat,personaId){
  const chars=[];for(const cid of characterIdsOf(chat)){const c=await api.characters.get(cid,u).catch(()=>null);if(c?.name)chars.push(c.name);}
  const p=await activePersona(u,personaId);return {char:chars.join(', '),user:p?.name||''};
 }
 /** stHost.generate: either Lumiverse's own assembly (dry run) + the request turn, or the messages as built by upstream. */
 async function generate(u,{runId,chatId,activeProfileId,personaId,payload}){
  id(runId);if(!alive)throw Error('확장이 꺼졌어요.');
  if(!payload||typeof payload!=='object')throw Error('잘못된 요청이에요.');
  const controller=new AbortController();runs.set(runId,{user:u,controller});
  try{
   const chat=chatId?await ownChat(u,chatId):null;const who=chat?await names(u,chat,personaId):{};
   const maxTokens=Math.max(16,Math.min(200000,Math.round(Number(payload.parameters?.maxTokens)||4096)));
   const {connectionId,model,name}=await modelOf(u,payload.connectionId||CURRENT,activeProfileId);
   let messages,parameters={max_tokens:maxTokens},history=null,meta={connectionId,model,connectionName:name,requestedMaxTokens:maxTokens};
   if(payload.useSillyTavernContext&&payload.connectionId===CURRENT){
    if(!chat)throw Error('현재 채팅에서 다시 시작해 주세요.');
    const dry=await api.generate.dryRun({chatId:chat.id,connectionId,...(personaId?{personaId}:{})},u);
    const source=payload.history||payload.selectedLoreOnly?await api.chat.getMessages(chat.id):[];
    const quiet=fillNames(text(String(payload.quietPrompt||payload.messages?.map(m=>m.content).filter(Boolean).join('\n\n')||'')),who);
    const shaped=shapeHostPrompt({dryRun:dry,source,plan:payload.history||null,quietPrompt:quiet,auxiliaryTurns:(payload.auxiliaryTurns||[]).map(m=>({role:m.role,content:fillNames(m.content,who)})),selectedLoreOnly:!!payload.selectedLoreOnly});
    if(shaped.blocked)throw Error(shaped.blocked);
    messages=shaped.messages;history=payload.history?shaped.report:null;
    const {stream:_s,max_tokens:_m,...rest}=dry.parameters&&typeof dry.parameters==='object'?dry.parameters:{};
    parameters={...rest,max_tokens:maxTokens};
    meta={...meta,...shaped.meta,presetMaxTokens:Number(dry.parameters?.max_tokens)||null,promptTokens:dry.tokenCount?.total_tokens??dry.tokenCount?.total??null,worldInfoActivated:dry.worldInfoStats?.activatedCount??dry.worldInfoStats?.activated??null};
   }else{
    if(!Array.isArray(payload.messages)||!payload.messages.length)throw Error('보낼 메시지가 없어요.');
    messages=payload.messages.map(m=>({role:['system','user','assistant'].includes(m?.role)?m.role:'user',content:fillNames(text(String(m?.content??'')),who)}));
   }
   if(payload.previewOnly)return {preview:true,text:'',finalPrompt:messages,history,meta:{...meta,preview:true}};
   if(!model)throw Error('연결 프로필에 모델이 지정되지 않았어요. 루미버스 연결 설정에서 모델을 골라 주세요.');
   // Raw generation does not fall back to the connection's model, so the model is always passed explicitly.
   const result=await api.generate.raw({type:'raw',userId:u,messages,connection_id:connectionId,model,parameters,signal:controller.signal});
   if(controller.signal.aborted)throw Object.assign(Error('중단됨'),{name:'AbortError'});
   const content=typeof result==='string'?result:result?.content;
   if(typeof content!=='string')throw Error('루미버스에서 텍스트 결과를 받지 못했어요.');
   return {text:content,finalPrompt:messages,history,meta};
  }finally{runs.delete(runId);}
 }
 function abort(u,{runId}){const r=runs.get(runId);if(r&&r.user===u)r.controller.abort();return true;}
 async function append(u,{chatId,items}){
  await ownChat(u,chatId);if(!Array.isArray(items)||!items.length||items.length>200)throw Error('채팅에 넣을 아티클이 없어요.');
  let n=0;for(const item of items){await api.chat.appendMessage(chatId,{role:'assistant',content:text(item.content),metadata:{sideStoryRecordId:String(item.recordId||'').slice(0,120)}});n++;}
  return n;
 }
 async function createCharacter(u,{name,description}){const c=await api.characters.create({name:text(name,120).trim(),description:text(description),personality:'',scenario:'',first_mes:'',mes_example:''},u);return c?.id||'';}
 async function createPersona(u,{name,description}){const p=await api.personas.create({name:text(name,120).trim(),description:text(description)},u);return p?.id||'';}

 // ---- storage: settings and the archive (upstream IndexedDB store 'records', keyed by id)
 const fnv=s=>{let h=0x811c9dc5;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h.toString(16);};
 const hex=s=>Array.from(new TextEncoder().encode(s),b=>b.toString(16).padStart(2,'0')).join('');
 const fileOf=rid=>'archive/'+(/^[A-Za-z0-9_-]{1,100}$/.test(rid)?rid:'x'+hex(rid).slice(0,150)+'-'+fnv(rid))+'.json';
 const read=(u,p)=>api.userStorage.getJson(p,{userId:u,fallback:null});
 const write=(u,p,v)=>api.userStorage.setJson(p,v,{userId:u});
 async function archiveFiles(u){return (await api.userStorage.list('archive/',u)).filter(p=>p.endsWith('.json')).map(p=>p.startsWith('archive/')?p:'archive/'+p);}
 /** Characters per chat (group order, like upstream's record.characterIds) and the user's personas. `complete`
  * is false when a lookup failed, so a pass that depends on it is not marked done. */
 async function sourceContext(u,chatIds){
  const byChat=new Map();let complete=true;
  for(const cid of new Set(chatIds.filter(x=>typeof x==='string'&&x))){
   try{const chat=await api.chats.get(cid,u);const list=[];for(const id of characterIdsOf(chat)){const c=await api.characters.get(id,u).catch(()=>{complete=false;return null;});list.push({id,name:c?.name||''});}byChat.set(cid,list);}catch{byChat.set(cid,[]);complete=false;}
  }
  let personas=[];try{personas=(await allPages(o=>api.personas.list({...o,userId:u}))).map(p=>({id:p.id,name:p.name||''}));}catch{personas=[];complete=false;}
  return {chatCharacters:cid=>byChat.get(cid)||[],personas,complete};
 }
 // 0.2.0 builds before this fix migrated identity extractions without the ids upstream looks them up by
 // (persona never, group chats under the greeting character). Re-attach them once; the marker is written only
 // after a pass in which every read and lookup succeeded, so a transient failure is retried next time.
 async function repairSources(u){
  if(await read(u,'repair-identity-sources-1.json'))return null;
  try{
   const files=await archiveFiles(u),targets=[];
   for(const p of files){const r=await read(u,p);if(r?.migratedFrom==='lumiverse-0.1'&&r.mode==='facet'&&r.facetPhase==='plan'&&r.facetPlan)targets.push({p,r});}
   const context=await sourceContext(u,targets.map(x=>x.r.chatId));let fixed=0;
   for(const {p,r} of targets){
    const ids=identitySourceIds(r.facetPlan,{characters:context.chatCharacters(r.chatId),personas:context.personas});
    const next={...r,settings:{...(r.settings||{})}};let changed=false;
    if(ids.characterIds.length&&JSON.stringify(ids.characterIds)!==JSON.stringify(r.characterIds||[])){next.characterIds=ids.characterIds;changed=true;}
    if(ids.personaIds.length&&!(r.settings?.personaIds||[]).length){next.settings.personaIds=ids.personaIds;changed=true;}
    if(changed){await write(u,p,next);fixed++;}
   }
   const done={at:now(),checked:targets.length,fixed};
   if(context.complete||!targets.length)await write(u,'repair-identity-sources-1.json',done);
   return done;
  }catch(e){return {error:String(e?.message||e),retry:true};}
 }
 // 0.1.x results (records/) → upstream archive (archive/). The completion marker is written only after every
 // old record was read and every new one written; a listing/read/write failure leaves no marker, reports the
 // error, and the next open continues (already moved records are recognised by lvLegacy.id).
 async function migrate(u){
  const marker=await read(u,'migration-0.2.0.json');if(marker)return {...marker,already:true};
  try{
   const old=(await api.userStorage.list('records/',u)).filter(p=>/^[\w-]+\.json$/.test(p.replace(/^records\//,'')));
   const rows=[];for(const p of old){const r=await read(u,p.startsWith('records/')?p:'records/'+p);if(r)rows.push(r);}
   const existing=[];for(const p of await archiveFiles(u)){const r=await read(u,p);if(r?.id)existing.push({id:r.id,content:r.content,lvLegacy:r.lvLegacy});}
   const context=await sourceContext(u,rows.map(r=>r?.host?.chatId));
   const result=migrateRecords(rows,existing,context);
   for(const r of result.records)await write(u,fileOf(r.id),r);
   const done={version:'0.2.0',at:now(),found:rows.length,migrated:result.records.length,skipped:result.skipped,failed:result.failed};
   await write(u,'migration-0.2.0.json',done);return done;
  }catch(e){return {error:String(e?.message||e),retry:true};}
 }
 const PAGE_BYTES=2_000_000;
 async function archiveList(u,{cursor=0}={}){
  const migration=cursor?null:await migrate(u);if(!cursor)await repairSources(u);
  const files=(await archiveFiles(u)).sort();const records=[];let size=0,i=Math.max(0,Number(cursor)||0);
  for(;i<files.length;i++){const r=await read(u,files[i]);if(!r?.id)continue;const n=JSON.stringify(r).length;if(records.length&&size+n>PAGE_BYTES)break;records.push(r);size+=n;}
  return {records,next:i<files.length?i:null,migration};
 }
 async function archivePut(u,{records}){if(!Array.isArray(records))throw Error('잘못된 보관 요청이에요.');for(const r of records){if(!r||typeof r.id!=='string'||r.id.length>200)throw Error('보관할 아티클 ID가 올바르지 않아요.');await write(u,fileOf(r.id),r);}return records.length;}
 async function archiveDelete(u,{ids}){for(const rid of Array.isArray(ids)?ids:[]){if(typeof rid!=='string')continue;try{await api.userStorage.delete(fileOf(rid),u);}catch{}}return true;}
 async function settingsGet(u){return (await read(u,'sidestory-settings.json'))||{};}
 async function settingsSet(u,{value}){if(!value||typeof value!=='object')throw Error('잘못된 설정이에요.');if(JSON.stringify(value).length>8_000_000)throw Error('설정이 너무 커요.');await write(u,'sidestory-settings.json',value);return true;}

 const ops={chat:chatView,connections,characters,personas,character,persona,lorebooks,entries,messages,tokens,generate,abort,append,createCharacter,createPersona,archiveList,archivePut,archiveDelete,settingsGet,settingsSet};
 return {
  ops,
  async handle(u,op,args){if(!alive)throw Error('확장이 꺼졌어요.');const fn=ops[op];if(!fn)throw Error('지원하지 않는 요청: '+op);return fn(u,args||{});},
  cancelUser(u){for(const r of runs.values())if(!u||r.user===u)r.controller.abort();},
  dispose(){alive=false;for(const r of runs.values())r.controller.abort();runs.clear();},
 };
}
