// "현재 루미버스 연결" (upstream: "현재 실리태번 연결").
// Upstream asks SillyTavern to assemble the RP prompt (preset, character, persona, lore, history) and appends
// the Side Story request as the last user turn, trimming the history on the way (series anchor, recent N,
// no history) and adding earlier parts as extra turns. Lumiverse exposes the same assembly as
// spindle.generate.dryRun(); this shapes its result the same way. Pure functions, no host calls.
//
// What the host actually returns (Lumiverse 1.2.5):
//  - messages: role/content/name only (src/spindle/worker-host.ts handleGenerateDryRun). The internal
//    "this row is chat history / came from message X" markers are not passed through.
//  - breakdown: every block EXCEPT chat_history (src/services/generate.service.ts
//    omitChatHistoryBreakdownEntries in dryRunGeneration).
//  - contextClipStats: how many chat-history messages the context budget dropped (oldest first).
// So history rows are identified by content against the chat's own messages, and every trim is applied only
// when that identification is complete. When it is not, a request to leave chat out (or keep only the last N)
// is refused instead of silently sending the whole chat.

export const textOf=m=>typeof m?.content==='string'?m.content:Array.isArray(m?.content)?m.content.map(p=>typeof p?.text==='string'?p.text:'').join(''):'';
const norm=s=>String(s??'').trim();
const clean=s=>String(s??'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();

/** Messages Lumiverse puts into the chat history (hidden ones are left out), oldest first. */
export function eligibleHistory(source){
 return (Array.isArray(source)?source:[]).filter(m=>m&&m.extra?.hidden!==true&&m.role!=='system'&&typeof m.content==='string').slice().sort((a,b)=>(a.index_in_chat??0)-(b.index_in_chat??0));
}
/** Lumiverse merges consecutive user messages into one turn joined by a blank line. */
export function historyTurns(source){
 const turns=[];
 for(const m of eligibleHistory(source)){
  const last=turns.at(-1);
  if(last&&m.is_user&&last.is_user)turns[turns.length-1]={...last,index_in_chat:m.index_in_chat,content:last.content+'\n\n'+m.content,count:last.count+1,ids:[...last.ids,m.id]};
  else turns.push({...m,count:1,ids:[m.id]});
 }
 return turns;
}
/** A prompt row is this chat turn when the text is the same (a group "Name: " prefix is allowed). */
export function sameTurn(message,turn){
 const a=clean(textOf(message)),b=clean(turn?.content);
 if(!b)return false;if(a===b)return true;
 const at=a.length-b.length;return at>0&&a.endsWith(b)&&/^[^\n]{1,80}:\s*$/.test(a.slice(0,at));
}

/**
 * Finds the chat-history rows of an assembled prompt by matching the chat's turns from the newest backwards.
 * Rows that match nothing (system blocks, world info, author's note, depth injections) are skipped.
 * reliable: every turn that should be in the prompt (all turns minus the ones the context budget dropped) was
 * found, in order, with the newest turn matched.
 */
export function locateHistory(dryRun,source){
 const messages=Array.isArray(dryRun?.messages)?dryRun.messages:[],turns=historyTurns(source);
 const clip=dryRun?.contextClipStats,dropped=clip?.enabled?Math.max(0,Number(clip.messagesDropped)||0):0;
 const total=turns.reduce((n,t)=>n+t.count,0),expectedMessages=Math.max(0,total-dropped);
 const pairs=[];let j=turns.length-1;
 for(let i=messages.length-1;i>=0&&j>=0;i--)if(sameTurn(messages[i],turns[j])){pairs.unshift({at:i,row:turns[j]});j--;}
 const matchedMessages=pairs.reduce((n,p)=>n+p.row.count,0);
 const reliable=turns.length===0||(pairs.length>0&&pairs.at(-1).row===turns.at(-1)&&matchedMessages===expectedMessages)||(expectedMessages===0&&pairs.length===0);
 return {indices:pairs.map(p=>p.at),rows:pairs.map(p=>p.row),expected:expectedMessages,matched:matchedMessages,dropped,reliable};
}

/** Index in chat of the series anchor, or -1. Anchors carry the Lumiverse message id in `sendDate`. */
export function anchorIndex(anchor,source){
 if(!anchor)return -1;const rows=Array.isArray(source)?source:[];
 const hit=anchor.sendDate&&rows.find(m=>m?.id===anchor.sendDate);
 return hit&&Number.isInteger(hit.index_in_chat)?hit.index_in_chat:-1;
}

/**
 * Removes the host's own world-info rows (or their text inside merged rows). Chat-history rows are never
 * touched, and a row with the breakdown's role is preferred, so the same sentence elsewhere survives.
 */
export function stripWorldInfo(messages,breakdown,removed,protect=new Set()){
 let stripped=0,unmatched=0;
 for(const b of Array.isArray(breakdown)?breakdown:[]){
  if(b?.type!=='world_info'||typeof b.content!=='string'||!norm(b.content))continue;
  const want=norm(b.content),free=i=>!removed.has(i)&&!protect.has(i);
  const exact=messages.map((m,i)=>i).filter(i=>free(i)&&norm(textOf(messages[i]))===want);
  let at=exact.find(i=>b.role&&messages[i].role===b.role)??exact[0];
  if(at!==undefined){removed.add(at);stripped++;continue;}
  at=messages.findIndex((m,i)=>free(i)&&typeof m.content==='string'&&m.content.includes(b.content));
  if(at>=0){messages[at]={...messages[at],content:messages[at].content.replace(b.content,'').replace(/\n{3,}/g,'\n\n')};stripped++;continue;}
  unmatched++;
 }
 return {stripped,unmatched};
}

export const HISTORY_BLOCKED='루미버스가 조립한 프롬프트에서 본편 대화를 정확히 가려내지 못했어요(정규식·매크로로 바뀐 메시지, 다른 블록과 합쳐진 메시지 등). “본편 대화 안 넣음/최근 N개”를 지킬 수 없어서 보내지 않았어요. 참고 자료에서 본편 대화를 “전체”로 두거나, 설정 › API 연결에서 다른 연결 프로필(Side Story가 자료를 직접 조립)을 골라 주세요.';

/**
 * plan (upstream st-host interceptHistory): {limit:number|null, anchor, exclude:boolean, append:[{role,content}]}
 * Returns {messages, report:{before,after,anchor,appended,skipped}, meta, blocked?}. `blocked` is set (and nothing
 * should be sent) when the plan asks for less history than the prompt has and the history rows are unverified.
 */
export function shapeHostPrompt({dryRun,source=[],plan=null,quietPrompt='',auxiliaryTurns=[],selectedLoreOnly=false}){
 const messages=(Array.isArray(dryRun?.messages)?dryRun.messages:[]).map(m=>({role:m.role,content:m.content,...(m.name?{name:m.name}:{})}));
 const breakdown=Array.isArray(dryRun?.breakdown)?dryRun.breakdown:[];
 const history=locateHistory(dryRun,source),removed=new Set();
 const report={before:history.indices.length,after:history.indices.length,anchor:null};
 const meta={host:'lumiverse',model:dryRun?.model??null,provider:dryRun?.provider??null,historyRows:history.indices.length,historyMessages:`${history.matched}/${history.expected}`,historyMapping:history.reliable?'matched':'unverified'};
 let kept=history.indices.slice(),blocked=null;
 const trims=!!plan&&(plan.exclude||Number.isInteger(plan.limit)&&plan.limit>=0);
 if(plan&&!history.reliable){
  report.skipped=true;if(plan.anchor)report.anchor='missing';
  // Fail closed: asked for no / less chat, but we cannot tell which rows are chat.
  if(trims&&(plan.exclude||history.expected>plan.limit))blocked=HISTORY_BLOCKED;
 }else if(plan){
  if(plan.exclude)kept=[];
  else{
   if(plan.anchor){
    const cut=anchorIndex(plan.anchor,source);
    if(cut>=0){kept=kept.filter((_,k)=>history.rows[k].index_in_chat<=cut);report.anchor='applied';}
    else report.anchor='missing';
   }
   if(Number.isInteger(plan.limit)&&plan.limit>=0)kept=kept.slice(Math.max(0,kept.length-plan.limit));
  }
  const keep=new Set(kept);for(const i of history.indices)if(!keep.has(i))removed.add(i);
  report.after=kept.length;
 }
 if(selectedLoreOnly)Object.assign(meta,{worldInfo:stripWorldInfo(messages,breakdown,removed,new Set(history.reliable?history.indices:[]))});
 // Earlier parts go right after the kept history (upstream pushes them onto the trimmed chat).
 const append=Array.isArray(plan?.append)?plan.append.filter(m=>m&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content})):[];
 const after=!history.reliable||!history.indices.length?messages.length-1:kept.length?kept.at(-1):history.indices[0]-1;
 const out=[];
 messages.forEach((m,i)=>{if(!removed.has(i))out.push(m);if(i===after)out.push(...append);});
 if(after<0)out.unshift(...append);
 if(append.length)report.appended=append.length;
 if(norm(quietPrompt))out.push({role:'user',content:String(quietPrompt)});
 for(const row of Array.isArray(auxiliaryTurns)?auxiliaryTurns:[])if(row&&typeof row.content==='string')out.push({role:row.role==='assistant'?'assistant':'user',content:row.content});
 return {messages:out,report,meta,...(blocked?{blocked}:{})};
}

/** {{char}} / {{user}} in Side Story's own text (Lumiverse does not run macros on extension-built turns). */
export function fillNames(text,{char='',user=''}={}){
 return String(text??'').replace(/\{\{char\}\}/gi,()=>char||'{{char}}').replace(/\{\{user\}\}/gi,()=>user||'{{user}}');
}
