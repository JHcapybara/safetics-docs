/**
 * 매뉴얼 역방향 가져오기
 *
 * 숨김 편집기(또는 외부)에서 수정된 단일 파일(TBM_사용설명서_vX.XX.html)을
 * 원본(docs/TBM-Admin-manual/index.html)으로 되돌려 반영한다.
 *  - base64 내장 이미지 → img/ 상대 경로 복원 (빌드 시 심어둔 data-src 사용)
 *  - 숨김 편집기 부트 스크립트 제거
 *  - 덮어쓰기 전 기존 index.html을 index.html.bak으로 백업
 *
 * 사용법: npm run manual:import -- "docs/TBM-Admin-manual/TBM_사용설명서_v1.02.html"
 *        (테스트용 출력 경로 지정: npm run manual:import -- <입력> <출력경로>)
 * 이후 npm run manual:build 로 공식 최종본을 재생성할 것.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MANUAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [, , srcArg, outArg] = process.argv;
if (!srcArg) {
  console.error('사용법: npm run manual:import -- <수정된 최종본.html> [출력경로]');
  process.exit(1);
}
if (!fs.existsSync(srcArg)) {
  console.error(`오류: 파일을 찾을 수 없습니다 — ${srcArg}`);
  process.exit(1);
}

let html = fs.readFileSync(srcArg, 'utf8');

// 1) 이미지 원복: data URI + data-src → img/ 상대 경로 (속성 순서 양방향 대응)
let restored = 0;
html = html.replace(/src="data:image\/[^"]+"\s+data-src="(img\/[^"]+)"/g, (m, rel) => {
  restored++;
  return `src="${rel}"`;
});
html = html.replace(/data-src="(img\/[^"]+)"\s+src="data:image\/[^"]+"/g, (m, rel) => {
  restored++;
  return `src="${rel}"`;
});

// 2) 숨김 편집기 부트 스크립트 제거
const before = html.length;
html = html.replace(/<script id="__he_boot">[\s\S]*?<\/script>\s*/g, '');
const bootRemoved = html.length !== before;

// 3) 편집 잔여물 안전망 (저장 시 이미 제거되지만 혹시 남았을 경우)
html = html.replace(/\s*class="([^"]*)\s*__he-editing([^"]*)"/g, (m, a, b) => {
  const cls = (a + ' ' + b).trim();
  return cls ? ` class="${cls}"` : '';
});

const ver = (html.match(/manual-version:\s*([\d.]+)/) || [])[1] || '?';
const out = outArg || path.join(MANUAL_DIR, 'index.html');

if (fs.existsSync(out)) {
  fs.copyFileSync(out, out + '.bak');
  console.log(`백업 생성: ${out}.bak`);
}
fs.writeFileSync(out, html, 'utf8');

console.log(`완료: ${out} 에 반영 (문서 버전 ${ver})`);
console.log(`이미지 ${restored}개 경로 복원, 부트 스크립트 제거: ${bootRemoved ? 'O' : '없었음'}`);
console.log('다음 단계: npm run manual:build 로 공식 최종본을 재생성하세요.');
