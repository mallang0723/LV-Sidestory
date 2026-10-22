import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeSpindle} from './fake-spindle.js';
import {createService,allPages,CURRENT} from '../src/lumiverse/service.js';
import {shapeHostPrompt,locateHistory,fillNames,HISTORY_BLOCKED} from '../src/lumiverse/assembly.js';
import {createRpc} from '../src/lumiverse/rpc.js';
import {createLumiverseHost} from '../src/lumiverse/host.js';
import {uuid} from '../src/lumiverse/ids.js';
import {install} from '../src/backend.js';

const U='u1';
/** Frontend ctx wired to the fake backend through the real backend entry (src/backend.js). */
function wire(seed={}){
 let frontend=null;
 const api=createFakeSpindle({...seed,onSend:p=>queueMicrotask(()=>frontend?.(p))});
 const dispose=install(api);
 const state={'chat.active':{chatId:'chat-1'},'persona.activeId':'persona-1','connections.active':{activeProfileId:'conn-1'},'ui.drawer':{open:false,tabId:'x'}};
 const subs=new Map(),events=new Map();
 const ctx={
  onBackendMessage(fn){frontend=fn;return()=>{frontend=null;};},
  sendToBackend(m){queueMicrotask(()=>api.deliver(m));},
  state:{get:k=>state[k],subscribe(k,fn){subs.set(k,fn);return()=>subs.delete(k);}},
  events:{on(e,fn){events.set(e,fn);return()=>events.delete(e);}},
 };
 const setState=(k,v)=>{state[k]=v;subs.get(k)?.(v);};
 return {api,ctx,setState,dispose};
}
function fakeDocument(){
 const el=()=>({style:{},hidden:false,textContent:'',classList:{add(){}},append(){},insertBefore(){},remove(){},setAttribute(){}});
 return {createElement:el};
}
function makeHost(w){
 const rpc=createRpc(w.ctx,{timeout:5000});
 const tab={root:{style:{},classList:{add(){}},append(){},insertBefore(){},clientWidth:420},tabId:'tab-1',onActivate:()=>()=>{}};
 return {rpc,host:createLumiverseHost({ctx:w.ctx,rpc,tab,document:fakeDocument(),realIndexedDB:null})};
}

test('paginated host lists are read to the end',async()=>{
 const api=createFakeSpindle();
 const books=await allPages(o=>api.world_books.list({...o,userId:U}));
 assert.equal(books.length,130);
 const service=createService(api);
 const rows=await service.handle(U,'lorebooks',{chatId:'chat-1',personaId:'persona-1'});
 assert.equal(rows.length,130);
 // Linked books: character, persona, chat and global books are marked like ST's connected books.
 assert.deepEqual(rows.filter(b=>b.isGlobal).map(b=>b.id).sort(),['book-5','book-char','book-chat','book-persona']);
 const entries=await service.handle(U,'entries',{bookId:'book-char'});
 assert.equal(entries.length,45);
 assert.equal(entries[44].enabled,false);
 assert.deepEqual(entries[3].key,['열쇠3']);
 const pages=api.calls.filter(c=>c.name==='world_books.entries.list').map(c=>c.args.offset);
 assert.deepEqual(pages,[0]);
});

test('chat view follows upstream st-host shape and refuses other users’ chats',async()=>{
 const service=createService(createFakeSpindle());
 const chat=await service.handle(U,'chat',{chatId:'chat-1',personaId:'persona-1'});
 assert.equal(chat.connectionId,CURRENT);
 assert.deepEqual(chat.characterIds,['char-a']);
 assert.equal(chat.personaId,'persona-1');
 assert.equal(chat.metadata.summary,'두 사람은 폐허에서 만났다.');
 assert.ok(chat.metadata.activeLorebookIds.includes('book-chat'));
 await assert.rejects(service.handle('someone-else','chat',{chatId:'chat-1'}),/채팅을 찾지 못했어요/);
 const msgs=await service.handle(U,'messages',{chatId:'chat-1'});
 assert.deepEqual(msgs.map(m=>m.id),['0','1','2','3']);
 assert.equal(msgs[2].extra.hiddenFromAI,true);
 assert.equal(msgs[1].role,'user');
});

