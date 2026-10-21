// Upstream style.css is written for a full-screen overlay, so its breakpoints read the browser viewport.
// Inside the Lumiverse drawer the usable width is the drawer, not the window (a 1280px desktop drawer is
// often ~420px wide). This turns viewport width/height queries into container queries on the .app
// element and viewport units into container units. Queries on anything else (pointer, motion, …) stay.
export const CONTAINER='sidestory';
const SIZE_ONLY=/^\s*(?:\(\s*(?:min|max)-(?:width|height)\s*:\s*[\d.]+px\s*\)\s*(?:and\s*)?)+$/i;

function blockEnd(css,open){let depth=0;for(let i=open;i<css.length;i++){if(css[i]==='{')depth++;else if(css[i]==='}'&&--depth===0)return i;}throw Error('unbalanced CSS block');}

/** Returns {css, converted:[prelude], kept:[prelude], selfTargets:[selector]} */
export function toContainerQueries(source){
 let css='',i=0;const converted=[],kept=[],selfTargets=[];
 while(i<source.length){
  const at=source.indexOf('@media',i);if(at<0){css+=source.slice(i);break;}
  css+=source.slice(i,at);const open=source.indexOf('{',at),end=blockEnd(source,open);
  const prelude=source.slice(at+6,open),body=source.slice(open+1,end);
  if(SIZE_ONLY.test(prelude)){
   converted.push(prelude.trim());
   for(const m of body.matchAll(/(^|})\s*([^{}@]+)\{/g))for(const sel of m[2].split(','))if(/^\s*\.app(\[[^\]]*\])*\s*$/.test(sel))selfTargets.push(sel.trim());
   css+=`@container ${CONTAINER} ${prelude.trim().replace(/\(\s*/g,'(')}{${body}}`;
  }else{kept.push(prelude.trim());css+=source.slice(at,end+1);}
  i=end+1;
 }
 css=css.replace(/(\d*\.?\d+)(?:dvh|svh|lvh|vh)\b/g,'$1cqh').replace(/(\d*\.?\d+)(?:dvw|svw|lvw|vw)\b/g,'$1cqw');
 return {css,converted,kept,selfTargets};
}
