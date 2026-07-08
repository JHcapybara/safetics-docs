====================================================
 TBM 앱 사용 설명서 — 폴더 안내 (safetics-docs/app/)
====================================================

■ 파일/폴더 역할
----------------------------------------------------
index.html
  - 매뉴얼 "원본". 모든 수정은 이 파일에만 한다.
  - 이미지를 img/ 폴더에서 상대 경로로 불러오므로 이 파일만 단독으로 공유하면 스크린샷이 안 보인다. (공유용 아님)
  - 파일 안의 <!-- manual-version: X.XX --> 주석과 하단 footer의 "문서 버전 X.XX"가 현재 버전 표기.
  - GitHub Pages 웹 보기는 이 index.html + img/ 를 그대로 서빙한다.

editor.html
  - 비개발자용 매뉴얼 편집기. 코딩 없이 화면 보면서 글 수정.
  - 반드시 index.html을 열어서 수정할 것.
    (TBM_앱_사용설명서_vX.XX.html을 열어 수정하면 다음 빌드 때 사라짐)

TBM_앱_사용설명서_vX.XX.html
  - "공유용 최종본". 빌드 명령으로 자동 생성되는 결과물.
  - 이미지가 파일 안에 내장되어 있어 이 파일 하나만 메일/메신저로 보내면 어디서든 열림 (~3MB).
  - 직접 수정 금지. 버전별로 파일이 쌓여서 이력 아카이브 역할.

img/
  - 매뉴얼 스크린샷 원본 (01-login.png ~ 18-stop.png).
  - index.html이 참조. 지우면 원본 매뉴얼에서 이미지가 깨짐.

tools/build.mjs   - 최종본 빌드 스크립트 (이미지 base64 내장 + 숨김 편집기 주입 + data-src 심기)
tools/import.mjs  - 수정된 최종본을 index.html로 역반영하는 스크립트
TOC.md            - 최초 기획 시 작성한 목차 초안 (참고용)
readme.txt        - 이 파일
CLAUDE.md         - 이 매뉴얼 전용 Claude 작업 지침


■ 스크린샷 파일명 매핑 (img/)
----------------------------------------------------
  01-login.png               로그인 — 아이디 로그인 탭        (1.2)
  02-login-otp.png           로그인 — 인증번호 로그인 탭      (1.3)
  03-home.png                홈 화면                          (1.5)
  04-site-picker.png         현장 선택 바텀시트               (1.6)
  05-tbm-list.png            Tool Box Meeting 목록            (2.1)
  06-tbm-session.png         TBM 세션 요약(시작 전)           (2.1)
  07-checklist-item.png      체크리스트 항목 카드             (2.2)
  08-checklist-sign.png      참석 확인 및 서명                (2.3)
  09-checklist-geofence.png  위치 인증(Geo-Fence) 완료        (2.4)
  10-tbm-record.png          TBM 기록 상세                    (2.5)
  11-suggestion-new.png      새 건의 작성                     (3.1)
  12-suggestions.png         건의사항 목록                    (3.2)
  13-suggestion-detail.png   건의사항 상세(조치 이력)         (3.2)
  14-dispatch.png            파견 초대 모달                   (3.3)
  15-profile.png             설정(프로필)                     (3.4)
  16-hazard-new.png          위험원 보고 작성                 (4.1)
  17-sos.png                 긴급 SOS 화면                    (4.2)
  18-stop.png                작업 중지 요청 화면              (4.3)


■ 사용 방법
----------------------------------------------------
[매뉴얼 보기]
  index.html 또는 TBM_앱_사용설명서_vX.XX.html을 더블클릭 (브라우저로 열림)
  공개 웹: https://jhcapybara.github.io/safetics-docs/app/
  - 왼쪽 목차 클릭으로 이동, 상단 검색창으로 본문 검색 가능

