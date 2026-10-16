# 검증 범위와 기능 제한

## 검증된 후보 — 2026-10-14

합성 단위 테스트 27/27, Bun 번들, headless 브라우저 harness를 통과했습니다. 실제 호스트 설치는 무데이터 격리 사본의 `POST /api/v1/spindle/import-local` scanner/build/등록 경로에서 성공했습니다. registry SQL fixture를 설치 증거로 사용하지 않았으며, 설치 범위는 로컬 import의 기본 operator입니다.

- `records/` 목록 조회는 실제 호스트의 디렉터리 상대경로 계약을 사용합니다.
- 호출 직전 취소된 요청은 모델을 시작하지 않습니다. 생성·번역 complete journal 직후 취소는 durable cancelled marker로 기록합니다.
- marker 저장 실패를 포함하여, 재시작 후 record에 저장되지 않은 journal 결과는 자동 복원을 거부합니다. record 저장 실패는 같은 살아 있는 런타임에서 미취소가 확인된 요청만 재과금 없이 저장 재시도할 수 있습니다. 이미 저장된 결과는 재시작 후에도 재조회할 수 있습니다.
- schema 1의 tags·메타데이터 타입 및 활성 필드 allowlist를 검증합니다. 번역 segment를 원문과 대조하며, 가져온 identity는 재승인 전 사용하지 않습니다.
- 브라우저 검사는 별도 CDP page와 실제 번들 frontend 버튼을 사용합니다. pending Worker의 dispose 시 terminate 및 Blob URL 회수를 확인했습니다.
- 실제 격리 설치 QA 21/21: frontend↔worker RPC, import·편집 자식 저장, 보관함·전체 JSON export 2건, 전체 호스트 재시작 후 유지, chats/generation 권한 회수, disable 시 frontend 제거/backend 중지, 보관 데이터 유지, DB integrity, page errors 0.

## 설치 실행물과 자동 빌드

수정 전 공개 소스의 깨끗한 GitHub clone에서 실제 호스트 `buildExtension()`을 실행하면 성공 반환 뒤에도 backend/frontend 실행 파일이 둘 다 없었습니다. 자동 빌드는 `.ts` 진입점만 탐색하며 별도의 npm build script를 실행하지 않는 것이 원인이었습니다.

TypeScript 진입점을 추가한 수정 후보에서는 dist·node_modules 없는 소스 사본으로 실제 호스트 자동 빌드 후 두 실행 파일의 생성 및 frontend `setup`/backend `install` export를 확인했습니다. 무데이터 격리 호스트의 소스 전용 로컬 scanner 설치 검사 22/22에서 Side 탭 표시·frontend↔backend RPC·저장·전체 JSON 내보내기·전체 호스트 재시작 후 재표시·권한 회수·disable을 통과했습니다. 기존 데이터·유료 모델은 사용하지 않았습니다. 단위 회귀 검사는 28/28 통과했습니다.

위 결과는 이전 소스 빌드 후보의 관측입니다. 현재 저장소는 `dist/backend.js`와 `dist/frontend.js`를 직접 추적해 사용자 기기의 빌드에 의존하지 않으며, TypeScript 진입점도 보조로 유지합니다. 소스 변경 시 Bun 1.4.0으로 빌드하고 깨끗한 clone에서 재빌드 바이트 일치를 확인해야 합니다. 로컬 설치 검증을 공개 원격 저장소의 배포 확인으로 확대하지 않습니다.

## 재현 가능한 합성 검사

UI 후보는 원작 0.9.8의 작업 폴더·작성/결과·참고 자료·보관함 구조를 따르도록 정리했습니다. 생성/번역/저장 계약을 새로 만들지 않고 기존 RPC에 연결하며, 대화 체크 선택·본문 읽기·검색 카드·분리된 설정을 제공합니다. 원작의 폴더/태그 관리·입력 히스토리·지침 프리셋 전체를 복원한 것은 아닙니다. UPSTREAM.json에 참고 범위를 표시합니다.

무데이터 실제 호스트의 소스 전용 설치에서 폴더 전환·대화 체크·카드 검색·읽기·파생본 편집·재시작·disable 등 UI 검사 21/21을 통과했습니다. 별도 합성 모델의 실제 클릭 흐름 검사 11/11에서 모바일 미리보기→확인→생성, 320px/넓은 화면 배치와 무의미한 모델 재호출이 없음을 확인했습니다. 어두운 테마는 실제 호스트 화면, 밝은 팔레트는 확장에만 적용한 합성 CSS 토큰 전환으로 구분해 확인했습니다. 실제 모델/provider 호출은 하지 않았습니다. UI 사용자 인수와 공개 반영은 이 로컬 검증과 별개입니다.

