import {createService} from './lumiverse/service.js';
// Spindle backend worker: answers the frontend host adapter (src/lumiverse/host.js).
export function install(api){
 const service=createService(api);
 const unsub=api.onFrontendMessage(async(msg,userId,frontendSessionId)=>{
  if(!msg||typeof msg.id!=='string'||msg.id.length>100||typeof msg.op!=='string')return;
  try{const result=await service.handle(userId,msg.op,msg.args);api.sendToFrontend({id:msg.id,result},userId,{frontendSessionId});}
  catch(e){api.sendToFrontend({id:msg.id,error:String(e?.message||e),name:e?.name==='AbortError'||/AbortError/.test(String(e?.message))?'AbortError':undefined},userId,{frontendSessionId});}
 });
 const offPermission=api.permissions?.onChanged?.(d=>{if(!d?.granted)service.cancelUser();})||(()=>{});
 return()=>{unsub();offPermission();service.dispose();};
}
if(globalThis.spindle)install(globalThis.spindle);
