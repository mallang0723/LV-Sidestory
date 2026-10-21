// Frontend ↔ backend request/response over the Spindle message channel.
export function createRpc(ctx,{timeout=120000,uuid=()=>crypto.randomUUID()}={}){
 const pending=new Map();let closed=false;
 const off=ctx.onBackendMessage(m=>{
  const p=pending.get(m?.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
  if(m.error!==undefined){const e=Error(m.error);if(m.name)e.name=m.name;p.reject(e);}else p.resolve(m.result);
 });
 function call(op,args={},{timeout:limit=timeout}={}){
  if(closed)return Promise.reject(Error('확장이 꺼졌어요.'));
  const id=uuid();
  return new Promise((resolve,reject)=>{
   const timer=limit?setTimeout(()=>{pending.delete(id);reject(Error('루미버스 서버 응답 시간이 초과됐어요.'));},limit):null;
   pending.set(id,{resolve,reject,timer});
   try{ctx.sendToBackend({id,op,args});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
  });
 }
 return {call,dispose(){closed=true;off?.();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('확장이 꺼졌어요.'));}pending.clear();}};
}
