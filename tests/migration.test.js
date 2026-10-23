import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeSpindle} from './fake-spindle.js';
import {createService} from '../src/lumiverse/service.js';
import {migrateRecord,migrateRecords} from '../src/lumiverse/migrate.js';

const plan={schema:'sidestory-identity-v1',subjects:[{kind:'character',name:'에이든',gender:'남성',age:'20대',relative_age:'',alignment:'중립',background_context:'',hair:'검은색',eyes:'회색',height:'',build:'',design:'',temperament:['과묵함'],speech:'짧게 말함',interpersonal:[],sheet_layout:[]}],relationship:'',counterpart:null};
const old=[
 {id:'old-story',revision:3,schema:1,mode:'story',content:'# 제목 줄\n\n본문 첫 문단\n\n둘째 문단',host:{chatId:'chat-1',connectionId:'conn-1'},parentId:null,seriesId:null,createdAt:111,requestId:'r1',sourceVersion:'0.9.8',translation:{complete:true,segments:[{id:'s0',text:'# Title'},{id:'s1',text:'First'},{id:'s2',text:'Second'}]},favorite:true,tags:['외전']},
 {id:'old-edit',revision:1,schema:1,mode:'story',content:'고친 본문',host:{chatId:'chat-1'},parentId:'old-story',seriesId:'old-story',createdAt:222,requestId:null},
 {id:'old-identity',revision:2,schema:1,mode:'identity',content:JSON.stringify(plan),facetPlan:plan,identityApproved:true,host:{chatId:'chat-1'},createdAt:333,requestId:'r2'},
 {id:'old-au',revision:1,schema:1,mode:'au',content:'AU 프로필 본문',host:{chatId:'chat-1'},parentId:'old-identity',seriesId:'old-identity',createdAt:444,requestId:'r3'},
 {id:'old-html',revision:1,schema:1,mode:'html',content:'<h2>메모</h2><p>본문</p>',host:{chatId:'chat-2'},createdAt:555,requestId:'r4',translation:{complete:true,segments:[{id:'s0',text:'Memo'}]}},
 {id:'old-imported',revision:1,schema:1,mode:'story',content:'ST 본문',host:{chatId:'chat-1'},needsRemap:false,createdAt:666,upstreamArchive:{record:{id:'st-original',mode:'story',title:'ST 제목',content:'ST 본문',chatId:'["character:a.png","chat 1"]',createdAt:5,folderId:'f1',tags:['t'],action:'new',seriesId:null,parentId:null,status:'complete'},folders:[{id:'f1',name:'폴더'}]}},
 {broken:true},
];

test('0.1.x records become upstream archive records',()=>{
 const {records,failed}=migrateRecords(old,new Set(),{chatCharacters:c=>c==='chat-1'?[{id:'char-a',name:'에이든'}]:[{id:'char-b',name:'다른 인물'}],personas:[{id:'p-1',name:'유리'}]});
 assert.equal(failed,1);
 const by=Object.fromEntries(records.map(r=>[r.id,r]));
 const story=by['old-story'];
 assert.equal(story.mode,'story');assert.equal(story.chatId,'chat-1');assert.deepEqual(story.characterIds,['char-a']);
 assert.equal(story.title,'제목 줄');assert.equal(story.status,'complete');assert.equal(story.action,'new');assert.equal(story.favorite,true);assert.deepEqual(story.tags,['외전']);
 assert.equal(story.translationView.content,'# Title\n\nFirst\n\nSecond');
 assert.equal(story.lvLegacy.revision,3);assert.equal(story.migratedFrom,'lumiverse-0.1');
 assert.equal(by['old-edit'].action,'edit');assert.equal(by['old-edit'].parentId,'old-story');assert.equal(by['old-edit'].seriesId,null);
 const identity=by['old-identity'];
 assert.equal(identity.mode,'facet');assert.equal(identity.facetPhase,'plan');assert.deepEqual(identity.facetPlan,plan);
 assert.equal(identity.settings.facet.target,'character');assert.match(identity.title,/인물 추출 · 에이든/);assert.match(identity.content,/과묵함/);
 const au=by['old-au'];assert.equal(au.mode,'facet');assert.equal(au.facetPhase,'written');assert.equal(au.parentId,null);
 const html=by['old-html'];assert.equal(html.mode,'visual');assert.match(html.content,/^<!doctype html>/);assert.match(html.content,/<p>본문<\/p>/);
 assert.equal(html.translationView,undefined);assert.ok(html.lvLegacy.translation,'HTML translations are kept, not shown');
 const st=by['st-original'];assert.equal(st.title,'ST 제목');assert.equal(st.folderId,'f1');assert.equal(st.chatId,'chat-1');assert.equal(st.lvLegacy.id,'old-imported');
});

