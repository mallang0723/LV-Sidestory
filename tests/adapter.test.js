import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeSpindle} from './fake-spindle.js';
import {createService,allPages,CURRENT} from '../src/lumiverse/service.js';
import {shapeHostPrompt,locateHistory,fillNames} from '../src/lumiverse/assembly.js';
import {createRpc} from '../src/lumiverse/rpc.js';
import {createLumiverseHost} from '../src/lumiverse/host.js';
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

test('dry-run shaping: history limit, series anchor, exclusion and earlier parts',()=>{
 const api=createFakeSpindle();
 const source=[...api.messages.get('chat-1')];
 const dry={messages:[{role:'system',content:'P'},{role:'user',content:'폐허의 문이 열렸다. 에이든은 칼을 고쳐 쥐었다.'},{role:'system',content:'AN'},{role:'user',content:'누구세요? 여기서 뭘 하고 있었어요?'},{role:'assistant',content:'에이든은 잠시 망설이다가 대답했다. 길을 잃었을 뿐이야.'},{role:'system',content:'POST'}],
  breakdown:[{type:'block',content:'P'},{type:'chat_history',messageCount:3,firstMessageIndex:1},{type:'authors_note',content:'AN'},{type:'block',content:'POST'}]};
 const located=locateHistory(dry,source);
 assert.deepEqual(located.indices,[1,3,4]);assert.ok(located.reliable);
 const plain=shapeHostPrompt({dryRun:dry,source,quietPrompt:'<SIDESTORY>요청</SIDESTORY>'});
 assert.equal(plain.messages.length,7);assert.deepEqual(plain.messages.at(-1),{role:'user',content:'<SIDESTORY>요청</SIDESTORY>'});
 const limited=shapeHostPrompt({dryRun:dry,source,plan:{limit:1},quietPrompt:'Q'});
 assert.deepEqual(limited.messages.map(m=>m.content),['P','AN','에이든은 잠시 망설이다가 대답했다. 길을 잃었을 뿐이야.','POST','Q']);
 assert.deepEqual(limited.report,{before:3,after:1,anchor:null});
 // Anchor at message #1 (id chat-1-m1): later chat messages are not part of this series' canon.
 const anchored=shapeHostPrompt({dryRun:dry,source,plan:{anchor:{index:1,sendDate:'chat-1-m1',name:'유리'},append:[{role:'assistant',content:'1편 본문'}]},quietPrompt:'Q'});
 assert.deepEqual(anchored.messages.map(m=>m.content),['P','폐허의 문이 열렸다. 에이든은 칼을 고쳐 쥐었다.','AN','누구세요? 여기서 뭘 하고 있었어요?','1편 본문','POST','Q']);
 assert.equal(anchored.report.anchor,'applied');assert.equal(anchored.report.appended,1);
 const missing=shapeHostPrompt({dryRun:dry,source,plan:{anchor:{index:9,sendDate:'gone',name:''}},quietPrompt:'Q'});
 assert.equal(missing.report.anchor,'missing');assert.equal(missing.report.after,3);
 const excluded=shapeHostPrompt({dryRun:dry,source,plan:{exclude:true,append:[{role:'user',content:'U'}]},quietPrompt:'Q',auxiliaryTurns:[{role:'assistant',content:'A'},{role:'user',content:'B'}]});
 assert.deepEqual(excluded.messages.map(m=>m.content),['P','U','AN','POST','Q','A','B']);
});

test('selected-entries mode removes the host’s own world info rows',()=>{
 const dry={messages:[{role:'system',content:'P'},{role:'system',content:'WI-1'},{role:'system',content:'앞\nWI-2\n뒤'}],breakdown:[{type:'world_info',content:'WI-1'},{type:'world_info',content:'WI-2'},{type:'world_info',content:'없는 항목'}]};
 const r=shapeHostPrompt({dryRun:dry,source:[],quietPrompt:'Q',selectedLoreOnly:true});
 assert.deepEqual(r.messages.map(m=>m.content),['P','앞\n\n뒤','Q']);
 assert.deepEqual(r.meta.worldInfo,{stripped:2,unmatched:1});
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
