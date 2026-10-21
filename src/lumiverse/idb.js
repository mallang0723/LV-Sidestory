// Upstream keeps its archive in IndexedDB ('st-sidestory-archive-v1', store 'records'). In Lumiverse the
// same records live in the extension's user storage on the server, so they follow the user to every
// device. This is the small slice of the IndexedDB API upstream's dbOp() uses (open, transaction,
// objectStore().getAll/put/delete, oncomplete/onerror). Other databases go to the browser's IndexedDB.
export const ARCHIVE_DB='st-sidestory-archive-v1';
const CHUNK=3_000_000;

export function createArchiveIDB({rpc,real=globalThis.indexedDB,onMigration=()=>{}}={}){
 let queue=Promise.resolve();
 async function listAll(){
  const out=[];let cursor=0;
  for(let guard=0;guard<10000;guard++){const page=await rpc.call('archiveList',{cursor},{timeout:300000});if(page?.migration)onMigration(page.migration);out.push(...(page?.records||[]));if(page?.next==null)break;cursor=page.next;}
  return out;
 }
 async function putAll(rows){
  let batch=[],size=0;
  const flush=async()=>{if(batch.length)await rpc.call('archivePut',{records:batch},{timeout:300000});batch=[];size=0;};
  for(const r of rows){const n=JSON.stringify(r).length;if(batch.length&&size+n>CHUNK)await flush();batch.push(structuredClone(r));size+=n;}
  await flush();
 }
 function transaction(){
  const ops=[],tx={error:null,oncomplete:null,onerror:null,onabort:null,objectStore:()=>store};
  const request=(type,value)=>{const r={result:undefined,error:null,onsuccess:null,onerror:null};ops.push({type,value,r});return r;};
  const store={getAll:()=>request('all'),put:v=>request('put',v),delete:k=>request('delete',k)};
  // Requests are queued synchronously and run together, like one IndexedDB transaction.
  setTimeout(()=>{queue=queue.catch(()=>{}).then(async()=>{
   try{
    const puts=ops.filter(o=>o.type==='put').map(o=>o.value),dels=ops.filter(o=>o.type==='delete').map(o=>o.value);
    if(puts.length)await putAll(puts);
    if(dels.length)await rpc.call('archiveDelete',{ids:dels});
    for(const o of ops){if(o.type==='all')o.r.result=await listAll();o.r.onsuccess?.({target:o.r});}
    tx.oncomplete?.({target:tx});
   }catch(e){tx.error=e;tx.onerror?.({target:tx});}
  });},0);
  return tx;
 }
 const db={transaction,close(){},objectStoreNames:{contains:()=>true}};
 return {
  open(name,version){
   if(name!==ARCHIVE_DB){if(!real)throw Error('IndexedDB를 사용할 수 없어요.');return real.open(name,version);}
   const req={result:null,error:null,onsuccess:null,onerror:null,onupgradeneeded:null};
   setTimeout(()=>{req.result=db;req.onsuccess?.({target:req});},0);
   return req;
  },
  deleteDatabase:(...a)=>real?.deleteDatabase(...a),
 };
}
