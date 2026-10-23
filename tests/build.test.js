import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildApp} from '../scripts/build-app.mjs';
import {PATCHES} from '../src/lumiverse/patches.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url));

test('upstream copy is byte-identical to the pinned upstream files listed in UPSTREAM.json',()=>{
 const meta=JSON.parse(read('UPSTREAM.json'));
 assert.equal(meta.sha,'727099430bb6725542656f1cd2b1adf1b3357f05');
 for(const f of meta.files){const data=read('upstream/'+f.path);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256,f.path);const blob=createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');assert.equal(blob,f.gitBlob,f.path);}
});

test('generated app is current and every patch anchor still matches',()=>{
 const code=buildApp();
 assert.equal(read('src/generated/side-story-app.js').toString(),code,'run npm run build');
 for(const p of PATCHES)assert.ok(code.includes(p.replace),`${p.file}: ${p.replace.slice(0,40)}`);
 assert.ok(!code.includes("const VERSION='ST 0.17.0'"));
});

test('source-only Spindle installation has both build entry points and the manifest asks only for used permissions',()=>{
 const manifest=JSON.parse(read('spindle.json'));
 for(const entry of ['backend','frontend']){assert.equal(manifest[`entry_${entry}`],`dist/${entry}.js`);assert.ok(existsSync(new URL(`../src/${entry}.ts`,import.meta.url)));assert.ok(existsSync(new URL(`../dist/${entry}.js`,import.meta.url)));}
 assert.deepEqual(manifest.permissions,['generation','chats','chat_mutation','characters','personas','world_books']);
 assert.equal(manifest.version,'0.2.3');assert.equal(JSON.parse(read('package.json')).version,'0.2.3');
});

test('the preset feature is gone',()=>{
 const backend=read('dist/backend.js').toString();
 assert.ok(!/presets\.(list|get)\(/.test(backend));
 assert.ok(!existsSync(new URL('../src/preset-scope.js',import.meta.url)));
});

test('phone floor only raises small upstream sizes',async()=>{
 const {floorRules}=await import('../src/lumiverse/css-floor.mjs');
 const out=floorRules('.a{font-size:11px}.hint{font-size:11.5px}.big{font-size:22px}.x small{font:12px/1.4 sans-serif}.ok{font-size:15px}');
 assert.equal(out,'.a{font-size:15px}\n.hint{font-size:13px}\n.x small{font-size:13px}');
 assert.ok(read('src/generated/side-story-app.js').toString().includes('@container sidestory (max-width:680px){'));
});
