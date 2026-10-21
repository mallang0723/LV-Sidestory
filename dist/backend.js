// @bun
// src/lumiverse/assembly.js
var textOf = (m) => typeof m?.content === "string" ? m.content : Array.isArray(m?.content) ? m.content.map((p) => typeof p?.text === "string" ? p.text : "").join("") : "";
var norm = (s) => String(s ?? "").trim();
function probe(content) {
  const lines = String(content ?? "").split(`
`).map((x) => x.trim()).filter((x) => x.length >= 12 && !/[<>\[\]{}|]/.test(x)).sort((a, b) => b.length - a.length);
  return lines[0] ? lines[0].slice(0, 40) : "";
}
function eligibleHistory(source) {
  return (Array.isArray(source) ? source : []).filter((m) => m && m.extra?.hidden !== true && typeof m.content === "string").slice().sort((a, b) => (a.index_in_chat ?? 0) - (b.index_in_chat ?? 0));
}
function locateHistory(dryRun, source) {
  const messages = Array.isArray(dryRun?.messages) ? dryRun.messages : [], breakdown = Array.isArray(dryRun?.breakdown) ? dryRun.breakdown : [];
  const entry = breakdown.find((b) => b?.type === "chat_history");
  const result = { indices: [], rows: [], expected: 0, verified: 0, checked: 0, reliable: false };
  if (!entry || !(entry.messageCount > 0) || !Number.isInteger(entry.firstMessageIndex))
    return { ...result, reliable: true };
  result.expected = entry.messageCount;
  const injected = new Set(breakdown.filter((b) => b && b.type !== "chat_history" && typeof b.content === "string" && norm(b.content)).map((b) => norm(b.content)));
  for (let i = entry.firstMessageIndex;i < messages.length && result.indices.length < entry.messageCount; i++)
    if (!injected.has(norm(textOf(messages[i]))))
      result.indices.push(i);
  const eligible = [];
  for (const m of eligibleHistory(source)) {
    const last = eligible.at(-1);
    if (last && m.is_user && last.is_user)
      eligible[eligible.length - 1] = { ...last, index_in_chat: m.index_in_chat, content: last.content + `
` + m.content };
    else
      eligible.push(m);
  }
  result.rows = result.indices.length === entry.messageCount ? eligible.slice(Math.max(0, eligible.length - entry.messageCount)) : [];
  if (result.rows.length === result.indices.length)
    result.indices.forEach((at, k) => {
      const p = probe(result.rows[k]?.content);
      if (!p)
        return;
      result.checked++;
      if (textOf(messages[at]).includes(p))
        result.verified++;
    });
  result.reliable = result.indices.length === entry.messageCount && result.rows.length === entry.messageCount && (result.checked === 0 || result.verified * 2 >= result.checked);
  return result;
}
function anchorIndex(anchor, source) {
  if (!anchor)
    return -1;
  const rows = Array.isArray(source) ? source : [];
  const hit = anchor.sendDate && rows.find((m) => m?.id === anchor.sendDate);
  return hit && Number.isInteger(hit.index_in_chat) ? hit.index_in_chat : -1;
}
function stripWorldInfo(messages, breakdown, removed) {
  let stripped = 0, unmatched = 0;
  for (const b of Array.isArray(breakdown) ? breakdown : []) {
    if (b?.type !== "world_info" || typeof b.content !== "string" || !norm(b.content))
      continue;
    const want = norm(b.content);
    let at = messages.findIndex((m, i) => !removed.has(i) && norm(textOf(m)) === want);
    if (at >= 0) {
      removed.add(at);
      stripped++;
      continue;
    }
    at = messages.findIndex((m, i) => !removed.has(i) && typeof m.content === "string" && m.content.includes(b.content));
    if (at >= 0) {
      messages[at] = { ...messages[at], content: messages[at].content.replace(b.content, "").replace(/\n{3,}/g, `

`) };
      stripped++;
      continue;
    }
    unmatched++;
  }
  return { stripped, unmatched };
}
function shapeHostPrompt({ dryRun, source = [], plan = null, quietPrompt = "", auxiliaryTurns = [], selectedLoreOnly = false }) {
  const messages = (Array.isArray(dryRun?.messages) ? dryRun.messages : []).map((m) => ({ role: m.role, content: m.content, ...m.name ? { name: m.name } : {} }));
  const breakdown = Array.isArray(dryRun?.breakdown) ? dryRun.breakdown : [];
  const history = locateHistory(dryRun, source), removed = new Set;
  const report = { before: history.indices.length, after: history.indices.length, anchor: null };
  const meta = { host: "lumiverse", model: dryRun?.model ?? null, provider: dryRun?.provider ?? null, historyRows: history.indices.length, historyExpected: history.expected, historyVerified: `${history.verified}/${history.checked}`, historyMapping: history.reliable ? "matched" : "approximate" };
  let kept = history.indices.slice();
  if (plan && !history.reliable) {
    report.skipped = true;
    if (plan.anchor)
      report.anchor = "missing";
    meta.historyMapping = "unreliable";
  } else if (plan) {
    if (plan.exclude)
      kept = [];
    else {
      if (plan.anchor) {
        const cut = anchorIndex(plan.anchor, source);
        if (cut >= 0 && history.reliable) {
          kept = kept.filter((_, k) => history.rows[k].index_in_chat <= cut);
          report.anchor = "applied";
        } else
          report.anchor = "missing";
      }
      if (Number.isInteger(plan.limit) && plan.limit >= 0)
        kept = kept.slice(Math.max(0, kept.length - plan.limit));
    }
    const keep = new Set(kept);
    for (const i of history.indices)
      if (!keep.has(i))
        removed.add(i);
    report.after = kept.length;
  }
  if (selectedLoreOnly)
    Object.assign(meta, { worldInfo: stripWorldInfo(messages, breakdown, removed) });
  const append = Array.isArray(plan?.append) ? plan.append.filter((m) => m && typeof m.content === "string" && m.content.trim()).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })) : [];
  const after = kept.length ? kept.at(-1) : history.indices.length ? history.indices[0] - 1 : messages.length - 1;
  const out = [];
  messages.forEach((m, i) => {
    if (!removed.has(i))
      out.push(m);
    if (i === after)
      out.push(...append);
  });
  if (after < 0)
    out.unshift(...append);
  if (append.length)
    report.appended = append.length;
  if (norm(quietPrompt))
    out.push({ role: "user", content: String(quietPrompt) });
  for (const row of Array.isArray(auxiliaryTurns) ? auxiliaryTurns : [])
    if (row && typeof row.content === "string")
      out.push({ role: row.role === "assistant" ? "assistant" : "user", content: row.content });
  return { messages: out, report, meta };
}
function fillNames(text, { char = "", user = "" } = {}) {
  return String(text ?? "").replace(/\{\{char\}\}/gi, () => char || "{{char}}").replace(/\{\{user\}\}/gi, () => user || "{{user}}");
}

