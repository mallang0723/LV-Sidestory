// In-memory stand-in for the Spindle backend API (the parts Side Story uses), for node tests and the
// browser QA page. Paginated lists behave like Lumiverse (limit/offset/total). No network, no models.
export function createFakeSpindle(seed={}){
 const user=seed.user||'u1';
 const calls=[];const log=(name,args)=>calls.push({name,args});
 const pageOf=(rows,{limit=50,offset=0}={})=>({data:rows.slice(offset,offset+Math.min(limit,100)),total:rows.length});
 const characters=new Map((seed.characters||[{id:'char-a',name:'에이든',description:'조용한 검사',personality:'과묵함',scenario:'',first_mes:'',mes_example:'',image_id:'img1',world_book_ids:[],extensions:{world_book_ids:['book-char']}},{id:'6f1d2c3e-1111-4a7b-9c0d-000000000001',name:'아드리안 폰 아이젠베르크',description:'제국 기사단장',personality:'',scenario:'',first_mes:'',mes_example:'',image_id:null,world_book_ids:[],extensions:{}},{id:'6f1d2c3e-2222-4a7b-9c0d-000000000002',name:'레온',description:'견습 기사',personality:'',scenario:'',first_mes:'',mes_example:'',image_id:null,world_book_ids:[],extensions:{}}]).map(c=>[c.id,c]));
 const personas=new Map((seed.personas||[{id:'persona-1',name:'유리',description:'호기심 많은 기록자',image_id:null,attached_world_book_id:'book-persona'},{id:'9a8b7c6d-3333-4e5f-8a9b-000000000003',name:'정수빈',description:'기사단 서기',image_id:null,attached_world_book_id:null}]).map(p=>[p.id,p]));
 const chats=new Map((seed.chats||[{id:'chat-1',character_id:'char-a',name:'첫 채팅',metadata:{loom_summary:'두 사람은 폐허에서 만났다.',chat_world_book_ids:['book-chat']}},{id:'chat-2',character_id:'char-a',name:'두 번째 채팅',metadata:{}},{id:'0c0c0c0c-4444-4f00-8000-00000000000g'.replace('g','a'),character_id:'6f1d2c3e-1111-4a7b-9c0d-000000000001',name:'기사단 그룹',metadata:{group:true,character_ids:['6f1d2c3e-2222-4a7b-9c0d-000000000002','6f1d2c3e-1111-4a7b-9c0d-000000000001']}},{id:'0c0c0c0c-5555-4f00-8000-00000000000b',character_id:'6f1d2c3e-1111-4a7b-9c0d-000000000001',name:'아드리안 단독',metadata:{}}]).map(c=>[c.id,c]));
 const msg=(chat,i,is_user,content,extra={})=>({id:`${chat}-m${i}`,chat_id:chat,index_in_chat:i,is_user,name:is_user?'유리':'에이든',role:is_user?'user':'assistant',content,send_date:1700000000+i,swipe_id:0,swipes:[content],swipe_dates:[],extra,parent_message_id:null,branch_id:null,created_at:1700000000+i});
 const messages=new Map(Object.entries(seed.messages||{'chat-1':[msg('chat-1',0,false,'폐허의 문이 열렸다. 에이든은 칼을 고쳐 쥐었다.'),msg('chat-1',1,true,'누구세요? 여기서 뭘 하고 있었어요?'),msg('chat-1',2,false,'숨겨진 메시지',{hidden:true}),msg('chat-1',3,false,'에이든은 잠시 망설이다가 대답했다. 길을 잃었을 뿐이야.')],'chat-2':[msg('chat-2',0,false,'다른 채팅의 첫 메시지입니다. 아주 다른 장면.')],'0c0c0c0c-5555-4f00-8000-00000000000b':[msg('0c0c0c0c-5555-4f00-8000-00000000000b',0,false,'아드리안 혼자 있는 채팅입니다. 집무실은 조용했다.')],'0c0c0c0c-4444-4f00-8000-00000000000a':[msg('0c0c0c0c-4444-4f00-8000-00000000000a',0,false,'아드리안은 서류를 내려놓았다. 정수빈이 들어왔다.'),msg('0c0c0c0c-4444-4f00-8000-00000000000a',1,true,'단장님, 보고서 가져왔어요.')]}));
 const books=seed.books||Array.from({length:130},(_,i)=>({id:i===0?'book-char':i===1?'book-chat':i===2?'book-persona':`book-${i}`,name:i<3?['캐릭터 로어','채팅 로어','페르소나 로어'][i]:`로어북 ${i}`,description:'',metadata:{},created_at:0,updated_at:0}));
 const entries=seed.entries||{'book-char':Array.from({length:45},(_,i)=>({id:`entry-${i}`,world_book_id:'book-char',uid:String(i),key:[`열쇠${i}`],keysecondary:[],content:`항목 ${i} 내용`,comment:`항목 ${i}`,constant:i===0,selective:false,selective_logic:0,disabled:i===44,case_sensitive:false}))};
 const connections=seed.connections||[{id:'conn-1',name:'메인 연결',provider:'openai',api_url:'',model:'model-main',preset_id:null,is_default:true,has_api_key:true,metadata:{}},{id:'conn-2',name:'번역 연결',provider:'anthropic',api_url:'',model:'model-two',preset_id:null,is_default:false,has_api_key:true,metadata:{}}];
 const storage=new Map(Object.entries(seed.storage||{}));
 const frontendHandlers=new Set();const sent=[];
 // Shaped like Lumiverse 1.2.5: messages are role/content only, and the breakdown has every block except
 // chat_history (generate.service.ts omitChatHistoryBreakdownEntries). Consecutive user turns are merged.
 const dryRun=seed.dryRun||(input=>{
  const hist=[];for(const m of (messages.get(input.chatId)||[]).filter(m=>m.extra?.hidden!==true)){const last=hist.at(-1);if(last&&m.is_user&&last.role==='user')last.content+='\n\n'+m.content;else hist.push({role:m.is_user?'user':'assistant',content:m.content});}
  const msgs=[{role:'system',content:'프리셋 시스템 지시'},{role:'system',content:'세계관 항목: 폐허의 도시'}];
  hist.forEach((m,i)=>{msgs.push(m);if(i===0)msgs.push({role:'system',content:'작가 노트: 긴장감'});});
  msgs.push({role:'system',content:'마지막 지시'});
  return {messages:msgs,breakdown:[{type:'block',name:'Main',content:'프리셋 시스템 지시'},{type:'world_info',name:'WI Before',role:'system',content:'세계관 항목: 폐허의 도시'},{type:'authors_note',name:"Author's Note",content:'작가 노트: 긴장감'},{type:'block',name:'Post',content:'마지막 지시'}],parameters:{temperature:0.8,max_tokens:300,stream:true},model:'model-main',provider:'openai',contextClipStats:{enabled:true,messagesDropped:0}};
 });
 const api={
  calls,sent,storage,messages,
  onFrontendMessage(fn){frontendHandlers.add(fn);return()=>frontendHandlers.delete(fn);},
  sendToFrontend(payload,u,opts){sent.push({payload,u,opts});seed.onSend?.(payload);},
  async deliver(payload,u=user){for(const fn of frontendHandlers)await fn(payload,u,'session-1');},
  permissions:{onChanged:()=>()=>{}},
  chats:{async get(id,u){log('chats.get',{id,u});return u===user&&chats.has(id)?structuredClone(chats.get(id)):null;},async getActive(){return structuredClone(chats.get('chat-1'));}},
  chat:{async getMessages(id){log('chat.getMessages',{id});return structuredClone(messages.get(id)||[]);},async appendMessage(id,message,options){log('chat.appendMessage',{id,message,options});const list=messages.get(id)||[];const m=msg(id,list.length,message.role==='user',message.content,{spindle_role:message.role});list.push(m);messages.set(id,list);return {id:m.id};}},
  characters:{async get(id,u){log('characters.get',{id,u});return characters.has(id)?structuredClone(characters.get(id)):null;},async create(input,u){log('characters.create',{input,u});const c={id:'char-new-'+characters.size,...input};characters.set(c.id,c);return c;}},
  personas:{async list(o={}){return pageOf([...personas.values()],o);},async get(id){return personas.has(id)?structuredClone(personas.get(id)):null;},async getActive(){return structuredClone(personas.get(seed.activePersona||'persona-1'));},async create(input,u){log('personas.create',{input,u});const p={id:'persona-new-'+personas.size,...input};personas.set(p.id,p);return p;}},
  world_books:{async list(o={}){log('world_books.list',o);return pageOf(books,o);},async get(id){return books.find(b=>b.id===id)||null;},async getGlobal(){return ['book-5'];},entries:{async list(bookId,o={}){log('world_books.entries.list',{bookId,...o});return pageOf(entries[bookId]||[],o);}}},
  connections:{async list(){return structuredClone(connections);},async get(id){return structuredClone(connections.find(c=>c.id===id)||null);}},
  tokens:{async countText(text,o){log('tokens.countText',{length:text.length,model:o?.model});return {total_tokens:Math.ceil(text.length/2),model:o?.model||'',modelSource:'explicit',tokenizer_id:'fake',tokenizer_name:'fake-tokenizer',approximate:false};}},
  generate:{
   async dryRun(input,u){log('generate.dryRun',{input,u});return structuredClone(dryRun(input));},
   async raw(input){log('generate.raw',{...input,signal:undefined});if(seed.rawDelay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,seed.rawDelay);input.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(Object.assign(Error('AbortError: Generation aborted'),{name:'AbortError'}));});});return {content:seed.rawText?seed.rawText(input):'# 결과\n\n생성된 이야기 본문입니다.\n\n두 번째 문단.',finish_reason:'stop'};},
  },
  userStorage:{
   async getJson(p,o={}){const v=storage.get(p);return v===undefined?(o.fallback??null):JSON.parse(v);},
   async setJson(p,v){storage.set(p,JSON.stringify(v));},
   async list(prefix=''){return [...storage.keys()].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));},
   async delete(p){storage.delete(p);},
  },
 };
 return api;
}