[PDF로 저장]
  매뉴얼 우측 상단 "PDF로 저장 / 인쇄" 버튼 → 대상: PDF로 저장
  - 페이지 나눔은 PDF 전용으로 설정되어 있음 (웹 화면과 무관)

[내용 수정하기 — 비개발자도 가능]
  1. editor.html 더블클릭 (Chrome 또는 Edge 권장)
  2. "매뉴얼 열기" → 같은 폴더의 index.html 선택
  3. 고칠 문장 클릭 후 그냥 타이핑 (실수하면 Ctrl+Z)
     - 글자 선택 시 상단에 서식 메뉴 표시: 문단 종류/크기/굵게/색/지우기
     - 같은 단어 전체 교체: "용어 일괄 치환" 버튼
  4. 저장 (Ctrl+S) → index.html에 바로 반영
     - 첫 저장 때 원본 백업본이 자동 다운로드됨

[수정 후 공유용 최종본 만들기 — Node.js 필요]
  1. index.html의 버전 두 곳을 +0.01 올린다
     (<!-- manual-version: X.XX --> 주석, footer의 "문서 버전 X.XX")
  2. 이 폴더(app/)에서 터미널 실행:
       node tools/build.mjs
  3. TBM_앱_사용설명서_v{새버전}.html 생성됨 → 이 파일을 공유
  ※ Claude에게 "앱 버전 올리고 빌드해줘"라고 요청해도 됨

[수정된 최종본을 원본으로 되돌리기(역반영)]
  node tools/import.mjs "<수정된 최종본.html>"
  (기존 index.html은 index.html.bak으로 자동 백업, 이후 node tools/build.mjs로 재생성)

[배포]
  safetics-docs 루트에서 git add/commit/push (main) → GitHub Actions가 Pages에 자동 배포.

[스크린샷 다시 찍기 — 앱 UI가 바뀌었을 때, 앱 코드 레포 필요]
  앱 레포(Expo 프로젝트)에서:
  1. 터미널 1:  npm run web          (Expo Web, http://localhost:4002)
  2. 터미널 2:  npm run screenshots:mock
     - 백엔드 서버 불필요. /api/tbm-member 요청을 전부 가로채 가짜 데모 데이터로
       실제 화면을 렌더해서 img/ 폴더에 18장 자동 저장 (실데이터 노출 없음)
     - 데모 데이터(가상): 세이프틱스 데모 / 김안전·박현장 / 1공장 (화성) 등
  3. 생성된 img/ 를 이 폴더로 복사 후 "공유용 최종본 만들기" 다시 실행


■ 숨김 편집기 (관리자용 — 일반 배포 시 이 항목은 안내하지 않음)
----------------------------------------------------
  최종본(TBM_앱_사용설명서_vX.XX.html) 자체에 편집 기능이 숨겨져 있다.
  - 진입: 키보드 S+F+T를 누른 채, 우측 상단 "⚙ PDF 페이지 설정" 버튼
    바로 왼쪽의 빈 공간(투명 버튼)을 1.5초 안에 3번 연속 클릭
  - 기능: editor.html과 동일 (문장 클릭 수정, 서식, 용어 일괄 치환, Ctrl+Z)
  - 저장(Ctrl+S): 버전이 자동으로 +0.01 되고, 새 버전 파일명으로 저장 제안
  - 편집 UI는 저장본에 포함되지 않으며, 저장본도 다시 숨김 편집 가능
  - 수정된 최종본을 원본(index.html)에 반영하려면: node tools/import.mjs "<파일>"


■ 규칙 요약
----------------------------------------------------
  - 수정은 index.html에만 / 공유·배포는 TBM_앱_사용설명서_vX.XX.html + 웹(index.html)
  - 수정할 때마다 버전 +0.01
  - PDF 페이지 나눔 설정: 매뉴얼 우측 상단 "⚙ PDF 페이지 설정" 버튼 → 섹션별 체크 토글
    (체크한 항목부터 PDF 새 페이지 시작, 웹 화면에는 영향 없음)
