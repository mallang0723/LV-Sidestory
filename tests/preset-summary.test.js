import {test} from 'node:test';import assert from 'node:assert/strict';import {createService} from '../src/service.js';import {fake} from './fake.js';

const blocks=[
 {id:'b1',name:'Style',content:'Write like {{char}}.',role:'system',enabled:true,marker:null},
 {id:'b2',name:'Chat History',content:'',role:'system',enabled:true,marker:'chat_history'},
 {id:'b3',name:'Off',content:'disabled text',role:'system',enabled:false,marker:null},
 {id:'b4',name:'World Info',content:'',role:'system',enabled:true,marker:'world_info_before'},
 {id:'b5',name:'Tone',content:'Keep it {{tone}}.',role:'user',enabled:true,marker:null},
 {id:'b6',name:'Impersonate only',content:'only on impersonate',role:'system',enabled:true,marker:null,injectionTrigger:['impersonate']},
];
const preset={id:'preset-dem',name:'DEM',prompt_order:blocks,metadata:{promptVariables:{b5:{tone:'gentle'}}}};
function setup({summary,presetError}={}){
 const f=fake(),s=createService(f.api),raw=[],assembled=[];
 f.api.chats.getActive=async()=>({id:'chat-a',character_id:'char-a',metadata:summary===undefined?{}:{loom_summary:summary}});
 f.api.presets={list:async()=>{if(presetError)throw Error(presetError);return {data:[{id:'preset-dem',name:'DEM',prompt_order:blocks},{id:'preset-bingsu',name:'BINGSU'}],total:2};},get:async x=>x==='preset-dem'?structuredClone(preset):null};
 // Host block assembly stand-in: resolves macros, drops trigger-filtered blocks and adds a stray non-block entry.
 f.api.assemble=async(input,user)=>{assembled.push({input,user});const breakdown=[{type:'world_info',name:'stray',content:'MUST NOT LEAK'}];for(const b of input.blocks){if(b.injectionTrigger?.length&&!b.injectionTrigger.includes('normal'))continue;breakdown.push({type:'block',name:b.name,blockId:b.id,role:b.role,content:b.content.replace('{{char}}','테스트 인물').replace('{{tone}}',input.promptVariables.b5.tone)});}return {messages:[{role:'system',content:'MUST NOT LEAK'}],breakdown};};
 f.api.generate.raw=async x=>{raw.push(x);return {content:'synthetic result'};};
 return {f,s,raw,assembled};
}
const base={mode:'story',connectionId:'conn',request:'x'};

test('catalog lists presets, saved choice and whether a Lumiverse summary exists',async()=>{
 const {s}=setup({summary:'지난 줄거리'});let c=await s.catalog('u');assert.deepEqual(c.presets,[{id:'preset-dem',name:'DEM'},{id:'preset-bingsu',name:'BINGSU'}]);assert.equal(c.presetsError,null);assert.equal(c.hasLoomSummary,true);assert.equal(c.settings.presetId,'');
 await s.saveSettings('u',{presetId:'preset-dem'});c=await s.catalog('u');assert.equal(c.settings.presetId,'preset-dem');
 await s.saveSettings('u',{presetId:''});assert.equal((await s.catalog('u')).settings.presetId,'');
 await assert.rejects(s.saveSettings('u',{presetId:'../x'}),/invalid id/);s.dispose();
});

test('catalog survives a denied presets permission and reports it',async()=>{
 const {s}=setup({summary:'   ',presetError:'Permission denied: presets'});const c=await s.catalog('u');assert.deepEqual(c.presets,[]);assert.match(c.presetsError,/presets/);assert.equal(c.hasLoomSummary,false);s.dispose();
});

test('Lumiverse summary feeds the reference summary slot only when checked',async()=>{
 const {s}=setup({summary:'루미버스가 만든 요약'});
 const user=p=>p.messages.at(-1).content;
 let p=await s.preview('u',{...base,includeLoomSummary:true,summary:'직접 쓴 요약'});assert.match(user(p),/\[루미버스 요약\]\\n루미버스가 만든 요약\\n\\n\[직접 요약\]\\n직접 쓴 요약/);assert.deepEqual(p.summarySource,{loom:true,manual:true});
 p=await s.preview('u',{...base,includeLoomSummary:true});assert.match(user(p),/\[루미버스 요약\]\\n루미버스가 만든 요약/);assert.doesNotMatch(user(p),/직접 요약/);
 p=await s.preview('u',{...base,includeLoomSummary:false,summary:'직접 쓴 요약'});assert.doesNotMatch(user(p),/루미버스/);assert.match(user(p),/"summary": "직접 쓴 요약"/);assert.deepEqual(p.summarySource,{loom:false,manual:true});
 s.dispose();
});

