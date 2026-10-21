// Side Story for Lumiverse 0.1.x kept results in its own record format (records/<id>.json).
// 0.2.0 uses the upstream archive format (the same records SillyTavern keeps in IndexedDB), stored under
// archive/. This converts old records without deleting them; the original is kept in `lvLegacy`.

const MODE={analysis:'analysis',story:'story',speak:'speak',write:'write',html:'visual',identity:'facet',au:'facet'};
const UPSTREAM_MODES=new Set(['analysis','story','visual','speak','write','facet','think']);
const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const SUBJECT={character:'캐릭터',user:'페르소나'};
const IDENTITY_LABELS=[['name','이름'],['gender','성별'],['age','나이 · 연령대'],['relative_age','상대적 연령'],['alignment','원본의 성향'],['background_context','원본 성장 환경'],['hair','머리색'],['eyes','눈색'],['height','키'],['build','체격'],['design','전체적인 외관 인상'],['temperament','핵심 성격적 기질'],['speech','말투'],['interpersonal','대인 반응'],['sheet_layout','시트 항목']];

/** Readable Markdown for an identity plan (search, cards and copy use record.content). */
export function identityMarkdown(plan){
 const out=[];
 for(const row of Array.isArray(plan?.subjects)?plan.subjects:[]){
  out.push(`## ${SUBJECT[row?.kind]||'인물'}${row?.name?' · '+row.name:''}`);
  for(const [k,label] of IDENTITY_LABELS){const v=row?.[k];if(Array.isArray(v)){const items=v.filter(x=>typeof x==='string'&&x.trim());if(items.length)out.push(`**${label}**`,...items.map(x=>'- '+x.trim()));}else if(typeof v==='string'&&v.trim())out.push(`**${label}** ${v.trim()}`);}
  out.push('');
 }
 if(typeof plan?.relationship==='string'&&plan.relationship.trim())out.push('## 관계',plan.relationship.trim());
 return out.join('\n').trim();
}

