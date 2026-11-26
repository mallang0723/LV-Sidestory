// Prefer the host UUID API; older hosts use Web Crypto, also available on HTTP/LAN.
// Set the RFC 4122 version and variant bits before formatting the random bytes.
const hex=Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0'));

export function uuid(ctx){
 if(typeof ctx?.uuid?.v4==='function')return ctx.uuid.v4();
 const b=new Uint8Array(16);
 globalThis.crypto.getRandomValues(b);
 b[6]=0x40|(b[6]&0x0f);b[8]=0x80|(b[8]&0x3f);
 const h=[...b].map(n=>hex[n]);
 return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
}
