import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemble,displayText,identityText,jsonReplyText,validateIdentity,TEXT_OUTPUT_RULE} from '../src/core.js';
import {createService} from '../src/service.js';
import {fake} from './fake.js';

const plan={schema:'sidestory-identity-v1',subjects:[{kind:'character',name:'가상 인물',gender:'여성',age:'20대 후반',relative_age:'상대보다 두 살 위',alignment:'중립 선',background_context:'원본에 명시 없음',hair:'검은색',eyes:'회색',height:'평균',build:'마른 편',design:'차분한 인상',temperament:['신중함','쉽게 마음을 열지 않음'],speech:'짧고 건조한 존댓말',interpersonal:['거리를 두고 관찰함'],sheet_layout:['기본 정보','성격']}],relationship:'',counterpart:{name:'테스트 사용자',gender:'',age:''}};
const raw=JSON.stringify(plan);

test('identity result renders as a readable Korean document, stored JSON unchanged',()=>{
 const record={mode:'identity',content:raw,facetPlan:validateIdentity(raw)};
 const view=displayText(record);
 assert.match(view,/^■ 캐릭터 · 가상 인물/);
 assert.match(view,/이름: 가상 인물\n성별: 여성\n나이: 20대 후반/);
 assert.match(view,/기질:\n {2}• 신중함\n {2}• 쉽게 마음을 열지 않음/);
 assert.match(view,/말투: 짧고 건조한 존댓말/);
 assert.match(view,/■ 상대\n이름: 테스트 사용자$/);
 assert.doesNotMatch(view,/[{}"]|schema|sidestory-identity-v1/);
 assert.equal(record.content,raw);assert.equal(record.facetPlan.schema,'sidestory-identity-v1');
 // Without a stored plan the content is parsed; unparsable legacy content is shown as-is, never throws.
 assert.equal(displayText({mode:'identity',content:raw}),view);
 assert.equal(displayText({mode:'identity',content:'synthetic identity'}),'synthetic identity');
 assert.match(identityText({...plan,relationship:'서로 신뢰하지만 선을 지킴',counterpart:null}),/■ 관계\n서로 신뢰하지만 선을 지킴$/);
});

test('fenced identity JSON validates, so a fenced reply is not rejected',()=>{
 assert.equal(validateIdentity('```json\n'+raw+'\n```').subjects[0].name,'가상 인물');
});

test('JSON replies in text modes are shown as readable text (unfenced and fenced)',()=>{
 const body='비가 그친 오후였다.\n\n두 사람은 말없이 걸었다.';
 assert.equal(displayText({mode:'story',content:JSON.stringify({title:'비 갠 뒤',content:body})}),'비 갠 뒤\n\n'+body);
 assert.equal(displayText({mode:'story',content:'```json\n'+JSON.stringify({story:body},null,2)+'\n```'}),body);
 assert.equal(displayText({mode:'speak',content:'```\n{"text":"안녕"}\n```'}),'안녕');
 const outline=displayText({mode:'analysis',content:'```json\n{"관계":"서로 경계함","근거":["말을 아낌","눈을 피함"],"장면":{"장소":"옥상"}}\n```'});
 assert.equal(outline,'관계: 서로 경계함\n근거:\n  • 말을 아낌\n  • 눈을 피함\n장면:\n  장소: 옥상');
 assert.equal(jsonReplyText('["첫 문단","둘째 문단"]'),'첫 문단\n\n둘째 문단');
 assert.match(displayText({mode:'au',content:raw}),/이름: 가상 인물/);
});

test('plain text passes through; only a whole-reply fence is removed; HTML untouched',()=>{
 const prose='그는 웃었다.\n\n"정말?" 그녀가 물었다.';
 assert.equal(displayText({mode:'story',content:prose}),prose);
 const inner='설명:\n```json\n{"a":1}\n```\n끝.';
 assert.equal(displayText({mode:'analysis',content:inner}),inner);
 assert.equal(displayText({mode:'story',content:'{ 중괄호로 시작하는 문장'}),'{ 중괄호로 시작하는 문장');
 assert.equal(displayText({mode:'story',content:'42'}),'42');assert.equal(displayText({mode:'story',content:'"따옴표"'}),'"따옴표"');
 assert.equal(displayText({mode:'write',content:'```\n편지 본문\n```'}),'편지 본문');
 assert.equal(displayText({mode:'html',content:'<p>{"a":1}</p>'}),'<p>{"a":1}</p>');
 assert.equal(displayText({mode:'html',content:'{"content":"x"}'}),'{"content":"x"}');
 assert.equal(displayText(null),'');
});

test('text modes ask for readable prose, identity and HTML keep their own contract',async()=>{
 const count=async m=>({total_tokens:JSON.stringify(m).length,approximate:true});
 const system=async mode=>(await assemble({mode,request:'요청',summary:'요약'},100000,count)).messages.find(m=>m.role==='system').content;
 for(const mode of ['analysis','story','speak','write','au']){const s=await system(mode);assert.ok(s.includes(TEXT_OUTPUT_RULE),mode);assert.match(s,/Never return JSON/);}
 for(const mode of ['identity','html'])assert.ok(!(await system(mode)).includes(TEXT_OUTPUT_RULE),mode);
 assert.match(await system('identity'),/OUTPUT ONLY JSON/);
});

test('stored record keeps the raw reply; display is derived',async()=>{
 const f=fake();f.api.generate.raw=async()=>({content:'```json\n{"content":"읽을 수 있는 본문"}\n```'});
 const s=createService(f.api),p=await s.preview('u',{mode:'story',request:'synthetic',connectionId:'conn',budget:8000}),r=await s.run('u',{previewId:p.id,requestId:'fallback'});
 assert.equal(r.content,'```json\n{"content":"읽을 수 있는 본문"}\n```');assert.equal(displayText(r),'읽을 수 있는 본문');s.dispose();
});