test('migration runs once, keeps the old files and skips records already in the archive',async()=>{
 const storage=Object.fromEntries(old.filter(r=>r.id).map(r=>['records/'+r.id+'.json',JSON.stringify(r)]));
 storage['archive/old-story.json']=JSON.stringify({id:'old-story',mode:'story',content:'이미 옮김',title:'x',createdAt:1});
 const api=createFakeSpindle({storage});const service=createService(api);
 const first=await service.handle('u1','archiveList',{});
 assert.equal(first.migration.found,6);assert.equal(first.migration.migrated,5);assert.equal(first.migration.skipped,1);
 assert.equal(first.records.length,6);
 assert.equal(first.records.find(r=>r.id==='old-story').content,'이미 옮김','existing archive record wins');
 for(const r of old.filter(r=>r.id))assert.ok(api.storage.has('records/'+r.id+'.json'),'old file kept: '+r.id);
 const second=await service.handle('u1','archiveList',{});
 assert.equal(second.records.length,6);assert.equal(second.migration.migrated,5,'marker reused');
 assert.ok(api.storage.has('migration-0.2.0.json'));
});

test('large archives come back in pages',async()=>{
 const storage={};for(let i=0;i<30;i++)storage[`archive/r${String(i).padStart(2,'0')}.json`]=JSON.stringify({id:'r'+i,mode:'story',content:'가'.repeat(150000),title:'t',createdAt:i});
 const service=createService(createFakeSpindle({storage}));
 let cursor=0,total=0,pages=0;do{const page=await service.handle('u1','archiveList',{cursor});total+=page.records.length;cursor=page.next;pages++;}while(cursor!=null);
 assert.equal(total,30);assert.ok(pages>1);
});

test('unknown input is ignored',()=>{assert.equal(migrateRecord(null),null);assert.equal(migrateRecord({id:'x'}),null);});

test('identity extractions keep the ids upstream looks them up by (group chat, persona by name)',()=>{
 const both={...plan,subjects:[plan.subjects[0],{...plan.subjects[0],kind:'user',name:'정수빈'}]};
 const group=[{id:'6f1d-1',name:'레온'},{id:'6f1d-2',name:'에이든'}];
 const {records}=migrateRecords([{id:'g-identity',schema:1,mode:'identity',content:'{}',facetPlan:both,host:{chatId:'group-chat'},createdAt:1,requestId:'r'}],new Set(),{chatCharacters:()=>group,personas:[{id:'9a8b',name:'정수빈'},{id:'x',name:'다른 사람'}]});
 const r=records[0];
 assert.deepEqual(r.characterIds,['6f1d-1','6f1d-2'],'whole group in chat order, like records upstream saves');
 assert.deepEqual(r.settings.personaIds,['persona:9a8b']);
 assert.equal(r.settings.facet.target,'both');
 const none=migrateRecords([{id:'p-only',schema:1,mode:'identity',content:'{}',facetPlan:{...plan,subjects:[{...plan.subjects[0],kind:'user',name:'모르는 이름'}]},host:{chatId:'c'},createdAt:1}],new Set(),{chatCharacters:()=>[],personas:[{id:'a',name:'유리'}]}).records[0];
 assert.deepEqual(none.settings.personaIds,[],'no guess when no persona has that name');
});

