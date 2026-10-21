// "현재 루미버스 연결" (upstream: "현재 실리태번 연결").
// Upstream asks SillyTavern to assemble the RP prompt (preset, character, persona, lore, history) and appends
// the Side Story request as the last user turn, trimming the history on the way (series anchor, recent N,
// no history) and adding earlier parts as extra turns. Lumiverse exposes the same assembly as
// spindle.generate.dryRun(); this shapes its result the same way. Pure functions, no host calls.

export const textOf=m=>typeof m?.content==='string'?m.content:Array.isArray(m?.content)?m.content.map(p=>typeof p?.text==='string'?p.text:'').join(''):'';
const norm=s=>String(s??'').trim();

/** The longest plain line of a message, used to check that a prompt row really is that chat message. */
export function probe(content){
 const lines=String(content??'').split('\n').map(x=>x.trim()).filter(x=>x.length>=12&&!/[<>\[\]{}|]/.test(x)).sort((a,b)=>b.length-a.length);
 return lines[0]?lines[0].slice(0,40):'';
}

/** Messages Lumiverse puts into the chat history (hidden ones are left out), oldest first. */
export function eligibleHistory(source){
 return (Array.isArray(source)?source:[]).filter(m=>m&&m.extra?.hidden!==true&&typeof m.content==='string').slice().sort((a,b)=>(a.index_in_chat??0)-(b.index_in_chat??0));
}

/**
 * Finds the chat-history rows inside an assembled prompt.
 * Breakdown gives where history starts and how many rows it has; rows injected between them (world info at
 * depth, author's note, depth blocks) are recognised by their breakdown content and skipped. History rows are
 * then matched to the last N eligible chat messages and spot-checked by content.
 */
export function locateHistory(dryRun,source){
 const messages=Array.isArray(dryRun?.messages)?dryRun.messages:[],breakdown=Array.isArray(dryRun?.breakdown)?dryRun.breakdown:[];
 const entry=breakdown.find(b=>b?.type==='chat_history');
 const result={indices:[],rows:[],expected:0,verified:0,checked:0,reliable:false};
 if(!entry||!(entry.messageCount>0)||!Number.isInteger(entry.firstMessageIndex))return {...result,reliable:true};
 result.expected=entry.messageCount;
 const injected=new Set(breakdown.filter(b=>b&&b.type!=='chat_history'&&typeof b.content==='string'&&norm(b.content)).map(b=>norm(b.content)));
 for(let i=entry.firstMessageIndex;i<messages.length&&result.indices.length<entry.messageCount;i++)if(!injected.has(norm(textOf(messages[i]))))result.indices.push(i);
 const eligible=eligibleHistory(source);
 result.rows=result.indices.length===entry.messageCount?eligible.slice(Math.max(0,eligible.length-entry.messageCount)):[];
 if(result.rows.length===result.indices.length)result.indices.forEach((at,k)=>{const p=probe(result.rows[k]?.content);if(!p)return;result.checked++;if(textOf(messages[at]).includes(p))result.verified++;});
 result.reliable=result.indices.length===entry.messageCount&&result.rows.length===entry.messageCount&&(result.checked===0||result.verified*2>=result.checked);
 return result;
}

/** Index in chat of the series anchor, or -1. Anchors carry the Lumiverse message id in `sendDate`. */
export function anchorIndex(anchor,source){
 if(!anchor)return -1;const rows=Array.isArray(source)?source:[];
 const hit=anchor.sendDate&&rows.find(m=>m?.id===anchor.sendDate);
 return hit&&Number.isInteger(hit.index_in_chat)?hit.index_in_chat:-1;
}

/** Removes the host's own world-info rows (or their text inside merged rows). Returns counts. */
export function stripWorldInfo(messages,breakdown,removed){
 let stripped=0,unmatched=0;
 for(const b of Array.isArray(breakdown)?breakdown:[]){
  if(b?.type!=='world_info'||typeof b.content!=='string'||!norm(b.content))continue;
  const want=norm(b.content);
  let at=messages.findIndex((m,i)=>!removed.has(i)&&norm(textOf(m))===want);
  if(at>=0){removed.add(at);stripped++;continue;}
  at=messages.findIndex((m,i)=>!removed.has(i)&&typeof m.content==='string'&&m.content.includes(b.content));
  if(at>=0){messages[at]={...messages[at],content:messages[at].content.replace(b.content,'').replace(/\n{3,}/g,'\n\n')};stripped++;continue;}
  unmatched++;
 }
 return {stripped,unmatched};
}

/**
 * plan (upstream st-host interceptHistory): {limit:number|null, anchor, exclude:boolean, append:[{role,content}]}
 * Returns {messages, report:{before,after,anchor,appended}, meta}.
 */
export function shapeHostPrompt({dryRun,source=[],plan=null,quietPrompt='',auxiliaryTurns=[],selectedLoreOnly=false}){
 const messages=(Array.isArray(dryRun?.messages)?dryRun.messages:[]).map(m=>({role:m.role,content:m.content,...(m.name?{name:m.name}:{})}));
 const breakdown=Array.isArray(dryRun?.breakdown)?dryRun.breakdown:[];
 const history=locateHistory(dryRun,source),removed=new Set();
 const report={before:history.indices.length,after:history.indices.length,anchor:null};
 const meta={host:'lumiverse',model:dryRun?.model??null,provider:dryRun?.provider??null,historyRows:history.indices.length,historyExpected:history.expected,historyVerified:`${history.verified}/${history.checked}`,historyMapping:history.reliable?'matched':'approximate'};
 let kept=history.indices.slice();
 if(plan){
  if(plan.exclude)kept=[];
  else{
   if(plan.anchor){
    const cut=anchorIndex(plan.anchor,source);
    if(cut>=0&&history.reliable){kept=kept.filter((_,k)=>history.rows[k].index_in_chat<=cut);report.anchor='applied';}
    else report.anchor='missing';
   }
   if(Number.isInteger(plan.limit)&&plan.limit>=0)kept=kept.slice(Math.max(0,kept.length-plan.limit));
  }
  const keep=new Set(kept);for(const i of history.indices)if(!keep.has(i))removed.add(i);
  report.after=kept.length;
 }
 if(selectedLoreOnly)Object.assign(meta,{worldInfo:stripWorldInfo(messages,breakdown,removed)});
 // Earlier parts go right after the kept history (upstream pushes them onto the trimmed chat).
 const append=Array.isArray(plan?.append)?plan.append.filter(m=>m&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content})):[];
 const after=kept.length?kept.at(-1):history.indices.length?history.indices[0]-1:messages.length-1;
 const out=[];
 messages.forEach((m,i)=>{if(!removed.has(i))out.push(m);if(i===after)out.push(...append);});
 if(after<0)out.unshift(...append);
 if(append.length)report.appended=append.length;
 if(norm(quietPrompt))out.push({role:'user',content:String(quietPrompt)});
 for(const row of Array.isArray(auxiliaryTurns)?auxiliaryTurns:[])if(row&&typeof row.content==='string')out.push({role:row.role==='assistant'?'assistant':'user',content:row.content});
 return {messages:out,report,meta};
}

/** {{char}} / {{user}} in Side Story's own text (Lumiverse does not run macros on extension-built turns). */
export function fillNames(text,{char='',user=''}={}){
 return String(text??'').replace(/\{\{char\}\}/gi,()=>char||'{{char}}').replace(/\{\{user\}\}/gi,()=>user||'{{user}}');
}
