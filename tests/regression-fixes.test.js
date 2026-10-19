import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../src/service.js';
import {fake} from './fake.js';
import {validateImport} from '../src/core.js';
const input={mode:'story',request:'synthetic',dialogue:{mode:'recent',count:1},connectionId:'conn',budget:8000};
test('host relative list retains saved archive and index rows',async()=>{
 const f=fake();
 const s=createService(f.api),p=await s.preview('u',input),r=await s.run('u',{previewId:p.id,requestId:'storage'});
 assert.deepEqual((await s.list('u')).map(x=>x.id),[r.id]);
 assert.equal(f.data.get('u:index.json')[0].id,r.id);s.dispose();
});
test('cancel during last active-chat check never invokes model',async()=>{
 const f=fake(),s=createService(f.api),p=await s.preview('u',input),get=f.api.chats.getActive;let checks=0;
 f.api.chats.getActive=async(...args)=>{const chat=await get(...args);if(++checks===2)s.cancel('u');return chat;};
 await assert.rejects(s.run('u',{previewId:p.id,requestId:'cancel'}),/stale|cancel/);
 assert.equal(f.calls,0);s.dispose();
});
test('one durable start and awaited final validation prevent cancellation race',async()=>{
 const f=fake(),s=createService(f.api),p=await s.preview('u',input),write=f.api.userStorage.setJson;let starts=0;
 f.api.userStorage.setJson=async(k,v,o)=>{await write(k,v,o);if(v.state==='started'&&++starts===2)s.cancel('u');};
 try{await s.run('u',{previewId:p.id,requestId:'once'});}catch(e){assert.match(e.message,/stale|cancel/);}
 assert.equal(starts,1);assert.equal(f.calls,1);s.dispose();
});
test('schema import validates tags and recomputes translation using safe source segments',()=>{
 const backup=r=>JSON.stringify({schema:1,records:[{id:'a',mode:'story',content:'A\n\nB',...r}]});
 assert.throws(()=>validateImport(backup({tags:42})),/tags/);
 const [r]=validateImport(backup({tags:['tag'],arbitrary:'drop',translation:{complete:true,segments:[{id:'forged',text:'fake'}]}}));
 assert.equal(r.arbitrary,undefined);assert.equal(r.translation.complete,false);assert.deepEqual(r.translation.missing,['s0','s1']);
 const [html]=validateImport(backup({mode:'html',content:'<p>A &amp; B</p>',translation:{complete:true,segments:[{id:'s0',text:'안녕'}]}}));
 assert.equal(html.translation.complete,true);
 assert.throws(()=>validateImport(backup({translation:{segments:[{id:'s0',text:'<script>x</script>'}]}})),/plain text/);
});
test('cancelled completed journal cannot recover generation or translation after restart',async()=>{
 for(const translation of [false,true]){const f=fake();let s=createService(f.api);const write=f.api.userStorage.setJson;
 if(translation){f.data.set('u:records/a.json',{id:'a',mode:'story',content:'A',revision:1});f.api.generate.raw=async()=>({content:'{"items":[{"id":"s0","text":"B"}]}'});}
 const p=translation?await s.translationPreview('u',{id:'a',revision:1,connectionId:'conn',language:'ko'}):await s.preview('u',input);
 f.api.userStorage.setJson=async(k,v,o)=>{await write(k,v,o);if(v.state==='complete')s.cancel('u');};
 const args={previewId:p.id,requestId:'restart'},run=()=>translation?s.translationRun('u',args):s.run('u',args);
 await assert.rejects(run(),/stale|cancel/);s.dispose();s=createService(f.api);
 await assert.rejects(run(),/cancel|ambiguous/);
 assert.equal(translation?f.data.get('u:records/a.json').revision:(await s.list('u')).length,translation?1:0);s.dispose();
 }
});
test('failed cancellation marker cannot resurrect completed result after restart',async()=>{
 for(const translation of [false,true]){const f=fake();let s=createService(f.api);const write=f.api.userStorage.setJson;
 if(translation){f.data.set('u:records/a.json',{id:'a',mode:'story',content:'A',revision:1});f.api.generate.raw=async()=>({content:'{"items":[{"id":"s0","text":"B"}]}'});}
 const p=translation?await s.translationPreview('u',{id:'a',revision:1,connectionId:'conn',language:'ko'}):await s.preview('u',input);
 f.api.userStorage.setJson=async(k,v,o)=>{if(v.state==='cancelled')throw Error('cancel marker disk');await write(k,v,o);if(v.state==='complete')s.cancel('u');};
 const args={previewId:p.id,requestId:'marker-failed'},run=()=>translation?s.translationRun('u',args):s.run('u',args);
 await assert.rejects(run(),/cancel marker disk/);s.dispose();s=createService(f.api);
 await assert.rejects(run(),/ambiguous/);
 assert.equal(translation?f.data.get('u:records/a.json').revision:(await s.list('u')).length,translation?1:0);s.dispose();
 }
});