// src/lumiverse/migrate.js
var MODE = { analysis: "analysis", story: "story", speak: "speak", write: "write", html: "visual", identity: "facet", au: "facet" };
var UPSTREAM_MODES = new Set(["analysis", "story", "visual", "speak", "write", "facet", "think"]);
var str = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
var SUBJECT = { character: "\uCE90\uB9AD\uD130", user: "\uD398\uB974\uC18C\uB098" };
var IDENTITY_LABELS = [["name", "\uC774\uB984"], ["gender", "\uC131\uBCC4"], ["age", "\uB098\uC774 \xB7 \uC5F0\uB839\uB300"], ["relative_age", "\uC0C1\uB300\uC801 \uC5F0\uB839"], ["alignment", "\uC6D0\uBCF8\uC758 \uC131\uD5A5"], ["background_context", "\uC6D0\uBCF8 \uC131\uC7A5 \uD658\uACBD"], ["hair", "\uBA38\uB9AC\uC0C9"], ["eyes", "\uB208\uC0C9"], ["height", "\uD0A4"], ["build", "\uCCB4\uACA9"], ["design", "\uC804\uCCB4\uC801\uC778 \uC678\uAD00 \uC778\uC0C1"], ["temperament", "\uD575\uC2EC \uC131\uACA9\uC801 \uAE30\uC9C8"], ["speech", "\uB9D0\uD22C"], ["interpersonal", "\uB300\uC778 \uBC18\uC751"], ["sheet_layout", "\uC2DC\uD2B8 \uD56D\uBAA9"]];
function identityMarkdown(plan) {
  const out = [];
  for (const row of Array.isArray(plan?.subjects) ? plan.subjects : []) {
    out.push(`## ${SUBJECT[row?.kind] || "\uC778\uBB3C"}${row?.name ? " \xB7 " + row.name : ""}`);
    for (const [k, label] of IDENTITY_LABELS) {
      const v = row?.[k];
      if (Array.isArray(v)) {
        const items = v.filter((x) => typeof x === "string" && x.trim());
        if (items.length)
          out.push(`**${label}**`, ...items.map((x) => "- " + x.trim()));
      } else if (typeof v === "string" && v.trim())
        out.push(`**${label}** ${v.trim()}`);
    }
    out.push("");
  }
  if (typeof plan?.relationship === "string" && plan.relationship.trim())
    out.push("## \uAD00\uACC4", plan.relationship.trim());
  return out.join(`
`).trim();
}
var FENCE = /^\s*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/;
function parsePlan(record) {
  let plan = record.facetPlan;
  if (!plan || typeof plan !== "object") {
    try {
      const raw = String(record.content || "");
      plan = JSON.parse((FENCE.exec(raw) || [, raw])[1]);
    } catch {
      return null;
    }
  }
  return plan?.schema === "sidestory-identity-v1" && Array.isArray(plan.subjects) && plan.subjects.length ? plan : null;
}
function titleFrom(text) {
  const line = String(text || "").replace(/<[^>]+>/g, " ").split(`
`).map((x) => x.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim()).find(Boolean) || "";
  return line.slice(0, 60) || "Side Story";
}
function visualDocument(content, title) {
  const source = String(content || "").trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (/^(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/i.test(source))
    return source;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
${source}
</body></html>`;
}
function translationView(record, mode) {
  const t = record.translation;
  if (!t || t.complete !== true || !Array.isArray(t.segments) || mode === "visual")
    return null;
  const parts = String(record.content || "").split(/\n\n/), byId = new Map(t.segments.filter((x) => x && typeof x.text === "string").map((x) => [x.id, x.text]));
  if (parts.some((_, i) => !byId.has("s" + i)))
    return null;
  return { content: parts.map((_, i) => byId.get("s" + i)).join(`

`), language: str(t.language, 120), batches: 1, inputTokens: 0, outputTokens: 0, createdAt: Number(record.createdAt) || Date.now() };
}
function migrateRecord(old, context = {}) {
  if (!old || typeof old !== "object" || typeof old.id !== "string" || typeof old.content !== "string")
    return null;
  const chatId = str(old.host?.chatId, 200);
  const upstream = old.upstreamArchive?.record;
  if (upstream && typeof upstream === "object" && typeof upstream.id === "string" && UPSTREAM_MODES.has(upstream.mode) && typeof upstream.content === "string") {
    return { ...structuredClone(upstream), chatId: chatId || "", favorite: !!(upstream.favorite || old.favorite), migratedFrom: "lumiverse-0.1", lvLegacy: { id: old.id, host: old.host || {}, needsRemap: !!old.needsRemap, stChatId: str(upstream.chatId, 300) } };
  }
  const mode = MODE[old.mode] || "story";
  const createdAt = Number.isFinite(old.createdAt) ? old.createdAt : Date.now();
  const characterId = str(old.host?.characterId, 200) || chatId && context.characterOf?.(chatId) || "";
  const record = {
    id: old.id,
    mode,
    title: "",
    action: old.parentId && old.requestId == null && old.mode !== "au" ? "edit" : "new",
    seriesId: null,
    seriesTitle: null,
    request: "",
    chatId,
    chatName: "",
    characterIds: characterId ? [characterId] : [],
    characterNames: [],
    content: old.content,
    status: "complete",
    createdAt,
    favorite: old.favorite === true,
    settings: { mode },
    parentId: null,
    folderId: typeof old.folderId === "string" ? old.folderId : null,
    tags: Array.isArray(old.tags) ? old.tags.filter((t) => typeof t === "string").slice(0, 24) : [],
    migratedFrom: "lumiverse-0.1",
    lvLegacy: { id: old.id, revision: old.revision ?? null, mode: old.mode, host: old.host || {}, requestId: old.requestId ?? null, sourceVersion: old.sourceVersion ?? null, parentId: old.parentId ?? null, seriesId: old.seriesId ?? null, needsRemap: !!old.needsRemap, identityApproved: old.identityApproved ?? null }
  };
  if (record.action === "edit")
    record.parentId = old.parentId;
  if (old.mode === "identity") {
    const plan = parsePlan(old);
    if (plan) {
      const kinds = plan.subjects.map((x) => x.kind);
      const target = kinds.includes("character") && kinds.includes("user") ? "both" : kinds.includes("user") ? "user" : "character";
      Object.assign(record, { facetPhase: "plan", facetPlan: plan, content: identityMarkdown(plan), title: ("\uC778\uBB3C \uCD94\uCD9C \xB7 " + plan.subjects.map((p) => p.name).filter(Boolean).join(" \xB7 ")).slice(0, 180), settings: { mode: "facet", facet: { target, relation: plan.relationship ? "original" : "none" }, personaIds: [] } });
      if (target === "user")
        record.characterIds = [];
    } else
      Object.assign(record, { mode: "story", settings: { mode: "story" } });
  } else if (old.mode === "au") {
    Object.assign(record, { facetPhase: "written", settings: { mode: "facet", facet: { target: "character" } } });
  }
  if (!record.title)
    record.title = typeof old.title === "string" && old.title.trim() ? old.title.trim().slice(0, 170) : titleFrom(old.content);
  if (mode === "visual")
    record.content = visualDocument(old.content, record.title);
  const view = translationView(old, record.mode);
  if (view)
    record.translationView = view;
  else if (old.translation)
    record.lvLegacy.translation = old.translation;
  if (old.translationView && typeof old.translationView.content === "string")
    record.translationView = { ...old.translationView };
  return record;
}
function migrateRecords(oldRows, existingIds = new Set, context = {}) {
  const out = [], seen = new Set(existingIds);
  let skipped = 0, failed = 0;
  for (const old of Array.isArray(oldRows) ? oldRows : []) {
    let r = null;
    try {
      r = migrateRecord(old, context);
    } catch {
      r = null;
    }
    if (!r) {
      failed++;
      continue;
    }
    if (seen.has(r.id)) {
      skipped++;
      continue;
    }
    seen.add(r.id);
    out.push(r);
  }
  const ids = new Set([...seen]);
  for (const r of out)
    if (r.parentId && !ids.has(r.parentId)) {
      r.parentId = null;
      r.action = "new";
    }
  return { records: out, skipped, failed };
}

// src/lumiverse/service.js
var CURRENT = "st-current";
var PAGE = 100;
var ID = /^[A-Za-z0-9_.:-]{1,200}$/;
var id = (v) => {
  if (typeof v !== "string" || !ID.test(v))
    throw Error("\uC798\uBABB\uB41C ID\uC608\uC694.");
  return v;
};
var text = (v, max = 2000000) => {
  if (typeof v !== "string" || v.length > max)
    throw Error("\uC798\uBABB\uB41C \uC785\uB825\uC774\uC5D0\uC694.");
  return v;
};
async function allPages(fetchPage, limit = PAGE, max = 5000) {
  const out = [];
  for (let offset = 0;offset < max; offset += limit) {
    const page = await fetchPage({ limit, offset });
    const rows = Array.isArray(page?.data) ? page.data : [];
    out.push(...rows);
    if (rows.length < limit || Number.isFinite(page?.total) && out.length >= page.total)
      break;
  }
  return out;
}
function characterCard(c) {
  if (!c)
    return null;
  const data = { name: c.name || "", description: c.description || "", personality: c.personality || "", scenario: c.scenario || "", first_mes: c.first_mes || "", mes_example: c.mes_example || "", extensions: c.extensions || {} };
  return { id: c.id, name: c.name || "", avatar: c.image_id ? c.id : "", data };
}
function personaCard(p) {
  if (!p)
    return null;
  return { id: p.id, name: p.name || "", avatar: p.image_id ? p.id : "", data: { name: p.name || "", description: p.description || "" } };
}
function loreEntry(e) {
  return { ...e, id: e.id, uid: e.uid, name: e.comment || e.uid || e.id, comment: e.comment || "", content: String(e.content || ""), enabled: !e.disabled, key: Array.isArray(e.key) ? e.key : [], keysecondary: Array.isArray(e.keysecondary) ? e.keysecondary : [], constant: !!e.constant, selective: !!e.selective, selectiveLogic: Number(e.selective_logic) || 0, caseSensitive: !!e.case_sensitive };
}
function messageRow(m) {
  const extra = m.extra || {};
  return { id: String(m.index_in_chat), messageId: m.id, role: m.role === "system" ? "system" : m.is_user ? "user" : m.name || "assistant", name: m.name || "", content: String(m.content ?? ""), characterId: typeof extra.character_id === "string" ? extra.character_id : "", system: m.role === "system", sendDate: m.send_date ?? null, extra: { hiddenFromAI: extra.hidden === true, hiddenFromUser: false } };
}
var characterWorldBooks = (c) => {
  const x = c?.extensions || {};
  return Array.isArray(x.world_book_ids) ? x.world_book_ids.filter((v) => typeof v === "string") : typeof x.world_book_id === "string" && x.world_book_id ? [x.world_book_id] : [];
};
var groupIds = (chat) => chat?.metadata?.group === true || chat?.metadata?.group === 1 ? Array.isArray(chat.metadata.character_ids) ? chat.metadata.character_ids.filter((x) => typeof x === "string") : [] : [];
function createService(api, { now = () => Date.now() } = {}) {
  const runs = new Map;
  let alive = true;
  const ownChat = async (u, chatId) => {
    const chat = await api.chats.get(id(chatId), u);
    if (!chat)
      throw Error("\uCC44\uD305\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694. \uCC44\uD305\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    return chat;
  };
  const characterIdsOf = (chat) => {
    const g = groupIds(chat);
    return g.length ? g : chat?.character_id ? [chat.character_id] : [];
  };
  async function activePersona(u, personaId) {
    if (personaId) {
      const p = await api.personas.get(id(personaId), u).catch(() => null);
      if (p)
        return p;
    }
    return api.personas.getActive(u).catch(() => null);
  }
  async function linkedBooks(u, chat, personaId) {
    const ids = new Set;
    for (const cid of characterIdsOf(chat)) {
      const c = await api.characters.get(cid, u).catch(() => null);
      for (const b of characterWorldBooks(c))
        ids.add(b);
    }
    const persona2 = await activePersona(u, personaId);
    if (persona2?.attached_world_book_id)
      ids.add(persona2.attached_world_book_id);
    for (const b of Array.isArray(chat?.metadata?.chat_world_book_ids) ? chat.metadata.chat_world_book_ids : [])
      if (typeof b === "string")
        ids.add(b);
    try {
      for (const b of await api.world_books.getGlobal(u) || [])
        ids.add(b);
    } catch {}
    return [...ids];
  }
  async function chatView(u, { chatId, personaId }) {
    const chat = await ownChat(u, chatId), persona2 = await activePersona(u, personaId);
    const summary = typeof chat.metadata?.loom_summary === "string" ? chat.metadata.loom_summary : "";
    return { id: chat.id, name: chat.name || "\uD604\uC7AC \uCC44\uD305", mode: "roleplay", connectionId: CURRENT, characterIds: characterIdsOf(chat), personaId: persona2?.id || "", metadata: { summary, activeLorebookIds: await linkedBooks(u, chat, persona2?.id) } };
  }
  async function connections(u, { activeProfileId } = {}) {
    const list = await api.connections.list(u);
    const active = list.find((c) => c.id === activeProfileId) || list.find((c) => c.is_default) || null;
    return [{ id: CURRENT, name: "\uD604\uC7AC \uB8E8\uBBF8\uBC84\uC2A4 \uC5F0\uACB0" + (active?.name ? " \xB7 " + active.name : ""), model: active?.model || "", isDefault: true }, ...list.map((c) => ({ id: c.id, name: c.name || c.id, model: c.model || "", provider: c.provider || "" }))];
  }
  async function characters(u, { chatId }) {
    const chat = await ownChat(u, chatId);
    const rows = [];
    for (const cid of characterIdsOf(chat)) {
      const c = await api.characters.get(cid, u).catch(() => null);
      if (c)
        rows.push(characterCard(c));
    }
    return rows;
  }
  async function personas(u, { personaId }) {
    const p = await activePersona(u, personaId);
    return p ? [personaCard(p)] : [];
  }
  async function character(u, { characterId }) {
    const c = await api.characters.get(id(characterId), u);
    if (!c)
      throw Error("\uC120\uD0DD\uD55C \uCE74\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694. \uCC38\uACE0 \uC790\uB8CC\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    return characterCard(c);
  }
  async function persona(u, { personaId }) {
    const p = await api.personas.get(id(personaId), u);
    if (!p)
      throw Error("\uC120\uD0DD\uD55C \uCE74\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694. \uCC38\uACE0 \uC790\uB8CC\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    return personaCard(p);
  }
  async function lorebooks(u, { chatId, personaId } = {}) {
    const books = await allPages((o) => api.world_books.list({ ...o, userId: u }));
    let linked = new Set;
    if (chatId) {
      try {
        linked = new Set(await linkedBooks(u, await ownChat(u, chatId), personaId));
      } catch {}
    }
    return books.map((b) => ({ id: b.id, name: b.name || b.id, enabled: true, isGlobal: linked.has(b.id) }));
  }
  async function entries(u, { bookId }) {
    if (!await api.world_books.get(id(bookId), u))
      throw Error("\uB85C\uC5B4\uBD81\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694: " + bookId);
    return (await allPages((o) => api.world_books.entries.list(bookId, { ...o, userId: u }))).map(loreEntry);
  }
  async function messages(u, { chatId }) {
    await ownChat(u, chatId);
    return (await api.chat.getMessages(chatId)).map(messageRow);
  }
  async function modelOf(u, connectionId, activeProfileId) {
    const cid = connectionId === CURRENT ? activeProfileId || (await api.connections.list(u)).find((c2) => c2.is_default)?.id : connectionId;
    if (!cid)
      throw Error("\uB8E8\uBBF8\uBC84\uC2A4\uC758 API \uC5F0\uACB0\uC744 \uC124\uC815\uD574 \uC8FC\uC138\uC694.");
    const c = await api.connections.get(id(cid), u);
    if (!c)
      throw Error("\uC120\uD0DD\uD55C \uC5F0\uACB0 \uD504\uB85C\uD544\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694. \uC124\uC815\uC5D0\uC11C \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    return { connectionId: c.id, model: c.model || "", name: c.name || c.id };
  }
  async function tokens(u, { texts, connectionId, activeProfileId }) {
    let model;
    try {
      model = (await modelOf(u, connectionId || CURRENT, activeProfileId)).model || undefined;
    } catch {
      model = undefined;
    }
    const out = [];
    let approximate = false, tokenizer = "";
    for (const t of Array.isArray(texts) ? texts.slice(0, 64) : []) {
      const r = await api.tokens.countText(text(t), { model, userId: u });
      out.push(r.total_tokens);
      approximate ||= !!r.approximate;
      tokenizer = r.tokenizer_name || tokenizer;
    }
    return { counts: out, approximate, tokenizer, model: model || "" };
  }
  async function names(u, chat, personaId) {
    const chars = [];
    for (const cid of characterIdsOf(chat)) {
      const c = await api.characters.get(cid, u).catch(() => null);
      if (c?.name)
        chars.push(c.name);
    }
    const p = await activePersona(u, personaId);
    return { char: chars.join(", "), user: p?.name || "" };
  }
  async function generate(u, { runId, chatId, activeProfileId, personaId, payload }) {
    id(runId);
    if (!alive)
      throw Error("\uD655\uC7A5\uC774 \uAEBC\uC84C\uC5B4\uC694.");
    if (!payload || typeof payload !== "object")
      throw Error("\uC798\uBABB\uB41C \uC694\uCCAD\uC774\uC5D0\uC694.");
    const controller = new AbortController;
    runs.set(runId, { user: u, controller });
    try {
      const chat = chatId ? await ownChat(u, chatId) : null;
      const who = chat ? await names(u, chat, personaId) : {};
      const maxTokens = Math.max(16, Math.min(200000, Math.round(Number(payload.parameters?.maxTokens) || 4096)));
      const { connectionId, model, name } = await modelOf(u, payload.connectionId || CURRENT, activeProfileId);
      let messages2, parameters = { max_tokens: maxTokens }, history = null, meta = { connectionId, model, connectionName: name, requestedMaxTokens: maxTokens };
      if (payload.useSillyTavernContext && payload.connectionId === CURRENT) {
        if (!chat)
          throw Error("\uD604\uC7AC \uCC44\uD305\uC5D0\uC11C \uB2E4\uC2DC \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
        const dry = await api.generate.dryRun({ chatId: chat.id, connectionId, ...personaId ? { personaId } : {} }, u);
        const source = payload.history || payload.selectedLoreOnly ? await api.chat.getMessages(chat.id) : [];
        const quiet = fillNames(text(String(payload.quietPrompt || payload.messages?.map((m) => m.content).filter(Boolean).join(`

`) || "")), who);
        const shaped = shapeHostPrompt({ dryRun: dry, source, plan: payload.history || null, quietPrompt: quiet, auxiliaryTurns: (payload.auxiliaryTurns || []).map((m) => ({ role: m.role, content: fillNames(m.content, who) })), selectedLoreOnly: !!payload.selectedLoreOnly });
        messages2 = shaped.messages;
        history = payload.history ? shaped.report : null;
        const { stream: _s, max_tokens: _m, ...rest } = dry.parameters && typeof dry.parameters === "object" ? dry.parameters : {};
        parameters = { ...rest, max_tokens: maxTokens };
        meta = { ...meta, ...shaped.meta, presetMaxTokens: Number(dry.parameters?.max_tokens) || null, promptTokens: dry.tokenCount?.total_tokens ?? dry.tokenCount?.total ?? null, worldInfoActivated: dry.worldInfoStats?.activatedCount ?? dry.worldInfoStats?.activated ?? null };
      } else {
        if (!Array.isArray(payload.messages) || !payload.messages.length)
          throw Error("\uBCF4\uB0BC \uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC5B4\uC694.");
        messages2 = payload.messages.map((m) => ({ role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user", content: fillNames(text(String(m?.content ?? "")), who) }));
      }
      if (payload.previewOnly)
        return { preview: true, text: "", finalPrompt: messages2, history, meta: { ...meta, preview: true } };
      if (!model)
        throw Error("\uC5F0\uACB0 \uD504\uB85C\uD544\uC5D0 \uBAA8\uB378\uC774 \uC9C0\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694. \uB8E8\uBBF8\uBC84\uC2A4 \uC5F0\uACB0 \uC124\uC815\uC5D0\uC11C \uBAA8\uB378\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.");
      const result = await api.generate.raw({ type: "raw", userId: u, messages: messages2, connection_id: connectionId, model, parameters, signal: controller.signal });
      if (controller.signal.aborted)
        throw Object.assign(Error("\uC911\uB2E8\uB428"), { name: "AbortError" });
      const content = typeof result === "string" ? result : result?.content;
      if (typeof content !== "string")
        throw Error("\uB8E8\uBBF8\uBC84\uC2A4\uC5D0\uC11C \uD14D\uC2A4\uD2B8 \uACB0\uACFC\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC5B4\uC694.");
      return { text: content, finalPrompt: messages2, history, meta };
    } finally {
      runs.delete(runId);
    }
  }
  function abort(u, { runId }) {
    const r = runs.get(runId);
    if (r && r.user === u)
      r.controller.abort();
    return true;
  }
  async function append(u, { chatId, items }) {
    await ownChat(u, chatId);
    if (!Array.isArray(items) || !items.length || items.length > 200)
      throw Error("\uCC44\uD305\uC5D0 \uB123\uC744 \uC544\uD2F0\uD074\uC774 \uC5C6\uC5B4\uC694.");
    let n = 0;
    for (const item of items) {
      await api.chat.appendMessage(chatId, { role: "assistant", content: text(item.content), metadata: { sideStoryRecordId: String(item.recordId || "").slice(0, 120) } });
      n++;
    }
    return n;
  }
  async function createCharacter(u, { name, description }) {
    const c = await api.characters.create({ name: text(name, 120).trim(), description: text(description), personality: "", scenario: "", first_mes: "", mes_example: "" }, u);
    return c?.id || "";
  }
  async function createPersona(u, { name, description }) {
    const p = await api.personas.create({ name: text(name, 120).trim(), description: text(description) }, u);
    return p?.id || "";
  }
  const fnv = (s) => {
    let h = 2166136261;
    for (const c of s) {
      h ^= c.codePointAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16);
  };
  const hex = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
  const fileOf = (rid) => "archive/" + (/^[A-Za-z0-9_-]{1,100}$/.test(rid) ? rid : "x" + hex(rid).slice(0, 150) + "-" + fnv(rid)) + ".json";
  const read = (u, p) => api.userStorage.getJson(p, { userId: u, fallback: null });
  const write = (u, p, v) => api.userStorage.setJson(p, v, { userId: u });
  async function archiveFiles(u) {
    return (await api.userStorage.list("archive/", u)).filter((p) => p.endsWith(".json")).map((p) => p.startsWith("archive/") ? p : "archive/" + p);
  }
  async function migrate(u) {
    const marker = await read(u, "migration-0.2.0.json");
    if (marker)
      return marker;
    let old = [];
    try {
      old = (await api.userStorage.list("records/", u)).filter((p) => /^[\w-]+\.json$/.test(p.replace(/^records\//, "")));
    } catch {
      old = [];
    }
    const rows = [];
    for (const p of old) {
      const r = await read(u, p.startsWith("records/") ? p : "records/" + p);
      if (r)
        rows.push(r);
    }
    const existing = new Set;
    for (const p of await archiveFiles(u)) {
      const r = await read(u, p);
      if (r?.id)
        existing.add(r.id);
    }
    const chars = new Map;
    const characterOf = (cid) => chars.get(cid) || "";
    for (const r of rows) {
      const cid = r?.host?.chatId;
      if (typeof cid === "string" && !chars.has(cid)) {
        try {
          const chat = await api.chats.get(cid, u);
          chars.set(cid, chat?.character_id || "");
        } catch {
          chars.set(cid, "");
        }
      }
    }
    const result = migrateRecords(rows, existing, { characterOf });
    for (const r of result.records)
      await write(u, fileOf(r.id), r);
    const done = { version: "0.2.0", at: now(), found: rows.length, migrated: result.records.length, skipped: result.skipped, failed: result.failed };
    await write(u, "migration-0.2.0.json", done);
    return done;
  }
  const PAGE_BYTES = 2000000;
  async function archiveList(u, { cursor = 0 } = {}) {
    const migration = cursor ? null : await migrate(u);
    const files = (await archiveFiles(u)).sort();
    const records = [];
    let size = 0, i = Math.max(0, Number(cursor) || 0);
    for (;i < files.length; i++) {
      const r = await read(u, files[i]);
      if (!r?.id)
        continue;
      const n = JSON.stringify(r).length;
      if (records.length && size + n > PAGE_BYTES)
        break;
      records.push(r);
      size += n;
    }
    return { records, next: i < files.length ? i : null, migration };
  }
  async function archivePut(u, { records }) {
    if (!Array.isArray(records))
      throw Error("\uC798\uBABB\uB41C \uBCF4\uAD00 \uC694\uCCAD\uC774\uC5D0\uC694.");
    for (const r of records) {
      if (!r || typeof r.id !== "string" || r.id.length > 200)
        throw Error("\uBCF4\uAD00\uD560 \uC544\uD2F0\uD074 ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
      await write(u, fileOf(r.id), r);
    }
    return records.length;
  }
  async function archiveDelete(u, { ids }) {
    for (const rid of Array.isArray(ids) ? ids : []) {
      if (typeof rid !== "string")
        continue;
      try {
        await api.userStorage.delete(fileOf(rid), u);
      } catch {}
    }
    return true;
  }
  async function settingsGet(u) {
    return await read(u, "sidestory-settings.json") || {};
  }
  async function settingsSet(u, { value }) {
    if (!value || typeof value !== "object")
      throw Error("\uC798\uBABB\uB41C \uC124\uC815\uC774\uC5D0\uC694.");
    if (JSON.stringify(value).length > 8000000)
      throw Error("\uC124\uC815\uC774 \uB108\uBB34 \uCEE4\uC694.");
    await write(u, "sidestory-settings.json", value);
    return true;
  }
  const ops = { chat: chatView, connections, characters, personas, character, persona, lorebooks, entries, messages, tokens, generate, abort, append, createCharacter, createPersona, archiveList, archivePut, archiveDelete, settingsGet, settingsSet };
  return {
    ops,
    async handle(u, op, args) {
      if (!alive)
        throw Error("\uD655\uC7A5\uC774 \uAEBC\uC84C\uC5B4\uC694.");
      const fn = ops[op];
      if (!fn)
        throw Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD: " + op);
      return fn(u, args || {});
    },
    cancelUser(u) {
      for (const r of runs.values())
        if (!u || r.user === u)
          r.controller.abort();
    },
    dispose() {
      alive = false;
      for (const r of runs.values())
        r.controller.abort();
      runs.clear();
    }
  };
}

// src/backend.js
function install(api) {
  const service = createService(api);
  const unsub = api.onFrontendMessage(async (msg, userId, frontendSessionId) => {
    if (!msg || typeof msg.id !== "string" || msg.id.length > 100 || typeof msg.op !== "string")
      return;
    try {
      const result = await service.handle(userId, msg.op, msg.args);
      api.sendToFrontend({ id: msg.id, result }, userId, { frontendSessionId });
    } catch (e) {
      api.sendToFrontend({ id: msg.id, error: String(e?.message || e), name: e?.name === "AbortError" || /AbortError/.test(String(e?.message)) ? "AbortError" : undefined }, userId, { frontendSessionId });
    }
  });
  const offPermission = api.permissions?.onChanged?.((d) => {
    if (!d?.granted)
      service.cancelUser();
  }) || (() => {});
  return () => {
    unsub();
    offPermission();
    service.dispose();
  };
}
if (globalThis.spindle)
  install(globalThis.spindle);
export {
  install
};