test('records migrated by earlier 0.2.0 builds are re-attached once',async()=>{
 const G='0c0c0c0c-4444-4f00-8000-00000000000a';
 const subjects=[{...plan.subjects[0],name:'아드리안 폰 아이젠베르크'},{...plan.subjects[0],kind:'user',name:'정수빈'}];
 const broken={id:'old-identity',mode:'facet',facetPhase:'plan',facetPlan:{...plan,subjects},chatId:G,characterIds:['6f1d2c3e-1111-4a7b-9c0d-000000000001'],settings:{mode:'facet',facet:{target:'both'},personaIds:[]},migratedFrom:'lumiverse-0.1',content:'x',title:'t',createdAt:1};
 const api=createFakeSpindle({storage:{'migration-0.2.0.json':JSON.stringify({migrated:1}),'archive/old-identity.json':JSON.stringify(broken)}});
 const service=createService(api);
 const page=await service.handle('u1','archiveList',{});
 const r=page.records.find(x=>x.id==='old-identity');
 assert.deepEqual(r.characterIds,['6f1d2c3e-2222-4a7b-9c0d-000000000002','6f1d2c3e-1111-4a7b-9c0d-000000000001']);
 assert.deepEqual(r.settings.personaIds,['persona:9a8b7c6d-3333-4e5f-8a9b-000000000003']);
 assert.ok(api.storage.has('repair-identity-sources-1.json'));
 const writes=api.storage.get('archive/old-identity.json');await service.handle('u1','archiveList',{});
 assert.equal(api.storage.get('archive/old-identity.json'),writes,'runs once');
});

// ---- review C2: an ST import edited in 0.1.x must survive as its own record
test('an ST import and its 0.1.x edit both survive, the edit attached to the import (review C2)',async()=>{
 const upstream={id:'st-original',mode:'story',title:'original',content:'ST ORIGINAL',status:'complete',createdAt:1,folderId:'f1',tags:['t']};
 const parent={id:'lv-import',mode:'story',content:'ST ORIGINAL',host:{chatId:'chat-1'},createdAt:2,requestId:null,upstreamArchive:{record:upstream}};
 const edit={...structuredClone(parent),id:'lv-edited',parentId:'lv-import',content:'USER EDIT MUST SURVIVE',requestId:null,createdAt:3};
 for(const order of [[parent,edit],[edit,parent]]){
  const storage=Object.fromEntries(order.map(r=>['records/'+r.id+'.json',JSON.stringify(r)]));
  const service=createService(createFakeSpindle({storage}));
  const page=await service.handle('u1','archiveList',{});
  assert.equal(page.migration.migrated,2);assert.equal(page.migration.skipped,0);
  const original=page.records.find(r=>r.content==='ST ORIGINAL'),edited=page.records.find(r=>r.content==='USER EDIT MUST SURVIVE');
  assert.equal(original.id,'st-original','the unedited import gets its upstream id back');
  assert.equal(edited.id,'lv-edited');assert.equal(edited.action,'edit');assert.equal(edited.parentId,'st-original');
  assert.equal(edited.folderId,'f1');assert.deepEqual(edited.tags,['t']);
 }
});

test('the same ST record imported twice in 0.1.x stays two records',()=>{
 const upstream={id:'st-x',mode:'story',title:'x',content:'SAME',status:'complete',createdAt:1};
 const a={id:'lv-a',mode:'story',content:'SAME',host:{},createdAt:2,upstreamArchive:{record:upstream}},b={...a,id:'lv-b',createdAt:3};
 const {records,skipped}=migrateRecords([a,b],[],{});
 assert.equal(skipped,0);assert.deepEqual(records.map(r=>r.id).sort(),['lv-b','st-x']);
});

// ---- review C3: no completion marker after a failed pass
test('a failed records/ listing is reported and retried, not recorded as an empty migration (review C3)',async()=>{
 const api=createFakeSpindle({storage:{'records/old.json':JSON.stringify({id:'old',mode:'story',content:'SURVIVE',host:{chatId:'chat-1'}})}});
 const list=api.userStorage.list;let fail=true;
 api.userStorage.list=async(prefix,...rest)=>{if(prefix==='records/'&&fail){fail=false;throw Error('synthetic transient list error');}return list(prefix,...rest);};
 const service=createService(api);
 const first=await service.handle('u1','archiveList',{});
 assert.match(first.migration.error,/synthetic/);assert.equal(first.records.length,0);assert.ok(!api.storage.has('migration-0.2.0.json'));
 const second=await service.handle('u1','archiveList',{});
 assert.equal(second.migration.migrated,1);assert.equal(second.records[0].content,'SURVIVE');assert.ok(api.storage.has('migration-0.2.0.json'));
 const third=await service.handle('u1','archiveList',{});assert.equal(third.migration.already,true);
});

