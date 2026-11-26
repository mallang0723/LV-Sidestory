# 원작 대비 빌드 패치 — 0.2.5-v1

`upstream/`는 `UPSTREAM.json`에 고정한 ST-Sidestory 0.17.0 원본입니다. SHA-256과 git blob SHA-1 검사는 `npm run verify:original` 및 `npm test`에서 실행합니다. 원본은 수정하지 않고 `src/lumiverse/patches.mjs`의 앵커를 빌드 중에만 치환합니다. 앵커가 없거나 개수가 달라지면 빌드를 중단합니다.

## 0.2.5-v1 UUID 호환 패치

| 원작 위치 | 변경 | 적용 범위 |
|---|---|---|
| `transport.js`의 `H.uuid` | 직접 브라우저 UUID 접근 및 시간·난수 대체식을 `stHost.uuid()`로 치환 | 아티클·복제·편집·시리즈·폴더·프리셋·규칙·발췌 배경·생성·번역·요청 내역 ID |
| `renderer.js`의 `snapshotInteractive` | 직접 브라우저 UUID 접근 및 자체 난수 대체식을 `stHost.uuid()`로 치환 | 상호작용 HTML 화면의 PNG 캡처 요청 ID |

두 패치 모두 정확히 한 곳씩 적용됩니다. `createLumiverseHost`가 설정 시 받은 `ctx`를 `stHost.uuid()`에 캡처하고, `src/lumiverse/ids.js`의 공용 `uuid(ctx)`를 호출합니다. RPC 요청 ID와 어댑터 생성 실행 ID도 같은 헬퍼를 사용합니다.

헬퍼는 `ctx.uuid.v4`가 함수이면 호스트 API를 호출합니다. API가 없는 Lumiverse 1.2.5 개발 빌드에서는 `crypto.getRandomValues`의 16바이트로 RFC 4122 v4를 만듭니다. 버전·variant 비트를 설정하며 HTTP/LAN에서도 동작합니다. 호스트 API 오류는 그대로 전달합니다.

`upstream/src/st-host.js`는 프런트엔드에 포함되지 않는 원작 전용 어댑터이므로 그대로 둡니다. 백엔드 UUID 경로에는 변경이 없습니다.

## 기존 패치와 이식 범위

- `core.js`: 화면 버전을 `LV 0.2.5-v1 · ST 0.17.0`으로 표시합니다.
- `extension.js`: 임베디드 서랍에서 문서 전체 키 입력을 가로채지 않습니다.
- 문구 치환 15건: `extension.js` 1건, `generation.js` 4건, `design.js` 1건, `shell.js` 5건, `compact.js` 2건, `extras-ui.js` 1건, `extras.js` 1건. 호스트·연결·로어북 안내를 Lumiverse 용어로 바꿉니다.

총 앵커 패치는 19건입니다. 별도의 스타일 변환과 호스트 연결은 `src/lumiverse/`에 있으며, 기능별 차이와 검증 범위는 [QA.md](QA.md)에 기록합니다.
