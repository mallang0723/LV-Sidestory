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
// 9. Follow the Lumiverse theme, safely. The host's theme engine (frontend/src/theme/engine.ts) rewrites
//    --lumiverse-bg / -bg-elevated / -bg-deep / -text* / -primary* for every theme and mode, often translucent
//    (glass), while --lumiverse-bg-opaque and --lumiverse-card-bg-solid are static dark defaults from
//    variables.css that it never updates. So the palette is computed here from the engine's variables: the
//    background is --lumiverse-bg flattened onto --lumiverse-bg-deep (never a translucent colour as a base),
//    every text colour is flattened onto that background and checked for contrast. If the main text is below
//    4.5:1 (or the variables are missing) upstream's own light or dark palette is used as a whole. Secondary
//    text is pulled toward the main text until it reaches 4.5:1 in either palette. A colour picked under
//    설정 › 테마 색 still wins. Light/dark follows the host until the user picks 밝게/어둡게 on this device.
const LV_THEME_KEY='sidestory-lumiverse-theme-choice';
let lvThemePicked=false;try{lvThemePicked=localStorage.getItem(LV_THEME_KEY)==='1';}catch{}
const LV_TOKENS=['--ground','--surface','--paper','--ink','--text','--muted','--faint','--line','--accent','--on-accent','--accent-soft','--accent-line','--danger','--box','--wash'];
function lvParse(value){if(!value)return null;const probe=document.createElement('i');probe.style.color='';probe.style.color=value;if(!probe.style.color)return null;probe.style.display='none';document.body.append(probe);const c=getComputedStyle(probe).color;probe.remove();const m=c.match(/[\d.]+/g);return m&&m.length>=3?{r:+m[0],g:+m[1],b:+m[2],a:m[3]===undefined?1:+m[3]}:null;}
const lvVar=name=>lvParse(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
const lvOver=(c,base)=>c?{r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a),a:1}:null;
const lvMix=(a,b,t)=>({r:a.r+(b.r-a.r)*t,g:a.g+(b.g-a.g)*t,b:a.b+(b.b-a.b)*t,a:1});
const lvHex=c=>'#'+['r','g','b'].map(k=>Math.round(Math.max(0,Math.min(255,c[k]))).toString(16).padStart(2,'0')).join('');
const lvLum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
const lvContrast=(a,b)=>{const x=lvLum(a),y=lvLum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
function lvEnsure(c,ink,bg,min=4.5){if(!c)return ink;let out=c;for(let t=0;t<=1&&lvContrast(out,bg)<min;t+=0.05)out=lvMix(c,ink,t);return lvContrast(out,bg)<min?ink:out;}
const LV_UPSTREAM={light:{ground:'#ffffff',paper:'#ffffff',ink:'#333333',text:'#555555',muted:'#888888',faint:'#ababab',line:'#ececec',accent:'#ad2c45',danger:'#b4263f'},dark:{ground:'#17171a',paper:'#17171a',ink:'#e8e8e8',text:'#c4c4c4',muted:'#8e8e93',faint:'#6c6c70',line:'#2a2a2d',accent:'#e8708a',danger:'#f2788e'}};
/** The host palette, or null when it cannot be used safely. */
function lvHostPalette(){
 const deep=lvVar('--lumiverse-bg-deep'),raw=lvVar('--lumiverse-bg');if(!raw)return null;
 const floor=deep&&deep.a>=0.99?deep:lvOver(deep,{r:255,g:255,b:255,a:1})||{r:255,g:255,b:255,a:1};
 const bg=lvOver(raw,floor),ink=lvOver(lvVar('--lumiverse-text'),bg);
 if(!ink||lvContrast(ink,bg)<4.5)return null;
 const elevated=lvOver(lvVar('--lumiverse-bg-elevated'),bg),paper=elevated&&lvContrast(ink,elevated)>=4.5?elevated:bg;
 const accentRaw=lvOver(lvVar('--lumiverse-primary'),bg)||ink;
 return {mode:lvLum(bg)<0.18?'dark':'light',ground:bg,paper,ink,text:ink,muted:lvOver(lvVar('--lumiverse-text-muted'),bg),faint:lvOver(lvVar('--lumiverse-text-dim'),bg),line:lvOver(lvVar('--lumiverse-border-neutral')||lvVar('--lumiverse-border'),bg)||lvMix(bg,ink,0.15),accent:accentRaw,danger:lvOver(lvVar('--lumiverse-danger'),bg)};
}
function lvUpstreamPalette(mode){const u=LV_UPSTREAM[mode],p=lvParse;return {mode,ground:p(u.ground),paper:p(u.paper),ink:p(u.ink),text:p(u.text),muted:p(u.muted),faint:p(u.faint),line:p(u.line),accent:p(u.accent),danger:p(u.danger)};}
let lvPaletteKey='';
function lvApplyPalette(){
 const cs=getComputedStyle(document.documentElement),key=['--lumiverse-bg','--lumiverse-bg-deep','--lumiverse-bg-elevated','--lumiverse-text','--lumiverse-text-muted','--lumiverse-text-dim','--lumiverse-primary','--lumiverse-border-neutral'].map(k=>cs.getPropertyValue(k)).join('|')+'|'+s.theme+'|'+lvThemePicked+'|'+s.accentColor;
 if(key===lvPaletteKey&&ui.style.getPropertyValue('--ground'))return;
 const host=lvHostPalette(),hostMode=host?.mode||null;
 if(hostMode&&!lvThemePicked)s.theme=hostMode;
 const pal=host&&host.mode===s.theme?host:lvUpstreamPalette(s.theme==='dark'?'dark':'light');
 const bg=pal.ground,ink=pal.ink,text=lvEnsure(pal.text,ink,bg),muted=lvEnsure(pal.muted,ink,bg),faint=lvEnsure(pal.faint,ink,bg);
 const accent=lvEnsure(pal.accent,ink,bg,3),onAccent=[{r:255,g:255,b:255,a:1},{r:17,g:17,b:17,a:1}].sort((a,b)=>lvContrast(b,accent)-lvContrast(a,accent))[0];
 const values={'--ground':bg,'--surface':bg,'--paper':pal.paper,'--ink':ink,'--text':text,'--muted':muted,'--faint':faint,'--line':pal.line,'--accent':accent,'--on-accent':onAccent,'--accent-soft':lvMix(bg,accent,0.12),'--accent-line':lvMix(bg,accent,0.45),'--danger':lvEnsure(pal.danger||accent,ink,bg,3),'--box':lvMix(bg,ink,0.2),'--wash':lvMix(bg,ink,0.05)};
 const custom=!!s.accentColor;
 for(const k of LV_TOKENS){if(custom&&['--accent','--on-accent','--accent-soft','--accent-line'].includes(k))continue;ui.style.setProperty(k,lvHex(values[k]));}
 ui.dataset.hostTheme=pal===host?'match':'off';ui.dataset.palette=pal===host?'host':'upstream';
 PAGE_COLORS[s.theme==='dark'?'dark':'light']={bg:lvHex(bg),ink:lvHex(text),accent:lvHex(accent),line:lvHex(pal.line)};
 lvPaletteKey=key.replace(/\|[^|]*\|[^|]*\|[^|]*$/,'')+'|'+s.theme+'|'+lvThemePicked+'|'+s.accentColor;
}
{const upstreamApplyAccent=applyAccent;applyAccent=function(){const before=s.theme;upstreamApplyAccent();lvApplyPalette();if(s.theme!==before)ui.dataset.theme=s.theme;};}
root.addEventListener('click',e=>{if(e.target.closest?.('[data-theme-set]')){lvThemePicked=true;try{localStorage.setItem(LV_THEME_KEY,'1');}catch{}}},true);
{const sig=()=>{const cs=getComputedStyle(document.documentElement);return ['--lumiverse-bg','--lumiverse-bg-deep','--lumiverse-bg-elevated','--lumiverse-text','--lumiverse-primary'].map(k=>cs.getPropertyValue(k)).join('|');};let last=sig();
 const observer=typeof MutationObserver!=='undefined'?new MutationObserver(()=>{const now=sig();if(now===last)return;last=now;if(alive&&opened)render();}):null;observer?.observe(document.documentElement,{attributes:true,attributeFilter:['style','class','data-theme']});stHost.onCleanup(()=>observer?.disconnect());}
lvApplyPalette();ui.dataset.theme=s.theme;
// 10. Browsing while a generation runs. Upstream switches to the finished result wherever the user is
//     (showCompletedResult) and shows the waiting screen for any article opened during a new generation, so a
//     slow model keeps pulling the user back. Here the view only follows the run while the user is still on
//     its waiting screen; otherwise the result is saved to the archive and a toast says so. Starting another
//     generation while one runs is still refused by upstream's busy guard.
let lvOpenedDuringRun=false;
{const upstreamRun=run;run=function(action){lvOpenedDuringRun=false;return upstreamRun(action);};}
{const upstreamOpenRecord=openRecord;openRecord=function(id){if(busy)lvOpenedDuringRun=true;return upstreamOpenRecord(id);};}
{const upstreamThreadScreen=threadScreen;threadScreen=function(){
 if(busy&&pending?.action==='new'&&lvOpenedDuringRun&&current){const running=pending;pending=null;try{return upstreamThreadScreen();}finally{pending=running;}}
 return upstreamThreadScreen();
};}
function lvWatchingRun(record){
 if(page!=='create'||mobilePane!=='result')return false;
 if(pending)return pending.action==='new'?!lvOpenedDuringRun:threadKey(current)===pending.thread;
 return !current||current.id===record?.id;
}
{const upstreamShow=showCompletedResult;showCompletedResult=function(record,translation,target,signal){
 if(alive&&!signal?.aborted&&target===activeChat()&&!lvWatchingRun(record)){say(`${translation?'번역을 마쳤어요':'완성했어요'}. 보관함에 저장했어요 · ${String(record?.title||'').slice(0,40)}`);return false;}
 return upstreamShow(record,translation,target,signal);
};}
