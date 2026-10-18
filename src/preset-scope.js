// Support checks for Lumiverse presets used as Side Story instructions.
// api.assemble renders blocks in a temporary classic preset with the host's macro
// environment (current chat, character, persona, memories, ...). These checks are a
// best-effort guard, not a sandbox: macro names come from Lumiverse v1.2.5 and other
// extensions can register or intercept macros.

// Built-in macros (names and aliases, lower-case) that expand host data Side Story
// does not let the user pick: memories/Cortex, databank, chat messages, character
// and persona cards, World Info outlets, Loom summary, web search, chat/global vars.
export const HOST_DATA_MACROS=new Set(`
memories longtermmemory chatmemory ltm memoriesraw memoriesactive memoriescount
entities entityfacts entityname relationships arc memorysalience cortexactive entitycount charactercolors
databank databankmemory documents knowledgebank databankactive databankcount databankraw
lastmessage last_message lastmessageid last_message_id lastusermessage last_user_message lastcharmessage last_char_message lastbotmessage lastmessagename
messageat message_at msgat messagesby messages_by msgby foreachmessage for_each_message messagecount message_count
rejectedswipe rejectedgeneration regeneratedmessage userinput user_input
description chardescription personality charpersonality scenario charscenario persona userpersona
chargroupfocuseddescription charfocuseddescription char_group_focused_description chargroupfocusedpersonality charfocusedpersonality char_group_focused_personality
mesexamples mes_examples examplemessages mesexamplesraw system charprompt charsystem
charposthistoryinstructions charinstruction jailbreak charjailbreak chardepthprompt depth_prompt
charcreatornotes creatornotes firstmessage firstmes first_message original
wi_marker wimarker outlet persona_outlet personaoutlet
loomsummary loomsummaryprompt loomlastusermessage loomlastmessagename loomlastcharmessage
websearchcontext web_search_context
getchatvar foreachchatvar for_each_chat_var getgvar getglobalvar foreachglobalvar foreachgvar for_each_global_var
getchatvarkey getgvarkey getglobalvarkey getglobalvarindex
`.split(/\s+/).filter(Boolean));
export const SEALED_MACROS=new Set(['presetblock','pblock']);
export const APPEND_ROLES=new Set(['user_append','assistant_append']);
export const SUPPORTED_ENGINE='classic';
// Missing engine is stored as 'classic' by the host (column default).
export const presetEngine=p=>typeof p?.engine==='string'&&p.engine?p.engine:SUPPORTED_ENGINE;
export const isSealedPreset=p=>!!p?.metadata&&typeof p.metadata==='object'&&p.metadata._lumiverse_sealed_preset!=null;

