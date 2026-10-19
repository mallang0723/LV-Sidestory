import {test} from 'node:test';import assert from 'node:assert/strict';
import {createService} from '../src/service.js';import {fake} from './fake.js';
const input={mode:'story',connectionId:'conn',request:'test',dialogue:{mode:'range',start:'0',end:'1'},includeCharacter:true,budget:8000};
test('preview -> generate -> user storage, durable idempotency and repair',async()=>{
 const f=fake(),s=createService(f.api);const p=await s.preview('u',input);assert.ok(p.excluded.includes('원문 범위의 숨김·시스템 대화 1개 제외'));assert.match(JSON.stringify(p.messages),/synthetic hello/);assert.doesNotMatch(JSON.stringify(p.messages),/secret hidden/);
 f.setFail(true);const a=await s.run('u',{previewId:p.id,requestId:'r1'});assert.equal(a.indexPending,true);
 f.setFail(false);const b=await s.run('u',{previewId:p.id,requestId:'r1'});assert.equal(a.id,b.id);assert.equal(f.calls,1);
 assert.equal((await s.list('u')).length,1);assert.equal((await s.list('other')).length,0);s.dispose();
});
test('late response after chat switch/cancel/revoke/disable never saves',async()=>{
 for(const reason of ['switch','cancel','revoke','disable']){
 const f=fake(),s=createService(f.api);let release;f.api.generate.raw=()=>new Promise(r=>release=r);
 const p=await s.preview('u',input);const running=s.run('u',{previewId:p.id,requestId:'late'});
 while(!release)await new Promise(r=>setTimeout(r,0));
 if(reason==='switch')f.setChat('b');else if(reason==='revoke')f.events.get('permission')({granted:false});else if(reason==='disable')s.dispose();else s.cancel('u');
 release({content:'stale'});await assert.rejects(running,/stale|cancel/);assert.equal([...f.data.keys()].filter(k=>k.includes(':records/')).length,0);s.dispose();}
});
test('concurrent duplicate generation serializes; edit revision conflict rejects',async()=>{
 const f=fake(),s=createService(f.api),p=await s.preview('u',input);
 const [a,b]=await Promise.all([s.run('u',{previewId:p.id,requestId:'same'}),s.run('u',{previewId:p.id,requestId:'same'})]);assert.equal(a.id,b.id);assert.equal(f.calls,1);
 await assert.rejects(s.edit('u',a.id,99,'bad'),/revision/);const c=await s.edit('u',a.id,1,'child');assert.equal(c.parentId,a.id);assert.equal((await s.list('u')).length,2);s.dispose();
});
test('failed record write rejects and does not create index',async()=>{
 const f=fake(),s=createService(f.api),p=await s.preview('u',input);f.api.userStorage.setJson=async()=>{throw Error('disk');};
 await assert.rejects(s.run('u',{previewId:p.id,requestId:'fail'}),/disk/);assert.equal(f.data.size,0);s.dispose();
});
