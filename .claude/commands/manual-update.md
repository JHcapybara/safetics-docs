---
description: 지정한 매뉴얼(admin/app/sfd)을 수정 → 버전업 → 빌드 → 커밋·푸시(자동 배포)까지 처리
---

Safetics 문서 허브의 매뉴얼 수정 요청이다. 먼저 저장소 루트의 CLAUDE.md와,
대상 매뉴얼 폴더의 CLAUDE.md를 읽고 규칙을 따르라.

요청: $ARGUMENTS
(형식 예: "admin 2.4 참여 현황 문구를 ~로 바꿔줘" / "admin 최신 코드 반영해줘")

## 처리 순서

1. 대상 매뉴얼 slug 확인 (admin / app / sfd). 명시 안 됐으면 되묻는다.
2. **"최신 코드 반영" 류 요청이면** (자동 업데이트 → 검수 레이어):
   - 기준점: `<slug>/sync-state.json`의 레포별 `lastSha`를 읽는다(여러 레포 가능). null이면 최초.
   - 각 코드 레포 `git fetch` 후 `lastSha..origin/HEAD` diff 분석.
   - 매뉴얼에 영향 주는 변경(버튼·라벨·화면·권한·기능 추가/삭제)만 골라 `<slug>/index.html`에
     **선반영하되, 딱지 UI를 넣지 말고 "의미 속성"만** 심는다 (검수 엔진 tools/editor-review.js가
     실행 중에만 동적으로 딱지를 그린다):
       - 추가: 새 요소에 `data-rv="add" data-rv-src="레포@sha"`
       - 변경: 요소에 `data-rv="change" data-rv-src="레포@sha" data-rv-old="이전 문구"`(새 문구는 본문)
       - 스크린샷 등 사람 손 필요: `data-rv-note="스크린샷 필요"` + 자리표시 문구
   - 저신뢰(불확실한 매칭·미검출 가능성) 항목은 사용자에게 **따로 보고**한다(구멍5: 모델 회수율 한계).
   - ⚠️ **아직 lastSha를 갱신하지 말 것.** 검수 완료 후(3-2) 갱신한다.
   - 검수: `<slug>/index.html?review=1` 로 열면 상단 검수 툴바 + 항목별 승인/수정후승인/반려가 뜬다.
     (`?review` 없으면 딱지가 안 뜨므로 공개 웹엔 노출 안 됨.) 사용자에게 검수를 요청한다.
     (승인=속성 제거→순수 본문, 반려=삭제/이전 문구 복원)
   - 검수가 끝나면(= index.html에 `data-rv`가 하나도 없음):
     1) `sync-state.json`의 해당 레포 `lastSha`를 origin HEAD로, `syncedAt`을 오늘로 갱신.
     2) 4~7 진행(버전업·빌드·커밋·배포).
   - ⚠️ **미검수 `data-rv`가 남아 있으면 build.mjs가 빌드를 중단**한다(안전장치). 공개 웹(index.html)은
     딱지를 기본 숨김이라 미검수 상태여도 사용자에겐 새 본문만 보이지만, **검수 전에는 push 하지 말 것.**
3. **일반 문구 수정 요청이면** 해당 부분을 `<slug>/index.html`에서 수정한다. (최종본 직접 수정 금지)
4. 버전 +0.01 (주석 + footer 두 곳).
5. `<slug>/tools/build.mjs` 실행해 최종본 재생성. (Node 없으면 그 폴더 CLAUDE.md의 설치 절차)
6. 검증: 새 버전 파일 생성, 이미지 내장 수, 링크·번호 이상 없음.
7. 커밋 + push (main). push되면 GitHub Actions가 Pages에 자동 배포.
   - 커밋 메시지 예: `docs(admin): 2.4 문구 수정 (v1.03)`
   - **push 전 사용자에게** 무엇이 공개 배포되는지 알리고, 민감 내용이면 확인받는다.
8. 결과 보고 + 다음 메모 출력:
   "📌 <slug> 문서 버전 X.XX로 업데이트·배포했습니다. PDF 페이지 전환 커스텀 설정할 것 있으면 요청해주세요 (형식: '2.2 앞에서'). 배포 반영까지 1~2분."

특수 케이스:
- "N.N 앞에서" → 해당 article에 pdf-break 클래스만 추가 (PDF 전용, 화면 불변).
- 수정된 최종본 파일을 들고 오면 → `node <slug>/tools/import.mjs "<파일>"`로 index.html 역반영 후 진행.
