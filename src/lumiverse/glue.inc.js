// Runs inside upstream's scope right after extension.js. Upstream opens a full-screen overlay from the
// wand menu; here the same app lives in a Lumiverse drawer tab, so only the mounting changes.
// 1. No overlay: no top-layer popover and no visual-viewport pinning.
window.removeEventListener?.('resize',syncViewport);viewport?.removeEventListener('resize',syncViewport);viewport?.removeEventListener('scroll',syncViewport);
syncViewport=function(){};
host.removeAttribute('popover');
// 2. No wand menu in Lumiverse: the drawer tab is the entry point.
mountObserver?.disconnect();mountObserver=null;wandButton.remove();
// 3. The wide reading layout follows the drawer width, not the browser window.
wideScreen=function(){return stHost.width()>=1200;};
{const upstreamSync=syncOverlay;syncOverlay=function(){upstreamSync();stHost.opened(opened);};}
// 4. The drawer has its own close; "close" inside Side Story returns to the article list instead of a blank tab.
{const upstreamClose=close;close=function(){upstreamClose();if(stHost.activeChatId()){opened=true;page='stories';render();}};}
// 5. Load automatically: when the tab is shown and whenever the chat changes (upstream closes on chat change).
const lumiverseOpen=()=>{if(alive&&activeChat())openFromWand().then(()=>{const note=stHost.takeMigrationNotice();if(note)say(note);}).catch(e=>say(e.message,true));};
if(chatEvent)stContext.eventSource?.on(chatEvent,lumiverseOpen);
stHost.onActivate(lumiverseOpen);
// Lumiverse can switch the persona without a chat change (manual pick, character binding): reload references.
stHost.onPersonaChange?.(()=>{if(alive&&opened&&activeChat()){chatId=activeChat();refresh().catch?.(()=>{});}});
stHost.mount(host,lumiverseOpen);
// 6. Optional prompt preview (upstream sends right away; that stays the default). "미리보기" runs the same
//    path up to the point of sending, records the final prompt in 프롬프트 내역, and sends nothing.
{const upstreamCompose=composeScreen;composeScreen=function(){const html=upstreamCompose();return html.replace('<button id="generate" class="btn primary wide"',`<button id="lv-preview" class="btn quiet" ${loading?'disabled':''} title="보내지 않고 최종 프롬프트만 만들어 봐요">미리보기</button><button id="generate" class="btn primary wide"`);};}
root.addEventListener('click',e=>{const b=e.target.closest?.('#lv-preview');if(!b||b.disabled||busy)return;stHost.requestPreview();run(s.mode==='facet'&&s.facetWorkspace==='identity'?'facet-extract':'new').catch(x=>say(x.message,true)).finally(()=>{if(stHost.takePreviewShown()&&alive){const last=requestCache.at(-1);if(last){last.status='미리보기 · 보내지 않음';delete last.error;cacheSave();}page='settings';settingsTab='requests';sheet='';render();}});});
// 7. Phone reading size: upstream's default reading size is 14px. When the user never chose one, start at 16px.
if(saved?.sideStory?.viewerSize===undefined){s.viewerSize=16;}
// 8. Which saved identity extraction ("핵심정보") belongs to whom. Upstream files an extraction under the
//    chat's FIRST character (record.characterIds[0]) and the persona id, and looks it up the same way. In a
//    Lumiverse group chat the extracted character is often not the first member, so the extraction showed as
//    "미추출" in that character's own chat and was filed under another member in the group. Here an extraction
//    counts for the character it actually extracted (by the stored id/name pair, else by name) when that
//    character is in the current chat, and for the persona it was extracted from (by id, else by name).
const lvNorm=v=>String(v??'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
function lvSubject(r,kind){return r?.facetPlan?.subjects?.find(x=>x?.kind===kind)||null;}
function lvExtractedCharacterId(r){
 const subject=lvSubject(r,'character');if(!subject)return null;
 const ids=r.characterIds||[],names=r.characterNames||[],at=names.findIndex(n=>lvNorm(n)===lvNorm(subject.name));
 if(at>=0&&ids[at])return ids[at];
 if(ids.length===1)return ids[0];
 return characters.find(c=>lvNorm(H.character(c).name)===lvNorm(subject.name))?.id||null;
}
function lvCurrentPersona(){const id=(s.personaIds||[])[0]||'';return personas.find(p=>'persona:'+p.id===id||p.id===id)||null;}
facetSources=function(kind){
 const plans=records.filter(r=>r.mode==='facet'&&r.facetPhase==='plan'&&r.facetPlan?.schema===SideIdentity.SCHEMA&&lvSubject(r,kind));
 let rows;
 if(kind==='character'){
  const members=new Set(s.characterIds||[]),names=new Set(characters.filter(c=>members.has(c.id)).map(c=>lvNorm(H.character(c).name)));
  rows=plans.filter(r=>{const id=lvExtractedCharacterId(r);return id?members.has(id):names.has(lvNorm(lvSubject(r,'character').name));});
 }else{
  const current=(s.personaIds||[])[0]||'',persona=lvCurrentPersona(),name=persona?lvNorm(H.character(persona).name):'';
  rows=plans.filter(r=>{const id=(r.settings?.personaIds||[])[0];return (id&&id===current)||(!!name&&lvNorm(lvSubject(r,'user').name)===name);});
 }
 return rows.sort((a,b)=>(b.editedAt||b.createdAt||0)-(a.editedAt||a.createdAt||0));
};
// The AU (and its "원본 기반" source sheet) is about the character whose extraction is selected, even when that
// character is not the group's first member: put it first in the references for facet work.
{const upstreamReferenceOptions=referenceOptions;referenceOptions=function(){
 const o=upstreamReferenceOptions();
 if(o.mode==='facet'&&Array.isArray(o.characterIds)&&o.characterIds.length>1){try{const id=lvExtractedCharacterId(facetSelectedSource('character'));if(id&&o.characterIds.includes(id)&&o.characterIds[0]!==id)o.characterIds=[id,...o.characterIds.filter(x=>x!==id)];}catch{}}
 return o;
};}