test('generation passes the connection model explicitly; host path keeps preset sampling',async()=>{
 const api=createFakeSpindle();const service=createService(api);
 const out=await service.handle(U,'generate',{runId:'run-1',chatId:'chat-1',activeProfileId:'conn-1',personaId:'persona-1',payload:{connectionId:CURRENT,useSillyTavernContext:true,quietPrompt:'<SIDESTORY>{{char}}와 {{user}}</SIDESTORY>',messages:[],parameters:{maxTokens:9000},history:{limit:null,anchor:null,exclude:false,append:null}}});
 const raw=api.calls.find(c=>c.name==='generate.raw').args;
 assert.equal(raw.model,'model-main');assert.equal(raw.connection_id,'conn-1');
 assert.deepEqual(raw.parameters,{temperature:0.8,max_tokens:9000});
 assert.deepEqual(raw.messages.at(-1),{role:'user',content:'<SIDESTORY>에이든와 유리</SIDESTORY>'});
 assert.equal(raw.messages[0].content,'프리셋 시스템 지시');
 assert.equal(out.text.startsWith('# 결과'),true);assert.equal(out.meta.historyMapping,'matched');
 assert.equal(api.calls.find(c=>c.name==='generate.dryRun').args.input.connectionId,'conn-1');
 // A named profile: upstream builds the messages itself; only the model has to be added.
 await service.handle(U,'generate',{runId:'run-2',chatId:'chat-1',payload:{connectionId:'conn-2',messages:[{role:'system',content:'S'},{role:'user',content:'U'}],parameters:{maxTokens:2000}}});
 const second=api.calls.filter(c=>c.name==='generate.raw')[1].args;
 assert.equal(second.model,'model-two');assert.equal(second.connection_id,'conn-2');assert.deepEqual(second.parameters,{max_tokens:2000});
 assert.equal(api.calls.filter(c=>c.name==='generate.dryRun').length,1);
});

test('abort reaches the running raw generation',async()=>{
 const api=createFakeSpindle({rawDelay:5000});const service=createService(api);
 const job=service.handle(U,'generate',{runId:'run-x',chatId:'chat-1',payload:{connectionId:'conn-1',messages:[{role:'user',content:'U'}],parameters:{maxTokens:100}}});
 await new Promise(r=>setTimeout(r,20));
 await service.handle(U,'abort',{runId:'run-x'});
 await assert.rejects(job,e=>/Abort/.test(e.name+e.message));
});

test('appending results and saving AU profiles go through Spindle APIs',async()=>{
 const api=createFakeSpindle();const service=createService(api);
 assert.equal(await service.handle(U,'append',{chatId:'chat-1',items:[{content:'1편',recordId:'r1'},{content:'2편',recordId:'r2'}]}),2);
 assert.deepEqual(api.messages.get('chat-1').slice(-2).map(m=>m.content),['1편','2편']);
 assert.equal(api.calls.find(c=>c.name==='chat.appendMessage').args.message.role,'assistant');
 await service.handle(U,'createCharacter',{name:'에이든 AU',description:'프로필'});
 await service.handle(U,'createPersona',{name:'유리 AU',description:'프로필'});
 assert.equal(api.calls.find(c=>c.name==='characters.create').args.input.name,'에이든 AU');
 assert.equal(api.calls.find(c=>c.name==='personas.create').args.input.description,'프로필');
});

