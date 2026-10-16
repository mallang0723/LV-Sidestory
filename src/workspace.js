// Layout adapted from ST-Sidestory 0.9.8: work folders, composer/reader,
// reference controls, archive and settings. Uses Lumiverse theme variables.
import {workspaceStyles} from './workspace-style.js';

export function createWorkspace(root){
 const node=(tag,text,parent,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;parent.append(e);return e;};
 root.style.cssText='height:100%;min-height:0;min-width:0;overflow:hidden';
 const style=node('style',workspaceStyles,root);
 const app=node('section','',root,'ss-app');app.setAttribute('aria-label','Side Story 작업실');app.dataset.page='create';app.dataset.pane='compose';
 const header=node('header','',app,'ss-topbar');
 const brand=node('div','',header,'ss-brand');node('strong','Side Story',brand);node('span','루미버스용 · 비공식',brand);
 const nav=node('nav','',header,'ss-folders');nav.setAttribute('aria-label','작업 화면');
 const panels={},navButtons={},archiveText=new WeakMap();let family='outer',modeInput,identityInput,navigate=()=>{};
 const folders=[['outer','Side Story'],['inner','내면'],['facet','다면'],['archive','보관함'],['settings','설정']];
 const setPage=page=>{app.dataset.page=page;for(const [name,p] of Object.entries(panels))p.hidden=name!==page;for(const [name,b] of Object.entries(navButtons))b.setAttribute('aria-pressed',String(page==='create'?name===family:name===page));};
 const setPane=pane=>{app.dataset.pane=pane;for(const b of paneNav.children)b.setAttribute('aria-pressed',String(b.dataset.pane===pane));};
 const chooseFamily=key=>{family=key;if(modeInput){const modes=key==='inner'?['speak','write']:key==='facet'?['identity','au']:['analysis','story','html'];if(!modes.includes(modeInput.value)){modeInput.value=modes[0];modeInput.dispatchEvent(new Event('input',{bubbles:true}));}syncMode();}setPage('create');setPane('compose');};
 for(const [key,label] of folders){const b=node('button',label,nav);b.type='button';navButtons[key]=b;b.onclick=()=>{if(['archive','settings'].includes(key)){setPage(key);navigate(key);}else chooseFamily(key);};}
 const content=node('div','',app,'ss-content');
 panels.create=node('div','',content,'ss-create');
 const paneNav=node('nav','',panels.create,'ss-pane-nav');paneNav.setAttribute('aria-label','작성 및 결과');
 for(const [key,label] of [['compose','작성'],['result','결과']]){const b=node('button',label,paneNav);b.type='button';b.dataset.pane=key;b.onclick=()=>setPane(key);}
 const layout=node('div','',panels.create,'ss-layout');
 const composer=node('aside','',layout,'ss-composer');composer.setAttribute('aria-label','새로운 작업');
 const scroll=node('div','',composer,'ss-compose-scroll');
 const heading=node('div','',scroll,'ss-section-heading');node('h2','새로운 작업',heading);node('small','본편과 별도로 보관',heading);
 const modePicker=node('div','',scroll,'ss-mode-picker');modePicker.setAttribute('aria-label','작업 종류');
 const request=node('div','',scroll),connection=node('div','',scroll),load=node('div','',scroll,'ss-inline-actions');
 const reference=node('details','',scroll,'ss-details');node('summary','참고 자료',reference);
 const referenceBody=node('div','',reference,'ss-details-body');
 const chatTitle=node('p','자료를 불러와 참고할 대화를 선택하세요.',referenceBody,'ss-hint');
 const messagePicks=node('div','',referenceBody,'ss-message-picks');messagePicks.dataset.ui='message-picks';
 const referenceFields=node('div','',referenceBody);
 const world=node('details','',referenceBody,'ss-details');node('summary','World Book 엔트리',world);const worldBody=node('div','',world,'ss-details-body');
 const worldActions=node('div','',worldBody,'ss-inline-actions');
 const source=node('details','',referenceBody,'ss-details');node('summary','불러온 대화 원문',source);const sourceBody=node('div','',source,'ss-details-body');
 const identity=node('div','',scroll);
 const generate=node('div','',panels.create,'ss-generate');
 node('small','미리보기에서 전송 내용을 확인한 뒤 생성하세요.',generate,'ss-hint');
 const generateActions=node('div','',generate,'ss-generate-actions');
 const reader=node('main','',layout,'ss-reader');reader.dataset.ui='reader';
 const readerHeading=node('div','',reader,'ss-reader-heading');const resultTitle=node('h2','아직 펼치지 않은 이야기',readerHeading);const resultMeta=node('small','',readerHeading);
 const readerActions=node('div','',reader,'ss-inline-actions');
 const empty=node('div','',reader,'ss-empty');node('span','SIDE STORY',empty,'ss-eyebrow');node('h3','같은 인물,\n다른 가능성.',empty);node('p','분석하고, 이야기를 쓰고, 인물의 내면을 만나보세요.\n결과는 본편을 바꾸지 않고 이곳에 남습니다.',empty);node('small','작성 → 참고 자료 → 미리보기 → 생성',empty);
 const prose=node('article','',reader,'ss-prose');prose.hidden=true;prose.setAttribute('aria-label','이야기 원문');
 const html=node('div','',reader,'ss-html');
 const detail=(title,parent=reader)=>{const d=node('details','',parent,'ss-details');node('summary',title,d);return node('div','',d,'ss-details-body');};
 const editor=detail('편집 · 자식 결과 저장');
 const translation=detail('번역');
 const excerpt=detail('발췌 · 내보내기');
 const replacement=detail('표시 치환',excerpt);
 const recovery=detail('번역 수동 복구',translation);
 const preview=detail('전송 프롬프트 확인');preview.parentElement.dataset.ui='prompt-details';
 const identityView=detail('핵심정보 검토');identityView.parentElement.dataset.ui='identity-details';
 panels.archive=node('section','',content,'ss-page');node('h2','보관함',panels.archive);node('p','본편과 분리해 보관한 이야기와 파생본입니다.',panels.archive,'ss-hint');
 const archiveToolbar=node('div','',panels.archive,'ss-inline-actions');
 const search=node('input','',panels.archive);search.type='search';search.placeholder='제목 · 내용으로 찾기';search.setAttribute('aria-label','보관함 검색');
 const archive=node('div','',panels.archive,'ss-archive');const archiveEmpty=node('p','아직 보관한 결과가 없습니다.',panels.archive,'ss-hint');
 const backup=detail('백업 · 가져오기',panels.archive);
 panels.settings=node('section','',content,'ss-page');node('h2','설정',panels.settings);node('p','연결 정보와 권한은 루미버스에서 관리합니다.',panels.settings,'ss-hint');
 const settings=detail('생성 한도',panels.settings);settings.parentElement.open=true;
 node('p','선택한 자료만 전달합니다. 본편 preset·Cortex·자동 World Info는 포함하지 않습니다.',settings,'ss-hint');
 const status=node('p','자료를 불러오세요.',app,'ss-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const hidden=node('div','',app);hidden.hidden=true;
 const fieldTargets={작업:hidden,'선택 대화 ID (쉼표 구분)':hidden,'선택 World Book 엔트리 ID (쉼표 구분)':hidden,'연결':connection,'요청':request,'직접 요약':referenceFields,'캐릭터 포함':referenceFields,'페르소나 포함':referenceFields,'World Book 선택':worldBody,'승인한 핵심정보':identity,'입력 토큰 예산':settings,'결과 / 편집 초안':editor,'번역 언어':translation,'번역 segment JSON (수동 복구 입력)':recovery,'표시 치환 정규식':replacement,'표시 치환 문자열':replacement,'임시 PNG/JPEG 배경':excerpt,'JSON 가져오기':backup};
 const actionTargets={};
 const route=(target,labels)=>labels.forEach(label=>actionTargets[label]=target);
 route(worldActions,['World Books 목록','책 이전 페이지','책 다음 페이지','선택한 책 엔트리','엔트리 이전 페이지','엔트리 다음 페이지']);
 route(load,['자료 불러오기']);route(generateActions,['프롬프트 미리보기','확인한 입력으로 생성','취소']);
 route(editor,['편집을 자식 결과로 저장']);route(archiveToolbar,['보관함 / 인덱스 복구']);
 route(identityView,['핵심정보로 선택']);route(editor,['현재 채팅으로 ID 재매핑 확인']);route(backup,['전체 JSON 내보내기']);
 route(excerpt,['새 채팅용 텍스트 내보내기','AU 카드 초안 내보내기','정적 HTML 내보내기','선택 텍스트 PNG']);
 route(translation,['번역 프롬프트 미리보기','확인한 입력으로 번역']);route(recovery,['번역 segment 원문','번역 검증·보관']);route(readerActions,['번역 보기','원문 보기']);route(replacement,['표시에만 치환']);
 function syncMode(){
  if(!modeInput)return;
  const selected=modeInput.value;family=['speak','write'].includes(selected)?'inner':['identity','au'].includes(selected)?'facet':'outer';
  const keys=family==='inner'?['speak','write']:family==='facet'?['identity','au']:['analysis','story','html'];
  modePicker.replaceChildren();for(const key of keys){const option=[...modeInput.options].find(o=>o.value===key);const b=node('button',option.textContent.replace('내면 ',''),modePicker);b.type='button';b.setAttribute('aria-pressed',String(key===selected));b.onclick=()=>{modeInput.value=key;modeInput.dispatchEvent(new Event('input',{bubbles:true}));};}
  identity.hidden=selected!=='au';setPage('create');
 }
 function identities(rows,reset=false){
  if(!identityInput)return;
  const selected=identityInput.value;
  if(reset)identityInput.replaceChildren();
  if(!identityInput.options.length){const o=node('option','보관함에서 핵심정보를 검토·승인하세요.',identityInput);o.value='';}
  for(const r of rows.filter(r=>r.mode==='identity'&&r.identityApproved&&!r.needsRemap))if(![...identityInput.options].some(o=>o.value===r.id)){const o=node('option',r.title||`승인된 핵심정보 · ${new Date(r.createdAt||Date.now()).toLocaleDateString('ko-KR')}`,identityInput);o.value=r.id;}
  if([...identityInput.options].some(o=>o.value===selected))identityInput.value=selected;
 }
 search.oninput=()=>{const q=search.value.toLocaleLowerCase();for(const card of archive.children)card.hidden=!(archiveText.get(card)||'').includes(q);};
 setPage('create');setPane('compose');
 return {
  status,bookRows:worldBody,available:sourceBody,prompt:preview,identityView,html,archive,hidden,style,
  fieldHost:label=>fieldTargets[label]||settings,actionHost:label=>actionTargets[label]||settings,
  bindMode(input){modeInput=input;input.addEventListener('input',syncMode);syncMode();},
  bindIdentity(input){identityInput=input;identities([]);},identities,
  onNavigate(fn){navigate=fn;},
  invalidatePreview(){delete app.dataset.previewActive;preview.parentElement.open=false;},
  preview(){app.dataset.hasPreview='true';app.dataset.previewActive='true';empty.hidden=true;resultTitle.textContent='전송 내용 확인';preview.parentElement.open=true;setPane('result');},
  showResult(r,content){app.dataset.hasResult='true';app.dataset.mode=r.mode;delete app.dataset.previewActive;identities([r]);empty.hidden=true;preview.parentElement.open=false;prose.hidden=r.mode==='html';prose.textContent=content;resultTitle.textContent=r.title||({analysis:'인물 분석',story:'새로운 이야기',speak:'내면 말하기',write:'내면 쓰기',identity:'인물 핵심정보',au:'AU 초안',html:'HTML 결과'}[r.mode]||'결과');resultMeta.textContent=`${new Date(r.createdAt||Date.now()).toLocaleDateString('ko-KR')} · revision ${r.revision}${r.parentId?' · 파생본':''}`;setPage('create');setPane('result');},
  clearResult(){delete app.dataset.hasResult;delete app.dataset.hasPreview;delete app.dataset.previewActive;empty.hidden=false;prose.hidden=true;prose.textContent='';resultTitle.textContent='아직 펼치지 않은 이야기';resultMeta.textContent='';messagePicks.replaceChildren();chatTitle.textContent='채팅이 바뀌었습니다. 자료를 다시 불러오세요.';},
  catalog(c,input,invalidate){
   chatTitle.textContent=c.chat?.name||c.chat?.title||'현재 채팅';messagePicks.replaceChildren();
   const choices=(c.messages||[]).filter(m=>['user','assistant'].includes(m.role)&&!m.extra?.hidden&&typeof m.content==='string');
   node('small',`${choices.length}개 대화 · 체크한 내용만 전달합니다.`,messagePicks,'ss-hint');
   const selected=new Set(input.value.split(',').filter(Boolean));
   for(const m of choices){const label=node('label','',messagePicks,'ss-message');const check=node('input','',label);check.type='checkbox';check.checked=selected.has(m.id);check.setAttribute('aria-label',`${m.role==='user'?'사용자':'캐릭터'}: ${m.content.slice(0,80)}`);const text=node('span','',label);node('small',m.role==='user'?'사용자':'캐릭터',text);node('span',m.content.slice(0,350),text);check.onchange=()=>{check.checked?selected.add(m.id):selected.delete(m.id);input.value=[...selected].join(',');invalidate();};}
   if(!choices.length)node('p','선택할 대화가 없습니다.',messagePicks,'ss-hint');
  },
  archiveCard(r,open){archiveEmpty.hidden=true;const b=node('button','',archive,'ss-archive-card');const modeName={analysis:'분석',story:'스토리',speak:'내면 말하기',write:'내면 쓰기',identity:'핵심정보',au:'AU',html:'HTML'}[r.mode]||r.mode;node('small',`${r.parentId?'파생본 · ':''}${modeName} · ${new Date(r.createdAt||Date.now()).toLocaleDateString('ko-KR')}`,b);node('strong',r.title||r.content.slice(0,45)||'제목 없는 결과',b);node('span',r.content.slice(0,120),b);archiveText.set(b,`${r.title||''}\n${r.content}`.toLocaleLowerCase());b.onclick=open;return b;},
  resetArchive(){archive.replaceChildren();archiveEmpty.hidden=false;search.value='';},
 };
}
