import {test} from 'node:test';import assert from 'node:assert/strict';
import {createService} from '../src/service.js';import {inspectDialogue,resolveDialogue,countDialogue,DIALOGUE_MAX} from '../src/core.js';import {fake} from './fake.js';

const counted=f=>{const box={n:0};const get=f.api.chat.getMessages;f.api.chat.getMessages=async(...a)=>{box.n++;return get(...a);};return box;};
const msg=(n,role='user',extra={})=>({id:'m'+n,index_in_chat:n,role,content:'line '+n,extra});
const base={mode:'story',connectionId:'conn',request:'x',budget:8000};

test('catalog makes zero getMessages calls and returns no message bodies',async()=>{
 const f=fake(),calls=counted(f);f.api.chats.getActive=async()=>({id:'chat-a',name:'합성 채팅',character_id:'char-a',metadata:{loom_summary:'요약'}});
 const s=createService(f.api);const c=await s.catalog('u');
 assert.equal(calls.n,0);assert.equal('messages' in c,false);assert.deepEqual(c.chat,{id:'chat-a',name:'합성 채팅'});
 const json=JSON.stringify(c);assert.doesNotMatch(json,/synthetic hello|secret hidden/);assert.equal(c.hasLoomSummary,true);s.dispose();
});

test('raw dialogue is off by default: preview without a selection never reads messages',async()=>{
 const f=fake(),calls=counted(f);f.api.chats.getActive=async()=>({id:'chat-a',character_id:'char-a',metadata:{loom_summary:'루미버스 줄거리'}});
 const s=createService(f.api);const p=await s.preview('u',{...base,includeLoomSummary:true});
 assert.equal(calls.n,0);assert.equal(p.dialogueSource,null);assert.match(p.messages.at(-1).content,/"dialogue": \[\]/);assert.match(p.messages.at(-1).content,/루미버스 줄거리/);s.dispose();
});

test('messageCount returns counts only',async()=>{
 const f=fake(),s=createService(f.api);const c=await s.messageCount('u');
 assert.deepEqual(c,{chatId:'chat-a',total:2,hidden:1});assert.doesNotMatch(JSON.stringify(c),/synthetic|secret/);s.dispose();
});

