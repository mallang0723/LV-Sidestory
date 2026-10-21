// Every change made to the upstream ST-Sidestory sources at build time.
// The files in upstream/ stay byte-identical to the pinned upstream commit; scripts/build-app.mjs
// applies this table and fails when an anchor is missing or appears a different number of times,
// so an upstream update shows exactly which line needs a new look.
//
// kind: 'behavior' changes what the code does, 'text' only changes user-facing wording
// (SillyTavern names → Lumiverse names). Everything else Lumiverse-specific lives in
// src/lumiverse/ (host adapter, prelude shims, glue, style overrides) without touching upstream.
export const PATCHES=[
 {file:'core.js',kind:'behavior',why:'버전 표시: 이식판 버전과 원작 버전을 함께 보여 줌',
  find:"const VERSION='ST 0.17.0'",replace:"const VERSION='LV 0.2.0 · ST 0.17.0'"},
 {file:'extension.js',kind:'behavior',why:'호스트 서랍 안에서는 문서 전체 키 입력을 가로채지 않음 (Side Story 안의 입력은 host 요소에서 그대로 처리)',
  find:"document.addEventListener('keydown',e=>{keydown(e);if(opened)e.stopPropagation();});",
  replace:"if(!stHost.embedded)document.addEventListener('keydown',e=>{keydown(e);if(opened)e.stopPropagation();});"},

 // ---- wording only ----
 {file:'extension.js',kind:'text',find:"'월드인포 목록을 불러오지 못했어요. '",replace:"'로어북 목록을 불러오지 못했어요. '"},
 {file:'generation.js',kind:'text',find:"'실리태번의 API 연결을 설정해 주세요.'",replace:"'루미버스의 API 연결을 설정해 주세요.'"},
 {file:'generation.js',kind:'text',find:"'현재 채팅에서 요술봉 메뉴로 다시 열어 주세요.'",replace:"'현재 채팅에서 Side Story 탭을 다시 열어 주세요.'"},
 {file:'generation.js',kind:'text',find:"'실리태번 현재 프롬프트 · 직접 선택한 로어북 엔트리 사용'",replace:"'루미버스 현재 프롬프트 · 직접 선택한 로어북 엔트리 사용'"},
 {file:'generation.js',kind:'text',find:"'실리태번 현재 프롬프트 · 캐릭터/월드인포/채팅 컨텍스트 사용'",replace:"'루미버스 현재 프롬프트 · 캐릭터/로어북/채팅 컨텍스트 사용'"},
 {file:'design.js',kind:'text',find:"'“현재 실리태번 연결”을 쓰면 캐릭터 카드 · 월드인포 · 작가 노트 · 현재 채팅 등 실리태번이 조립한 프롬프트 맨 끝에 Side Story 요청을 마지막 유저 메시지로 붙여 보내요.",
  replace:"'“현재 루미버스 연결”을 쓰면 루미버스가 지금 프리셋으로 조립한 프롬프트(캐릭터 카드 · 로어북 · 작가 노트 · 현재 채팅 등) 맨 끝에 Side Story 요청을 마지막 유저 메시지로 붙여 보내요."},
 {file:'shell.js',kind:'text',find:"'로어북 ST 설정'",replace:"'로어북 루미버스 설정'"},
 {file:'shell.js',kind:'text',find:"'ST 설정 따르기'",replace:"'루미버스 설정 따르기'"},
 {file:'shell.js',kind:'text',find:">ST 설정 따르기<",replace:">루미버스 설정 따르기<"},
 {file:'shell.js',kind:'text',find:"지금 ST의 로어북 활성화·키워드 설정을 그대로 써요.",replace:"지금 루미버스의 로어북 활성화·키워드 설정을 그대로 써요."},
 {file:'shell.js',kind:'text',find:"현재 실리태번 연결로 만들 때, 요청 맨 앞에 붙는 안내예요. RP 프리셋에서 무엇을 그대로 따르고 무엇을 이번 요청에서만 내려놓을지 적어요. {{char}} · {{user}} 매크로는 실리태번이 치환해요.",
  replace:"현재 루미버스 연결로 만들 때, 요청 맨 앞에 붙는 안내예요. 루미버스 프리셋에서 무엇을 그대로 따르고 무엇을 이번 요청에서만 내려놓을지 적어요. {{char}} · {{user}}는 Side Story가 캐릭터·페르소나 이름으로 바꿔요."},
 {file:'compact.js',kind:'text',find:"ST가 조립한 최종 프롬프트를 받지 못했어요. 텍스트 컴플리션 연결이거나 이전 버전에서 보낸 요청이에요.",replace:"루미버스가 조립한 최종 프롬프트를 받지 못했어요. 이전 버전에서 보낸 요청이에요."},
 {file:'compact.js',kind:'text',find:"현재 ST 프리셋에 Side Story 요청을",replace:"현재 루미버스 프리셋에 Side Story 요청을"},
 {file:'extras-ui.js',kind:'text',find:"현재 ST 연결에서는 추가 지침·직접 요약·이전 아티클·이번 요청을 검사하며, ST가 조립하는 전체 컨텍스트 한도는 ST 설정을 따라요.",
  replace:"현재 루미버스 연결에서는 추가 지침·직접 요약·이전 아티클·이번 요청을 검사하며, 루미버스가 조립하는 전체 컨텍스트 한도는 루미버스 설정을 따라요."},
 {file:'extras.js',kind:'text',find:"컨텍스트 한도가 모자라 ST가 뒤쪽 프롬프트를 버렸을 가능성이 커요.",replace:"컨텍스트 한도가 모자라 루미버스가 뒤쪽 프롬프트를 버렸을 가능성이 커요."},
];

/** Applies PATCHES to {file:text}; throws on any anchor whose count differs from `count` (default 1). */
export function applyPatches(files,patches=PATCHES){
 const out={...files};
 for(const p of patches){
  const text=out[p.file];if(typeof text!=='string')throw Error(`patch target missing: ${p.file}`);
  const n=text.split(p.find).length-1,want=p.count??1;
  if(n!==want)throw Error(`upstream patch anchor in ${p.file} found ${n}×, expected ${want}×: ${p.find.slice(0,80)}`);
  out[p.file]=text.split(p.find).join(p.replace);
 }
 return out;
}
