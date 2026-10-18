import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createService} from '../src/service.js';import {fake} from './fake.js';
import {presetSupport,blockMacros,PRESET_MACRO_NOTICE,EMBEDDING_NOTICE} from '../src/preset-scope.js';

const CANARY='UNSELECTED_HOST_CANARY';
// Stand-in for host assembly: any macro left in a block expands to host data the user did not pick.
function setup(preset){
 const f=fake(),s=createService(f.api),assembled=[];
 f.api.presets={list:async()=>({data:[structuredClone(preset)],total:1}),get:async x=>x===preset.id?structuredClone(preset):null};
 f.api.assemble=async(input,user)=>{assembled.push({input,user});return {messages:[],breakdown:input.blocks.map(b=>({type:'block',blockId:b.id,name:b.name,content:b.content.replace(/\{\{[^}]*\}\}/g,CANARY)}))};};
 return {f,s,assembled};
}
const base={mode:'story',connectionId:'conn',request:'x',includeCharacter:false,includePersona:false,messageIds:[]};
const block=(id,content,extra={})=>({id,name:id,content,role:'system',enabled:true,marker:null,...extra});
const all=p=>JSON.stringify(p.messages);

test('C1: blocks with host-data macros are left out before host assembly, with the macro named',async()=>{
 const preset={id:'p',name:'P',engine:'classic',metadata:{promptVariables:{viaVar:{x:'{{lastMessage}}'}}},prompt_order:[
  block('style','Write gently.'),block('mem','Recall: {{memories}}'),block('card','{{ description }}'),block('wi','{{wiMarker::before}}'),
  block('persona','{{persona}}'),block('chatvar','{{getchatvar::k}} {{$g}}'),block('viaVar','{{var::x}}'),block('alias','{{LTM}}'),block('cortex','{{entityFacts}}')]};
 const {s,assembled}=setup(preset);const p=await s.preview('u',{...base,presetId:'p'});
 assert.deepEqual(assembled[0].input.blocks.map(b=>b.id),['style']);
 const line=p.excluded.find(x=>x.startsWith('호스트 자료 매크로가 든 프리셋 블록:'));assert.ok(line);
 for(const name of ['mem ({{memories}})','card ({{description}})','wi ({{wimarker}})','persona ({{persona}})','viaVar ({{lastmessage}})','alias ({{ltm}})','cortex ({{entityfacts}})'])assert.ok(line.includes(name),name);
 assert.match(line,/chatvar \(\{\{getchatvar\}\}, \{\{\$var\}\}\)/);
 assert.ok(!all(p).includes(CANARY));s.dispose();
});

test('C1: preview no longer claims host data is excluded when preset text is sent, and says why',async()=>{
 // {{char}} is allowed through; the host still fills it from the current chat even with nothing selected.
 const {s}=setup({id:'p',name:'P',prompt_order:[block('style','Write as {{char}}.')]});
 const p=await s.preview('u',{...base,presetId:'p'});
 assert.ok(p.messages[0].content.includes(CANARY),'host expansion of allowed macros reaches the system message');
 assert.ok(!p.excluded.includes('Cortex / 자동 World Info / 선택하지 않은 자료'));assert.ok(!p.excluded.some(x=>x.startsWith('본편 preset')));
 assert.match(p.excluded[0],/프리셋 블록의 매크로 결과는 별도/);
 assert.ok(p.notices.includes(PRESET_MACRO_NOTICE));assert.match(PRESET_MACRO_NOTICE,/전수 검사가 아닙니다/);
 const none=await s.preview('u',{...base});assert.ok(none.excluded[0].startsWith('본편 preset'));assert.deepEqual(none.notices,[]);s.dispose();
});

test('C1: unchecked character/persona and no selected dialogue stay out when preset blocks reference them',async()=>{
 const f=fake(),s=createService(f.api);
 f.api.characters.get=async()=>({name:'테스트 인물',description:CANARY+'-card'});f.api.personas.getActive=async()=>({name:'u',description:CANARY+'-persona'});
 const preset={id:'p',name:'P',prompt_order:[block('a','{{description}} {{personality}}'),block('b','{{persona}}'),block('c','{{lastUserMessage}}'),block('d','{{loomSummary}}')]};
 f.api.presets={list:async()=>({data:[preset]}),get:async()=>structuredClone(preset)};let called=0;f.api.assemble=async()=>{called++;return {breakdown:[]};};
 const p=await s.preview('u',{...base,presetId:'p'});assert.equal(called,0);assert.ok(!all(p).includes(CANARY));assert.ok(p.excluded.includes('프리셋에서 포함할 블록 없음'));
 assert.ok(p.excluded[0].startsWith('본편 preset'),'nothing from the preset was sent');s.dispose();
});

