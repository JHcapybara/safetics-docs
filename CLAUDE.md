# Safetics 문서 허브 — Claude 작업 지침서

이 저장소(`safetics-docs`)는 회사 제품별 사용 설명서를 모아 배포하는 허브다.
GitHub Pages로 공개 배포되며, 표지(`index.html`)에서 각 매뉴얼로 이동한다.

## 구조

```
safetics-docs/
├─ index.html            표지(랜딩) — 각 매뉴얼 링크
├─ editor.html           비개발자용 GUI 편집기 (루트 1개, 파일 선택기로 아무 매뉴얼이나 편집)
├─ CLAUDE.md             이 파일 (허브 공통 규칙)
├─ .claude/commands/     /manual-update 등 명령
├─ tools/                공용 편집 엔진 3종(단일 소스): editor-find/media/review.js
├─ .github/workflows/    Pages 자동 배포
├─ admin/                TBM 관리자 매뉴얼  ↔ 코드 레포: tbmadmin (JHcapybara/tbmadmin)
├─ app/                  TBM 앱 매뉴얼  ↔ 코드 레포: safeticsTBM (JHcapybara/safeticsTBM)
└─ sfd/                  SFD 매뉴얼 (준비 중)  ↔ 코드 레포: (SFD 레포)
```

편집 도구는 **루트에 단일화**돼 있다: `editor.html`(GUI 편집기) + `tools/`(공용 엔진 3종).
각 매뉴얼 폴더는 콘텐츠 자체(`index.html` 원본, `img/`, `sync-state.json`, `tools/build.mjs`·`import.mjs`,
`readme.txt`, `CLAUDE.md`, 빌드된 최종본 `*_vX.XX.html`)를 갖는다. index.html·editor.html·build는
공용 엔진을 루트 `../tools/`(빌드는 인라인 주입)로 참조한다.

## 매뉴얼 = 코드 레포 매핑 (자동 업데이트용)

| 매뉴얼 | 소스 위치 | 비교 대상 코드 레포(로컬) |
|---|---|---|
| admin | `admin/` | `c:\Users\jhcho\Desktop\TBM` (origin: JHcapybara/tbmadmin) |
| app | `app/` | `c:\Users\jhcho\Desktop\TBM_App` (origin: JHcapybara/safeticsTBM) |
| sfd | `sfd/` | (SFD 레포 — 준비되면 기입) |

자동 업데이트(`/manual-update`)는 **매뉴얼 ↔ 해당 코드 레포**를 비교한다. 코드 레포가
이 PC에 clone되어 있어야 한다.

## 작업 규칙 (매뉴얼 수정 시)

각 매뉴얼 폴더의 `CLAUDE.md`가 세부 규칙(버전 +0.01, 빌드, PDF 페이지 전환, 함정 노트)을 갖는다.
매뉴얼을 수정할 때는 **그 폴더의 CLAUDE.md를 먼저 읽고** 따른다. 공통 원칙:

1. 수정은 각 매뉴얼의 `index.html`에만. 빌드 산출물(`*_vX.XX.html`)은 직접 수정 금지.
2. 수정 시 버전 +0.01 (주석 + footer 두 곳), 이후 그 폴더에서 `node tools/build.mjs`로 최종본 재생성.
3. 커밋 후 push하면 GitHub Actions가 Pages에 자동 배포한다 (아래).

## 배포 (GitHub Pages + Actions)

- `main`에 push → `.github/workflows/deploy.yml`이 사이트를 Pages에 배포.
- 웹 보기는 각 매뉴얼의 `index.html` + `img/`를 그대로 서빙 (base64 빌드는 파일 공유용이라 웹엔 불필요).
- 공개 URL: `https://jhcapybara.github.io/safetics-docs/` (표지), `.../admin/` (관리자 매뉴얼).
- ⚠️ 이 저장소는 **공개**다. 새 매뉴얼을 넣기 전, 그 내용/스크린샷을 공개해도 되는지 확인할 것.
- 조직 이관 시 Pages URL이 바뀐다(옛 링크 리다이렉트 안 됨) — 링크 대량 배포 전에 이관을 끝낼 것.

## 커밋/푸시

- 매뉴얼 변경 후 커밋 메시지 예: `docs(admin): 2.4 참여 현황 문구 수정 (v1.03)`.
- push 전 사용자에게 무엇을 배포하는지 알리고, 민감 내용 공개 여부를 확인한다.
