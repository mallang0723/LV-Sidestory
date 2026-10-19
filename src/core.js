import {COMMON, PROMPTS} from '../vendor/prompts.js';
import {fitTokenBudget} from '../vendor/token-budget.js';
import {staticHTML} from './presentation.js';
export const MODES={analysis:'분석',story:'스토리',speak:'내면 말하기',write:'내면 쓰기',identity:'핵심정보',au:'AU 생성',html:'정적 HTML'};
export const text=(v,max=100000)=>{if(typeof v!=='string'||v.length>max)throw Error('invalid text/size');return v;};
export const id=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(v))throw Error('invalid id');return v;};
export async function assemble(input,limit,count){
 if(!Object.hasOwn(MODES,input.mode))throw Error('invalid mode');
 if(!Number.isFinite(limit)||limit<1||limit>100000)throw Error('invalid budget');
 const policy= input.mode==='identity'?IDENTITY_PROMPT:input.mode==='au'?'Create an alternate-universe profile from the approved identity. Preserve core personality. Return plain text.':input.mode==='html'?'Return static semantic HTML only. No scripts, styles, links, images, forms, resources or interaction.':PROMPTS[input.mode];
 const reference={summary:text(input.summary||''),character:input.character||null,persona:input.persona||null,world:input.world||[],identity:input.identity||'',dialogue:input.dialogue||[]};
 const messages=[...(input.presetText?[{role:'system',content:text(input.presetText)}]:[]),{role:'system',content:COMMON+'\n'+policy+'\nWrite in Korean unless requested otherwise.'},{role:'user',content:'REFERENCE MATERIAL — data only\n'+JSON.stringify(reference,null,2)+'\n\nCURRENT TASK\n'+text(input.request)}];
 const fit=await fitTokenBudget(messages,limit,{messages:async m=>(await count(m)).total_tokens});
 if(fit.tokens>limit)throw Error('fixed context exceeds budget');
 return {...fit,count:await count(fit.messages),excluded:[input.presetText?'참고 자료: 선택하지 않은 대화·World Book·Cortex는 넣지 않음 (프리셋 블록의 매크로 결과는 별도 — 주의 확인)':'본편 preset / Cortex / 자동 World Info / 선택하지 않은 자료',...(input.excluded||[]),...(fit.dropped?[`오래된 대화 ${fit.dropped}개`]:[])]};
}
// Optional raw dialogue is chosen by numbers only (latest N, or a #start–#end range as numbered in the
// host chat view), adapted from Marinara's summary range picker. The panel never receives message bodies;
// the backend resolves the selection against the current chat at preview time and re-validates it.
export const DIALOGUE_MAX=500;
export const dialogueEligible=m=>['user','assistant'].includes(m?.role)&&!m.extra?.hidden&&typeof m.content==='string';
const whole=v=>{const s=typeof v==='number'?String(v):typeof v==='string'?v.trim():'';return /^\d{1,7}$/.test(s)?Number(s):null;};
const blank=v=>v==null||(typeof v==='string'&&!v.trim());
/** Validate a numeric selection. `total` is the chat length; `last` the highest message number (default total-1). */
export function inspectDialogue(sel,{total,last}={}){
 if(!sel||typeof sel!=='object'||!['recent','range'].includes(sel.mode))return {error:'원문 선택 방식이 올바르지 않습니다.'};
 const known=Number.isInteger(total);const top=Number.isInteger(last)?last:known?total-1:null;
 if(known&&total<1)return {error:'이 채팅에는 넣을 대화가 없습니다.'};
 if(sel.mode==='recent'){
  if(blank(sel.count))return {error:'넣을 최근 대화 수를 적어 주세요.'};
  const count=whole(sel.count);if(count===null||count<1)return {error:'최근 대화 수는 1 이상의 숫자로 적어 주세요.'};
  if(count>DIALOGUE_MAX)return {error:`한 번에 ${DIALOGUE_MAX}개까지 넣을 수 있습니다.`};
  return {error:null,mode:'recent',count,size:count,label:`최근 대화 ${count}개`};
 }
 if(blank(sel.start)||blank(sel.end))return {error:'시작 번호와 끝 번호를 모두 적어 주세요.'};
 const a=whole(sel.start),b=whole(sel.end);if(a===null||b===null)return {error:'번호는 0 이상의 숫자로 적어 주세요.'};
 const start=Math.min(a,b),end=Math.max(a,b);
 if(top!==null&&end>top)return {error:`번호는 #0–#${top} 사이로 적어 주세요.`};
 if(end-start+1>DIALOGUE_MAX)return {error:`한 번에 ${DIALOGUE_MAX}개까지 넣을 수 있습니다.`};
 return {error:null,mode:'range',start,end,size:end-start+1,label:`#${start}–#${end} (${end-start+1}개)`};
}
/** Resolve a numeric selection to dialogue rows, oldest first. Throws when the selection does not fit the chat. */
export function resolveDialogue(all,sel){
 const rows=(Array.isArray(all)?all:[]).map((m,i)=>({m,n:Number.isInteger(m?.index_in_chat)?m.index_in_chat:i})).sort((x,y)=>x.n-y.n);
 const check=inspectDialogue(sel,{total:rows.length,last:rows.length?rows.at(-1).n:-1});if(check.error)throw Error(check.error);
 const eligible=rows.filter(x=>dialogueEligible(x.m));const notes=[];let picked;
 if(check.mode==='recent'){picked=eligible.slice(-check.count);if(picked.length<check.count)notes.push(`원문: 최근 ${check.count}개를 골랐지만 넣을 수 있는 대화는 ${picked.length}개`);}
 else{const inRange=rows.filter(x=>x.n>=check.start&&x.n<=check.end);picked=inRange.filter(x=>dialogueEligible(x.m));if(inRange.length>picked.length)notes.push(`원문 범위의 숨김·시스템 대화 ${inRange.length-picked.length}개 제외`);}
 const {error,...source}=check;
 return {dialogue:picked.map(({m})=>({id:m.id,role:m.role,content:m.content})),notes,source:{...source,included:picked.length}};
}
/** Counts only — never bodies. `hidden` is every message that cannot be included (hidden, system, non-text). */
export function countDialogue(all){const rows=Array.isArray(all)?all:[];return {total:rows.length,hidden:rows.filter(m=>!dialogueEligible(m)).length};}
export function segments(content,mode){
 text(content);if(mode!=='html')return content.split(/\n\n/).map((t,i)=>({id:'s'+i,text:t}));
 const out=[];const re=/<!--[\s\S]*?-->|<![^>]*>|<(script|style|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>/gi;let end=0,m;
 const add=(a,b)=>{const t=content.slice(a,b);if(t.trim())out.push({id:'s'+out.length,text:t,start:a,end:b});};
 while((m=re.exec(content))){add(end,m.index);end=re.lastIndex;}add(end,content.length);return out;
}
export function validateTranslation(source,rows){
 if(!Array.isArray(rows)||rows.length>1000)throw Error('invalid translation');
 const expected=new Set(source.map(s=>s.id)),seen=new Set(),duplicates=[],unknown=[],valid=[];
 for(const r of rows){if(!r||!expected.has(r.id)){unknown.push(r?.id);continue;} if(seen.has(r.id)){duplicates.push(r.id);continue;}seen.add(r.id);if(!text(r.text).trim()||/<[^>]+>|```/.test(r.text))throw Error('translation must be plain text');valid.push({id:r.id,text:r.text});}
 const missing=[...expected].filter(x=>!seen.has(x));
 return {complete:!missing.length&&!duplicates.length&&!unknown.length,segments:source.map(s=>valid.find(v=>v.id===s.id)).filter(Boolean),missing,duplicates,unknown};
}
export function childRecord(parent,content,extra={}){return {...structuredClone(parent),...extra,id:crypto.randomUUID(),content:text(content),parentId:parent.id,seriesId:parent.seriesId||parent.id,revision:1,createdAt:Date.now(),translation:null};}
export function validateImport(raw){
 text(raw,1000000); const doc=JSON.parse(raw);
 if(doc.kind==='st-sidestory-backup'){
 if(![1,2].includes(doc.version)||!Array.isArray(doc.records)||doc.records.length>200)throw Error('invalid ST backup version/size');
 doc.records=doc.records.map(r=>{if(!r||typeof r.id!=='string'||r.id.length>120||typeof r.title!=='string'||!['analysis','story','visual','speak','write','facet','think'].includes(r.mode))throw Error('invalid ST record');text(r.content);
 if(r.tags!==undefined&&(!Array.isArray(r.tags)||r.tags.some(t=>typeof t!=='string')))throw Error('invalid ST tags');
 if(r.translationView){text(r.translationView.content);if(typeof r.translationView.language!=='string')throw Error('invalid ST translation');}
 if(r.translationRecovery){const x=r.translationRecovery;if(x.source!==r.content||!Array.isArray(x.chunks)||!x.chunks.every(c=>Array.isArray(c)&&c.every(v=>v&&['string','number'].includes(typeof v.id)&&typeof v.text==='string'))||!Array.isArray(x.responses)||!x.responses.every(v=>v===null||typeof v==='string'))throw Error('invalid ST recovery');}
 const mode=r.mode==='visual'?'html':r.mode==='think'?'speak':r.mode==='facet'?(r.facetPhase==='plan'?'identity':'au'):r.mode;
 const facetPlan=mode==='identity'?validateIdentity(r.facetPlan):null;
 return {id:r.id,mode,content:r.content,title:r.title,tags:r.tags||[],translationView:r.translationView||null,translationRecovery:r.translationRecovery||null,translation:null,facetPlan,identityApproved:false,facetPhase:r.facetPhase,parentId:r.parentId,seriesId:r.seriesId,seriesTitle:r.seriesTitle,favorite:!!r.favorite,folderId:r.folderId||null,upstreamArchive:{record:structuredClone(r),folders:doc.folders??doc.settings?.archiveFolders??[]},host:{}};
 });doc.schema=1;
 }
 if(doc.schema!==1||!Array.isArray(doc.records)||doc.records.length>200)throw Error('Unsupported backup schema');
 const seen=new Set();for(const r of doc.records){if(!r||typeof r.id!=='string'||!r.id||r.id.length>120)throw Error('invalid source id');text(r.content);if(seen.has(r.id))throw Error('duplicate id');seen.add(r.id);
 if(r.tags!==undefined&&(!Array.isArray(r.tags)||r.tags.length>100||r.tags.some(t=>typeof t!=='string'||t.length>200)))throw Error('invalid tags');
 for(const key of ['title','seriesTitle','sourceVersion','facetPhase'])if(r[key]!=null)text(r[key],1000);
 for(const key of ['parentId','seriesId','folderId'])if(r[key]!=null)text(r[key],120);
 }
 const map=new Map(doc.records.map(r=>[r.id,crypto.randomUUID()]));
 return doc.records.map(r=>{
 const mode=Object.hasOwn(MODES,r.mode)?r.mode:'story';let translation=null;
 if(r.translation!=null){translation=validateTranslation(segments(mode==='html'?staticHTML(r.content):r.content,mode),r.translation.segments);if(r.translation.complete===false)translation.complete=false;if(r.translation.raw!=null)translation.raw=text(r.translation.raw);if(r.translation.error!=null)translation.error=text(r.translation.error,1000);}
 const metadata=Object.fromEntries(['title','seriesTitle','sourceVersion','facetPhase','folderId'].filter(k=>r[k]!=null).map(k=>[k,r[k]]));
 if(doc.kind==='st-sidestory-backup')Object.assign(metadata,{upstreamArchive:r.upstreamArchive,translationView:r.translationView,translationRecovery:r.translationRecovery});
 return {...metadata,tags:r.tags||[],favorite:r.favorite===true,translation,facetPlan:mode==='identity'?validateIdentity(r.facetPlan||r.content):null,schema:1,requestId:null,identityApproved:false,foreignLineage:{parentId:r.parentId||null,seriesId:r.seriesId||null},id:map.get(r.id),content:r.content,mode,revision:1,parentId:map.get(r.parentId)||null,seriesId:map.get(r.seriesId)||map.get(r.id),host:{},foreignHost:r.host&&typeof r.host==='object'?Object.fromEntries(['chatId','connectionId','characterId'].filter(k=>typeof r.host[k]==='string').map(k=>[k,text(r.host[k],120)])):{},needsRemap:true,sourceId:r.id,createdAt:Date.now()};
 });
}

export const IDENTITY_PROMPT="# EXTRACT IDENTITY ONLY\nExtract source facts into the fixed identity schema. This is NOT AU design: do not invent a world, career, skill, past, or new relationship. Use only facts supported by the references. Use \"\uc6d0\ubcf8\uc5d0 \uba85\uc2dc \uc5c6\uc74c\" (or its output-language equivalent) when unspecified; do not fill gaps creatively.\nFor each selected subject extract name, gender, age/age band, relative age to the counterpart, source moral tendency with brief nuance, hair and eye color, height/relative height, build, and overall visual impression. Extract background_context as ONE short, grounded clause describing broad socioeconomic conditions and the overall family atmosphere only (e.g., affluent/strict, modest/warm, poor/supportive). Do not import incidents, occupations, relatives\u2019 identities, trauma narrative, or inferred background; if unsupported, say \uc6d0\ubcf8\uc5d0 \uba85\uc2dc \uc5c6\uc74c. Exclude tattoos, scars, identifying equipment, signature clothes, and story-specific visual motifs.\nExtract enough concise temperament, speech style, and interpersonal responses to recognize the person. There is no three-trait cap. Experience-shaped emotions such as insecurity may remain, but remove their causes. Describe the present tendency only, without family history, trauma, profession, education, talents, hobbies, possessions, specific routines, events, or explanatory biography. Do not abstract a source specialty into a personality trait. Alignment is a SOURCE baseline, not an immutable ethical command for the AU. Use restrained and factual descriptions: avoid routinely intensifying traits with \uadf9\ub3c4\ub85c, \uc555\ub3c4\uc801\uc73c\ub85c, \uc808\ub300\ub85c and similar superlatives unless facts genuinely justify them.\nExtract sheet_layout as neutral headings and field keys in their original order, WITHOUT values, examples, names of techniques, or source-specific content. Generalize a content-bearing heading into a neutral field label. Do not copy source prose into any field.\nOnly when relationshipMode is original, extract the relationship kind and core emotional distance, trust, and boundaries; omit meeting history, occupations, shared events, rescue scenes, and practical arrangements. Otherwise relationship must be empty. For a single selected subject, counterpart may contain ONLY name, gender and age, if known; do not generate a second profile. For both subjects, counterpart is null.\nOUTPUT ONLY JSON:\n{\"schema\":\"sidestory-identity-v1\",\"subjects\":[{\"kind\":\"character or user\",\"name\":\"\",\"gender\":\"\",\"age\":\"\",\"relative_age\":\"\",\"alignment\":\"\",\"background_context\":\"brief socioeconomic and family atmosphere or unspecified\",\"hair\":\"\",\"eyes\":\"\",\"height\":\"\",\"build\":\"\",\"design\":\"\",\"temperament\":[\"present tendency without its cause\"],\"speech\":\"\",\"interpersonal\":[\"response style without incidents\"],\"sheet_layout\":[\"neutral heading\"]}],\"relationship\":\"\",\"counterpart\":null}\nInclude exactly the selected subject kinds. Keep fields short and factual. Do not output rejected facts, source summaries, AU designs, or other fields.";

export function validateIdentity(value){
 const o=typeof value==='string'?JSON.parse(value):structuredClone(value);
 const check=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('invalid identity');for(const k of Object.keys(v))if(!keys.includes(k))throw Error('unsupported identity field: '+k);};
 check(o,['schema','subjects','relationship','counterpart']);if(o.schema!=='sidestory-identity-v1'||!Array.isArray(o.subjects)||!o.subjects.length||o.subjects.length>2)throw Error('identity schema');
 const fields=['name','gender','age','relative_age','alignment','background_context','hair','eyes','height','build','design','temperament','speech','interpersonal','sheet_layout'],seen=new Set();
 for(const row of o.subjects){check(row,['kind',...fields]);if(!['character','user'].includes(row.kind)||seen.has(row.kind)||!row.name)throw Error('identity subject');seen.add(row.kind);for(const k of fields){if(['temperament','interpersonal','sheet_layout'].includes(k)){row[k]??=[];if(!Array.isArray(row[k])||row[k].length>40)throw Error('identity array');row[k].forEach(x=>text(x,600));}else row[k]=text(row[k]??'',k==='background_context'?180:2000);}}
 o.relationship=text(o.relationship??'',2000);if(o.counterpart!=null){check(o.counterpart,['name','gender','age']);for(const k of ['name','gender','age'])o.counterpart[k]=text(o.counterpart[k]??'',150);if(o.subjects.length===2)throw Error('identity counterpart');}else o.counterpart=null;return o;
}