test('a write failure halfway leaves no marker and the next pass finishes without duplicates',async()=>{
 const rows=['a','b','c'].map((id,i)=>({id:'old-'+id,mode:'story',content:'본문 '+id,host:{chatId:'chat-1'},createdAt:i}));
 const api=createFakeSpindle({storage:Object.fromEntries(rows.map(r=>['records/'+r.id+'.json',JSON.stringify(r)]))});
 const setJson=api.userStorage.setJson;let writes=0;
 api.userStorage.setJson=async(p,v,o)=>{if(p.startsWith('archive/')&&++writes===2)throw Error('synthetic write error');return setJson(p,v,o);};
 const service=createService(api);
 assert.match((await service.handle('u1','archiveList',{})).migration.error,/synthetic write/);
 assert.ok(!api.storage.has('migration-0.2.0.json'));
 const page=await service.handle('u1','archiveList',{});
 assert.equal(page.records.length,3);assert.equal(page.migration.migrated,2);assert.equal(page.migration.skipped,1);
});

test('the identity repair pass is retried when a lookup failed',async()=>{
 const broken={id:'old-identity',mode:'facet',facetPhase:'plan',facetPlan:{...plan,subjects:[{...plan.subjects[0],kind:'user',name:'정수빈'}]},chatId:'chat-1',characterIds:['char-a'],settings:{facet:{target:'user'},personaIds:[]},migratedFrom:'lumiverse-0.1',content:'x',title:'t',createdAt:1};
 const api=createFakeSpindle({storage:{'migration-0.2.0.json':'{}','archive/old-identity.json':JSON.stringify(broken)}});
 const listPersonas=api.personas.list;let fail=true;api.personas.list=async(...a)=>{if(fail){fail=false;throw Error('busy');}return listPersonas(...a);};
 const service=createService(api);
 await service.handle('u1','archiveList',{});assert.ok(!api.storage.has('repair-identity-sources-1.json'));
 const page=await service.handle('u1','archiveList',{});
 assert.deepEqual(page.records[0].settings.personaIds,['persona:9a8b7c6d-3333-4e5f-8a9b-000000000003']);assert.ok(api.storage.has('repair-identity-sources-1.json'));
});

// ---- review C2-R1: resuming after a failed pass keeps the edit attached to its (already moved, renamed) parent
const importedPair=()=>{
 const upstream={id:'st-original',mode:'story',title:'original',content:'ST ORIGINAL',status:'complete',createdAt:1};
 const parent={id:'lv-import',mode:'story',content:'ST ORIGINAL',host:{chatId:'chat-1'},createdAt:2,requestId:null,upstreamArchive:{record:upstream}};
 const edit={...structuredClone(parent),id:'lv-edited',parentId:'lv-import',content:'USER EDIT',requestId:null,createdAt:3};
 return {upstream,parent,edit};
};

test('an edit migrated after its parent was already moved under another id keeps parentId and action (review C2-R1)',()=>{
 const {parent,edit}=importedPair();
 const first=migrateRecords([parent],[],{});
 assert.equal(first.records[0].id,'st-original');
 const resumed=migrateRecords([parent,edit],first.records,{});
 assert.equal(resumed.skipped,1);assert.equal(resumed.records.length,1);
 assert.equal(resumed.records[0].id,'lv-edited');assert.equal(resumed.records[0].parentId,'st-original');assert.equal(resumed.records[0].action,'edit');
 // existing may also be plain ids (no lvLegacy): nothing to restore, the link is dropped as before
 assert.equal(migrateRecords([edit],new Set(['st-original']),{}).records[0].parentId,null);
});

test('a write failure on the edit after the parent was renamed, then a resume, keeps the edit attached (review C2-R1)',async()=>{
 const {parent,edit}=importedPair();
 const api=createFakeSpindle({storage:Object.fromEntries([parent,edit].map(r=>['records/'+r.id+'.json',JSON.stringify(r)]))});
 const setJson=api.userStorage.setJson;let writes=0;
 api.userStorage.setJson=async(p,v,o)=>{if(p.startsWith('archive/')&&++writes===2)throw Error('synthetic write error');return setJson(p,v,o);};
 const service=createService(api);
 assert.ok((await service.handle('u1','archiveList',{})).migration.retry);
 const page=await service.handle('u1','archiveList',{});
 assert.equal(page.records.length,2);
 const e=page.records.find(r=>r.id==='lv-edited');
 assert.equal(e.content,'USER EDIT');assert.equal(e.parentId,'st-original');assert.equal(e.action,'edit');
});