test('C2: append blocks are reported as unsupported, not sent to assembly and not blamed on generation conditions',async()=>{
 const preset={id:'p',name:'P',prompt_order:[block('style','Write.'),{id:'h',name:'Chat History',marker:'chat_history',enabled:true,content:''},block('ua','[OOC: stay brief]',{role:'user_append'}),block('aa','Sure.',{role:'assistant_append'})]};
 const {s,assembled}=setup(preset);const p=await s.preview('u',{...base,presetId:'p'});
 assert.deepEqual(assembled[0].input.blocks.map(b=>b.id),['style']);
 assert.ok(p.excluded.includes('프리셋 append 블록(미지원 — 붙일 대화 기록이 없어 빠짐): ua, aa'));
 assert.ok(!p.excluded.some(x=>x.includes('생성 조건')&&x.includes('ua')));assert.ok(!all(p).includes('stay brief'));
 assert.equal(p.preset.support,'partial');assert.deepEqual(presetSupport(preset),{level:'partial',engine:'classic',reason:'append 블록 제외'});s.dispose();
});

test('C2: host append entries are ignored even if returned',async()=>{
 const {f,s}=setup({id:'p',name:'P',prompt_order:[block('style','Write.')]});
 f.api.assemble=async i=>({breakdown:[{type:'append',blockId:'style',content:'APPENDED'},{type:'block',blockId:'style',content:'Write.'}]});
 const p=await s.preview('u',{...base,presetId:'p'});assert.ok(!all(p).includes('APPENDED'));assert.match(p.messages[0].content,/Write\./);s.dispose();
});

test('C3: non-classic engines are refused before host assembly and marked unsupported in the catalog',async()=>{
 const preset={id:'p',name:'Other',engine:'loom-v2',prompt_order:[block('style','Write.')]};
 const {s,assembled}=setup(preset);
 await assert.rejects(s.preview('u',{...base,presetId:'p'}),/classic 엔진 프리셋만 지원합니다 \(선택한 프리셋: loom-v2 엔진\)/);assert.equal(assembled.length,0);
 const c=await s.catalog('u');assert.deepEqual(c.presets[0].support,{level:'unsupported',engine:'loom-v2',reason:'loom-v2 엔진 미지원'});
 assert.equal(presetSupport({prompt_order:[block('a','Write.')]}).level,'full','missing engine is the host default classic');
 assert.equal(presetSupport({prompt_order:[]}).level,'none','an empty preset is not shown as applied');
 assert.equal(presetSupport({}).level,'full','a list row without prompt_order is not labelled as not applied');s.dispose();
});

test('C3: sealed blocks are left out with their reason and the preset is marked partial',async()=>{
 const preset={id:'p',name:'Hub',engine:'classic',metadata:{_lumiverse_sealed_preset:{blocks:[{key:'k'}]},_lumiverse_lumihub_id:'hub'},prompt_order:[block('open','Write.'),block('sealed','{{pblock::k}}'),block('sealed2','{{presetBlock::j}}')]};
 const {s,assembled}=setup(preset);const p=await s.preview('u',{...base,presetId:'p'});
 assert.deepEqual(assembled[0].input.blocks.map(b=>b.id),['open']);
 assert.ok(p.excluded.includes('프리셋 봉인 블록(미지원 — 원 프리셋 정보 없이 풀 수 없음): sealed, sealed2'));
 assert.deepEqual(p.preset,{id:'p',name:'Hub',engine:'classic',support:'partial',reason:'봉인 블록 제외'});
 assert.deepEqual((await s.catalog('u')).presets[0].support,{level:'partial',engine:'classic',reason:'봉인 블록 제외'});
 assert.equal(presetSupport({metadata:{_lumiverse_sealed_preset:{}},prompt_order:[block('a','x')]}).level,'partial');s.dispose();
});

test('C3/C1: macro scan follows host lexer flags and is case-insensitive',()=>{
 assert.deepEqual(blockMacros(block('a','{{ !Memories }} {{#if x}}{{/if}} {{.tone}}')).data,['memories']);
 assert.equal(blockMacros(block('a','{{ pBlock::x }}')).sealed,true);
 assert.deepEqual(blockMacros(block('a','{{char}} {{user}} {{var::tone}}'),{a:{tone:'soft'}}).data,[]);
});

test('C4: embedding notice states data, path, cache and repeat conditions whenever host assembly runs',async()=>{
 const {s}=setup({id:'p',name:'P',prompt_order:[block('style','Write.')]});
 const p=await s.preview('u',{...base,presetId:'p'});assert.ok(p.notices.includes(EMBEDDING_NOTICE));
 for(const part of ['최근 메시지 최대 6개','체크하지 않은 메시지 포함','임베딩 공급자','캐시','다시 시도','요청 횟수는 정해져 있지 않습니다'])assert.ok(EMBEDDING_NOTICE.includes(part),part);
 assert.ok(!EMBEDDING_NOTICE.includes('한 번'));
 assert.deepEqual((await s.preview('u',{...base})).notices,[]);s.dispose();
});

