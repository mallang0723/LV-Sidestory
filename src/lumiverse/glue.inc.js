// Runs inside upstream's scope right after extension.js. Upstream opens a full-screen overlay from the
// wand menu; here the same app lives in a Lumiverse drawer tab, so only the mounting changes.
// 1. No overlay: no top-layer popover and no visual-viewport pinning.
window.removeEventListener?.('resize',syncViewport);viewport?.removeEventListener('resize',syncViewport);viewport?.removeEventListener('scroll',syncViewport);
syncViewport=function(){};
host.removeAttribute('popover');
// 2. No wand menu in Lumiverse: the drawer tab is the entry point.
mountObserver?.disconnect();mountObserver=null;wandButton.remove();
// 3. The wide reading layout follows the drawer width, not the browser window.
wideScreen=function(){return stHost.width()>=1200;};
{const upstreamSync=syncOverlay;syncOverlay=function(){upstreamSync();stHost.opened(opened);};}
// 4. The drawer has its own close; "close" inside Side Story returns to the article list instead of a blank tab.
{const upstreamClose=close;close=function(){upstreamClose();if(stHost.activeChatId()){opened=true;page='stories';render();}};}
// 5. Load automatically: when the tab is shown and whenever the chat changes (upstream closes on chat change).
const lumiverseOpen=()=>{if(alive&&activeChat())openFromWand().catch(e=>say(e.message,true));};
if(chatEvent)stContext.eventSource?.on(chatEvent,lumiverseOpen);
stHost.onActivate(lumiverseOpen);
stHost.mount(host,lumiverseOpen);
