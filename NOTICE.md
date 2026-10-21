# 원저작물 고지

Side Story (사이드 스토리)는 Byulchaek 및 ST-Sidestory 기여자의 작업을 바탕으로 합니다.
원작은 [SillyTavern용 ST-Sidestory](https://github.com/f-en-rep/ST-Sidestory)와 [Marinara용 Side Story/이면 Side-B](https://m.dcinside.com/mini/aichatfrontend/163)이며, mallang0723이 원 게시글 작성자의 허가를 받아 Lumiverse용으로 변환·이식했습니다.

참조한 SillyTavern 원본: https://github.com/f-en-rep/ST-Sidestory/tree/727099430bb6725542656f1cd2b1adf1b3357f05
고정 버전: 0.17.0 / 727099430bb6725542656f1cd2b1adf1b3357f05.

0.2.0부터 이 고정 버전의 소스 파일을 `upstream/`에 바이트 그대로 포함하고(파일별 SHA-256·git blob은 UPSTREAM.json), 원작 `build.py`와 같은 방식으로 묶어 실행합니다. 원작의 SillyTavern 어댑터(`src/st-host.js`)는 실행물에 넣지 않고, 같은 역할을 하는 Lumiverse 어댑터(`src/lumiverse/`)를 새로 작성했습니다. 원작 파일에 가한 변경(버전 표기, 문서 전체 키 입력 처리, 호스트 이름 문구)은 `src/lumiverse/patches.mjs`에 모두 적었고, 화면 폭 조건을 서랍 폭 기준으로 바꾸는 스타일 변환은 `src/lumiverse/css-transform.mjs`, 휴대폰에서 작은 글자·버튼을 키우는 덧씌움 규칙은 `src/lumiverse/css-floor.mjs`에 있습니다. 원작 프롬프트·화면·보관함 형식은 원작 그대로입니다.

이전 0.1.x는 원작 0.9.8(252fd07ebbb8e134d1e312f9aab034117ce03a95)의 일부를 참고해 다시 작성한 것이었으며, 0.2.0에서 그 코드를 걷어내고 위 방식으로 바꿨습니다.

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
| 2026-10-21 | 0.2.0: 고정 원작을 0.17.0으로 갱신, 원작 소스 포함·어댑터 방식 설명 |
