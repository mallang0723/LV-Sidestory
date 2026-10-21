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
stHost.mount(host,lumiverseOpen);
// 6. Optional prompt preview (upstream sends right away; that stays the default). "미리보기" runs the same
//    path up to the point of sending, records the final prompt in 프롬프트 내역, and sends nothing.
{const upstreamCompose=composeScreen;composeScreen=function(){const html=upstreamCompose();return html.replace('<button id="generate" class="btn primary wide"',`<button id="lv-preview" class="btn quiet" ${loading?'disabled':''} title="보내지 않고 최종 프롬프트만 만들어 봐요">미리보기</button><button id="generate" class="btn primary wide"`);};}
root.addEventListener('click',e=>{const b=e.target.closest?.('#lv-preview');if(!b||b.disabled||busy)return;stHost.requestPreview();run(s.mode==='facet'&&s.facetWorkspace==='identity'?'facet-extract':'new').catch(x=>say(x.message,true)).finally(()=>{if(stHost.takePreviewShown()&&alive){const last=requestCache.at(-1);if(last){last.status='미리보기 · 보내지 않음';delete last.error;cacheSave();}page='settings';settingsTab='requests';sheet='';render();}});});
// 7. Phone reading size: upstream's default reading size is 14px. When the user never chose one, start at 16px.
if(saved?.sideStory?.viewerSize===undefined){s.viewerSize=16;}
// 8. Saved identity extractions are looked up by character/persona id. Extractions that have no id for that
//    side (ST backups, records from other hosts) still show up when the extracted name matches the current
//    character/persona, instead of reading "미추출".
{const upstreamSources=facetSources,norm=v=>String(v??'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
 facetSources=function(kind){
  const rows=upstreamSources(kind);if(rows.length)return rows;
  const id=kind==='character'?(s.characterIds||[])[0]:(s.personaIds||[])[0];
  const card=kind==='character'?characters.find(c=>c.id===id):personas.find(p=>'persona:'+p.id===id||p.id===id);
  const want=card?norm(H.character(card).name):'';if(!want)return rows;
  return records.filter(r=>r.mode==='facet'&&r.facetPhase==='plan'&&r.facetPlan?.schema===SideIdentity.SCHEMA&&!(kind==='character'?(r.characterIds||[])[0]:(r.settings?.personaIds||[])[0])&&r.facetPlan.subjects?.some(x=>x.kind===kind&&norm(x.name)===want)).sort((a,b)=>(b.editedAt||b.createdAt||0)-(a.editedAt||a.createdAt||0));
 };}