test('host adapter: chat switch, message cache, anchors and request routes',async()=>{
 const w=wire();const {host,rpc}=makeHost(w);
 const changed=[];host.SillyTavern.getContext().eventSource.on('CHAT_CHANGED',id=>changed.push(id));
 const [chat]=await host.request('/chats');
 assert.equal(chat.id,'chat-1');
 assert.equal(host.SillyTavern.getContext().chat.length,4);
 assert.equal(host.SillyTavern.getContext().chat[2].is_system,true);
 const anchor=host.currentAnchor();
 assert.deepEqual(anchor,{index:3,sendDate:'chat-1-m3',name:'에이든'});
 assert.equal(host.resolveAnchor(anchor),3);
 assert.equal((await host.request('/lorebooks')).length,130);
 assert.equal((await host.request('/connections'))[0].name,'현재 루미버스 연결 · 메인 연결');
 await assert.rejects(host.request('/chats/chat-2/messages'),/참고 채팅이 바뀌었어요/);
 w.setState('chat.active',{chatId:'chat-2'});
 assert.deepEqual(changed,['chat-2']);
 assert.equal(host.SillyTavern.getContext().chat.length,0,'cache is dropped on chat switch');
 assert.equal(host.resolveAnchor(anchor),-1);
 assert.equal((await host.request('/chats/chat-2/messages')).length,1);
 assert.equal(host.SillyTavern.getContext().chat.length,1);
 assert.deepEqual(host.presetNames(),[]);
 await assert.rejects(host.createChatFromRecord({}),/새 채팅을 만드는 기능이 없어요/);
 host.cleanup();rpc.dispose();w.dispose();
});

test('host generate returns text and reports the final prompt; tokens use the host tokenizer',async()=>{
 const w=wire();const {host,rpc}=makeHost(w);
 let ready=null;
 const text=await host.generate({connectionId:CURRENT,useSillyTavernContext:true,quietPrompt:'<SIDESTORY>x</SIDESTORY>',messages:[],parameters:{maxTokens:1000},onPromptReady:i=>ready=i},new AbortController().signal);
 assert.match(text,/생성된 이야기/);
 assert.equal(ready.messages.at(-1).content,'<SIDESTORY>x</SIDESTORY>');
 assert.equal(ready.meta.model,'model-main');
 const counter=host.tokenCounter(CURRENT);
 assert.equal(await counter.text('가나다라'),2);
 assert.equal(await counter.messages([{content:'가나'},{content:'다라마바'}]),3+(1+8)+(2+8));
 assert.match(counter.info().label,/루미버스 토크나이저/);
 host.cleanup();rpc.dispose();w.dispose();
});