const FENCE=/^\s*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/;
function parsePlan(record){
 let plan=record.facetPlan;
 if(!plan||typeof plan!=='object'){try{const raw=String(record.content||'');plan=JSON.parse((FENCE.exec(raw)||[,raw])[1]);}catch{return null;}}
 return plan?.schema==='sidestory-identity-v1'&&Array.isArray(plan.subjects)&&plan.subjects.length?plan:null;
}
function titleFrom(text){
 const line=String(text||'').replace(/<[^>]+>/g,' ').split('\n').map(x=>x.replace(/^[#>*\-\s]+/,'').replace(/[*_`]/g,'').trim()).find(Boolean)||'';
 return line.slice(0,60)||'Side Story';
}
function visualDocument(content,title){
 const source=String(content||'').trim().replace(/^```(?:html)?\s*/i,'').replace(/\s*```$/,'').trim();
 if(/^(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/i.test(source))return source;
 const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
 return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>\n${source}\n</body></html>`;
}
/** Plain-text translation of a paragraph record: 0.1.x split text on blank lines as s0, s1, … */
function translationView(record,mode){
 const t=record.translation;
 if(!t||t.complete!==true||!Array.isArray(t.segments)||mode==='visual')return null;
 const parts=String(record.content||'').split(/\n\n/),byId=new Map(t.segments.filter(x=>x&&typeof x.text==='string').map(x=>[x.id,x.text]));
 if(parts.some((_,i)=>!byId.has('s'+i)))return null;
 return {content:parts.map((_,i)=>byId.get('s'+i)).join('\n\n'),language:str(t.language,120),batches:1,inputTokens:0,outputTokens:0,createdAt:Number(record.createdAt)||Date.now()};
}

const norm=s=>String(s??'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
/**
 * Upstream finds saved identity extractions ("핵심정보") by ids, not names: the character by
 * record.characterIds[0] (the chat's character list, group order) and the persona by
 * record.settings.personaIds[0] ('persona:<id>'). 0.1.x stored neither, so they are rebuilt from the
 * chat's characters and the persona whose name matches the extracted user subject.
 */
export function identitySourceIds(plan,{characters=[],personas=[]}={}){
 const characterIds=characters.map(c=>c?.id).filter(x=>typeof x==='string'&&x);
 const user=(plan?.subjects||[]).find(x=>x?.kind==='user');
 let personaIds=[];
 if(user){const hits=personas.filter(p=>p&&norm(p.name)===norm(user.name));if(hits.length===1)personaIds=['persona:'+hits[0].id];}
 return {characterIds,personaIds};
}

/**
 * Converts one 0.1.x record. `context.chatCharacters(chatId)` returns the chat's characters
 * ([{id,name}], group order) and `context.personas` the user's personas, when known.
 * Returns null for anything that is not a 0.1.x record.
 */
export function migrateRecord(old,context={}){
 if(!old||typeof old!=='object'||typeof old.id!=='string'||typeof old.content!=='string')return null;
 const chatId=str(old.host?.chatId,200);
 // Records that came from an ST backup still carry the original upstream record. It restores the metadata
 // (title, folder, tags, series), but the 0.1.x record stays the owner of its own content: an edit made in
 // 0.1.x (childRecord copied the whole parent, snapshot included) keeps its own id, its edited text and its
 // link to the parent. Only an unedited import may take the original upstream id back (see migrateRecords).
 const upstream=old.upstreamArchive?.record;
 if(upstream&&typeof upstream==='object'&&typeof upstream.id==='string'&&UPSTREAM_MODES.has(upstream.mode)&&typeof upstream.content==='string'){
  const edited=!!old.parentId&&old.requestId==null||old.content!==upstream.content;
  const r={...structuredClone(upstream),id:old.id,content:old.content,chatId:chatId||'',favorite:!!(upstream.favorite||old.favorite),migratedFrom:'lumiverse-0.1',
   lvLegacy:{id:old.id,host:old.host||{},needsRemap:!!old.needsRemap,stChatId:str(upstream.chatId,300),upstreamId:upstream.id,parentId:old.parentId??null}};
  if(edited){Object.assign(r,{action:'edit',parentId:old.parentId||null,createdAt:Number.isFinite(old.createdAt)?old.createdAt:Date.now(),favorite:old.favorite===true});delete r.translationView;delete r.translationRecovery;delete r.recap;}
  else r.preferredId=upstream.id;
  return r;
 }
 const mode=MODE[old.mode]||'story';
 const createdAt=Number.isFinite(old.createdAt)?old.createdAt:Date.now();
 const chatCharacters=(chatId&&context.chatCharacters?.(chatId))||[];
 const characterIds=chatCharacters.length?chatCharacters.map(c=>c.id):str(old.host?.characterId,200)?[str(old.host.characterId,200)]:[];
 const record={id:old.id,mode,title:'',action:old.parentId&&old.requestId==null&&old.mode!=='au'?'edit':'new',seriesId:null,seriesTitle:null,request:'',chatId,chatName:'',
  characterIds,characterNames:chatCharacters.map(c=>c.name||''),content:old.content,status:'complete',createdAt,favorite:old.favorite===true,settings:{mode},
  parentId:null,folderId:typeof old.folderId==='string'?old.folderId:null,tags:Array.isArray(old.tags)?old.tags.filter(t=>typeof t==='string').slice(0,24):[],
  migratedFrom:'lumiverse-0.1',lvLegacy:{id:old.id,revision:old.revision??null,mode:old.mode,host:old.host||{},requestId:old.requestId??null,sourceVersion:old.sourceVersion??null,parentId:old.parentId??null,seriesId:old.seriesId??null,needsRemap:!!old.needsRemap,identityApproved:old.identityApproved??null}};
 if(record.action==='edit')record.parentId=old.parentId;
 if(old.mode==='identity'){
  const plan=parsePlan(old);
  if(plan){
   const kinds=plan.subjects.map(x=>x.kind);const target=kinds.includes('character')&&kinds.includes('user')?'both':kinds.includes('user')?'user':'character';
   const ids=identitySourceIds(plan,{characters:chatCharacters,personas:context.personas||[]});
   Object.assign(record,{facetPhase:'plan',facetPlan:plan,content:identityMarkdown(plan),title:('인물 추출 · '+plan.subjects.map(p=>p.name).filter(Boolean).join(' · ')).slice(0,180),settings:{mode:'facet',facet:{target,relation:plan.relationship?'original':'none'},personaIds:ids.personaIds}});
   if(ids.characterIds.length)record.characterIds=ids.characterIds;
  }else Object.assign(record,{mode:'story',settings:{mode:'story'}});
 }else if(old.mode==='au'){
  Object.assign(record,{facetPhase:'written',settings:{mode:'facet',facet:{target:'character'}}});
 }
 if(!record.title)record.title=typeof old.title==='string'&&old.title.trim()?old.title.trim().slice(0,170):titleFrom(old.content);
 if(mode==='visual')record.content=visualDocument(old.content,record.title);
 const view=translationView(old,record.mode);
 if(view)record.translationView=view;else if(old.translation)record.lvLegacy.translation=old.translation;
 if(old.translationView&&typeof old.translationView.content==='string')record.translationView={...old.translationView};
 return record;
}

/**
 * Converts a batch. `existing` is the new archive's records (or ids). A 0.1.x record already migrated (same
 * lvLegacy.id) is skipped; nothing else is dropped: when two records would share an id (an unedited ST import
 * imported twice, or an archive record with that id), the later one keeps its own 0.1.x id. Parent links are
 * re-pointed through the id map, so edits stay attached to their (possibly renamed) parent.
 * Returns {records, skipped, failed}.
 */
export function migrateRecords(oldRows,existing=[],context={}){
 const existingRows=[...(existing instanceof Set?[...existing].map(id=>({id})):existing||[])];
 const taken=new Set(existingRows.map(r=>r.id)),done=new Set(existingRows.map(r=>r.lvLegacy?.id).filter(Boolean));
 const out=[],idMap=new Map();let skipped=0,failed=0;
 for(const old of Array.isArray(oldRows)?oldRows:[]){
  if(old?.id&&done.has(old.id)){skipped++;continue;}
  let r=null;try{r=migrateRecord(old,context);}catch{r=null;}
  if(!r){failed++;continue;}
  const preferred=r.preferredId;delete r.preferredId;
  if(preferred&&!taken.has(preferred))r.id=preferred;
  if(taken.has(r.id)){
   const twin=existingRows.find(x=>x.id===r.id);
   if(twin&&twin.content===r.content&&!twin.lvLegacy){skipped++;idMap.set(old.id,r.id);continue;} // the same ST record restored directly
   if(old.id!==r.id&&!taken.has(old.id))r.id=old.id;else{skipped++;idMap.set(old.id,r.id);continue;} // that id is already in the archive: keep what is there
  }
  taken.add(r.id);idMap.set(old.id,r.id);out.push(r);
 }
 for(const r of out){
  if(!r.parentId)continue;
  const mapped=idMap.get(r.parentId)||(taken.has(r.parentId)?r.parentId:null);
  if(mapped&&mapped!==r.id)r.parentId=mapped;else{r.parentId=null;if(r.action==='edit')r.action='new';}
 }
 return {records:out,skipped,failed};
}
