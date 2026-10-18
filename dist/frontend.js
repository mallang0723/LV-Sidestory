// vendor/prompts.js
var INNER_BASE = `Create a character-grounded response from inside the requested character's perspective. Let characterization emerge through what the character notices, prioritizes, assumes, interprets, remembers, avoids, and chooses to express. Match the breadth, depth, and emotional weight to the request and the present situation. A narrow prompt may stay narrow; a broad prompt may explore several genuinely different facets. Use the established RP context as grounding, and infer only where the request leaves genuine room. Do not enlarge a small moment merely because more output is available. Stop when the requested perspective feels complete.`;
var PROMPTS = {
  speak: INNER_BASE + `

Answer in the character's spoken voice, addressing the person in the request rather than describing the character from outside. Let the tone emerge naturally from the relationship, the subject, and what the character is willing to reveal, soften, avoid, or conceal in that moment. Stay with the user's actual question or prompt instead of widening it into a general character profile. If the request contains several distinct questions or speaking prompts, respond to each one separately and keep their original order. If it is one continuous prompt, treat it as one response. If the user asks for a specific spoken form, preserve that form inside the spoken response.`,
  write: INNER_BASE + `

Write the requested piece in the character's own written voice. Let its purpose, intended audience, circumstances, and degree of privacy shape the wording, level of detail, emphasis, and what the character chooses to disclose. Follow the requested form and let the piece end where that form naturally feels complete.`,
  analysis: `Offer a perceptive reading of the characters and their relationship in clear, natural prose. Answer the user's curiosity directly and begin with the most revealing pattern, tension, or contrast instead of restating the assignment. Pay attention to choices, evasions, gaps between words and behavior, emotional asymmetry, and the effect each person has on the other. Develop only the angles that are genuinely supported by the supplied material; these suggestions are not a checklist or required headings.
Use the provided dialogue AND summaries as evidence. Summaries are legitimate accounts of events even when the dialogue contains only a greeting. Do not call an event absent merely because it appears only in the summary. Paraphrase summarized events rather than inventing direct quotations. Distinguish an appealing interpretation from an established fact in ordinary language, without dividing the response into an evidence-audit table.
Avoid bureaucratic labels, information-deficit inventories, generic demographic tables, character database field names, message IDs, and an academic conclusion that repeats everything. Prefer vivid, concrete explanations of why a gesture matters to these people. A teasing or affectionate observation is welcome when it fits, but do not flatten the characters into memes or force romance. Use tables only if requested or clearly useful. Do not mechanically include contradiction, timeline, comparison, and limitation sections.
If the user asks who loves more, offer a reasoned reading of their different ways of caring rather than a numerical score. Never invent past events, quotations, or diagnoses. When the user explicitly requests a hypothetical event, alternate premise, or future emotional change, treat that premise as the basis of the analysis and develop it to the requested scope. Keep the hypothetical framing clear without repeatedly disclaiming it; do not require the event to have happened in canon. For requested preferences or ranked lists not established in the sources, offer a character-grounded inference, identify it briefly as inferred, and explain each choice without claiming confirmed favorites or inventing supporting past events. If ALL supplied sources are thin, mention the limitation once, offer the meaningful interpretation that is possible, and finish naturally rather than stretching one line into a long report. The selected length is a preference, not a requirement to pad.`,
  story: `Write an immersive standalone episode. Start near an interesting action or choice. Let the requested premise guide the characters’ wants, obstacles, and decisions; do not force conflict into every scene. For an AU or role reversal, enact the changed circumstances while keeping recognizable personality and relationship dynamics. For a quoted opening line, build the scene around that line rather than explaining it from outside. Convey character through speech, attention, omissions, and behavior, not a dossier. Let the premise drive actual events rather than decorating a generic romance. Balance dialogue, physical action, and interiority naturally. Respect viewpoint knowledge and the player's stated writing boundary. Create a satisfying scene-level ending sized to the requested scope. For a continuation, output only the next installment; for revision, output the complete revised episode. Use Markdown paragraphs, with occasional scene breaks if useful.`,
  visual: `Show the requested object, document, record, scene, or interface itself rather than explaining it from the outside. Derive its structure, hierarchy, density, and visual character from its purpose, its creator or intended user, and the circumstances in which it exists. Use familiar interface conventions only when they genuinely belong to the requested artifact. A phone request should initially show a phone home screen with app icons, opening app contents within that device and providing a way back. A diary page or mission report should look like that document itself; do not turn every artifact into an app dashboard.

Treat the supplied RP context as continuity for the artifact. Keep names, prior events, established dynamics, distinctive habits, and other settled details consistent. Add new specifics only where the requested artifact leaves a genuine gap.

Where appropriate, let authorship and use leave traces in the artifact itself through wording, omissions, annotations, corrections, formatting habits, incomplete fields, differences in formality, or similar details. Do not add such irregularities when the requested object would naturally be clean or standardized.

Do not pad the result with repeated entries or decoration merely to increase its size.

Interaction is optional. Add it only when a change of state or access to another part of the artifact genuinely belongs to the requested result. Keep behavior purposeful, and make every secondary state easy to leave or reverse.

Use the requested length to determine the amount of meaningful content, not the amount of code. Leave enough output room to finish the document. If space becomes tight, cut repetition and secondary decoration before essential content or behavior.`
};