// Macro names as the host lexer reads them: optional flags, then `.name`/`$name`/`@name` or an identifier.
export function macroNames(value){
 const src=typeof value==='string'?value:JSON.stringify(value??'');const names=[];
 for(const m of src.matchAll(/\{\{\s*[!?~>/#]*\s*([.$@]?)([A-Za-z0-9_-]*)/g))names.push(m[1]==='$'||m[1]==='@'?m[1]+'var':m[2].toLowerCase());
 return names;
}
// Text that a block renders from: its content, its variable definitions and the user's saved values.
export function blockMacros(block,promptVariables){
 const names=[...macroNames(block.content),...(block.variables?macroNames(block.variables):[]),...(promptVariables&&promptVariables[block.id]!=null?macroNames(promptVariables[block.id]):[])];
 return {sealed:names.some(n=>SEALED_MACROS.has(n)),data:[...new Set(names.filter(n=>HOST_DATA_MACROS.has(n)||n==='$var'||n==='@var'))]};
}
export const presetVariables=p=>p?.metadata?.promptVariables&&typeof p.metadata.promptVariables==='object'?p.metadata.promptVariables:{};
// One block classification for the dropdown and the preview, so both report the same support level.
// Order matters: markers, disabled, empty, append, sealed, then host-data macros; the rest go to host assembly.
export function classifyBlocks(p){
 const vars=presetVariables(p);const r={blocks:[],skipped:[],append:[],sealed:[],data:[],disabled:0,empty:0,vars,sealedPreset:isSealedPreset(p)};
 for(const b of Array.isArray(p?.prompt_order)?p.prompt_order:[]){if(!b||typeof b!=='object'||typeof b.id!=='string')continue;const label=b.name||b.id;if(b.marker){r.skipped.push(label);continue;}if(b.enabled===false){r.disabled++;continue;}if(typeof b.content!=='string'||!b.content.trim()){r.empty++;continue;}
  if(APPEND_ROLES.has(b.role)){r.append.push(label);continue;}
  const scan=blockMacros(b,vars);if(scan.sealed){r.sealed.push(label);continue;}if(scan.data.length){r.data.push(`${label} ({{${scan.data.join('}}, {{')}}})`);continue;}
  r.blocks.push(b);}
 return r;
}
export const NOT_APPLIED='적용 안 됨 — 포함할 블록 없음';
// Support level: unsupported (engine), none (no block reaches host assembly, so no preset instructions),
// partial (some blocks left out as unsupported or for host data), full.
export function supportOf(engine,c){
 if(engine!==SUPPORTED_ENGINE)return {level:'unsupported',engine,reason:`${engine} 엔진 미지원`};
 const reasons=[...(c.sealed.length||c.sealedPreset?['봉인 블록 제외']:[]),...(c.append.length?['append 블록 제외']:[]),...(c.data.length?['자료 매크로 블록 제외']:[])];
 if(!c.blocks.length)return {level:'none',engine,reason:[NOT_APPLIED,...reasons].join(', ')};
 return reasons.length?{level:'partial',engine,reason:reasons.join(', ')}:{level:'full',engine,reason:''};
}
// Support level shown in the preset dropdown, computed from the list row (no extra host calls).
// A row without prompt_order says nothing about its blocks, so it is not labelled 'none'.
export function presetSupport(p){const engine=presetEngine(p);if(engine!==SUPPORTED_ENGINE)return supportOf(engine,null);
 const c=classifyBlocks(p);if(!Array.isArray(p?.prompt_order)&&!c.sealedPreset)return {level:'full',engine,reason:''};return supportOf(engine,c);}
export const PRESET_NOT_APPLIED_NOTICE='프리셋 지시문이 적용되지 않습니다: 포함할 수 있는 블록이 없어 프리셋 없이 보낸 것과 같습니다. 빠진 블록과 이유는 제외 목록을 확인하세요.';
export const PRESET_MACRO_NOTICE='주의: 프리셋 블록의 매크로는 호스트가 현재 채팅 기준으로 펼칩니다. 알려진 호스트 자료 매크로(기억·Cortex·데이터뱅크·대화 본문·캐릭터/페르소나 카드·World Info 출력 등)가 든 블록은 뺐지만 전수 검사가 아닙니다. 캐릭터·사용자 이름처럼 직접 선택하지 않은 호스트 자료가 들어갈 수 있으니 아래 system 본문을 확인하세요.';
export const EMBEDDING_NOTICE='임베딩: 프리셋 조립에 호스트 프롬프트 조립을 쓰므로, 임베딩이 켜져 있고 활성 데이터뱅크가 있으면 현재 채팅의 최근 메시지 최대 6개 본문(여기서 체크하지 않은 메시지 포함)이 설정된 임베딩 공급자로 전송될 수 있습니다. 같은 내용이 캐시(약 10분)에 있으면 요청이 생략될 수 있고, 미리보기를 다시 만들 때마다 다시 시도합니다. 기억 검색 등 다른 조립 단계도 임베딩을 요청할 수 있어 요청 횟수는 정해져 있지 않습니다. 모델 생성 요청은 보내지 않습니다.';
