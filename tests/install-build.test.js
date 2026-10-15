import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

// A GitHub checkout has no ignored dist/. Spindle discovers these exact names,
// not our npm build script or the JavaScript implementation entry points.
test('source-only Spindle installation has both automatic build entry points',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../spindle.json',import.meta.url)));
 for(const entry of ['backend','frontend']){
  assert.equal(manifest[`entry_${entry}`],`dist/${entry}.js`);
  assert.ok(existsSync(new URL(`../src/${entry}.ts`,import.meta.url)),`Missing Spindle auto-build entry src/${entry}.ts`);
 }
});