test('numeric selection validation mirrors Marinara errors',()=>{
 const t={total:10};
 assert.match(inspectDialogue(null,t).error,/방식/);
 assert.match(inspectDialogue({mode:'recent',count:''},t).error,/적어 주세요/);
 for(const v of ['0','-1','1.5','abc',' '])assert.ok(inspectDialogue({mode:'recent',count:v},t).error,v);
 assert.match(inspectDialogue({mode:'recent',count:String(DIALOGUE_MAX+1)},t).error,/500개까지/);
 assert.deepEqual(inspectDialogue({mode:'recent',count:' 3 '},t),{error:null,mode:'recent',count:3,size:3,label:'최근 대화 3개'});
 assert.match(inspectDialogue({mode:'range',start:'1',end:''},t).error,/모두/);
 assert.match(inspectDialogue({mode:'range',start:'-2',end:'3'},t).error,/0 이상/);
 assert.match(inspectDialogue({mode:'range',start:'2',end:'10'},t).error,/#0–#9/);
 const swapped=inspectDialogue({mode:'range',start:'7',end:'2'},t);assert.deepEqual([swapped.start,swapped.end,swapped.size,swapped.label],[2,7,6,'#2–#7 (6개)']);
 assert.match(inspectDialogue({mode:'range',start:'0',end:'500'},{total:1000}).error,/500개까지/);
 assert.equal(inspectDialogue({mode:'range',start:'0',end:'499'},{total:1000}).error,null);
 assert.match(inspectDialogue({mode:'recent',count:'1'},{total:0}).error,/대화가 없습니다/);
});

test('numeric selection resolves by chat numbers, skips hidden/system, oldest first',()=>{
 const all=[msg(0,'assistant'),msg(1),msg(2,'assistant',{hidden:true}),msg(3,'system'),msg(4),msg(5,'assistant')];
 assert.deepEqual(countDialogue(all),{total:6,hidden:2});
 let r=resolveDialogue(all,{mode:'recent',count:'3'});assert.deepEqual(r.dialogue.map(x=>x.id),['m1','m4','m5']);assert.deepEqual(r.notes,[]);assert.equal(r.source.included,3);
 r=resolveDialogue(all,{mode:'range',start:'4',end:'1'});assert.deepEqual(r.dialogue.map(x=>x.id),['m1','m4']);assert.deepEqual(r.notes,['원문 범위의 숨김·시스템 대화 2개 제외']);
 r=resolveDialogue(all,{mode:'recent',count:'9'});assert.equal(r.dialogue.length,4);assert.match(r.notes[0],/최근 9개를 골랐지만 넣을 수 있는 대화는 4개/);
 assert.deepEqual(Object.keys(r.dialogue[0]).sort(),['content','id','role']);
 // Numbers follow the host's index_in_chat, not array position.
 const shifted=[msg(10),msg(11,'assistant'),msg(12)];r=resolveDialogue(shifted,{mode:'range',start:'11',end:'12'});assert.deepEqual(r.dialogue.map(x=>x.id),['m11','m12']);
 assert.throws(()=>resolveDialogue(all,{mode:'range',start:'0',end:'6'}),/#0–#5/);
});

test('preview re-validates the selection against the chat as it is now',async()=>{
 const f=fake(),s=createService(f.api);const c=await s.messageCount('u');assert.equal(c.total,2);
 f.api.chat.getMessages=async()=>[{id:'m1',role:'user',content:'only one',extra:{}}];
 await assert.rejects(s.preview('u',{...base,dialogue:{mode:'range',start:'0',end:'1'}}),/#0–#0/);
 await assert.rejects(s.preview('u',{...base,dialogue:{mode:'recent',count:'x'}}),/숫자/);
 const p=await s.preview('u',{...base,dialogue:{mode:'range',start:'0',end:'0'}});assert.deepEqual(p.dialogueSource,{mode:'range',start:0,end:0,size:1,label:'#0–#0 (1개)',included:1});s.dispose();
});

test('budget trims raw dialogue first (oldest first) and keeps the summary',async()=>{
 const f=fake(),s=createService(f.api);
 f.api.chats.getActive=async()=>({id:'chat-a',character_id:'char-a',metadata:{loom_summary:'KEEP-SUMMARY '.repeat(20)}});
 f.api.chat.getMessages=async()=>Array.from({length:12},(_,i)=>({id:'m'+i,index_in_chat:i,role:i%2?'assistant':'user',content:`turn-${i} `+'x'.repeat(200),extra:{}}));
 f.api.tokens.countMessages=async m=>({total_tokens:JSON.stringify(m).length});
 const input={...base,includeLoomSummary:true,dialogue:{mode:'recent',count:'12'}};
 const fixed=await s.preview('u',{...input,dialogue:null});const budget=fixed.count.total_tokens+700;
 const p=await s.preview('u',{...input,budget});const user=p.messages.at(-1).content;
 assert.match(user,/KEEP-SUMMARY/);assert.match(user,/turn-11 /);assert.doesNotMatch(user,/turn-0 /);
 const dropped=p.excluded.find(x=>x.startsWith('오래된 대화'));assert.ok(dropped,'dropped dialogue is reported');
 const kept=Number(/오래된 대화 (\d+)개/.exec(dropped)[1]);for(let i=0;i<12;i++)assert.equal(user.includes(`turn-${i} `),i>=kept,`turn-${i}`);
 assert.ok(p.count.total_tokens<=budget);
 await assert.rejects(s.preview('u',{...input,budget:fixed.count.total_tokens-1}),/fixed context exceeds budget/);s.dispose();
});
