// Phone readability floor for the drawer. Upstream is designed for a full-screen overlay and uses
// 9–13.5px text and 18–30px buttons; on a small phone drawer that is too small to read and tap.
// For a narrow drawer (≤680px) or a touch screen, every upstream rule that sets a font size below the
// floor is repeated with the floor value: secondary/meta text 13px, everything else 15px. Same selectors,
// later in the cascade, so specificity is unchanged and upstream's larger sizes are never reduced.
export const PRIMARY=15,SECONDARY=13;
// Selector words that mark captions, hints and metadata (kept smaller than body text, but ≥13px).
export const SECONDARY_SELECTOR=/small|hint|\.label\b|meta|kind|count|note|time|caption|snip|date|badge|\bval\b|tr-n|speak-index|speak-news-live|inner-hint|bar-text p|bar-note|entry-kind|entry-time|empty-sub|sub\b/i;

function sizeOf(decls){
 const m=/(?:^|;)\s*font-size\s*:\s*([\d.]+)px/.exec(decls)||/(?:^|;)\s*font\s*:\s*(?:[^;]*?\s)?([\d.]+)px[\s/]/.exec(decls);
 return m?Number(m[1]):null;
}
/** Returns CSS text with the floor rules (no wrapper). */
export function floorRules(css){
 const out=[];const seen=new Set();
 for(const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)){
  const selector=m[1].trim(),size=sizeOf(m[2]);
  if(!selector||size==null||selector.startsWith(':host')||/^(from|to|\d+%)/.test(selector))continue;
  const floor=SECONDARY_SELECTOR.test(selector)?SECONDARY:PRIMARY;
  if(size>=floor)continue;
  const rule=`${selector}{font-size:${floor}px}`;if(seen.has(rule))continue;seen.add(rule);out.push(rule);
 }
 return out.join('\n');
}
/** Tap targets: at least 44px tall; icon buttons also 44px wide (the icon itself stays small). */
export const TAP_RULES=`
.window :is(button,select,summary,label.row,label.check,.tab,.chip,.opt,.seg>button,[role=radio]):not(.swatch):not(.speak-news-dot){min-height:44px}
.window :is(.icon-btn,.icon-button,.speak-copy,.speak-nav-arrow,.mini,.card-icons button,.reader-nav button){min-width:44px;min-height:44px}
.window :is(input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=file]),textarea){min-height:44px;font-size:16px}
.window .row{min-height:44px}
.window #followup{min-height:44px;height:44px;font-size:16px}
.window .speak-inner-body{font-size:max(15px,.93em)}
.window{font-size:${PRIMARY}px}`;
export function phoneFloor(css){
 const body=floorRules(css)+'\n'+TAP_RULES;
 return `@container sidestory (max-width:680px){\n${body}\n}\n@media (pointer:coarse){\n${body}\n}`;
}