test('Lumiverse summary counts against the token budget',async()=>{
 const {f,s}=setup({summary:'긴 요약 '.repeat(50)});f.api.tokens.countMessages=async m=>({total_tokens:JSON.stringify(m).length});
 const small=await s.preview('u',{...base,request:'x'});const budget=small.count.total_tokens+50;
 await assert.rejects(s.preview('u',{...base,includeLoomSummary:true,budget}),/fixed context exceeds budget/);
 assert.ok(await s.preview('u',{...base,includeLoomSummary:false,budget}));s.dispose();
});

test('missing Lumiverse summary is noted when requested',async()=>{
 const {s}=setup();const p=await s.preview('u',{...base,includeLoomSummary:true});assert.ok(p.excluded.includes('루미버스 요약 없음'));assert.deepEqual(p.summarySource,{loom:false,manual:false});s.dispose();
});

test('preset blocks go through host assembly and are sent as system text before the task policy',async()=>{
 const {s,raw,assembled}=setup();const p=await s.preview('u',{...base,presetId:'preset-dem'});
 assert.equal(assembled.length,1);assert.equal(assembled[0].user,'u');assert.deepEqual(assembled[0].input.blocks.map(b=>b.id),['b1','b5','b6']);assert.equal(assembled[0].input.chatId,'chat-a');assert.equal(assembled[0].input.connectionId,'conn');assert.deepEqual(assembled[0].input.promptVariables,{b5:{tone:'gentle'}});
 assert.equal(p.messages[0].role,'system');assert.equal(p.messages[0].content,'LUMIVERSE PRESET INSTRUCTIONS — DEM\n\nWrite like 테스트 인물.\n\nKeep it gentle.');
 assert.equal(p.messages.length,3);assert.ok(!JSON.stringify(p.messages).includes('MUST NOT LEAK'));assert.ok(!JSON.stringify(p.messages).includes('disabled text'));
 assert.deepEqual(p.preset,{id:'preset-dem',name:'DEM'});
 assert.ok(p.excluded.includes('프리셋 marker 블록: Chat History, World Info'));assert.ok(p.excluded.includes('프리셋 비활성 블록 1개'));assert.ok(p.excluded.includes('프리셋 조건으로 빠진 블록: Impersonate only'));assert.ok(!p.excluded.some(x=>x.startsWith('본편 preset')));
 await s.run('u',{previewId:p.id,requestId:'r1'});assert.equal(raw[0].messages[0].content,p.messages[0].content);s.dispose();
});

test('no preset keeps the previous prompt shape',async()=>{
 const {s,assembled}=setup();const p=await s.preview('u',{...base,presetId:''});assert.equal(assembled.length,0);assert.equal(p.messages.length,2);assert.equal(p.preset,null);assert.ok(p.excluded[0].startsWith('본편 preset'));s.dispose();
});

test('preset text counts against the token budget',async()=>{
 const {f,s}=setup();f.api.tokens.countMessages=async m=>({total_tokens:JSON.stringify(m).length});
 const plain=await s.preview('u',{...base});const budget=plain.count.total_tokens+20;
 await assert.rejects(s.preview('u',{...base,presetId:'preset-dem',budget}),/fixed context exceeds budget/);s.dispose();
});

test('missing preset, failed host assembly and presets with nothing to include',async()=>{
 const {f,s,assembled}=setup();await assert.rejects(s.preview('u',{...base,presetId:'preset-gone'}),/preset missing/);
 f.api.assemble=async()=>{throw Error('assembly failed');};await assert.rejects(s.preview('u',{...base,presetId:'preset-dem'}),/assembly failed/);
 f.api.presets.get=async()=>({id:'preset-empty',name:'EMPTY',prompt_order:[{id:'m',name:'Chat History',marker:'chat_history',enabled:true,content:''}]});
 const p=await s.preview('u',{...base,presetId:'preset-empty'});assert.equal(assembled.length,0);assert.equal(p.messages.length,2);assert.ok(p.excluded.includes('프리셋에서 포함할 블록 없음'));s.dispose();
});
