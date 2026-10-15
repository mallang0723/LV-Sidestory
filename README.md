루미버스용 · 비공식 (Unofficial, for Lumiverse)

# Side Story (사이드 스토리)

Side Story는 Lumiverse에서 단일 캐릭터의 별도 이야기를 생성·번역하고, 본편과 분리해 보관하는 비공식 확장입니다. 대화와 World Book 자료를 직접 선택한 뒤 프롬프트를 확인하고 생성할 수 있으며, 결과 편집·JSON 백업·제한된 정적 HTML 표시를 지원합니다.

Lumiverse 공식 확장이 아니며, Lumiverse 팀이 만들거나 승인·보증·지원하는 확장이 아닙니다. 원본 ST-Sidestory의 모든 기능을 구현한 것은 아니며 실제 모델 응답 품질을 검증한 것은 아닙니다.

자료 불러오기 → 대화 ID 및 World Book 목록/엔트리 페이지 선택 → 연결 선택 → 프롬프트 미리보기 → 명시적 생성 확인 순서로 사용합니다. 현재 연결은 호스트 `connections.active` selector에서 선택하며, 사용할 수 없으면 직접 선택해야 합니다. 본편 채팅·Cortex·World Book을 수정하지 않습니다. 토큰 수와 근사 여부, 제외 자료를 미리보기에서 확인하세요.

번역은 결과와 연결, 언어를 선택하고 번역 프롬프트를 확인한 다음 실행합니다. 원문은 보존됩니다. HTML은 텍스트 구간만 전송합니다. 잘못된 JSON 또는 누락/중복 ID는 복구 자료로 보관하며 수동 segment JSON으로 수정할 수 있습니다. 8,000 입력 토큰 초과 번역은 거부합니다.

편집은 자식 결과를 만듭니다. 제거 전 전체 JSON을 내보내세요. schema 1 및 ST-Sidestory version 1/2 백업을 제한된 크기로 검증·변환합니다. 원본 tags/번역/lineage는 보존하며 상세 제한은 QA.md에 기록합니다. 가져온 호스트 ID는 재매핑 확인 전 사용하지 않습니다. HTML은 제한된 정적 태그만 표시하며 원본 스크립트를 실행하지 않습니다.

`npm test`, `npm run build`, `npm run qa:browser`로 검증합니다. Bun 경로는 `BUN_BIN`, Chromium 경로는 `CHROMIUM_BIN`으로 지정할 수 있습니다. ZIP에는 실행물·소스·vendor·출처·문서·테스트·합성 브라우저 harness를 포함합니다. 실행기는 headless Chromium만 사용하며 일반 브라우저 탭을 자동으로 열지 않습니다.

소스 저장소 및 배포 안내: https://github.com/mallang0723/LV-Sidestory

기능 제한과 검증 범위는 [QA.md](QA.md), 원저작물 출처와 허가 출처는 [NOTICE.md](NOTICE.md)를 확인하세요. [PolyForm Noncommercial License 1.0.0](LICENSE)에 따라 제공하는 비상업 source-available 소프트웨어입니다. 상업적 이용은 이 라이선스로 허용되지 않습니다.

설치 권한의 `chat_mutation`은 호스트의 대화 메시지 조회 API에 필요하며, 이 확장은 메시지 읽기에만 사용하고 본편 메시지를 수정하지 않습니다. World Book 연결 자동 탐색은 지원하지 않으므로 자료를 직접 선택해야 합니다.

핵심정보는 구조화 JSON을 검토하고 “핵심정보로 선택”으로 승인한 뒤 AU에 사용합니다. 생성·번역 요청은 호출 전에 durable journal을 기록하며 불명확한 요청을 자동으로 재과금하지 않습니다.

저장 실패 후 같은 런타임의 미취소 요청은 재과금 없이 저장을 재시도할 수 있습니다. 재시작 후 record에 저장되지 않은 journal 결과는 취소 여부를 입증할 수 없어 자동 복원을 거부합니다. 원문 journal은 남지만 수동 복구 UI는 없습니다. 이미 저장된 결과의 재조회는 정상 지원합니다.