test('settings and archive round-trip through the IndexedDB stand-in',async()=>{
 const w=wire();const {host,rpc}=makeHost(w);
 await host.storage.patch({sideStory:{mode:'story',theme:'dark'}});
 assert.deepEqual((await host.storage.get()).sideStory,{mode:'story',theme:'dark'});
 const db=await new Promise((resolve,reject)=>{const q=host.indexedDB.open('st-sidestory-archive-v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const op=(type,value)=>new Promise((resolve,reject)=>{const tx=db.transaction('records',type==='all'?'readonly':'readwrite'),store=tx.objectStore('records');let result;const q=type==='all'?store.getAll():type==='delete'?store.delete(value):type==='batch'?null:store.put(value);if(type==='batch')for(const r of value)store.put(r);if(q)q.onsuccess=()=>result=q.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});
 await op('put',{id:'a',mode:'story',content:'A',title:'A',createdAt:1});
 await op('batch',[{id:'b',mode:'story',content:'B',title:'B',createdAt:2},{id:'weird id/한글',mode:'story',content:'C',title:'C',createdAt:3}]);
 assert.deepEqual((await op('all')).map(r=>r.id).sort(),['a','b','weird id/한글']);
 await op('delete','a');
 assert.deepEqual((await op('all')).map(r=>r.id).sort(),['b','weird id/한글']);
 host.cleanup();rpc.dispose();w.dispose();
});

test('{{char}}/{{user}} are filled only when names are known',()=>{
 assert.equal(fillNames('{{char}}·{{USER}}',{char:'A',user:'B'}),'A·B');
 assert.equal(fillNames('{{char}}',{}),'{{char}}');
});

test('optional preview assembles the prompt but never calls the model',async()=>{
 const w=wire();const {host,rpc}=makeHost(w);
 host.requestPreview();let ready=null;
 await assert.rejects(host.generate({connectionId:CURRENT,useSillyTavernContext:true,quietPrompt:'<SIDESTORY>p</SIDESTORY>',messages:[],parameters:{maxTokens:100},onPromptReady:i=>ready=i},new AbortController().signal),/미리보기만 만들었어요/);
 assert.equal(ready.messages.at(-1).content,'<SIDESTORY>p</SIDESTORY>');
 assert.equal(w.api.calls.filter(c=>c.name==='generate.raw').length,0);
 assert.equal(host.takePreviewShown(),true);
 // The next generation is a normal one again.
 await host.generate({connectionId:CURRENT,useSillyTavernContext:true,quietPrompt:'q',messages:[],parameters:{maxTokens:100}},new AbortController().signal);
 assert.equal(w.api.calls.filter(c=>c.name==='generate.raw').length,1);
 host.cleanup();rpc.dispose();w.dispose();
});

test('Lumiverse system messages stay system rows',async()=>{
 const api=createFakeSpindle();api.messages.get('chat-1').push({id:'sys',chat_id:'chat-1',index_in_chat:4,is_user:false,name:'System',role:'system',content:'시스템 안내',extra:{spindle_role:'system'}});
 const rows=await createService(api).handle(U,'messages',{chatId:'chat-1'});
 assert.equal(rows.at(-1).role,'system');assert.equal(rows.at(-1).system,true);
});


// ---- "현재 루미버스 연결" history shaping, on the host's real dryRun contract (no chat_history breakdown).
const turn=(i,is_user,content,extra={})=>({id:'m'+i,index_in_chat:i,is_user,role:is_user?'user':'assistant',content,extra});
const HOST=(rows,{dropped=0}={})=>({messages:rows,breakdown:[{type:'block',content:'P'},{type:'authors_note',content:'AN'}],contextClipStats:{enabled:true,messagesDropped:dropped}});

test('host contract: “본편 안 넣음” removes the chat although the breakdown has no chat_history (review C1)',()=>{
 const source=[turn(0,false,'안녕'),turn(1,true,'응'),turn(2,false,'반가워')];
 const dry={messages:[{role:'system',content:'P'},{role:'assistant',content:'안녕'},{role:'user',content:'응'},{role:'assistant',content:'반가워'}],breakdown:[{type:'block',content:'P'}]};
 const r=shapeHostPrompt({dryRun:dry,source,plan:{exclude:true},quietPrompt:'Q'});
 assert.equal(r.blocked,undefined);assert.deepEqual(r.messages.map(m=>m.content),['P','Q']);
 assert.deepEqual(r.report,{before:3,after:0,anchor:null});assert.equal(r.meta.historyMapping,'matched');assert.equal(r.meta.historyMessages,'3/3');
});

test('short chat after an unlisted injection: only the chat rows are removed (review C1 short-chat case)',()=>{
 const source=[turn(0,false,'안녕'),turn(1,true,'응')];
 const dry={messages:[{role:'system',content:'PREFIX KEEP'},{role:'system',content:'UNLISTED INJECTION KEEP'},{role:'assistant',content:'안녕'},{role:'user',content:'응'}],breakdown:[{type:'block',content:'PREFIX KEEP'}]};
 const r=shapeHostPrompt({dryRun:dry,source,plan:{exclude:true},quietPrompt:'Q'});
 assert.deepEqual(r.messages.map(m=>m.content),['PREFIX KEEP','UNLISTED INJECTION KEEP','Q']);
});

test('recent N, series anchor and earlier parts on the host contract (injections between turns, merged user turns)',()=>{
 const source=[turn(0,false,'폐허의 문이 열렸다.'),turn(1,true,'누구세요?'),turn(2,true,'거기 누구 있어요?'),turn(3,false,'길을 잃었을 뿐이야.'),turn(4,false,'숨김',{hidden:true})];
 const dry=HOST([{role:'system',content:'P'},{role:'assistant',content:'폐허의 문이 열렸다.'},{role:'system',content:'AN'},{role:'user',content:'누구세요?\n\n거기 누구 있어요?'},{role:'assistant',content:'길을 잃었을 뿐이야.'},{role:'system',content:'POST'}]);
 assert.deepEqual(locateHistory(dry,source).indices,[1,3,4]);
 const limited=shapeHostPrompt({dryRun:dry,source,plan:{limit:1},quietPrompt:'Q'});
 assert.deepEqual(limited.messages.map(m=>m.content),['P','AN','길을 잃었을 뿐이야.','POST','Q']);
 const anchored=shapeHostPrompt({dryRun:dry,source,plan:{anchor:{index:2,sendDate:'m2',name:''},append:[{role:'assistant',content:'1편 본문'}]},quietPrompt:'Q',auxiliaryTurns:[{role:'assistant',content:'A'},{role:'user',content:'B'}]});
 assert.equal(anchored.report.anchor,'applied');assert.equal(anchored.report.appended,1);
 assert.deepEqual(anchored.messages.map(m=>m.content),['P','폐허의 문이 열렸다.','AN','누구세요?\n\n거기 누구 있어요?','1편 본문','POST','Q','A','B']);
 const missing=shapeHostPrompt({dryRun:dry,source,plan:{anchor:{index:9,sendDate:'gone',name:''}},quietPrompt:'Q'});
 assert.equal(missing.report.anchor,'missing');assert.equal(missing.report.after,3);
});

test('history the context budget dropped still counts as verified; group name prefixes match',()=>{
 const source=[turn(0,false,'아주 오래된 첫 대사'),turn(1,true,'질문'),turn(2,false,'대답')];
 const dry=HOST([{role:'system',content:'P'},{role:'user',content:'질문'},{role:'assistant',content:'아드리안: 대답'}],{dropped:1});
 const r=shapeHostPrompt({dryRun:dry,source,plan:{exclude:true},quietPrompt:'Q'});
 assert.equal(r.meta.historyMapping,'matched');assert.deepEqual(r.messages.map(m=>m.content),['P','Q']);
});

test('unverifiable history fails closed for 안 넣음 / 최근 N, and is left alone for 전체 (review C1)',()=>{
 const source=[turn(0,false,'{{char}}가 웃었다.'),turn(1,true,'안녕')];
 // The host resolved the macro, so the first turn cannot be matched to the chat.
 const dry=HOST([{role:'system',content:'P'},{role:'assistant',content:'아드리안가 웃었다.'},{role:'user',content:'안녕'}]);
 const excluded=shapeHostPrompt({dryRun:dry,source,plan:{exclude:true},quietPrompt:'Q'});
 assert.equal(excluded.blocked,HISTORY_BLOCKED);assert.equal(excluded.meta.historyMapping,'unverified');
 assert.equal(shapeHostPrompt({dryRun:dry,source,plan:{limit:1},quietPrompt:'Q'}).blocked,HISTORY_BLOCKED);
 const all=shapeHostPrompt({dryRun:dry,source,plan:{limit:null,anchor:{index:0,sendDate:'m0',name:''}},quietPrompt:'Q'});
 assert.equal(all.blocked,undefined);assert.equal(all.report.anchor,'missing');assert.deepEqual(all.messages.map(m=>m.content),['P','아드리안가 웃었다.','안녕','Q']);
 assert.equal(shapeHostPrompt({dryRun:dry,source,plan:{limit:5},quietPrompt:'Q'}).blocked,undefined,'asking for more than there is changes nothing');
});

test('the service refuses to send when exclusion cannot be honoured',async()=>{
 const api=createFakeSpindle({dryRun:()=>({messages:[{role:'system',content:'P'},{role:'assistant',content:'바뀐 첫 메시지'},{role:'user',content:'바뀐 둘째'}],breakdown:[],contextClipStats:{enabled:false}})});
 const service=createService(api);
 await assert.rejects(service.handle(U,'generate',{runId:'r',chatId:'chat-1',payload:{connectionId:CURRENT,useSillyTavernContext:true,quietPrompt:'Q',messages:[],parameters:{maxTokens:100},history:{limit:null,anchor:null,exclude:true,append:null}}}),/본편 대화를 정확히 가려내지 못했어요/);
 assert.equal(api.calls.filter(c=>c.name==='generate.raw').length,0);
});

test('selected-entries mode removes the host’s own world info rows, preferring the world-info role and never chat rows',()=>{
 const dry={messages:[{role:'system',content:'P'},{role:'system',content:'WI-1'},{role:'system',content:'앞\nWI-2\n뒤'}],breakdown:[{type:'world_info',content:'WI-1'},{type:'world_info',content:'WI-2'},{type:'world_info',content:'없는 항목'}]};
 const r=shapeHostPrompt({dryRun:dry,source:[],quietPrompt:'Q',selectedLoreOnly:true});
 assert.deepEqual(r.messages.map(m=>m.content),['P','앞\n\n뒤','Q']);assert.deepEqual(r.meta.worldInfo,{stripped:2,unmatched:1});
 // Review repro: the same sentence as a user row and a system WI row.
 const dup=shapeHostPrompt({dryRun:{messages:[{role:'user',content:'SAME TEXT'},{role:'system',content:'SAME TEXT'}],breakdown:[{type:'world_info',role:'system',content:'SAME TEXT'}]},selectedLoreOnly:true});
 assert.deepEqual(dup.messages,[{role:'user',content:'SAME TEXT'}]);
 // A chat line identical to a WI entry stays when the history is verified.
 const chat=shapeHostPrompt({dryRun:{messages:[{role:'system',content:'SAME'},{role:'user',content:'SAME'}],breakdown:[{type:'world_info',content:'SAME'}]},source:[turn(0,true,'SAME')],selectedLoreOnly:true});
 assert.deepEqual(chat.messages,[{role:'user',content:'SAME'}]);
});

// Plain http on a non-localhost address (a phone reaching the PC over Tailscale) is not a secure context:
// crypto.randomUUID is missing there. Shadow the prototype method on the instance so it is really gone.
const V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function withoutWebCrypto(names,fn){
 const c=globalThis.crypto;
 for(const n of names)Object.defineProperty(c,n,{value:undefined,configurable:true,writable:true});
 try{for(const n of names)assert.notEqual(typeof c[n],'function',n+' still callable');return await fn();}
 finally{for(const n of names)delete c[n];}
}

test('insecure context: without crypto.randomUUID the rpc and host still make ids and work',async()=>{
 await withoutWebCrypto(['randomUUID'],async()=>{
  const w=wire();const sent=[];const send=w.ctx.sendToBackend;w.ctx.sendToBackend=m=>{sent.push(m);send(m);};
  const {host,rpc}=makeHost(w);
  const list=await rpc.call('connections',{activeProfileId:'conn-1'});
  assert.deepEqual(list.map(c=>c.id),[CURRENT,'conn-1','conn-2']);
  const text=await host.generate({connectionId:'conn-1',messages:[{role:'user',content:'U'}],parameters:{maxTokens:100}},new AbortController().signal);
  assert.match(text,/생성된 이야기/);
  const gen=sent.find(m=>m.op==='generate');
  assert.match(gen.args.runId,V4);
  for(const m of sent)assert.match(m.id,V4);
  assert.equal(new Set(sent.map(m=>m.id)).size,sent.length);
  host.cleanup();rpc.dispose();w.dispose();
 });
 assert.equal(typeof crypto.randomUUID,'function','restored');
});

test('id fallbacks: getRandomValues, then Math.random, both give RFC 4122 v4 strings',async()=>{
 await withoutWebCrypto(['randomUUID'],()=>{const ids=Array.from({length:200},uuid);for(const id of ids)assert.match(id,V4);assert.equal(new Set(ids).size,ids.length);});
 await withoutWebCrypto(['randomUUID','getRandomValues'],()=>{const ids=Array.from({length:200},uuid);for(const id of ids)assert.match(id,V4);assert.equal(new Set(ids).size,ids.length);});
 assert.match(uuid(),V4);
});
