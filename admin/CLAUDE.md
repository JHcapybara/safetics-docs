# TBM 관리자 사용 설명서 — Claude 작업 지침서

이 폴더는 "TBM 관리자 웹" 사용 설명서의 원본과 도구 일체다.
누가 어떤 Claude 세션에서 열든, 이 지침을 **반드시** 따라 매뉴얼을 수정·빌드한다.
사용자는 대부분 비개발자(기획/운영)이므로 쉬운 말로 설명하고, 아래 절차는 네가 알아서 처리한다.

## 파일 구조

| 경로 | 역할 |
|---|---|
| `index.html` | 매뉴얼 **원본. 모든 수정은 이 파일에만** 한다 |
| `TBM_사용설명서_vX.XX.html` | 공유용 최종본(빌드 산출물). **직접 수정 금지**, 버전별로 쌓여 이력이 됨 |
| `img/` | 스크린샷. `index.html`이 상대 경로로 참조 |
| `editor.html` | 비개발자용 GUI 편집기 (index.html을 열어 수정) |
| `tools/build.mjs` | 최종본 빌드 스크립트 |
| `tools/import.mjs` | 수정된 최종본을 index.html로 역반영하는 스크립트 |
| `readme.txt` | 사람용 안내서 |
| `.claude/commands/manual-update.md` | `/manual-update` 명령 정의 |

## 절대 규칙

1. **수정은 `index.html`에만.** 최종본(`TBM_사용설명서_*.html`)을 직접 고치지 말 것.
   예외: 사용자가 "수정된 최종본"을 들고 온 경우 → `node tools/import.mjs "<그 파일>"`로 index.html에 역반영부터.
2. **버전 규칙**: index.html 내용을 수정할 때마다 버전을 **+0.01** 올린다. 표기는 두 곳 — 반드시 동시 갱신:
   - `<!-- manual-version: X.XX -->` 주석
   - footer의 `<span id="docVersion">문서 버전 X.XX</span>`
3. **수정 후 항상 빌드**: `node tools/build.mjs` → `TBM_사용설명서_v{버전}.html` 생성. 구버전 파일은 지우지 않는다(이력).
4. **버전업 직후 사용자에게 이 메모를 대화로 보여줄 것** (index.html에는 넣지 않음):
   > 📌 문서 버전 X.XX로 업데이트했습니다. PDF 페이지 전환 커스텀 설정할 것 있으면 추가로 요청해주세요 (형식: "2.2 앞에서").
5. **PDF 페이지 전환**: 사용자가 "2.2 앞에서"라고 하면 해당 항목의 `<article>`에 `pdf-break` 클래스를 추가한다
   (인쇄 CSS `article.pdf-break { break-before: page; }`가 이미 있음). **PDF 전용 — 웹 화면 표시가 바뀌면 안 됨.**
6. **용어/문구는 실제 앱 UI와 100% 일치**시킨다. "양식"과 "템플릿"은 같은 뜻(첫 등장 시 병기).
7. 문서 구조·디자인(사이드 목차, 검색, 스텝 번호, 주의/팁 박스, 권한 배지)은 기존 패턴을 유지한다.

## 표준 작업 절차 (수정 요청이 오면)

1. 요청 파악 → `index.html`에서 해당 부분 수정 (섹션 이동 시 번호·사이드바 목차·상호 링크도 함께 정리)
2. 버전 +0.01 (두 곳)
3. Node 확인 후 `node tools/build.mjs` 실행
4. 결과 검증(아래) → 사용자에게 바뀐 내용·새 버전 파일명 보고 + 규칙 4의 메모 출력

## Node.js가 없을 때 (빌드 실패: 'node'를 찾을 수 없음)

1. 사용자에게 설명: "매뉴얼 빌드에 Node.js(무료 실행 도구)가 필요합니다. 설치할까요? 1~2분 걸립니다."
2. 동의하면: `winget install OpenJS.NodeJS.LTS` 실행 → 완료 후 **새 터미널에서** `node -v`로 확인
3. winget이 없으면 https://nodejs.org 에서 LTS 설치 파일을 받도록 안내 (기본 옵션으로 다음-다음-설치)
4. 그래도 불가하면: 수정과 버전업까지만 완료하고, "빌드는 Node 설치 후 `node tools/build.mjs` 한 번"이라고 안내

## 검증 체크리스트 (빌드 후)

- 새 `TBM_사용설명서_v{버전}.html`이 생성되었는지, 용량이 대략 1.5MB인지
- 빌드 로그에 "이미지 11개 내장" (누락 경고 없는지)
- 가능하면 브라우저(또는 Playwright 있으면 자동)로 열어: 목차 이동·검색·이미지 표시 확인
- 섹션 번호 연속성, 깨진 앵커(#) 링크 없는지
- PDF 관련 수정이었다면: PDF로 저장해서 페이지 나눔 확인 (빈 페이지가 생기면 안 됨)

## 알아둘 것 (수정 시 함정)

- **최종본에는 숨김 편집기가 내장**됨 (S+F+T 누른 채 "⚙ PDF 페이지 설정" 버튼 왼쪽 투명 버튼 3연클릭).
  빌드가 자동 주입하므로 별도 작업 불필요. 관련 코드는 `tools/build.mjs` 안에 있음.
- `index.html`의 `<img>`에 빌드가 심는 `data-src` 속성은 역반영(import)에 필요 — 제거 금지.
- designMode 문서에서는 버튼/모달에 `contenteditable="false"`가 없으면 클릭이 안 먹고,
  파일 다운로드는 designMode를 끄고 **한 틱 뒤에** 실행해야 동작한다 (tools/build.mjs에 반영돼 있음).
- 스크린샷 재촬영은 이 폴더만으로는 불가 — 어드민 웹 저장소(`c:\Users\jhcho\Desktop\TBM`)에서
  `npm run dev`(VITE_DEV_SKIP_AUTH=false) + `npm run screenshots:mock` 실행 후 다시 빌드.
- 인쇄 CSS 원칙: 장(chapter)은 항상 새 페이지, 항목(article)은 중간 분할 허용하되
  제목·표·이미지·박스는 잘리지 않게 보호. 항목 전체를 `break-inside: avoid`로 묶으면 빈 페이지가 생기니 금지.
