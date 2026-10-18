import {staticHTML,decodeEntities} from './presentation.js';
import {assemble,id,text,childRecord,segments,validateTranslation,validateImport,validateIdentity} from './core.js';
import {APPEND_ROLES,SUPPORTED_ENGINE,presetEngine,isSealedPreset,blockMacros,presetSupport,PRESET_MACRO_NOTICE,EMBEDDING_NOTICE} from './preset-scope.js';
const pick=(o,keys)=>o?Object.fromEntries(keys.filter(k=>typeof o[k]==='string').map(k=>[k,o[k]])):null;
export function createService(api){
 const queues=new Map(),epochs=new Map(),controllers=new Map(),previews=new Map(),requests=new Map();let alive=true;
 const epoch=u=>epochs.get(u)||0;
 function cancel(u){epochs.set(u,epoch(u)+1);controllers.get(u)?.abort();for(const [k,p] of previews)if(p.user===u)previews.delete(k);}
 const cancelAll=()=>{for(const u of new Set([...epochs.keys(),...controllers.keys(),...[...previews.values()].map(p=>p.user)]))cancel(u);};
 const off=[api.on('CHAT_SWITCHED',cancelAll),api.permissions.onChanged(d=>{if(!d.granted)cancelAll();})];
 function serial(u,fn){id(u);const p=(queues.get(u)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(u,p);p.finally(()=>{if(queues.get(u)===p)queues.delete(u);}).catch(()=>{});return p;}
 const read=(u,key)=>api.userStorage.getJson(key,{userId:u,fallback:null});
 const write=(u,key,v)=>api.userStorage.setJson(key,v,{userId:u});
 async function records(u){const paths=await api.userStorage.list('records/',u);const rows=[];for(const p of paths.filter(p=>/^[\w-]+\.json$/.test(p))){const r=await read(u,'records/'+p);if(r)rows.push(r);}return rows;}
 async function repair(u,rows){await write(u,'index.json',rows.map(({id,revision,parentId,seriesId,createdAt})=>({id,revision,parentId,seriesId,createdAt})));}
 async function save(u,r){await write(u,`records/${id(r.id)}.json`,r);try{await repair(u,await records(u));return r;}catch{return {...r,indexPending:true};}}

 async function accepted(u,requestId,previewId){const issuedEpoch=epoch(u);const memory=requests.get(u+':'+requestId);const j=await read(u,`requests/${id(requestId)}.json`)||memory;if(memory&&memory.epoch!==epoch(u))throw Error('stale/cancelled request');if(!j)return null;if(j.previewId!==previewId)throw Error('request ID bound to different preview');if(j.state!=='complete')throw Error('request started/ambiguous; automatic retry refused');if(!alive)throw Error('disabled');const existing=await read(u,`records/${j.record.id}.json`);if(!alive||issuedEpoch!==epoch(u))throw Error('stale/cancelled request');if(existing&&existing.revision>=j.record.revision)return existing;if(memory?.state!=='complete')throw Error('request result ambiguous after restart; automatic restore refused');return save(u,j.record);}
 async function start(u,requestId,previewId){const marker={state:'started',previewId,startedAt:Date.now(),epoch:epoch(u)};requests.set(u+':'+requestId,marker);await write(u,`requests/${id(requestId)}.json`,marker);}
 async function complete(u,requestId,previewId,record){await write(u,`requests/${id(requestId)}.json`,{state:'complete',previewId,record});}
 async function approveIdentity(u,rid,revision){return serial(u,async()=>{const r=await read(u,`records/${id(rid)}.json`);if(!r||r.mode!=='identity'||r.revision!==revision||r.needsRemap)throw Error('identity revision/remap');return save(u,{...r,facetPlan:validateIdentity(r.facetPlan||r.content),identityApproved:true,revision:r.revision+1});});}
 async function books(u,{offset=0}={}){return api.world_books.list({limit:20,offset:Math.max(0,Number(offset)||0),userId:u});}
 async function entries(u,{bookId,offset=0}){if(!await api.world_books.get(id(bookId),u))throw Error('world book access denied');return api.world_books.entries.list(bookId,{limit:20,offset:Math.max(0,Number(offset)||0),userId:u});}
 const loomSummary=chat=>typeof chat?.metadata?.loom_summary==='string'?chat.metadata.loom_summary.trim():'';
 // Preset blocks are rendered by the host's own block assembly (macros, prompt variables, injection triggers)
 // in a temporary classic preset. Markers are skipped because Side Story supplies its own references;
 // append blocks need the chat history marker, sealed blocks need the original preset metadata, and blocks
 // using known host-data macros are left out. See preset-scope.js for the limits of these checks.
 async function presetInstructions(u,chat,connection,presetId){
 const preset=await api.presets.get(id(presetId),u);if(!preset)throw Error('preset missing');const name=typeof preset.name==='string'&&preset.name?preset.name:preset.id;
 const engine=presetEngine(preset);if(engine!==SUPPORTED_ENGINE)throw Error(`classic 엔진 프리셋만 지원합니다 (선택한 프리셋: ${engine} 엔진)`);
 const vars=preset.metadata?.promptVariables&&typeof preset.metadata.promptVariables==='object'?preset.metadata.promptVariables:{};
 const sealedPreset=isSealedPreset(preset);
 const blocks=[],skipped=[],append=[],sealed=[],data=[];let disabled=0,empty=0;
 for(const b of Array.isArray(preset.prompt_order)?preset.prompt_order:[]){if(!b||typeof b!=='object'||typeof b.id!=='string')continue;const label=b.name||b.id;if(b.marker){skipped.push(label);continue;}if(b.enabled===false){disabled++;continue;}if(typeof b.content!=='string'||!b.content.trim()){empty++;continue;}
  if(APPEND_ROLES.has(b.role)){append.push(label);continue;}
  const scan=blockMacros(b,vars);if(scan.sealed){sealed.push(label);continue;}if(scan.data.length){data.push(`${label} ({{${scan.data.join('}}, {{')}}})`);continue;}
  blocks.push(b);}
 const excluded=[];if(skipped.length)excluded.push(`프리셋 marker 블록: ${skipped.join(', ')}`);if(disabled)excluded.push(`프리셋 비활성 블록 ${disabled}개`);if(empty)excluded.push(`프리셋 빈 블록 ${empty}개`);
 if(append.length)excluded.push(`프리셋 append 블록(미지원 — 붙일 대화 기록이 없어 빠짐): ${append.join(', ')}`);
 if(sealed.length)excluded.push(`프리셋 봉인 블록(미지원 — 원 프리셋 정보 없이 풀 수 없음): ${sealed.join(', ')}`);
 if(data.length)excluded.push(`호스트 자료 매크로가 든 프리셋 블록: ${data.join(', ')}`);
 const support=sealed.length||append.length||sealedPreset?'partial':'full';
 const info={id:preset.id,name,engine,support};
 if(!blocks.length)return {preset:info,text:'',excluded:[...excluded,'프리셋에서 포함할 블록 없음'],notices:[]};
 const out=await api.assemble({blocks,chatId:chat.id,connectionId:connection.id,promptVariables:vars},u);
 const wanted=new Map(blocks.map(b=>[b.id,b]));const used=[];
 for(const x of out?.breakdown||[])if(x?.type==='block'&&wanted.has(x.blockId)&&typeof x.content==='string'&&x.content.trim()&&!used.some(y=>y.blockId===x.blockId))used.push(x);
 const dropped=blocks.filter(b=>!used.some(x=>x.blockId===b.id)).map(b=>b.name||b.id);if(dropped.length)excluded.push(`프리셋 생성 조건으로 빠진 블록: ${dropped.join(', ')}`);
 return {preset:info,text:used.length?`LUMIVERSE PRESET INSTRUCTIONS — ${name}\n\n`+used.map(x=>x.content).join('\n\n'):'',excluded,notices:[...(used.length?[PRESET_MACRO_NOTICE]:[]),EMBEDDING_NOTICE]};
 }
 async function preview(u,input){
 id(u);if(!alive)throw Error('disabled');const e=epoch(u);epochs.set(u,e);const chat=await api.chats.getActive(u);if(!chat)throw Error('active chat required');
 const connection=input.connectionId?await api.connections.get(id(input.connectionId),u):null;
 if(!connection?.model)throw Error('connection required');
 const selected=new Set((input.messageIds||[]).map(id));const all=await api.chat.getMessages(chat.id);const excluded=[];const dialogue=[];
 for(const m of all){if(!selected.has(m.id))continue;if(m.role==='system'||m.extra?.hidden||!['user','assistant'].includes(m.role)||typeof m.content!=='string'){excluded.push(`제외 대화 ${m.id}: system/hidden/unsupported`);continue;}dialogue.push({id:m.id,role:m.role,content:m.content});}
 for(const m of selected)if(!all.some(x=>x.id===m))throw Error('selected message missing');
 const character=input.includeCharacter?pick(await api.characters.get(chat.character_id,u),['name','description','personality','scenario']):null;
 const persona=input.includePersona?pick(await api.personas.getActive(u),['name','description']):null;
 const world=[];for(const entryId of [...new Set(input.worldIds||[])]){const entry=await api.world_books.entries.get(id(entryId),u);if(!entry)throw Error('world entry missing');if(!(input.worldBookIds||[]).includes(entry.world_book_id)||!await api.world_books.get(id(entry.world_book_id),u))throw Error('explicit accessible world book required');world.push({id:entry.id,content:entry.content});}
 let identity=null;if(input.identityId){const r=await read(u,`records/${id(input.identityId)}.json`);if(!r||r.mode!=='identity'||r.needsRemap)throw Error('approved mapped identity required');if(!r.identityApproved)throw Error('identity approval required');identity=validateIdentity(r.facetPlan);}
 if(input.mode==='au'&&!identity)throw Error('select identity first');
 const loom=input.includeLoomSummary?loomSummary(chat):'';const manual=typeof input.summary==='string'?input.summary:'';if(input.includeLoomSummary&&!loom)excluded.push('루미버스 요약 없음');
 const summary=loom?(manual.trim()?`[루미버스 요약]\n${loom}\n\n[직접 요약]\n${manual}`:`[루미버스 요약]\n${loom}`):manual;
 let presetPart=null;if(input.presetId){presetPart=await presetInstructions(u,chat,connection,input.presetId);excluded.push(...presetPart.excluded);}
 const fit=await assemble({...input,summary,presetText:presetPart?.text||'',dialogue,character,persona,world,identity,excluded},input.budget||8000,m=>api.tokens.countMessages(m,{model:connection.model,userId:u}));
 if(e!==epoch(u)||!alive)throw Error('stale preview');
 const p={...fit,notices:presetPart?.notices||[],id:crypto.randomUUID(),user:u,epoch:e,mode:input.mode,chatId:chat.id,connectionId:connection.id,model:connection.model,preset:presetPart?.preset||null,summarySource:{loom:!!loom,manual:!!manual.trim()},identityId:input.identityId||null,createdAt:Date.now()};
 if(previews.size>100)previews.delete(previews.keys().next().value);previews.set(p.id,p);return structuredClone(p);
 }
 // Raw generation does not fall back to the connection's model, so pass it explicitly.
 const runModel=async(u,connectionId)=>{const c=await api.connections.get(id(connectionId),u);if(!c?.model)throw Error('connection required');return c.model;};
 async function run(u,{previewId,requestId}){id(requestId);return serial(u,async()=>{
 const prior=await accepted(u,requestId,previewId);if(prior)return prior;
 const p=previews.get(id(previewId));if(!p||p.user!==u||Date.now()-p.createdAt>600000)throw Error('preview expired');
 const valid=async()=>{const chat=await api.chats.getActive(u);if(!alive||p.epoch!==epoch(u)||chat?.id!==p.chatId)throw Error('stale/cancelled');};
 await valid();const model=await runModel(u,p.connectionId);await valid();await start(u,requestId,previewId);await valid();const controller=new AbortController();controllers.set(u,controller);
 try{const result=await api.generate.raw({type:'raw',userId:u,messages:p.messages,connection_id:p.connectionId,model,parameters:{max_tokens:2048},signal:controller.signal});await valid();
 const record={id:crypto.randomUUID(),revision:1,schema:1,mode:p.mode,content:text(result.content),host:{chatId:p.chatId,connectionId:p.connectionId},parentId:p.identityId,seriesId:p.identityId||null,createdAt:Date.now(),requestId,sourceVersion:'0.9.8',translation:null};if(p.mode==='identity'){record.facetPlan=validateIdentity(record.content);record.identityApproved=false;record.facetPhase='plan';}await complete(u,requestId,previewId,record);await valid();requests.set(u+':'+requestId,{state:'complete',previewId,record,epoch:p.epoch});return await save(u,record);
 }catch(e){if(!alive||p.epoch!==epoch(u))await write(u,`requests/${requestId}.json`,{state:'cancelled',previewId});throw e;}finally{controllers.delete(u);}
 });}
 async function edit(u,rid,revision,content){return serial(u,async()=>{const p=await read(u,`records/${id(rid)}.json`);if(!p||p.revision!==revision)throw Error('revision conflict');const extra=p.mode==='identity'?{facetPlan:validateIdentity(content),identityApproved:false}:{};return save(u,childRecord(p,content,{requestId:null,...extra}));});}
 async function translationPreview(u,{id:rid,revision,connectionId,language}){
 const e=epoch(u);epochs.set(u,e);const r=await read(u,`records/${id(rid)}.json`);if(!r||r.revision!==revision)throw Error('revision conflict');
 const connection=await api.connections.get(id(connectionId),u);if(!connection?.model)throw Error('connection required');
 const items=segments(r.mode==='html'?staticHTML(r.content):r.content,r.mode).map(x=>({...x,text:r.mode==='html'?decodeEntities(x.text):x.text}));const messages=[{role:'system',content:'Translate source data only. Preserve meaning, voice, names, punctuation and ambiguity. Never summarize or add content. Return JSON only: {"items":[{"id":"s0","text":"translation"}]}. Preserve every ID exactly once. Plain text values only, no HTML or Markdown fences.'},{role:'user',content:JSON.stringify({language:text(language,100),items:items.map(({id,text})=>({id,text}))})}];
 const count=await api.tokens.countMessages(messages,{model:connection.model,userId:u});if(count.total_tokens>8000)throw Error('translation exceeds 8000 input tokens; split/edit source first');
 if(!alive||e!==epoch(u))throw Error('stale/cancelled');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({u,rid,revision,connectionId,messages})));if(!alive||e!==epoch(u))throw Error('stale/cancelled');const previewKey=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');const p={id:previewKey,user:u,epoch:e,recordId:rid,revision,connectionId,model:connection.model,items,messages,count};previews.set(p.id,p);return p;
 }
 async function translate(u,rid,rows,revision){const e=epoch(u);return serial(u,async()=>{const r=await read(u,`records/${id(rid)}.json`);if(!r||r.revision!==revision)throw Error('revision conflict');const recovery=validateTranslation(segments(r.mode==='html'?staticHTML(r.content):r.content,r.mode),rows);if(!alive||e!==epoch(u))throw Error('stale/cancelled');return save(u,{...r,revision:r.revision+1,translation:recovery});});}
 async function translationRun(u,{previewId}){id(previewId);return serial(u,async()=>{const requestId='translation-'+previewId;const old=await accepted(u,requestId,previewId);if(old)return old;const p=previews.get(previewId);if(!p||p.user!==u||!p.recordId)throw Error('translation preview required');
 const valid=()=>{if(!alive||p.epoch!==epoch(u))throw Error('stale/cancelled');};valid();const r=await read(u,`records/${p.recordId}.json`);if(r?.revision!==p.revision)throw Error('revision conflict');valid();const model=await runModel(u,p.connectionId);valid();await start(u,requestId,previewId);valid();const controller=new AbortController();controllers.set(u,controller);
 try{const result=await api.generate.raw({type:'raw',userId:u,messages:p.messages,connection_id:p.connectionId,model,parameters:{max_tokens:4096},signal:controller.signal});valid();let recovery;try{recovery=validateTranslation(p.items,JSON.parse(result.content).items);}catch(e){recovery={complete:false,segments:[],raw:text(result.content),error:e.message};}
 const latest=await read(u,`records/${p.recordId}.json`);valid();if(latest.revision!==p.revision)throw Error('revision conflict');const record={...r,revision:r.revision+1,translation:recovery};await complete(u,requestId,previewId,record);valid();requests.set(u+':'+requestId,{state:'complete',previewId,record,epoch:p.epoch});return await save(u,record);}catch(e){if(!alive||p.epoch!==epoch(u))await write(u,`requests/${requestId}.json`,{state:'cancelled',previewId});throw e;}finally{controllers.delete(u);}
 });}
 async function list(u){return serial(u,async()=>{const rows=await records(u);await repair(u,rows);return rows;});}
 async function importRecords(u,raw){const rows=validateImport(raw);return serial(u,async()=>{for(const r of rows)await save(u,r);return rows;});}
 async function remap(u,rid){return serial(u,async()=>{const r=await read(u,`records/${id(rid)}.json`);if(!r)throw Error('record missing');const chat=await api.chats.getActive(u);if(!chat)throw Error('chat required');return save(u,{...r,revision:r.revision+1,host:{chatId:chat.id,characterId:chat.character_id},needsRemap:false});});}
 async function catalog(u){const chat=await api.chats.getActive(u);let presets=[],presetsError=null;
 try{const r=await api.presets.list({limit:200,userId:u});presets=(r?.data||[]).filter(p=>typeof p?.id==='string').map(p=>({id:p.id,name:typeof p.name==='string'&&p.name?p.name:p.id,support:presetSupport(p)}));}catch(e){presetsError=e.message;}
 const saved=await read(u,'settings.json');return {chat,connections:await api.connections.list(u),messages:chat?await api.chat.getMessages(chat.id):[],presets,presetsError,hasLoomSummary:!!loomSummary(chat),settings:{presetId:typeof saved?.presetId==='string'?saved.presetId:''}};}
 async function saveSettings(u,{presetId=''}={}){if(presetId!=='')id(presetId);await write(u,'settings.json',{presetId});return {presetId};}
 return {saveSettings,books,entries,approveIdentity,translationPreview,translationRun,preview,run,cancel,list,edit,translate,importRecords,remap,catalog,dispose(){alive=false;cancelAll();off.forEach(f=>f());}};
}
