import {runSideStory} from './generated/side-story-app.js';
import {createRpc} from './lumiverse/rpc.js';
import {createLumiverseHost} from './lumiverse/host.js';
// Spindle frontend: one drawer tab that hosts the upstream Side Story app (see src/lumiverse/host.js).
export function setup(ctx){
 const tab=ctx.ui.registerDrawerTab({id:'side_story',title:'Side Story (사이드 스토리)',shortName:'Side',description:'루미버스용 · 비공식 (Unofficial, for Lumiverse)',keywords:['side story','사이드 스토리','외전','번역','AU']});
 const rpc=createRpc(ctx);
 const host=createLumiverseHost({ctx,rpc,tab});
 runSideStory(host).catch(e=>{console.error('[Side Story]',e);host.fail(e);});
 return()=>{host.cleanup();rpc.dispose();tab.destroy();};
}
