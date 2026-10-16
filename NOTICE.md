# 원저작물 고지

Side Story (사이드 스토리)는 Byulchaek 및 ST-Sidestory 기여자의 작업을 바탕으로 합니다.
원작은 [SillyTavern용 ST-Sidestory](https://github.com/f-en-rep/ST-Sidestory)와 [Marinara용 Side Story/이면 Side-B](https://m.dcinside.com/mini/aichatfrontend/163)이며, mallang0723이 원 게시글 작성자의 허가를 받아 Lumiverse용으로 변환·이식했습니다.

참조한 SillyTavern 원본: https://github.com/f-en-rep/ST-Sidestory/tree/252fd07ebbb8e134d1e312f9aab034117ce03a95
고정 버전: 0.9.8 / 252fd07ebbb8e134d1e312f9aab034117ce03a95.

프롬프트와 토큰 예산 코드의 재사용·수정 내역 및 원본 파일 SHA-256은 UPSTREAM.json에 기록합니다. 번역 계약과 HTML 텍스트 구간 처리 정책은 같은 버전 src/extras.js를 참고하여 구현했습니다. 호스트 소스는 포함하지 않습니다.

identity 추출 프롬프트와 allowlist는 src/facet.js에서, 백업 envelope와 변환 규칙은 src/extension.js 및 src/core.js에서 수정·참조했습니다.

작업 폴더 탭·작성/읽기·참고 자료·보관함의 화면 구조는 같은 고정 버전의 src/extension.js, src/composer.js, src/design.js, src/compact.js, src/style.css를 참고해 이식했습니다. 스타일은 호스트 drawer에 격리하고 Lumiverse 테마 변수로 연결했습니다. 원작의 전체 화면 overlay나 ST 전역 객체를 복제하지 않았습니다.

## 원 게시글 및 허가 출처

- 원 게시글 작성자: https://m.dcinside.com/mini/aichatfrontend/163
- 원작 이용 안내 요지: 개인 사용·수정 허용, 상업 이용 금지. 원본·수정본의 다른 사이트나 개인 GitHub 별도 재배포는 삼가 달라는 안내가 있으며, 내장 프롬프트의 비상업 공유는 원 게시글을 언급하는 조건으로 허용합니다.
- 개별 허가 출처: 위 원 게시글의 2026-10-14 댓글. Lumiverse 버전의 커뮤니티 배포 및 GitHub 업로드와 원작 포크 또는 크레딧에 대한 요청을 원 게시글 작성자가 허가했습니다.
- 이식판 라이선스: [PolyForm Noncommercial License 1.0.0](LICENSE). 원작의 비상업 조건을 유지합니다. 위 개별 허가를 상업 이용 허가로 해석하지 않습니다.

허가 캡처 이미지는 포함하지 않습니다. 이 고지는 출처 및 허가 기록이며, 라이선스 전문을 대체하지 않습니다. 이식판은 Lumiverse 및 ST-Sidestory의 공식 확장이나 공식 제휴 프로젝트가 아닙니다.

## 리비전 이력

| 날짜 | 변경 |
|---|---|
| 2026-10-14 | 고정 출처 고지 |
| 2026-10-14 | identity·백업 출처 추가 |
| 2026-10-15 | 원 게시글·개별 허가·라이선스 명시 |
| 2026-10-15 | ST·Marinara 원작과 이식자 구분 |
| 2026-10-16 | 원작 UI 참고 범위 통합 |