test('C1-C4: README, QA and UI describe the preset limits without overclaiming',()=>{
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
 for(const f of ['README.md','QA.md']){
  const doc=read(f);
  for(const line of doc.split('\n').filter(l=>l.includes('임베딩')))assert.ok(!line.includes('한 번'),`${f}: ${line}`);
  for(const part of ['최근 메시지 최대 6개','classic','봉인','append','전수 검사가 아닙니다'])assert.ok(doc.includes(part),`${f}: ${part}`);
 }
 const ui=read('src/frontend.js')+read('src/workspace.js');
 assert.ok(!ui.includes("'선택한 자료만 전달합니다. 본편 preset·Cortex·자동 World Info는 포함하지 않습니다.'"));
 for(const part of ['notices:p.notices','부분 지원','미지원',"lv==='none'",'임베딩'])assert.ok(ui.includes(part),part);
});

test('S1: a preset whose only block uses a host-data macro is shown as not applied in the list and the preview',async()=>{
 const preset={id:'p',name:'Mem',engine:'classic',prompt_order:[block('mem','Recall: {{memories}}')]};
 const {s,assembled}=setup(preset);
 const listed=(await s.catalog('u')).presets[0].support;
 assert.equal(listed.level,'none');assert.match(listed.reason,/적용 안 됨/);assert.match(listed.reason,/자료 매크로 블록 제외/);
 assert.deepEqual(presetSupport(preset),listed);
 const p=await s.preview('u',{...base,presetId:'p'});assert.equal(assembled.length,0);
 assert.equal(p.preset.support,'none');assert.equal(p.preset.reason,listed.reason);
 assert.ok(p.notices.some(x=>x.includes('프리셋 지시문이 적용되지 않습니다')),'not shown as a normal application');
 assert.ok(!all(p).includes('LUMIVERSE PRESET INSTRUCTIONS'));s.dispose();
});

test('S1: blocks left out for host-data macros make the preset partial in the list and the preview',async()=>{
 const preset={id:'p',name:'Mix',prompt_order:[block('style','Write.'),block('mem','{{memories}}')]};
 const {s}=setup(preset);const listed=(await s.catalog('u')).presets[0].support;
 assert.deepEqual(listed,{level:'partial',engine:'classic',reason:'자료 매크로 블록 제외'});
 const p=await s.preview('u',{...base,presetId:'p'});assert.equal(p.preset.support,'partial');assert.equal(p.preset.reason,listed.reason);s.dispose();
});

test('S1: a sealed block reached through a saved prompt variable is partial in the list, as in the preview',async()=>{
 const preset={id:'p',name:'Var',engine:'classic',metadata:{promptVariables:{v:{tone:'{{pblock::k}}'}}},prompt_order:[block('open','Write.'),block('v','Tone: {{var::tone}}')]};
 const {s,assembled}=setup(preset);
 const listed=(await s.catalog('u')).presets[0].support;
 assert.deepEqual(listed,{level:'partial',engine:'classic',reason:'봉인 블록 제외'});
 const p=await s.preview('u',{...base,presetId:'p'});
 assert.deepEqual(assembled[0].input.blocks.map(b=>b.id),['open']);
 assert.equal(p.preset.support,'partial');assert.equal(p.preset.reason,listed.reason);s.dispose();
});

test('S1: list and preview agree on support level across fixtures',async()=>{
 const fixtures=[
  {id:'p',name:'a',prompt_order:[block('a','Write.')]},
  {id:'p',name:'b',prompt_order:[block('a','Write.'),block('ua','x',{role:'user_append'})]},
  {id:'p',name:'c',prompt_order:[block('ua','x',{role:'user_append'})]},
  {id:'p',name:'d',prompt_order:[block('a','{{pblock::k}}')]},
  {id:'p',name:'e',metadata:{promptVariables:{a:{x:'{{getchatvarkey::secret::note}}'}}},prompt_order:[block('a','{{var::x}}'),block('b','Write.')]},
  {id:'p',name:'f',prompt_order:[block('a','x',{enabled:false}),{id:'h',name:'h',marker:'chat_history',enabled:true,content:''}]},
 ];
 for(const preset of fixtures){const {s}=setup(preset);const listed=(await s.catalog('u')).presets[0].support;const p=await s.preview('u',{...base,presetId:'p'});
  assert.equal(p.preset.support,listed.level,preset.name);assert.equal(p.preset.reason,listed.reason,preset.name);s.dispose();}
});

test('R1: v1.2.5 JSON-path variable reads and their aliases are treated as host data',()=>{
 for(const name of ['getchatvarkey','getgvarkey','getglobalvarkey','getglobalvarindex'])
  assert.deepEqual(blockMacros(block('a',`{{${name}::secret::note}}`)).data,[name],name);
});

test('S1: when host assembly drops every block, the preview says the preset was not applied',async()=>{
 const {f,s}=setup({id:'p',name:'P',prompt_order:[block('style','Write.')]});f.api.assemble=async()=>({breakdown:[]});
 const p=await s.preview('u',{...base,presetId:'p'});
 assert.equal(p.preset.support,'none');assert.match(p.preset.reason,/적용 안 됨/);
 assert.ok(p.notices.some(x=>x.includes('프리셋 지시문이 적용되지 않습니다')));assert.ok(!p.notices.includes(PRESET_MACRO_NOTICE));
 assert.ok(p.excluded.includes('프리셋 생성 조건으로 빠진 블록: style'));s.dispose();
});