// ---- review C2-R2: an import collapsed by the first 0.2.0 build gets its edit back, once
const collapsedStorage=({winner='lv-import'}={})=>{
 const {parent,edit}=importedPair();
 const won=winner==='lv-import'?parent:edit;
 const storage=Object.fromEntries([parent,edit].map(r=>['records/'+r.id+'.json',JSON.stringify(r)]));
 // What the first 0.2.0 build left behind: one record under the upstream id (no lvLegacy.upstreamId), and a completion marker.
 storage['archive/st-original.json']=JSON.stringify({...structuredClone(parent.upstreamArchive.record),content:won.content,chatId:'chat-1',migratedFrom:'lumiverse-0.1',lvLegacy:{id:won.id,host:{chatId:'chat-1'},needsRemap:false,stChatId:''}});
 storage['migration-0.2.0.json']=JSON.stringify({version:'0.2.0',found:2,migrated:1,skipped:1,failed:0});
 return storage;
};

test('an edited import missing since the first 0.2.0 build is restored next to the original, once (review C2-R2)',async()=>{
 const storage=collapsedStorage();
 const api=createFakeSpindle({storage});const service=createService(api);
 const page=await service.handle('u1','archiveList',{});
 assert.equal(page.records.length,2);
 const original=page.records.find(r=>r.id==='st-original'),edited=page.records.find(r=>r.id==='lv-edited');
 assert.equal(original.content,'ST ORIGINAL');
 assert.equal(edited.content,'USER EDIT');assert.equal(edited.action,'edit');assert.equal(edited.parentId,'st-original');
 assert.ok(api.storage.has('repair-edited-imports-1.json'));
 // idempotent, and the user's own changes afterwards are not undone
 const kept=JSON.parse(api.storage.get('archive/st-original.json'));kept.content='EDITED LATER';kept.title='mine';api.storage.set('archive/st-original.json',JSON.stringify(kept));
 await service.handle('u1','archiveDelete',{ids:['lv-edited']});
 const again=await service.handle('u1','archiveList',{});
 assert.deepEqual(again.records.map(r=>r.id),['st-original']);assert.equal(again.records[0].content,'EDITED LATER','current archive content is never overwritten');
});

test('when the first 0.2.0 build kept the edit and dropped the original, the original comes back under its own id (review C2-R2)',async()=>{
 const api=createFakeSpindle({storage:collapsedStorage({winner:'lv-edited'})});
 const page=await createService(api).handle('u1','archiveList',{});
 assert.equal(page.records.length,2);
 assert.equal(page.records.find(r=>r.id==='st-original').content,'USER EDIT','the record already in the archive is untouched');
 const back=page.records.find(r=>r.id==='lv-import');
 assert.equal(back.content,'ST ORIGINAL');assert.equal(back.migratedFrom,'lumiverse-0.1');
});

test('records migrated by the fixed builds are not “restored” again after the user deletes them (review C2-R2)',async()=>{
 const {parent,edit}=importedPair();
 const api=createFakeSpindle({storage:Object.fromEntries([parent,edit].map(r=>['records/'+r.id+'.json',JSON.stringify(r)]))});
 const service=createService(api);
 assert.equal((await service.handle('u1','archiveList',{})).records.length,2);
 await service.handle('u1','archiveDelete',{ids:['lv-edited']});
 api.storage.delete('repair-edited-imports-1.json'); // even if the repair ran again, nothing marks this as collapsed
 assert.deepEqual((await service.handle('u1','archiveList',{})).records.map(r=>r.id),['st-original']);
});

test('the collapsed-import repair is retried after a read error and leaves no marker until it finished (review C2-R2)',async()=>{
 const api=createFakeSpindle({storage:collapsedStorage()});
 const list=api.userStorage.list;let fail=true;api.userStorage.list=async(prefix,...a)=>{if(prefix==='records/'&&fail){fail=false;throw Error('synthetic list error');}return list(prefix,...a);};
 const service=createService(api);
 assert.equal((await service.handle('u1','archiveList',{})).records.length,1);assert.ok(!api.storage.has('repair-edited-imports-1.json'));
 assert.equal((await service.handle('u1','archiveList',{})).records.length,2);assert.ok(api.storage.has('repair-edited-imports-1.json'));
});
