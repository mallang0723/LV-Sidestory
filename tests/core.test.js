import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemble, validateTranslation, validateImport, childRecord} from '../src/core.js';
test('budget trims old dialogue, preserves fixed context, refuses fixed overflow',async()=>{
 const count=async m=>({total_tokens:JSON.stringify(m).length,approximate:true});
 const input={mode:'story',request:'keep request',summary:'fixed summary',dialogue:[{content:'old'.repeat(300)},{content:'recent'}]};
 const base=await assemble({...input,dialogue:[]},100000,count);
 const out=await assemble(input,base.count.total_tokens+100,count);
 assert.equal(out.dropped,1); assert.match(out.messages[1].content,/fixed summary/); assert.match(out.messages[1].content,/recent/);
 await assert.rejects(assemble(input,1,count),/fixed/);
});
test('translation rejects duplicate/missing IDs and retains recoverable segments',()=>{
 const out=validateTranslation([{id:'s0',text:'a'},{id:'s1',text:'b'}],[{id:'s0',text:'A'},{id:'s0',text:'X'}]);
 assert.equal(out.complete,false); assert.deepEqual(out.missing,['s1']); assert.deepEqual(out.duplicates,['s0']);
});
test('imports reject duplicates/size and detach foreign host IDs',()=>{
 assert.throws(()=>validateImport(JSON.stringify({schema:1,records:[{id:'a',content:'a'},{id:'a',content:'b'}]})),/duplicate/);
 assert.throws(()=>validateImport(' '.repeat(1000001)),/size/);
 const [r]=validateImport(JSON.stringify({schema:1,records:[{id:'old',content:'safe',host:{chatId:'foreign'}}]}));
 assert.deepEqual(r.host,{}); assert.equal(r.needsRemap,true); assert.notEqual(r.id,'old');
});
test('editing creates a child and leaves original untouched',()=>{
 const p={id:'a',content:'original',revision:1};const c=childRecord(p,'edited');
 assert.equal(p.content,'original');assert.equal(c.parentId,'a');assert.equal(c.seriesId,'a');assert.equal(c.revision,1);
});
