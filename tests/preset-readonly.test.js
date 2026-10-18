import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {createService} from '../src/service.js';import {fake} from './fake.js';

// The presets permission also grants write access on the host; the extension must only read.
test('extension source never calls preset write APIs',()=>{
 for(const dir of ['src','dist'])for(const file of readdirSync(new URL(`../${dir}/`,import.meta.url)).filter(f=>f.endsWith('.js')||f.endsWith('.ts'))){
  const code=readFileSync(new URL(`../${dir}/${file}`,import.meta.url),'utf8');
  assert.doesNotMatch(code,/presets\s*\.\s*(create|update|delete)\b/,`${dir}/${file}`);
  assert.doesNotMatch(code,/presets\s*\.\s*blocks\s*\.\s*(create|update|delete)\b/,`${dir}/${file}`);
  for(const m of code.matchAll(/presets\s*\.\s*([A-Za-z_$]+)/g))assert.ok(['list','get'].includes(m[1]),`${dir}/${file}: presets.${m[1]}`);
 }
});

test('manifest declares presets permission',()=>{const manifest=JSON.parse(readFileSync(new URL('../spindle.json',import.meta.url)));assert.ok(manifest.permissions.includes('presets'));});

test('catalog and preset preview only use presets.list and presets.get at runtime',async()=>{
 const f=fake(),used=[];const deny=name=>()=>{throw Error('write call: '+name);};
 const preset={id:'p1',name:'DEM',prompt_order:[{id:'b1',name:'Style',content:'x',role:'system',enabled:true,marker:null}],metadata:{}};
 f.api.presets=new Proxy({list:async()=>({data:[preset],total:1}),get:async()=>structuredClone(preset),create:deny('create'),update:deny('update'),delete:deny('delete'),blocks:new Proxy({},{get:(_,k)=>deny('blocks.'+String(k))})},{get:(t,k)=>{used.push(String(k));return t[k];}});
 f.api.assemble=async i=>({messages:[],breakdown:i.blocks.map(b=>({type:'block',blockId:b.id,content:b.content}))});
 const s=createService(f.api);await s.catalog('u');await s.preview('u',{mode:'story',connectionId:'conn',request:'x',presetId:'p1'});
 assert.deepEqual([...new Set(used)].sort(),['get','list']);s.dispose();
});
