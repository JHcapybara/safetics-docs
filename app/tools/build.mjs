/**
 * 매뉴얼 단일 파일 빌드
 *
 * docs/TBM-Admin-manual/index.html 의 이미지(img/*.png)를 base64 data URI로 내장해
 * 버전이 파일명에 포함된 단일 파일(TBM_사용설명서_v{버전}.html)을 생성한다.
 * 버전은 index.html 안의 <!-- manual-version: X.XX --> 주석에서 읽는다.
 * 결과물은 파일 하나만 공유하면 어디서든 열린다 (img 폴더 불필요).
 *
 * 추가 기능(빌드 시 자동 내장):
 *  - 숨김 편집기: S+F+T 키를 누른 채 "PDF로 저장/인쇄" 버튼 왼쪽의 보이지 않는
 *    버튼을 3번 연속 클릭하면 편집 모드로 전환. 저장 시 버전 자동 +0.01,
 *    새 버전 파일명으로 저장 제안. 편집 UI는 저장본에 포함되지 않음.
 *  - 각 이미지에 data-src="img/..." 원본 경로를 심어 역방향 가져오기
 *    (npm run manual:import) 시 index.html로 복원 가능.
 *
 * 사용법: npm run manual:build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 이 스크립트(tools/) 기준 상위 폴더 = 매뉴얼 폴더. 어디서 실행해도 동작.
const MANUAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(MANUAL_DIR, 'index.html');

const html = fs.readFileSync(SRC, 'utf8');

const verMatch = html.match(/manual-version:\s*([\d.]+)/);
if (!verMatch) {
  console.error('오류: index.html에서 <!-- manual-version: X.XX --> 주석을 찾지 못했습니다.');
  process.exit(1);
}
const VERSION = verMatch[1];
const OUT = path.join(MANUAL_DIR, `TBM_앱_사용설명서_v${VERSION}.html`);

// 검수 가드: /manual-update 자동반영분 중 미검수(data-rv 속성)가 남아 있으면 빌드 중단.
// 승인=속성 제거, 반려=삭제/복원이므로, 모두 검수되면 data-rv가 하나도 없어야 한다.
const rvPending = (html.match(/\bdata-rv=/g) || []).length;
if (rvPending > 0) {
  console.error(`오류: 미검수 자동반영 항목 ${rvPending}건이 남아 있습니다.`);
  console.error('       index.html을 브라우저로 열어 검수(승인/반려)를 끝낸 뒤 다시 빌드하세요.');
  process.exit(1);
}

// ---------------------------------------------------------------- 이미지 내장
let embedded = 0;
const missing = [];

let result = html.replace(/src="(img\/[^"]+\.(png|jpg|jpeg|gif|webp))"/gi, (m, rel, ext) => {
  const file = path.join(MANUAL_DIR, rel);
  if (!fs.existsSync(file)) {
    missing.push(rel);
    return m;
  }
  const mime = ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase();
  const b64 = fs.readFileSync(file).toString('base64');
  embedded++;
  // data-src: 역방향 가져오기(manual:import)용 원본 경로
  return `src="data:image/${mime};base64,${b64}" data-src="${rel}"`;
});

// ---------------------------------------------------------------- 숨김 편집기 주입
// 주의: 아래 코드는 최종본 안에서 실행된다. 편집 UI 요소는 전부 class "__he"로
// 마킹되어 저장(직렬화) 시 제거된다. 이 부트 스크립트 자체(id="__he_boot")는
// 저장본에 유지되어 다음에도 숨김 편집이 가능하다.
const HIDDEN_EDITOR = String.raw`<script id="__he_boot">
(function () {
  'use strict';
  var editing = false, dirty = false, bumped = false;
  var fileHandle = null, savedRange = null, curVersion = null;
  var held = {}, clicks = 0, lastClick = 0;
  var ef = null;   // 공용 찾기/치환 엔진 (EditorFind) — 편집 진입 시 생성
  var media = null; // 공용 미디어 엔진 (EditorMedia) — 편집 진입 시 생성

  var COLORS = ['#1f2733', '#1f5eff', '#cf1322', '#d46b08', '#389e0d', '#8a94a3'];
  var SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 28];

  // ---------- 공용 ----------
  function toast(msg) {
    var t = document.getElementById('__he_toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '__he_toast';
      t.className = '__he';
      t.setAttribute('contenteditable', 'false');
      t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#16213a;color:#fff;padding:10px 20px;border-radius:999px;font-size:13.5px;z-index:99;max-width:80vw;transition:opacity .25s;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.style.opacity = '0'; }, 2800);
  }
  function setDirty(v) {
    dirty = v;
    var d = document.getElementById('__he_dirty');
    if (d) d.style.display = v ? 'inline-block' : 'none';
  }
  function download(text, name) {
    // designMode 문서에서는 앵커 클릭의 기본 동작(다운로드)이 막힌다.
    // 해제 직후 동기 클릭도 막히므로, 한 틱 쉰 뒤 클릭하고 다시 켠다.
    var wasEditing = document.designMode === 'on';
    if (wasEditing) document.designMode = 'off';
    setTimeout(function () {
      var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      if (wasEditing) document.designMode = 'on';
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 120);
  }

  // ---------- 숨김 트리거: S+F+T 누른 채 투명 버튼 3연속 클릭 ----------
  document.addEventListener('keydown', function (e) { if (e.key) held[e.key.toLowerCase()] = true; });
  document.addEventListener('keyup', function (e) { if (e.key) delete held[e.key.toLowerCase()]; });
  window.addEventListener('blur', function () { held = {}; clicks = 0; });

  function makeTrigger() {
    if (document.getElementById('__he_trigger')) return;
    // "⚙ PDF 페이지 설정" 버튼 왼쪽에 배치 (없으면 인쇄 버튼 왼쪽)
    var printBtn = document.getElementById('pbSettingsBtn') || document.querySelector('.topbar button[onclick*="print"]');
    if (!printBtn) return;
    var b = document.createElement('button');
    b.id = '__he_trigger';
    b.className = '__he';
    b.type = 'button';
    b.setAttribute('aria-hidden', 'true');
    b.tabIndex = -1;
    b.style.cssText = 'width:44px;height:32px;background:transparent;border:none;cursor:default;padding:0;opacity:0;';
    b.addEventListener('click', function () {
      if (!(held['s'] && held['f'] && held['t'])) { clicks = 0; return; }
      var now = Date.now();
      if (now - lastClick > 1500) clicks = 0;
      lastClick = now;
      clicks++;
      if (clicks >= 3) { clicks = 0; enterEdit(); }
    });
    printBtn.parentNode.insertBefore(b, printBtn);
  }

  // ---------- 편집 모드 ----------
  function injectStyle() {
    if (document.getElementById('__he_style')) return;
    var s = document.createElement('style');
    s.id = '__he_style';
    s.className = '__he';
    s.textContent =
      '#__he_bar{position:fixed;top:56px;left:0;right:0;z-index:50;display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#16213a;padding:7px 14px;border-bottom:1px solid #2a3a60;}' +
      '#__he_bar .hlab{color:#8fa0c5;font-size:12px;margin-right:2px;}' +
      '#__he_bar .hcount{color:#9fe08f;font-size:12px;min-width:34px;text-align:center;}' +
      '#__he_bar select,#__he_bar input{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;padding:4px 6px;font-size:12.5px;outline:none;}' +
      '#__he_bar input{width:130px;}' +
      '#__he_bar button{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;min-width:30px;height:28px;font-size:13px;cursor:pointer;padding:0 8px;}' +
      '#__he_bar button:hover{background:#2e3f68;}' +
      '#__he_bar button.hprimary{background:#1f5eff;border-color:#1f5eff;font-weight:700;}' +
      '#__he_bar .hsep{width:1px;height:20px;background:#3a4a75;}' +
      '#__he_bar .hsw{width:19px;height:19px;border-radius:50%;min-width:0;padding:0;border:2px solid rgba(255,255,255,.35);}' +
      '#__he_bar .hsw:hover{border-color:#fff;transform:scale(1.15);}' +
      '#__he_bar .hdirty{width:10px;height:10px;border-radius:50%;background:#ffb020;display:none;}' +
      'body.__he-editing{padding-top:48px;}' +
      'body.__he-editing .sidebar{top:104px;}';
    document.head.appendChild(s);
  }

  function buildToolbar() {
    if (document.getElementById('__he_bar')) return;
    var bar = document.createElement('div');
    bar.id = '__he_bar';
    bar.className = '__he';
    // designMode 문서 안에서 툴바가 "편집 대상"이 되지 않도록 비편집 섬으로 지정
    // (이게 없으면 버튼 클릭이 커서 이동으로 먹혀서 동작하지 않음)
    bar.setAttribute('contenteditable', 'false');
    var sizeOpts = '<option value="">크기</option>';
    for (var i = 0; i < SIZES.length; i++) sizeOpts += '<option value="' + SIZES[i] + '">' + SIZES[i] + 'px</option>';
    var swatches = '';
    for (var j = 0; j < COLORS.length; j++) swatches += '<button type="button" class="hsw" data-color="' + COLORS[j] + '" style="background:' + COLORS[j] + '"></button>';
    bar.innerHTML =
      '<span class="hlab">✏️ 숨김 편집</span>' +
      '<select id="__he_block"><option value="">문단 종류</option><option value="h4">제목</option><option value="p">본문</option><option value="note">주석 (작은 회색 글)</option></select>' +
      '<select id="__he_size">' + sizeOpts + '</select>' +
      '<span class="hsep"></span>' +
      '<button type="button" id="__he_bold"><b>B</b></button>' +
      '<span class="hsep"></span>' + swatches +
      '<span class="hsep"></span>' +
      '<button type="button" id="__he_clear">지우기</button>' +
      '<span class="hsep"></span>' +
      '<span class="hlab">정렬</span>' +
      '<button type="button" id="__he_alL" title="왼쪽 정렬"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M2 7h6M2 10.5h9"/></svg></button>' +
      '<button type="button" id="__he_alC" title="가운데 정렬"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M4 7h6M3 10.5h8"/></svg></button>' +
      '<button type="button" id="__he_alR" title="오른쪽 정렬"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M6 7h6M3 10.5h9"/></svg></button>' +
      '<span class="hsep"></span>' +
      '<input id="__he_find" placeholder="찾을 용어">' +
      '<button type="button" id="__he_doFind" title="찾기 (Enter)">🔍</button>' +
      '<button type="button" id="__he_prev" title="이전 (Shift+Enter)">◀</button>' +
      '<button type="button" id="__he_next" title="다음 (Enter)">▶</button>' +
      '<span class="hcount" id="__he_count"></span>' +
      '<span class="hsep"></span>' +
      '<span class="hlab">→</span> <input id="__he_repl" placeholder="바꿀 용어">' +
      '<button type="button" id="__he_replOne">현재만</button>' +
      '<button type="button" id="__he_doRepl">전체 치환</button>' +
      '<span class="hsep"></span>' +
      '<button type="button" id="__he_media">➕ 미디어</button>' +
      '<span style="flex:1"></span>' +
      '<span class="hdirty" id="__he_dirty" title="저장하지 않은 변경"></span>' +
      '<button type="button" id="__he_save" class="hprimary">💾 저장 (Ctrl+S)</button>' +
      '<button type="button" id="__he_exit">편집 종료</button>';
    document.body.appendChild(bar);

    bar.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });
    document.getElementById('__he_bold').addEventListener('click', function () { exec('bold'); });
    document.getElementById('__he_clear').addEventListener('click', function () { exec('removeFormat'); });
    document.getElementById('__he_alL').addEventListener('click', function () { exec('justifyLeft'); });
    document.getElementById('__he_alC').addEventListener('click', function () { exec('justifyCenter'); });
    document.getElementById('__he_alR').addEventListener('click', function () { exec('justifyRight'); });
    Array.prototype.forEach.call(bar.querySelectorAll('.hsw'), function (sw) {
      sw.addEventListener('click', function () { exec('foreColor', sw.getAttribute('data-color')); });
    });
    document.getElementById('__he_block').addEventListener('change', function () {
      var v = this.value; this.value = '';
      if (!v) return;
      if (v === 'note') {
        exec('formatBlock', 'p');
        var el = currentBlock();
        if (el) { el.style.color = '#8a94a3'; el.style.fontSize = '13px'; setDirty(true); }
      } else {
        var el2 = currentBlock();
        if (el2) { el2.style.color = ''; el2.style.fontSize = ''; }
        exec('formatBlock', v);
      }
    });
    document.getElementById('__he_size').addEventListener('change', function () {
      var v = this.value;
      if (!v) return;
      applyFontSizePx(parseInt(v, 10));
    });
    var fInput = document.getElementById('__he_find');
    var rInput = document.getElementById('__he_repl');
    var cLabel = document.getElementById('__he_count');
    function refreshFind() {
      var c = ef ? ef.count() : 0;
      cLabel.textContent = c ? (ef.position() + '/' + c) : (fInput.value ? '없음' : '');
    }
    function doFind() {
      if (!ef) return;
      if (!fInput.value) { ef.clear(); cLabel.textContent = ''; return; }
      ef.search(fInput.value);
      refreshFind();
    }
    document.getElementById('__he_doFind').addEventListener('click', doFind);
    fInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (ef && ef.count() && fInput.value) { (e.shiftKey ? ef.prev() : ef.next()); refreshFind(); }
      else doFind();
    });
    document.getElementById('__he_next').addEventListener('click', function () { if (ef) { ef.next(); refreshFind(); } });
    document.getElementById('__he_prev').addEventListener('click', function () { if (ef) { ef.prev(); refreshFind(); } });
    document.getElementById('__he_replOne').addEventListener('click', function () {
      if (!ef || !ef.count()) { toast('먼저 🔍 찾기로 위치를 잡으세요.'); return; }
      ef.replaceCurrent(rInput.value);
      setDirty(true);
      refreshFind();
    });
    document.getElementById('__he_doRepl').addEventListener('click', function () {
      if (!ef) return;
      var find = fInput.value;
      if (!find) { toast('찾을 용어를 입력하세요.'); return; }
      var n = ef.replaceAll(find, rInput.value);
      if (n > 0) setDirty(true);
      refreshFind();
      toast(n > 0 ? '"' + find + '" → "' + rInput.value + '" ' + n + '곳 치환 (Ctrl+Z 되돌리기)' : '찾지 못했습니다.');
    });
    var mBtn = document.getElementById('__he_media');
    if (mBtn) mBtn.addEventListener('click', function () { if (media) media.openInsert(); });
    document.getElementById('__he_save').addEventListener('click', save);
    document.getElementById('__he_exit').addEventListener('click', exitEdit);
  }

  function enterEdit() {
    if (editing) return;
    editing = true;
    document.designMode = 'on';
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    injectStyle();
    buildToolbar();
    ef = window.EditorFind ? window.EditorFind.create({ doc: document, win: window }) : null;
    media = window.EditorMedia ? window.EditorMedia.create({ doc: document, win: window, onChange: function () { setDirty(true); }, onToast: toast }) : null;
    if (media) media.enable();
    document.body.classList.add('__he-editing');
    toast('편집 모드 — 문장을 클릭해 수정, 실수는 Ctrl+Z, 저장은 Ctrl+S');
  }

  function exitEdit() {
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 편집을 종료할까요?')) return;
    editing = false;
    dirty = false;
    document.designMode = 'off';
    document.body.classList.remove('__he-editing');
    var bar = document.getElementById('__he_bar');
    if (bar) bar.remove();
    var st = document.getElementById('__he_style');
    if (st) st.remove();
    if (ef) { ef.clear(); ef = null; }
    if (media) { media.disable(); media = null; }
    toast('보기 모드로 돌아왔습니다.');
  }

  // ---------- 서식 명령 ----------
  function keepRange() {
    var sel = document.getSelection();
    if (sel && sel.rangeCount && document.body.contains(sel.anchorNode) && !(sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('#__he_bar')) {
      savedRange = sel.getRangeAt(0).cloneRange();
      refreshSize(sel);
    }
  }
  function refreshSize(sel) {
    var el = sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
    var szSel = document.getElementById('__he_size');
    if (!el || !szSel) return;
    var px = Math.round(parseFloat(getComputedStyle(el).fontSize));
    var has = false;
    for (var i = 0; i < szSel.options.length; i++) if (szSel.options[i].value === String(px)) has = true;
    if (has) { szSel.value = String(px); szSel.options[0].textContent = '크기'; }
    else { szSel.options[0].textContent = px + 'px'; szSel.value = ''; }
  }
  document.addEventListener('selectionchange', function () { if (editing) keepRange(); });

  function exec(cmd, val) {
    var sel = document.getSelection();
    if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    document.execCommand(cmd, false, val || null);
    setDirty(true);
    if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function currentBlock() {
    var sel = document.getSelection();
    var n = sel && sel.anchorNode;
    if (!n) return null;
    var el = n.nodeType === 1 ? n : n.parentElement;
    return el ? el.closest('p,h1,h2,h3,h4,h5,h6,li,dt,dd,figcaption') : null;
  }
  function applyFontSizePx(px) {
    var sel = document.getSelection();
    if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
    if (!sel.rangeCount) return;
    if (sel.isCollapsed) {
      var blk = currentBlock();
      if (blk) { blk.style.fontSize = px + 'px'; setDirty(true); }
    } else {
      try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
      document.execCommand('fontSize', false, '7');
      Array.prototype.forEach.call(document.querySelectorAll('font[size="7"]'), function (f) {
        var s = document.createElement('span');
        s.style.fontSize = px + 'px';
        while (f.firstChild) s.appendChild(f.firstChild);
        f.parentNode.replaceChild(s, f);
      });
      Array.prototype.forEach.call(document.querySelectorAll('span[style*="xxx-large"]'), function (s) {
        s.style.fontSize = px + 'px';
      });
      setDirty(true);
      if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  // ---------- 버전 / 직렬화 / 저장 ----------
  function readVersion() {
    var span = document.getElementById('docVersion');
    if (span) {
      var m = span.textContent.match(/([\d.]+)/);
      if (m) return m[1];
    }
    return '1.00';
  }
  function bumpVersionOnce() {
    if (bumped) return curVersion;
    var v = (Math.round((parseFloat(readVersion()) + 0.01) * 100) / 100).toFixed(2);
    var span = document.getElementById('docVersion');
    if (span) span.textContent = '문서 버전 ' + v;
    var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT, null);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.indexOf('manual-version') !== -1) {
        walker.currentNode.nodeValue = ' manual-version: ' + v + ' ';
      }
    }
    bumped = true;
    curVersion = v;
    return v;
  }
  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('.__he, .__eui'), function (el) { el.remove(); });
    var body = clone.querySelector('body');
    if (body) body.classList.remove('__he-editing');
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }
  async function save() {
    if (!editing) return;
    var ver = bumpVersionOnce();
    var html = serialize();
    var name = 'TBM_앱_사용설명서_v' + ver + '.html';
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            id: 'tbm-manual-standalone',
            suggestedName: name,
            types: [{ description: 'HTML 문서', accept: { 'text/html': ['.html'] } }]
          });
        }
        var w = await fileHandle.createWritable();
        await w.write(html);
        await w.close();
        setDirty(false);
        toast('💾 저장 완료 (v' + ver + ')');
      } catch (e) {
        if (e && e.name !== 'AbortError') toast('저장 실패: ' + e.message);
      }
    } else {
      download(html, name);
      setDirty(false);
      toast('⬇ 수정본 다운로드 (v' + ver + ')');
    }
  }

  document.addEventListener('keydown', function (e) {
    if (editing && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('input', function (e) {
    if (editing && !(e.target && e.target.closest && e.target.closest('#__he_bar'))) setDirty(true);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeTrigger);
  else makeTrigger();
})();
</script>`;

// 공용 엔진(editor-find.js·editor-media.js)을 숨김 편집기보다 먼저 인라인 주입 (최종본은 자기완결형이라 외부 참조 불가)
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIND_ENGINE = fs.readFileSync(path.join(TOOLS_DIR, 'editor-find.js'), 'utf8');
const MEDIA_ENGINE = fs.readFileSync(path.join(TOOLS_DIR, 'editor-media.js'), 'utf8');
result = result.replace('</body>',
  '<script id="__ef_engine">\n' + FIND_ENGINE + '\n</' + 'script>\n' +
  '<script id="__em_engine">\n' + MEDIA_ENGINE + '\n</' + 'script>\n' +
  HIDDEN_EDITOR + '\n</body>');

// index.html의 검수 엔진 외부 참조(<script src="tools/editor-review.js">)는 최종본에선 파일이 없으므로
// 인라인으로 치환(자기완결형 유지). 최종본엔 data-rv가 없어 실제로는 비활성(무해).
const REVIEW_ENGINE = fs.readFileSync(path.join(TOOLS_DIR, 'editor-review.js'), 'utf8');
result = result.replace(/<script src="tools\/editor-review\.js"><\/script>/,
  '<script id="__rv_engine">\n' + REVIEW_ENGINE + '\n</' + 'script>');

fs.writeFileSync(OUT, result, 'utf8');

// 고정 별칭: 저장소 루트에 <폴더>-latest.html → 최신 최종본으로 리다이렉트.
// 루트 index.html의 '최종본 보기' 링크가 이 고정 경로를 가리키므로, 버전이 올라가도 index.html은 수정 불필요.
const folder = path.basename(MANUAL_DIR);              // 'admin' | 'app' ...
const target = folder + '/' + encodeURI(path.basename(OUT));
const aliasHtml = `<!doctype html><meta charset="utf-8"><title>최신 최종본으로 이동…</title>`
  + `<meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${target}">`
  + `<p style="font:14px/1.6 system-ui,sans-serif;padding:24px">최신 최종본(v${VERSION})으로 이동합니다… `
  + `자동 이동되지 않으면 <a href="${target}">여기</a>를 누르세요.</p>`;
fs.writeFileSync(path.join(MANUAL_DIR, '..', folder + '-latest.html'), aliasHtml, 'utf8');

// 구버전 명명 규칙 잔재 정리
const legacy = path.join(MANUAL_DIR, 'index.standalone.html');
if (fs.existsSync(legacy)) fs.unlinkSync(legacy);

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`완료: ${OUT} (v${VERSION})`);
console.log(`이미지 ${embedded}개 내장, 숨김 편집기 포함, 용량 ${kb}KB${missing.length ? ` | 누락: ${missing.join(', ')}` : ''}`);
