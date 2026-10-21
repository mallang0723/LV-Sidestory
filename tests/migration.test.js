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
 assert.deepEqual(r.characterIds,['6f1d2c3e-1111-4a7b-9c0d-000000000001','6f1d2c3e-2222-4a7b-9c0d-000000000002']);
 assert.deepEqual(r.settings.personaIds,['persona:9a8b7c6d-3333-4e5f-8a9b-000000000003']);
 assert.ok(api.storage.has('repair-identity-sources-1.json'));
 const writes=api.storage.get('archive/old-identity.json');await service.handle('u1','archiveList',{});
 assert.equal(api.storage.get('archive/old-identity.json'),writes,'runs once');
});
