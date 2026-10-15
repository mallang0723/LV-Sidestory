import {test} from 'node:test';import assert from 'node:assert/strict';
import {staticHTML,exportHTML} from '../src/presentation.js';
test('hostile HTML has no active attributes/resources/scripts and keeps safe formatting',()=>{
 const out=staticHTML('<h1>hello</h1><img src="https://evil"><script>parent.rpc()</script><a href="javascript:evil()">go</a><svg onload="evil()"></svg><p onclick="evil()">text</p>');
 assert.match(out,/<h1>hello<\/h1>/);assert.doesNotMatch(out,/<(?:script|img|a|svg)\b/);assert.doesNotMatch(out,/<p\s/);assert.match(exportHTML(out),/script-src 'none'/);
});
import {translatedHTML,decodeEntities} from '../src/presentation.js';
test('HTML translation keeps sanitized structure and escapes model text exactly once',()=>{const raw='<p>A &amp; B</p><strong>C</strong>';const result=translatedHTML(raw,{complete:true,segments:[{id:'s0',text:'가 & 나'},{id:'s1',text:'<evil>'}]});assert.equal(result,'<p>가 &amp; 나</p><strong>&lt;evil&gt;</strong>');assert.equal(staticHTML('<p>&lt;script&gt; &#x1f600;</p>'),'<p>&lt;script&gt; 😀</p>');assert.equal(decodeEntities('A &amp; B'),'A & B');});
