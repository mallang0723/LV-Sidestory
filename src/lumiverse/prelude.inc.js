// ---- src/lumiverse/prelude.inc.js
// Upstream reads two host globals by name. Inside this function they resolve to the Lumiverse adapter:
//  SillyTavern.getContext() → {eventTypes, eventSource, chat, getThumbnailUrl} (src/lumiverse/host.js)
//  indexedDB → the archive database 'st-sidestory-archive-v1' is kept in Lumiverse user storage on the
//              server (same records, available on every device); any other database stays in the browser.
const SillyTavern=stHost.SillyTavern;
const indexedDB=stHost.indexedDB;
// Upstream's CommonJS export guards (`if(typeof module!=='undefined')…`) stay inert in the bundle.
const module=undefined;