- `npm test`: 공개 서비스 경로와 합성 host/model API를 사용한 회귀 검사.
- `npm run build`: backend/frontend Bun 번들 및 설치 ZIP 생성. Bun이 PATH에 없으면 `BUN_BIN`으로 지정합니다.
- `npm run qa:browser`: localhost HTTP, 390×844 CDP viewport의 headless Chromium harness. console/page/Log 오류를 수집하고 종료 시 서버·브라우저를 정리합니다. 일반 브라우저 탭은 자동으로 열지 않습니다. Chromium 경로는 `CHROMIUM_BIN`으로 지정합니다.

private 실행 로그와 호스트 자료는 설치 ZIP에 포함하지 않습니다. 위 실제 설치 결과는 2026-10-14 후보의 관측이며 합성 검사만으로 실제 호스트 통합 성공을 주장하지 않습니다.

## 지원 범위

- 단일 캐릭터 identity 추출 프롬프트·필드 allowlist 및 승인 보기. AU는 승인된 identity만 사용하며 카드 파일을 내보냅니다.
- World Book 목록 및 엔트리 20개 페이지 선택. 책 접근을 확인하고 명시적으로 선택한 엔트리만 사용하며 원본 엔트리를 변경하지 않습니다.
- 모델 호출 전 durable request journal 기록. 불명확한 요청은 자동 재시도하지 않으며 동일 request ID에 다른 preview를 사용하지 않습니다.
- 번역 preview→run, 순서 복원·부분 ID 복구·원문 보존. HTML은 제한된 정적 태그와 텍스트 구간 치환을 사용하고 원본 스크립트를 실행하지 않습니다.
- ST-Sidestory version 1/2 백업 envelope 및 schema 1 import. 원본 tags·번역 자료·lineage·폴더는 비활성 보관 자료에 보존하고 활성 호스트 참조와 분리합니다. 가져온 ID는 새로 매핑하며 재승인이 필요합니다.

## 정확한 잔여 한계

- 실제 provider/유료 호출과 모델 응답 품질은 검증하지 않았습니다. 모델 호출·취소의 타이밍 검사는 합성 fault injection이며 실제 과금 취소 관측이 아닙니다.
- 실제 설치는 로컬 scanner 경로입니다. GitHub install/remove/reinstall 및 사용자별 설치 정책 전체는 검증하지 않았습니다.
- 재시작 후 journal에만 남은 결과는 ambiguous로 자동 복원을 거부합니다. 원문 journal은 남지만 수동 복구 UI는 없습니다. journal 보존은 호스트 userStorage 계약에 의존하며 record 파일 쓰기 도중 장애의 트랜잭션 원자성을 보장하지 않습니다.
- World Book 글로벌/캐릭터/페르소나 연결 자동 탐색·표시는 없고 직접 책을 선택해야 합니다. 목록 끝의 다음 페이지 버튼은 비활성화하지 않습니다.
- 번역은 8,000 입력 토큰 초과를 거부하며 자동 분할을 지원하지 않습니다. HTML entity 디코딩은 numeric 및 amp/lt/gt/quot/apos/nbsp만 지원하며 나머지 named entity는 문자로 유지합니다. 전체 HTML parser가 아닌 제한된 정적 태그 문법입니다.
- ST import는 1MB 파일, 200 records, 항목 content 100k 제한으로 원본 최대 크기보다 좁습니다. legacy facet plan이 identity v1과 다르면 거부합니다. ST settings는 활성 설정으로 복원하지 않고 원본 레코드 내부 자료로만 보존합니다. import translationView는 보존하지만 segment 번역 UI로 자동 변환하지 않습니다. 원본 backup validator와 동일한 의미 검증은 아닙니다.
- 원본의 다중 대상/관계/연속성 편집 UI 전체를 복원하지 않았습니다. allowlist는 필드 구조만 검증하므로 모델이 생성한 내용의 사실성은 사용자가 승인 전 확인해야 합니다.

라이선스 전문은 [LICENSE](LICENSE), 원작 이용 안내와 개별 허가 출처는 [NOTICE.md](NOTICE.md)를 확인하세요.

## 리비전 이력

| 날짜 | 변경 |
|---|---|
| 2026-10-14 | 최초 후보·batch 1 기록 |
| 2026-10-14 | batch 2·잔여 범위 기록 |
| 2026-10-14 | 부모 독립 FAIL·재개 경계 기록 |
| 2026-10-14 | 후속 수정·실제 설치 QA 기록 |
| 2026-10-15 | 현재 검증·제한 중심 공개 문서 정리 |
| 2026-10-15 | 소스 전용 설치·자동 빌드 검증 추가 |
| 2026-10-15 | 원작 UI 구조·실클릭 검증 기록 |
| 2026-10-16 | dist 추적·자동 빌드 경계 정정 |
