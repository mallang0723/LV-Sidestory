import {segments} from './core.js';
const workers=new Set();
export function disposeWorkers(){for(const stop of [...workers])stop();}
export function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Escape-first static grammar: only exact, attribute-free formatting tags survive.
// This intentionally displays unsupported markup as text; no parser sees raw input.
export function staticHTML(raw){if(typeof raw!=='string'||raw.length>100000)throw Error('HTML size');return escapeHTML(raw).replace(/&lt;(\/?)(p|h[1-6]|strong|em|b|i|ul|ol|li|blockquote|pre|code|br|hr|table|thead|tbody|tr|td|th)&gt;/gi,(_,close,tag)=>`<${close}${tag.toLowerCase()}>`).replace(/&amp;(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,key)=>escapeHTML(decodeEntities("&"+key+";")));}
export function exportHTML(raw){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Side Story</title></head><body>${staticHTML(raw)}</body></html>`;}
export function replaceDisplay(content,pattern,replacement,timeout=200){
 if(content.length>100000||pattern.length>200||replacement.length>1000)return Promise.reject(Error('replacement size'));
 return new Promise((resolve,reject)=>{
 const blob=new Blob(['onmessage=e=>{try{const [s,p,r]=e.data;postMessage({value:s.replace(new RegExp(p,"gu"),r)})}catch(e){postMessage({error:e.message})}}'],{type:'text/javascript'});
 const url=URL.createObjectURL(blob),worker=new Worker(url);let timer;
 const stop=()=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);workers.delete(cancel);};
 const cancel=()=>{stop();reject(Error("worker disposed"));};workers.add(cancel);
 timer=setTimeout(()=>{stop();reject(Error('replacement timeout'));},timeout);
 worker.onmessage=e=>{stop();e.data.error?reject(Error(e.data.error)):resolve(e.data.value);};worker.onerror=()=>{stop();reject(Error('worker failed'));};worker.postMessage([content,pattern,replacement]);
 });
}
export async function excerptPNG(value,background){
 if(!value||value.length>4000)throw Error('발췌는 1–4000자');
 const canvas=document.createElement('canvas');canvas.width=900;const ctx=canvas.getContext('2d');ctx.font='26px sans-serif';
 const lines=[];let line='';for(const c of value){if(c==='\n'||ctx.measureText(line+c).width>780){lines.push(line);line=c==='\n'?'':c;}else line+=c;}lines.push(line);
 canvas.height=Math.max(300,Math.min(4000,lines.length*40+120));if(lines.length*40+120>4000)throw Error('발췌가 너무 깁니다');
 ctx.fillStyle='#fff8ed';ctx.fillRect(0,0,900,canvas.height);if(background){ctx.drawImage(background,0,0,900,canvas.height);ctx.fillStyle='#ffffffcc';ctx.fillRect(0,0,900,canvas.height);}ctx.font='26px sans-serif';ctx.fillStyle='#272232';lines.forEach((l,i)=>ctx.fillText(l,60,80+i*40));
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG failed')),'image/png'));
}
export function download(name,content,type='application/json'){const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function decodeEntities(value){return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(m,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[key.toLowerCase()]||m;});}
export function translatedHTML(content,translation){
 if(!translation?.complete)throw Error('complete translation required');const clean=staticHTML(content);const rows=segments(clean,'html');const values=new Map(translation.segments.map(s=>[s.id,s.text]));let result=clean;
 for(const s of rows.slice().reverse()){if(!values.has(s.id))throw Error('translation segment mismatch');result=result.slice(0,s.start)+escapeHTML(values.get(s.id))+result.slice(s.end);}return result;
}
