import {createService} from './service.js';
// Native contract at pinned host: module import installs handlers on global spindle.
export function install(api){
 const service=createService(api);
 const unsub=api.onFrontendMessage(async(msg,userId,frontendSessionId)=>{
 if(!msg||typeof msg.id!=='string'||msg.id.length>100)return;
 try{let result;const a=msg.args||{};
 switch(msg.op){case 'books':result=await service.books(userId,a);break;case 'entries':result=await service.entries(userId,a);break;case 'approveIdentity':result=await service.approveIdentity(userId,a.id,a.revision);break;case 'catalog':result=await service.catalog(userId);break;case 'saveSettings':result=await service.saveSettings(userId,a);break;case 'preview':result=await service.preview(userId,a);break;case 'run':result=await service.run(userId,a);break;case 'cancel':service.cancel(userId);result=true;break;case 'list':result=await service.list(userId);break;case 'edit':result=await service.edit(userId,a.id,a.revision,a.content);break;case 'translationPreview':result=await service.translationPreview(userId,a);break;case 'translationRun':result=await service.translationRun(userId,a);break;case 'translate':result=await service.translate(userId,a.id,a.rows,a.revision);break;case 'import':result=await service.importRecords(userId,a.raw);break;case 'remap':result=await service.remap(userId,a.id);break;default:throw Error('unknown operation');}
 api.sendToFrontend({id:msg.id,result},userId,{frontendSessionId});
 }catch(e){api.sendToFrontend({id:msg.id,error:e.message},userId,{frontendSessionId});}
 });return()=>{unsub();service.dispose();};
}
if(globalThis.spindle)install(globalThis.spindle);
