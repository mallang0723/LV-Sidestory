import {test} from 'node:test';import assert from 'node:assert/strict';import {createService} from '../src/service.js';import {fake} from './fake.js';

// Lumiverse raw generation resolves provider/key/url from connection_id but sends
// the given model as-is (an empty model is rejected by the provider), so every
// raw call must carry the connection's model.
const capture=f=>{const calls=[];f.api.generate.raw=async x=>{calls.push(x);return {content:x.parameters.max_tokens===4096?'{"items":[{"id":"s0","text":"B"}]}':'synthetic result'};};return calls;};
const seed=f=>f.data.set('u:records/a.json',{id:'a',mode:'story',content:'A',revision:1});

test('story raw generation passes the connection model',async()=>{const f=fake(),s=createService(f.api),calls=capture(f);const p=await s.preview('u',{mode:'story',connectionId:'conn',request:'x'});assert.equal(p.model,'fixture');await s.run('u',{previewId:p.id,requestId:'r1'});assert.equal(calls.length,1);assert.equal(calls[0].type,'raw');assert.equal(calls[0].connection_id,'conn');assert.equal(calls[0].model,'fixture');s.dispose();});

test('translation raw generation passes the connection model',async()=>{const f=fake(),s=createService(f.api),calls=capture(f);seed(f);const p=await s.translationPreview('u',{id:'a',revision:1,connectionId:'conn',language:'ko'});assert.equal(p.model,'fixture');await s.translationRun('u',{previewId:p.id});assert.equal(calls.length,1);assert.equal(calls[0].connection_id,'conn');assert.equal(calls[0].model,'fixture');s.dispose();});

test('model is re-read from the connection at run time',async()=>{for(const translation of [false,true]){const f=fake(),s=createService(f.api),calls=capture(f);if(translation)seed(f);const p=translation?await s.translationPreview('u',{id:'a',revision:1,connectionId:'conn',language:'ko'}):await s.preview('u',{mode:'story',connectionId:'conn',request:'x'});f.api.connections.get=async()=>({id:'conn',model:'changed-model'});await(translation?s.translationRun('u',{previewId:p.id}):s.run('u',{previewId:p.id,requestId:'r1'}));assert.equal(calls[0].model,'changed-model');s.dispose();}});

test('missing connection or model at run time fails before the request journal and generation',async()=>{for(const translation of [false,true])for(const gone of [null,{id:'conn',model:''}]){const f=fake(),s=createService(f.api),calls=capture(f);if(translation)seed(f);const p=translation?await s.translationPreview('u',{id:'a',revision:1,connectionId:'conn',language:'ko'}):await s.preview('u',{mode:'story',connectionId:'conn',request:'x'});f.api.connections.get=async()=>gone;await assert.rejects(translation?s.translationRun('u',{previewId:p.id}):s.run('u',{previewId:p.id,requestId:'r1'}),/connection required/);assert.equal(calls.length,0);assert.equal([...f.data.keys()].some(k=>k.startsWith('u:requests/')),false);s.dispose();}});