// src/presentation.js
var workers = new Set;
function disposeWorkers() {
  for (const stop of [...workers])
    stop();
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function staticHTML(raw) {
  if (typeof raw !== "string" || raw.length > 1e5)
    throw Error("HTML size");
  return escapeHTML(raw).replace(/&lt;(\/?)(p|h[1-6]|strong|em|b|i|ul|ol|li|blockquote|pre|code|br|hr|table|thead|tbody|tr|td|th)&gt;/gi, (_, close, tag) => `<${close}${tag.toLowerCase()}>`).replace(/&amp;(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, key) => escapeHTML(decodeEntities("&" + key + ";")));
}
function exportHTML(raw) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Side Story</title></head><body>${staticHTML(raw)}</body></html>`;
}
function replaceDisplay(content, pattern, replacement, timeout = 200) {
  if (content.length > 1e5 || pattern.length > 200 || replacement.length > 1000)
    return Promise.reject(Error("replacement size"));
  return new Promise((resolve, reject) => {
    const blob = new Blob(['onmessage=e=>{try{const [s,p,r]=e.data;postMessage({value:s.replace(new RegExp(p,"gu"),r)})}catch(e){postMessage({error:e.message})}}'], { type: "text/javascript" });
    const url = URL.createObjectURL(blob), worker = new Worker(url);
    let timer;
    const stop = () => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      workers.delete(cancel);
    };
    const cancel = () => {
      stop();
      reject(Error("worker disposed"));
    };
    workers.add(cancel);
    timer = setTimeout(() => {
      stop();
      reject(Error("replacement timeout"));
    }, timeout);
    worker.onmessage = (e) => {
      stop();
      e.data.error ? reject(Error(e.data.error)) : resolve(e.data.value);
    };
    worker.onerror = () => {
      stop();
      reject(Error("worker failed"));
    };
    worker.postMessage([content, pattern, replacement]);
  });
}
async function excerptPNG(value, background) {
  if (!value || value.length > 4000)
    throw Error("발췌는 1–4000자");
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  const ctx = canvas.getContext("2d");
  ctx.font = "26px sans-serif";
  const lines = [];
  let line = "";
  for (const c of value) {
    if (c === `
` || ctx.measureText(line + c).width > 780) {
      lines.push(line);
      line = c === `
` ? "" : c;
    } else
      line += c;
  }
  lines.push(line);
  canvas.height = Math.max(300, Math.min(4000, lines.length * 40 + 120));
  if (lines.length * 40 + 120 > 4000)
    throw Error("발췌가 너무 깁니다");
  ctx.fillStyle = "#fff8ed";
  ctx.fillRect(0, 0, 900, canvas.height);
  if (background) {
    ctx.drawImage(background, 0, 0, 900, canvas.height);
    ctx.fillStyle = "#ffffffcc";
    ctx.fillRect(0, 0, 900, canvas.height);
  }
  ctx.font = "26px sans-serif";
  ctx.fillStyle = "#272232";
  lines.forEach((l, i) => ctx.fillText(l, 60, 80 + i * 40));
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(Error("PNG failed")), "image/png"));
}
function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, key) => {
    if (key[0] === "#") {
      const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return n > 0 && n <= 1114111 && !(n >= 55296 && n <= 57343) ? String.fromCodePoint(n) : "�";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[key.toLowerCase()] || m;
  });
}
function translatedHTML(content, translation) {
  if (!translation?.complete)
    throw Error("complete translation required");
  const clean = staticHTML(content);
  const rows = segments(clean, "html");
  const values = new Map(translation.segments.map((s) => [s.id, s.text]));
  let result = clean;
  for (const s of rows.slice().reverse()) {
    if (!values.has(s.id))
      throw Error("translation segment mismatch");
    result = result.slice(0, s.start) + escapeHTML(values.get(s.id)) + result.slice(s.end);
  }
  return result;
}

// src/core.js
var MODES = { analysis: "분석", story: "스토리", speak: "내면 말하기", write: "내면 쓰기", identity: "핵심정보", au: "AU 생성", html: "정적 HTML" };
var text = (v, max = 1e5) => {
  if (typeof v !== "string" || v.length > max)
    throw Error("invalid text/size");
  return v;
};
function segments(content, mode) {
  text(content);
  if (mode !== "html")
    return content.split(/\n\n/).map((t, i) => ({ id: "s" + i, text: t }));
  const out = [];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<(script|style|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>/gi;
  let end = 0, m;
  const add = (a, b) => {
    const t = content.slice(a, b);
    if (t.trim())
      out.push({ id: "s" + out.length, text: t, start: a, end: b });
  };
  while (m = re.exec(content)) {
    add(end, m.index);
    end = re.lastIndex;
  }
  add(end, content.length);
  return out;
}

// src/workspace-style.js
var workspaceStyles = `
.ss-app{--ss-bg:var(--lumiverse-bg,#181622);--ss-paper:var(--lumiverse-bg-elevated,#211e2c);--ss-ink:var(--lumiverse-text,#eeeaf5);--ss-muted:var(--lumiverse-text-muted,#aba5ba);--ss-line:var(--lumiverse-border,rgba(174,148,218,.22));--ss-accent:var(--lumiverse-primary,#9370db);--ss-tint:var(--lumiverse-primary-light,rgba(147,112,219,.12));--ss-input:var(--lumiverse-input-bg,rgba(0,0,0,.15));font:13px/1.6 var(--lumiverse-font-family,system-ui,sans-serif);color:var(--ss-ink);background:var(--ss-bg);height:100%;min-height:0;display:flex;flex-direction:column;container-type:inline-size;overflow:hidden;color-scheme:normal}
.ss-app *{box-sizing:border-box;min-width:0}.ss-app [hidden]{display:none!important}
.ss-app button,.ss-app input,.ss-app select,.ss-app textarea{font:inherit;color:inherit;letter-spacing:normal}
.ss-app button{border:1px solid var(--ss-line);border-radius:7px;background:var(--ss-paper);padding:7px 11px;min-height:34px;cursor:pointer;line-height:1.5;text-align:center}
.ss-app button:hover{background:var(--ss-tint)}.ss-app button:disabled{opacity:.45;cursor:not-allowed}.ss-app :is(button,input,select,textarea,summary):focus-visible{outline:2px solid var(--ss-accent);outline-offset:2px}
.ss-app :is(input,select,textarea){width:100%;border:1px solid var(--ss-line);background:var(--ss-input);border-radius:7px;padding:9px 10px;line-height:1.6;box-shadow:none}
.ss-app select option{background:var(--ss-paper);color:var(--ss-ink)}.ss-app textarea{resize:vertical;min-height:86px}.ss-app input[type=checkbox]{width:16px;height:16px;min-width:16px;padding:0;accent-color:var(--ss-accent);margin:3px 0}
.ss-app input[type=file]{font-size:11px;padding:7px}.ss-app input::file-selector-button{border:1px solid var(--ss-line);background:var(--ss-paper);color:var(--ss-ink);border-radius:5px;padding:5px 9px;margin-right:8px}
.ss-app :is(h2,h3,p){margin:0}.ss-app h2{font-size:16px;font-weight:650;letter-spacing:-.35px}.ss-app small,.ss-hint{font-size:11px;color:var(--ss-muted)}
.ss-topbar{flex:none;border-bottom:1px solid var(--ss-line);background:var(--ss-paper);padding:14px 16px 0}
.ss-brand{display:flex;align-items:baseline;gap:9px;margin-bottom:13px}.ss-brand strong{font-size:18px;font-weight:750;letter-spacing:-.65px}.ss-brand span{font-size:11px;color:var(--ss-muted)}
.ss-folders{display:flex;gap:3px;align-items:end;overflow-x:auto;scrollbar-width:thin;margin-bottom:-1px}
.ss-app .ss-folders button{border-radius:9px 9px 0 0;border-bottom-color:transparent;background:transparent;color:var(--ss-muted);font-size:12px;white-space:nowrap;padding:9px 12px;min-height:39px;flex:1}
.ss-app .ss-folders button[aria-pressed=true]{background:var(--ss-bg);border-color:var(--ss-line);border-bottom-color:var(--ss-bg);color:var(--ss-ink);font-weight:700}
.ss-content{flex:1;min-height:0;overflow:hidden}.ss-create{height:100%;display:flex;flex-direction:column}.ss-layout{display:grid;grid-template-columns:280px minmax(0,1fr);flex:1;min-height:0}
.ss-composer{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--ss-line)}.ss-compose-scroll{flex:1;overflow:auto;padding:20px 18px;scrollbar-width:thin;overscroll-behavior:contain}
.ss-section-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:7px}.ss-section-heading h2{font-size:13px}.ss-section-heading small{font-size:10px}
.ss-mode-picker{display:flex;gap:3px;background:var(--ss-input);border:1px solid var(--ss-line);border-radius:8px;padding:3px;margin-bottom:17px}.ss-app .ss-mode-picker button{flex:1;border:0;background:transparent;padding:6px 4px;min-height:31px;font-size:11px;color:var(--ss-muted)}.ss-app .ss-mode-picker button[aria-pressed=true]{background:var(--ss-paper);color:var(--ss-ink);box-shadow:0 1px 3px #0002}
.ss-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}.ss-field>span{font-size:12px;font-weight:550}.ss-field:has(input[type=checkbox]){flex-direction:row;align-items:center;gap:8px;margin:8px 0;font-weight:400}.ss-field:has(input[type=checkbox])>span{order:1;font-weight:400}
.ss-field textarea[aria-label=요청]{min-height:150px;line-height:1.8}
.ss-details{margin-top:14px;border-top:1px solid var(--ss-line)}.ss-details>summary{display:flex;align-items:center;gap:9px;cursor:pointer;padding:13px 0;font-size:12px;font-weight:600;list-style:none}.ss-details>summary::after{content:'›';margin-left:auto;color:var(--ss-muted);font-size:17px;line-height:1}.ss-details[open]>summary::after{transform:rotate(90deg)}.ss-details>summary::-webkit-details-marker{display:none}.ss-details-body{padding:0 0 12px}.ss-details-body>.ss-hint{margin:7px 0 12px}
.ss-inline-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ss-inline-actions:empty{display:none}.ss-app .ss-inline-actions button{font-size:11px;min-height:30px;padding:5px 9px}
.ss-generate{padding:13px 18px 16px;border-top:1px solid var(--ss-line);background:var(--ss-paper);flex:none}.ss-generate>.ss-hint{display:block;font-size:10px;line-height:1.5;margin-bottom:9px}.ss-generate-actions{display:grid;grid-template-columns:1fr auto;gap:7px}.ss-app .ss-generate-actions button:first-child{grid-column:1/-1}.ss-app .ss-generate-actions button[data-action="확인한 입력으로 생성"]{background:var(--ss-accent);border-color:transparent;color:var(--lumiverse-primary-deep-contrast,#fff);font-weight:650}
.ss-pane-nav{display:none;border-bottom:1px solid var(--ss-line);gap:6px;padding:7px 14px}.ss-app .ss-pane-nav button{flex:1;border:0;background:transparent;font-size:12px;min-height:30px;padding:4px}.ss-app .ss-pane-nav button[aria-pressed=true]{background:var(--ss-tint);color:var(--lumiverse-primary-text,var(--ss-ink))}
.ss-reader{overflow:auto;padding:19px 22px 30px;overscroll-behavior:contain;scrollbar-width:thin;min-height:0}.ss-reader-heading{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:12px}.ss-reader-heading h2{font-size:14px}.ss-reader-heading small{font-size:10px;flex:none}
.ss-empty{min-height:280px;padding:65px 12px 35px;max-width:470px;margin:auto}.ss-eyebrow{font-size:10px;letter-spacing:2.4px;color:var(--lumiverse-primary-text,var(--ss-muted));font-weight:650}.ss-empty h3{white-space:pre-line;font:600 30px/1.4 var(--lumiverse-font-family,system-ui,sans-serif);letter-spacing:-1.1px;margin:14px 0 18px}.ss-empty p{white-space:pre-line;color:var(--ss-muted);line-height:1.9;font-size:12px;margin:0 0 24px}.ss-empty small{font-size:10px}
.ss-prose{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.95;padding:22px 0;max-width:760px;margin:auto}.ss-html iframe{display:block;width:100%;border:0;border-radius:8px;min-height:240px}.ss-reader textarea{font-size:13px;min-height:220px}
.ss-app:not([data-has-result=true]) .ss-reader>.ss-inline-actions,.ss-app:not([data-has-result=true]) .ss-reader>.ss-details:not([data-ui=prompt-details]),.ss-app:not([data-has-preview=true]) [data-ui=prompt-details]{display:none}
.ss-app:not([data-mode=identity]) [data-ui=identity-details]{display:none}
.ss-app pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.65 ui-monospace,monospace;max-height:330px;overflow:auto;padding:10px;background:var(--ss-input);border:1px solid var(--ss-line);border-radius:6px;margin:0}
.ss-message-picks{max-height:240px;overflow:auto}.ss-message{display:flex;gap:9px;padding:10px 0;border-bottom:1px solid var(--ss-line);cursor:pointer;font-size:12px}.ss-message>span{display:flex;flex-direction:column;gap:4px;white-space:pre-wrap;overflow-wrap:anywhere}.ss-message>span>small{font-size:10px}.ss-message:has(input:checked){background:var(--ss-tint)}
.ss-page{height:100%;overflow:auto;padding:22px 20px;scrollbar-width:thin}.ss-page>h2{font-size:20px;margin-bottom:7px}.ss-page>.ss-hint{margin-bottom:19px}.ss-page>.ss-inline-actions{margin-bottom:12px}.ss-page>input[type=search]{margin-bottom:14px}
.ss-archive{display:grid;gap:10px}.ss-app .ss-archive-card{display:flex;flex-direction:column;gap:7px;width:100%;padding:15px 16px;text-align:left;background:var(--ss-paper);border:1px solid var(--ss-line);border-radius:9px;overflow-wrap:anywhere}.ss-archive-card small{font-size:10px}.ss-archive-card strong{font-size:13px;font-weight:650}.ss-archive-card>span{font-size:12px;line-height:1.7;color:var(--ss-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ss-status{flex:none;padding:8px 16px;border-top:1px solid var(--ss-line);font-size:10px;color:var(--ss-muted);line-height:1.6;max-height:75px;overflow:auto;overflow-wrap:anywhere;background:var(--ss-paper)}
@container (max-width:679px){.ss-layout{display:flex;flex-direction:column}.ss-pane-nav{display:flex}.ss-composer{flex:1;border-right:0}.ss-app[data-pane=compose] .ss-reader{display:none}.ss-app[data-pane=result] .ss-composer{display:none}.ss-app[data-pane=result] .ss-reader{flex:1}.ss-topbar{padding:11px 12px 0}.ss-brand{margin-bottom:10px}.ss-app .ss-folders button{padding:8px 8px;font-size:11px}.ss-compose-scroll{padding:18px 15px}.ss-reader{padding:17px 16px 24px}.ss-generate{padding:12px 15px}.ss-empty{padding-top:38px}.ss-reader-heading{flex-wrap:wrap}.ss-page{padding:20px 16px}}
@container (max-width:679px){.ss-app[data-pane=result]:not([data-preview-active=true]) .ss-generate{display:none}}
@container (max-width:330px){.ss-brand span{display:none}.ss-app .ss-folders button{padding:8px 5px}.ss-app .ss-folders{gap:1px}}
`;

// src/workspace.js
function createWorkspace(root) {
  const node = (tag, text2, parent, cls) => {
    const e = document.createElement(tag);
    if (text2)
      e.textContent = text2;
    if (cls)
      e.className = cls;
    parent.append(e);
    return e;
  };
  root.style.cssText = "height:100%;min-height:0;min-width:0;overflow:hidden";
  const style = node("style", workspaceStyles, root);
  const app = node("section", "", root, "ss-app");
  app.setAttribute("aria-label", "Side Story 작업실");
  app.dataset.page = "create";
  app.dataset.pane = "compose";
  const header = node("header", "", app, "ss-topbar");
  const brand = node("div", "", header, "ss-brand");
  node("strong", "Side Story", brand);
  node("span", "루미버스용 · 비공식", brand);
  const nav = node("nav", "", header, "ss-folders");
  nav.setAttribute("aria-label", "작업 화면");
  const panels = {}, navButtons = {}, archiveText = new WeakMap;
  let family = "outer", modeInput, identityInput, navigate = () => {};
  const folders = [["outer", "Side Story"], ["inner", "내면"], ["facet", "다면"], ["archive", "보관함"], ["settings", "설정"]];
  const setPage = (page) => {
    app.dataset.page = page;
    for (const [name, p] of Object.entries(panels))
      p.hidden = name !== page;
    for (const [name, b] of Object.entries(navButtons))
      b.setAttribute("aria-pressed", String(page === "create" ? name === family : name === page));
  };
  const setPane = (pane) => {
    app.dataset.pane = pane;
    for (const b of paneNav.children)
      b.setAttribute("aria-pressed", String(b.dataset.pane === pane));
  };
  const chooseFamily = (key) => {
    family = key;
    if (modeInput) {
      const modes = key === "inner" ? ["speak", "write"] : key === "facet" ? ["identity", "au"] : ["analysis", "story", "html"];
      if (!modes.includes(modeInput.value)) {
        modeInput.value = modes[0];
        modeInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      syncMode();
    }
    setPage("create");
    setPane("compose");
  };
  for (const [key, label] of folders) {
    const b = node("button", label, nav);
    b.type = "button";
    navButtons[key] = b;
    b.onclick = () => {
      if (["archive", "settings"].includes(key)) {
        setPage(key);
        navigate(key);
      } else
        chooseFamily(key);
    };
  }
  const content = node("div", "", app, "ss-content");
  panels.create = node("div", "", content, "ss-create");
  const paneNav = node("nav", "", panels.create, "ss-pane-nav");
  paneNav.setAttribute("aria-label", "작성 및 결과");
  for (const [key, label] of [["compose", "작성"], ["result", "결과"]]) {
    const b = node("button", label, paneNav);
    b.type = "button";
    b.dataset.pane = key;
    b.onclick = () => setPane(key);
  }
  const layout = node("div", "", panels.create, "ss-layout");
  const composer = node("aside", "", layout, "ss-composer");
  composer.setAttribute("aria-label", "새로운 작업");
  const scroll = node("div", "", composer, "ss-compose-scroll");
  const heading = node("div", "", scroll, "ss-section-heading");
  node("h2", "새로운 작업", heading);
  node("small", "본편과 별도로 보관", heading);
  const modePicker = node("div", "", scroll, "ss-mode-picker");
  modePicker.setAttribute("aria-label", "작업 종류");
  const request = node("div", "", scroll), connection = node("div", "", scroll), load = node("div", "", scroll, "ss-inline-actions");
  const reference = node("details", "", scroll, "ss-details");
  node("summary", "참고 자료", reference);
  const referenceBody = node("div", "", reference, "ss-details-body");
  const chatTitle = node("p", "자료를 불러와 참고할 대화를 선택하세요.", referenceBody, "ss-hint");
  const messagePicks = node("div", "", referenceBody, "ss-message-picks");
  messagePicks.dataset.ui = "message-picks";
  const referenceFields = node("div", "", referenceBody);
  const world = node("details", "", referenceBody, "ss-details");
  node("summary", "World Book 엔트리", world);
  const worldBody = node("div", "", world, "ss-details-body");
  const worldActions = node("div", "", worldBody, "ss-inline-actions");
  const source = node("details", "", referenceBody, "ss-details");
  node("summary", "불러온 대화 원문", source);
  const sourceBody = node("div", "", source, "ss-details-body");
  const identity = node("div", "", scroll);
  const generate = node("div", "", panels.create, "ss-generate");
  node("small", "미리보기에서 전송 내용을 확인한 뒤 생성하세요.", generate, "ss-hint");
  const generateActions = node("div", "", generate, "ss-generate-actions");
  const reader = node("main", "", layout, "ss-reader");
  reader.dataset.ui = "reader";
  const readerHeading = node("div", "", reader, "ss-reader-heading");
  const resultTitle = node("h2", "아직 펼치지 않은 이야기", readerHeading);
  const resultMeta = node("small", "", readerHeading);
  const readerActions = node("div", "", reader, "ss-inline-actions");
  const empty = node("div", "", reader, "ss-empty");
  node("span", "SIDE STORY", empty, "ss-eyebrow");
  node("h3", `같은 인물,
다른 가능성.`, empty);
  node("p", `분석하고, 이야기를 쓰고, 인물의 내면을 만나보세요.
결과는 본편을 바꾸지 않고 이곳에 남습니다.`, empty);
  node("small", "작성 → 참고 자료 → 미리보기 → 생성", empty);
  const prose = node("article", "", reader, "ss-prose");
  prose.hidden = true;
  prose.setAttribute("aria-label", "이야기 원문");
  const html = node("div", "", reader, "ss-html");
  const detail = (title, parent = reader) => {
    const d = node("details", "", parent, "ss-details");
    node("summary", title, d);
    return node("div", "", d, "ss-details-body");
  };
  const editor = detail("편집 · 자식 결과 저장");
  const translation = detail("번역");
  const excerpt = detail("발췌 · 내보내기");
  const replacement = detail("표시 치환", excerpt);
  const recovery = detail("번역 수동 복구", translation);
  const preview = detail("전송 프롬프트 확인");
  preview.parentElement.dataset.ui = "prompt-details";
  const identityView = detail("핵심정보 검토");
  identityView.parentElement.dataset.ui = "identity-details";
  panels.archive = node("section", "", content, "ss-page");
  node("h2", "보관함", panels.archive);
  node("p", "본편과 분리해 보관한 이야기와 파생본입니다.", panels.archive, "ss-hint");
  const archiveToolbar = node("div", "", panels.archive, "ss-inline-actions");
  const search = node("input", "", panels.archive);
  search.type = "search";
  search.placeholder = "제목 · 내용으로 찾기";
  search.setAttribute("aria-label", "보관함 검색");
  const archive = node("div", "", panels.archive, "ss-archive");
  const archiveEmpty = node("p", "아직 보관한 결과가 없습니다.", panels.archive, "ss-hint");
  const backup = detail("백업 · 가져오기", panels.archive);
  panels.settings = node("section", "", content, "ss-page");
  node("h2", "설정", panels.settings);
  node("p", "연결 정보와 권한은 루미버스에서 관리합니다.", panels.settings, "ss-hint");
  const settings = detail("생성 한도", panels.settings);
  settings.parentElement.open = true;
  node("p", "선택한 자료만 전달합니다. 본편 preset·Cortex·자동 World Info는 포함하지 않습니다.", settings, "ss-hint");
  const status = node("p", "자료를 불러오세요.", app, "ss-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const hidden = node("div", "", app);
  hidden.hidden = true;
  const fieldTargets = { 작업: hidden, "선택 대화 ID (쉼표 구분)": hidden, "선택 World Book 엔트리 ID (쉼표 구분)": hidden, "연결": connection, "프리셋": connection, "루미버스 요약 넣기": referenceFields, "요청": request, "직접 요약": referenceFields, "캐릭터 포함": referenceFields, "페르소나 포함": referenceFields, "World Book 선택": worldBody, "승인한 핵심정보": identity, "입력 토큰 예산": settings, "결과 / 편집 초안": editor, "번역 언어": translation, "번역 segment JSON (수동 복구 입력)": recovery, "표시 치환 정규식": replacement, "표시 치환 문자열": replacement, "임시 PNG/JPEG 배경": excerpt, "JSON 가져오기": backup };
  const actionTargets = {};
  const route = (target, labels) => labels.forEach((label) => actionTargets[label] = target);
  route(worldActions, ["World Books 목록", "책 이전 페이지", "책 다음 페이지", "선택한 책 엔트리", "엔트리 이전 페이지", "엔트리 다음 페이지"]);
  route(load, ["자료 불러오기"]);
  route(generateActions, ["프롬프트 미리보기", "확인한 입력으로 생성", "취소"]);
  route(editor, ["편집을 자식 결과로 저장"]);
  route(archiveToolbar, ["보관함 / 인덱스 복구"]);
  route(identityView, ["핵심정보로 선택"]);
  route(editor, ["현재 채팅으로 ID 재매핑 확인"]);
  route(backup, ["전체 JSON 내보내기"]);
  route(excerpt, ["새 채팅용 텍스트 내보내기", "AU 카드 초안 내보내기", "정적 HTML 내보내기", "선택 텍스트 PNG"]);
  route(translation, ["번역 프롬프트 미리보기", "확인한 입력으로 번역"]);
  route(recovery, ["번역 segment 원문", "번역 검증·보관"]);
  route(readerActions, ["번역 보기", "원문 보기"]);
  route(replacement, ["표시에만 치환"]);
  function syncMode() {
    if (!modeInput)
      return;
    const selected = modeInput.value;
    family = ["speak", "write"].includes(selected) ? "inner" : ["identity", "au"].includes(selected) ? "facet" : "outer";
    const keys = family === "inner" ? ["speak", "write"] : family === "facet" ? ["identity", "au"] : ["analysis", "story", "html"];
    modePicker.replaceChildren();
    for (const key of keys) {
      const option = [...modeInput.options].find((o) => o.value === key);
      const b = node("button", option.textContent.replace("내면 ", ""), modePicker);
      b.type = "button";
      b.setAttribute("aria-pressed", String(key === selected));
      b.onclick = () => {
        modeInput.value = key;
        modeInput.dispatchEvent(new Event("input", { bubbles: true }));
      };
    }
    identity.hidden = selected !== "au";
    setPage("create");
  }
  function identities(rows, reset = false) {
    if (!identityInput)
      return;
    const selected = identityInput.value;
    if (reset)
      identityInput.replaceChildren();
    if (!identityInput.options.length) {
      const o = node("option", "보관함에서 핵심정보를 검토·승인하세요.", identityInput);
      o.value = "";
    }
    for (const r of rows.filter((r2) => r2.mode === "identity" && r2.identityApproved && !r2.needsRemap))
      if (![...identityInput.options].some((o) => o.value === r.id)) {
        const o = node("option", r.title || `승인된 핵심정보 · ${new Date(r.createdAt || Date.now()).toLocaleDateString("ko-KR")}`, identityInput);
        o.value = r.id;
      }
    if ([...identityInput.options].some((o) => o.value === selected))
      identityInput.value = selected;
  }
  search.oninput = () => {
    const q = search.value.toLocaleLowerCase();
    for (const card of archive.children)
      card.hidden = !(archiveText.get(card) || "").includes(q);
  };
  setPage("create");
  setPane("compose");
  return {
    status,
    bookRows: worldBody,
    available: sourceBody,
    prompt: preview,
    identityView,
    html,
    archive,
    hidden,
    style,
    fieldHost: (label) => fieldTargets[label] || settings,
    actionHost: (label) => actionTargets[label] || settings,
    bindMode(input) {
      modeInput = input;
      input.addEventListener("input", syncMode);
      syncMode();
    },
    bindIdentity(input) {
      identityInput = input;
      identities([]);
    },
    identities,
    onNavigate(fn) {
      navigate = fn;
    },
    invalidatePreview() {
      delete app.dataset.previewActive;
      preview.parentElement.open = false;
    },
    preview() {
      app.dataset.hasPreview = "true";
      app.dataset.previewActive = "true";
      empty.hidden = true;
      resultTitle.textContent = "전송 내용 확인";
      preview.parentElement.open = true;
      setPane("result");
    },
    showResult(r, content2) {
      app.dataset.hasResult = "true";
      app.dataset.mode = r.mode;
      delete app.dataset.previewActive;
      identities([r]);
      empty.hidden = true;
      preview.parentElement.open = false;
      prose.hidden = r.mode === "html";
      prose.textContent = content2;
      resultTitle.textContent = r.title || ({ analysis: "인물 분석", story: "새로운 이야기", speak: "내면 말하기", write: "내면 쓰기", identity: "인물 핵심정보", au: "AU 초안", html: "HTML 결과" }[r.mode] || "결과");
      resultMeta.textContent = `${new Date(r.createdAt || Date.now()).toLocaleDateString("ko-KR")} · revision ${r.revision}${r.parentId ? " · 파생본" : ""}`;
      setPage("create");
      setPane("result");
    },
    clearResult() {
      delete app.dataset.hasResult;
      delete app.dataset.hasPreview;
      delete app.dataset.previewActive;
      empty.hidden = false;
      prose.hidden = true;
      prose.textContent = "";
      resultTitle.textContent = "아직 펼치지 않은 이야기";
      resultMeta.textContent = "";
      messagePicks.replaceChildren();
      chatTitle.textContent = "채팅이 바뀌었습니다. 자료를 다시 불러오세요.";
    },
    catalog(c, input, invalidate) {
      chatTitle.textContent = c.chat?.name || c.chat?.title || "현재 채팅";
      messagePicks.replaceChildren();
      const choices = (c.messages || []).filter((m) => ["user", "assistant"].includes(m.role) && !m.extra?.hidden && typeof m.content === "string");
      node("small", `${choices.length}개 대화 · 체크한 내용만 전달합니다.`, messagePicks, "ss-hint");
      const selected = new Set(input.value.split(",").filter(Boolean));
      for (const m of choices) {
        const label = node("label", "", messagePicks, "ss-message");
        const check = node("input", "", label);
        check.type = "checkbox";
        check.checked = selected.has(m.id);
        check.setAttribute("aria-label", `${m.role === "user" ? "사용자" : "캐릭터"}: ${m.content.slice(0, 80)}`);
        const text2 = node("span", "", label);
        node("small", m.role === "user" ? "사용자" : "캐릭터", text2);
        node("span", m.content.slice(0, 350), text2);
        check.onchange = () => {
          check.checked ? selected.add(m.id) : selected.delete(m.id);
          input.value = [...selected].join(",");
          invalidate();
        };
      }
      if (!choices.length)
        node("p", "선택할 대화가 없습니다.", messagePicks, "ss-hint");
    },
    archiveCard(r, open) {
      archiveEmpty.hidden = true;
      const b = node("button", "", archive, "ss-archive-card");
      const modeName = { analysis: "분석", story: "스토리", speak: "내면 말하기", write: "내면 쓰기", identity: "핵심정보", au: "AU", html: "HTML" }[r.mode] || r.mode;
      node("small", `${r.parentId ? "파생본 · " : ""}${modeName} · ${new Date(r.createdAt || Date.now()).toLocaleDateString("ko-KR")}`, b);
      node("strong", r.title || r.content.slice(0, 45) || "제목 없는 결과", b);
      node("span", r.content.slice(0, 120), b);
      archiveText.set(b, `${r.title || ""}
${r.content}`.toLocaleLowerCase());
      b.onclick = open;
      return b;
    },
    resetArchive() {
      archive.replaceChildren();
      archiveEmpty.hidden = false;
      search.value = "";
    }
  };
}

// src/frontend.js
function setup(ctx) {
  const tab = ctx.ui.registerDrawerTab({ id: "side_story", title: "Side Story (사이드 스토리)", shortName: "Side", description: "루미버스용 · 비공식 (Unofficial, for Lumiverse)" });
  const root = tab.root;
  const ui = createWorkspace(root);
  let translationPreview = null;
  let disposed = false, epoch = 0, preview = null, record = null, frame = null, background = null;
  const pending = new Map;
  const el = (tag, label, parent = ui.hidden) => {
    const e = document.createElement(tag);
    if (label)
      e.textContent = label;
    parent.append(e);
    return e;
  };
  const status = ui.status;
  const field = (label, tag = "input") => {
    const l = el("label", "", ui.fieldHost(label));
    l.className = "ss-field";
    el("span", label === "요청" ? "이번에는 무엇을 만들까요?" : label, l);
    const e = el(tag, "", l);
    e.setAttribute("aria-label", label);
    return e;
  };
  const mode = field("작업", "select");
  for (const [key, label] of Object.entries(MODES)) {
    const o = el("option", label, mode);
    o.value = key;
  }
  const connection = field("연결", "select");
  const presetSelect = field("프리셋", "select");
  const noPreset = el("option", "없음", presetSelect);
  noPreset.value = "";
  const ids = field("선택 대화 ID (쉼표 구분)");
  const world = field("선택 World Book 엔트리 ID (쉼표 구분)");
  const book = field("World Book 선택", "select"), bookRows = el("div", "", ui.bookRows);
  let bookOffset = 0, entryOffset = 0;
  const chosenBooks = new Set;
  const character = field("캐릭터 포함");
  character.type = "checkbox";
  character.checked = true;
  const persona = field("페르소나 포함");
  persona.type = "checkbox";
  const loomSummary = field("루미버스 요약 넣기");
  loomSummary.type = "checkbox";
  const summary = field("직접 요약", "textarea"), identity = field("승인한 핵심정보", "select"), request = field("요청", "textarea"), budget = field("입력 토큰 예산");
  budget.type = "number";
  budget.value = "8000";
  const initialConnection = el("option", "자료를 불러와 연결을 선택하세요.", connection);
  initialConnection.value = "";
  const available = el("pre", "", ui.available);
  const prompt = el("pre", "", ui.prompt);
  prompt.dataset.testid = "prompt";
  const identityView = el("pre", "", ui.identityView);
  const output = field("결과 / 편집 초안", "textarea");
  output.rows = 12;
  const htmlRoot = ui.html;
  const rpc = (op, args = {}) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const issuedEpoch = epoch;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("응답 시간 초과"));
    }, 120000);
    pending.set(id, { resolve, reject, timer, issuedEpoch });
    ctx.sendToBackend({ id, op, args });
  });
  const unsub = ctx.onBackendMessage((m) => {
    const p = pending.get(m?.id);
    if (!p)
      return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    disposed || p.issuedEpoch !== epoch ? p.reject(Error("stale result")) : m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
  });
  const actions = new Map;
  const action = (label, fn) => {
    const display = { "보관함 / 인덱스 복구": "새로고침", "편집을 자식 결과로 저장": "수정본을 새 결과로 저장", "현재 채팅으로 ID 재매핑 확인": "가져온 결과를 현재 채팅에 연결" };
    const b = el("button", display[label] || label, ui.actionHost(label));
    b.type = "button";
    b.dataset.action = label;
    actions.set(label, b);
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        if (!disposed && e.message !== "stale result")
          status.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  const invalidate = () => {
    epoch++;
    translationPreview = null;
    preview = null;
    run.disabled = true;
    ui.invalidatePreview();
    prompt.textContent = "입력이 변경되었습니다. 다시 미리보세요.";
  };
  for (const e of [mode, connection, presetSelect, loomSummary, ids, world, character, persona, summary, identity, request, budget])
    e.addEventListener("input", invalidate);
  const eventOff = [ctx.events.on("CHAT_SWITCHED", () => {
    invalidate();
    record = null;
    output.value = "";
    ids.value = "";
    world.value = "";
    chosenBooks.clear();
    bookRows.replaceChildren();
    available.textContent = "";
    ui.clearResult();
    frame?.destroy();
    frame = null;
  }), ctx.events.on("PERMISSION_CHANGED", () => invalidate())];
  const show = (r) => {
    translationPreview = null;
    record = r;
    identityView.textContent = r.mode === "identity" ? JSON.stringify({ approved: !!r.identityApproved, facetPlan: r.facetPlan }, null, 2) : "";
    output.value = r.content;
    ui.showResult(r, r.content);
    frame?.destroy();
    frame = null;
    htmlRoot.replaceChildren();
    if (r.mode === "html") {
      frame = ctx.dom.createSandboxFrame({ html: staticHTML(r.content), minHeight: 240 });
      htmlRoot.append(frame.element);
    }
    status.textContent = `저장됨 · revision ${r.revision}${r.indexPending ? " · 인덱스 복구 필요" : ""}${r.needsRemap ? " · 호스트 ID 재매핑 필요" : ""}`;
  };
  const loadBooks = async () => {
    const page = await rpc("books", { offset: bookOffset });
    book.replaceChildren();
    for (const row of page.data) {
      const o = el("option", row.name || row.id, book);
      o.value = row.id;
    }
    status.textContent = `World Books ${bookOffset + 1}–${bookOffset + page.data.length} / ${page.total}`;
  };
  const loadEntries = async () => {
    if (!book.value)
      throw Error("책 선택 필요");
    const bookId = book.value;
    const page = await rpc("entries", { bookId, offset: entryOffset });
    chosenBooks.add(bookId);
    bookRows.replaceChildren();
    for (const row of page.data) {
      const label = el("label", row.comment || row.id, bookRows);
      label.style.display = "block";
      const c = el("input", "", label);
      c.type = "checkbox";
      c.checked = world.value.split(",").includes(row.id);
      c.onchange = () => {
        const selected = new Set(world.value.split(",").filter(Boolean));
        c.checked ? selected.add(row.id) : selected.delete(row.id);
        world.value = [...selected].join(",");
        invalidate();
      };
    }
    status.textContent = `Entries ${entryOffset + 1}–${entryOffset + page.data.length} / ${page.total}`;
  };
  action("World Books 목록", async () => {
    bookOffset = 0;
    await loadBooks();
  });
  action("책 이전 페이지", async () => {
    bookOffset = Math.max(0, bookOffset - 20);
    await loadBooks();
  });
  action("책 다음 페이지", async () => {
    bookOffset += 20;
    await loadBooks();
  });
  action("선택한 책 엔트리", async () => {
    entryOffset = 0;
    await loadEntries();
  });
  action("엔트리 이전 페이지", async () => {
    entryOffset = Math.max(0, entryOffset - 20);
    await loadEntries();
  });
  action("엔트리 다음 페이지", async () => {
    entryOffset += 20;
    await loadEntries();
  });
  book.onchange = () => {
    entryOffset = 0;
    invalidate();
  };
  action("자료 불러오기", async () => {
    const e = epoch;
    const c = await rpc("catalog");
    if (disposed || e !== epoch)
      return;
    connection.replaceChildren();
    const empty = el("option", "연결을 명시적으로 선택하세요", connection);
    empty.value = "";
    for (const x of c.connections) {
      const o = el("option", `${x.name || x.id} / ${x.model}`, connection);
      o.value = x.id;
      if (x.id === ctx.state?.get("connections.active")?.activeProfileId)
        o.selected = true;
    }
    available.textContent = c.messages.map((m) => `${m.role}${m.extra?.hidden ? " (숨김: 제외)" : ""}
${m.content}`).join(`
`);
    presetSelect.replaceChildren(noPreset);
    for (const x of c.presets || []) {
      const o = el("option", x.name, presetSelect);
      o.value = x.id;
    }
    presetSelect.value = (c.presets || []).some((x) => x.id === c.settings?.presetId) ? c.settings.presetId : "";
    loomSummary.checked = !!c.hasLoomSummary;
    ui.catalog(c, ids, invalidate);
    status.textContent = "참고 자료에서 포함할 대화를 선택하세요." + (c.presetsError ? ` (프리셋 목록을 불러오지 못했습니다: ${c.presetsError})` : "");
    invalidate();
  });
  presetSelect.addEventListener("change", () => {
    rpc("saveSettings", { presetId: presetSelect.value }).catch((e) => {
      if (!disposed && e.message !== "stale result")
        status.textContent = e.message;
    });
  });
  action("프롬프트 미리보기", async () => {
    const e = epoch;
    const p = await rpc("preview", { mode: mode.value, connectionId: connection.value, messageIds: ids.value.split(",").map((s) => s.trim()).filter(Boolean), worldBookIds: [...chosenBooks], worldIds: world.value.split(",").map((s) => s.trim()).filter(Boolean), presetId: presetSelect.value, includeLoomSummary: loomSummary.checked, includeCharacter: character.checked, includePersona: persona.checked, summary: summary.value, identityId: identity.value, request: request.value, budget: Number(budget.value) });
    if (e !== epoch || disposed)
      return;
    preview = p;
    prompt.textContent = JSON.stringify({ connection: p.connectionId, model: p.model, preset: p.preset, summarySource: p.summarySource, count: p.count, excluded: p.excluded, messages: p.messages }, null, 2);
    ui.preview();
    run.disabled = false;
    status.textContent = "실제 전송 입력을 확인한 뒤 생성하세요.";
  });
  const run = action("확인한 입력으로 생성", async () => {
    if (!preview)
      throw Error("미리보기 필요");
    const e = epoch;
    const r = await rpc("run", { previewId: preview.id, requestId: preview.requestId || (preview.requestId = crypto.randomUUID()) });
    if (e === epoch && !disposed)
      show(r);
  });
  run.disabled = true;
  action("취소", async () => {
    invalidate();
    await rpc("cancel");
    status.textContent = "취소됨";
  });
  action("편집을 자식 결과로 저장", async () => {
    if (!record)
      throw Error("결과 선택 필요");
    show(await rpc("edit", { id: record.id, revision: record.revision, content: output.value }));
  });
  action("보관함 / 인덱스 복구", async () => {
    const e = epoch;
    const rows = await rpc("list");
    if (disposed || e !== epoch)
      return;
    ui.resetArchive();
    ui.identities(rows, true);
    for (const r of rows)
      ui.archiveCard(r, () => show(r));
    status.textContent = `${rows.length}개 결과`;
  });
  action("핵심정보로 선택", async () => {
    if (record?.mode !== "identity")
      throw Error("핵심정보 결과를 선택하세요");
    show(await rpc("approveIdentity", { id: record.id, revision: record.revision }));
    identity.value = record.id;
    mode.value = "au";
    mode.dispatchEvent(new Event("input", { bubbles: true }));
  });
  action("현재 채팅으로 ID 재매핑 확인", async () => {
    if (!record?.needsRemap)
      throw Error("재매핑할 import 결과 선택");
    show(await rpc("remap", { id: record.id }));
  });
  action("전체 JSON 내보내기", async () => download("side-story.json", JSON.stringify({ schema: 1, records: await rpc("list") }, null, 2)));
  const upload = field("JSON 가져오기");
  upload.type = "file";
  upload.accept = ".json";
  upload.onchange = async () => {
    try {
      const e = epoch;
      const f = upload.files[0];
      if (f.size > 1e6)
        throw Error("import size");
      const raw = await f.text();
      if (disposed || e !== epoch)
        return;
      await rpc("import", { raw });
      status.textContent = "가져왔습니다. 보관함에서 ID 재매핑을 확인하세요.";
    } catch (e) {
      status.textContent = e.message;
    }
  };
  action("새 채팅용 텍스트 내보내기", async () => {
    if (!record)
      throw Error("결과 선택");
    download("side-story-chat.txt", record.content, "text/plain");
  });
  action("AU 카드 초안 내보내기", async () => {
    if (record?.mode !== "au")
      throw Error("AU 결과 선택");
    download("side-story-au.json", JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "AU 초안", description: record.content, personality: "", scenario: "", first_mes: "", mes_example: "", creator_notes: "Side Story 비공식 AU 초안", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: [], creator: "", character_version: "", extensions: {} } }, null, 2));
  });
  action("정적 HTML 내보내기", async () => {
    if (!record)
      throw Error("결과 선택");
    download("side-story.html", exportHTML(record.content), "text/html");
  });
  const language = field("번역 언어");
  language.value = "한국어";
  language.addEventListener("input", invalidate);
  action("번역 프롬프트 미리보기", async () => {
    if (!record)
      throw Error("결과 선택");
    translationPreview = await rpc("translationPreview", { id: record.id, revision: record.revision, connectionId: connection.value, language: language.value });
    prompt.textContent = JSON.stringify(translationPreview, null, 2);
  });
  action("확인한 입력으로 번역", async () => {
    if (!translationPreview)
      throw Error("번역 미리보기 필요");
    show(await rpc("translationRun", { previewId: translationPreview.id }));
    translationPreview = null;
  });
  const trans = field("번역 segment JSON (수동 복구 입력)", "textarea");
  action("번역 segment 원문", async () => {
    if (!record)
      throw Error("결과 선택");
    trans.value = JSON.stringify(segments(record.content, record.mode), null, 2);
  });
  action("번역 검증·보관", async () => {
    if (!record)
      throw Error("결과 선택");
    show(await rpc("translate", { id: record.id, revision: record.revision, rows: JSON.parse(trans.value) }));
    status.textContent = record.translation.complete ? "번역 ID 검증 완료" : JSON.stringify(record.translation);
  });
  action("번역 보기", async () => {
    if (!record?.translation?.complete)
      throw Error("완전한 번역 필요");
    output.value = record.translation.segments.map((s) => s.text).join(`

`);
    ui.showResult(record, output.value);
    if (record.mode === "html") {
      frame?.destroy();
      frame = ctx.dom.createSandboxFrame({ html: translatedHTML(record.content, record.translation), minHeight: 240 });
      htmlRoot.replaceChildren(frame.element);
    }
  });
  action("원문 보기", async () => {
    if (record)
      show(record);
  });
  const pattern = field("표시 치환 정규식"), replacement = field("표시 치환 문자열");
  action("표시에만 치환", async () => {
    if (!record)
      throw Error("결과 선택");
    const e = epoch;
    const value = await replaceDisplay(record.content, pattern.value, replacement.value);
    if (e === epoch && !disposed) {
      output.value = value;
      ui.showResult(record, value);
    }
  });
  const bg = field("임시 PNG/JPEG 배경");
  bg.type = "file";
  bg.accept = "image/png,image/jpeg";
  bg.onchange = async () => {
    try {
      const e = epoch;
      const f = bg.files[0];
      if (f.size > 5000000 || !["image/png", "image/jpeg"].includes(f.type))
        throw Error("배경 크기/종류");
      const bitmap = await createImageBitmap(f);
      if (disposed || e !== epoch) {
        bitmap.close();
        return;
      }
      background?.close();
      background = bitmap;
    } catch (e) {
      status.textContent = e.message;
    }
  };
  action("선택 텍스트 PNG", async () => {
    const e = epoch;
    const value = output.value.slice(output.selectionStart, output.selectionEnd) || output.value;
    const png = await excerptPNG(value, background);
    if (!disposed && e === epoch)
      download("side-story-excerpt.png", png);
  });
  ui.bindMode(mode);
  ui.bindIdentity(identity);
  ui.onNavigate((page) => {
    if (page === "archive")
      actions.get("보관함 / 인덱스 복구").click();
  });
  request.placeholder = "예시) 비가 그친 뒤, 두 사람이 처음으로 솔직한 이야기를 나누는 장면을 써 주세요.";
  return () => {
    disposed = true;
    epoch++;
    disposeWorkers();
    ctx.sendToBackend({ id: crypto.randomUUID(), op: "cancel" });
    unsub();
    eventOff.forEach((f) => f());
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("disabled"));
    }
    pending.clear();
    frame?.destroy();
    background?.close();
    tab.destroy();
  };
}
export {
  setup
};
