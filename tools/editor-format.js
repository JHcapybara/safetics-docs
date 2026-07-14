/*
 * editor-format.js — 두 에디터(editor.html · 최종본 숨김 편집기) 공용 "서식" 엔진.
 *
 * 제공 기능:
 *  - 플로팅 서식바: 고정 툴바 대신 커서/드래그 선택 근처에 떠서, 선택 영역에 서식 적용.
 *    (문단종류·크기·굵게·글자색·정렬·행간·표·콜아웃·➕미디어·지우기)
 *  - 행간: 100/120/140/160% 프리셋 + 직접 입력. 현재 값이 프리셋과 같으면 프리셋 선택,
 *    다르면 '직접 입력'에 수치 자동 표시, 선택 영역에 여러 값이 섞이면 비움.
 *  - 표: 행×열 지정 삽입. 캐럿이 표 안이면 행/열 추가·삭제, →·↓ 셀 병합, 병합 해제.
 *  - 콜아웃: 현재 문단을 콜아웃 박스로. 배경색 프리셋(없음 포함), 좌측 구분선 켜기/끄기+색.
 *  - 우클릭 문단 메뉴: 잘라내기 / 위·아래에 붙여넣기(잘라둔 것 있을 때) / 문단 링크 복사.
 *    텍스트 드래그 후 우클릭 → '문단 링크 삽입'(복사해 둔 #링크를 선택 텍스트에 걸기).
 *  - 링크 색: 선택이 하이퍼링크(<a>) 안이면 글자색 스와치가 링크 색을 직접 바꿈.
 *
 * UI는 전부 class "__eui"(+contenteditable=false) → 저장/빌드 직렬화에서 제거.
 * 콘텐츠 산출물(표·콜아웃·행간·문단 id)은 인라인 스타일/속성이라 어떤 HTML에서도 자기완결.
 *
 * 사용:
 *   var fmt = EditorFormat.create({ doc, win, onChange, onMedia, onToast, linkBase });
 *   fmt.enable();  fmt.disable();
 */
(function (g) {
  'use strict';

  function create(opts) {
    var doc = opts.doc;
    var win = opts.win || doc.defaultView || window;
    var onChange = opts.onChange || function () {};
    var onMedia = opts.onMedia || null;
    var toast = opts.onToast || function (m) { try { win.alert(m); } catch (e) {} };
    var linkBase = opts.linkBase || '';   // 문단 링크 복사 시 '#id' 앞에 붙일 URL(최종본은 파일 URL)

    var COLORS = ['#1f2733', '#1f5eff', '#cf1322', '#d46b08', '#389e0d', '#8a94a3'];
    var SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 28];
    var LHS = [100, 120, 140, 160];
    var CALL_BG = [['없음', ''], ['회색', '#F1F5F9'], ['노랑', '#FEF9C3'], ['파랑', '#DBEAFE'], ['초록', '#DCFCE7'], ['빨강', '#FEE2E2'], ['주황', '#FFEDD5']];
    var BAR_C = ['#64748B', '#F59E0B', '#3B82F6', '#22C55E', '#EF4444', '#FF7A12'];
    var BLOCKSEL = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,figcaption,td,th,blockquote,pre';
    var PARASEL = 'p,h1,h2,h3,h4,h5,h6,li,figure,table,blockquote,pre,div';

    var bar = null, pop = null, menu = null, savedRange = null, enabled = false;
    var selTimer = null, cutHTML = null, copiedLink = null, markEl = null;

    function markUI(n) { n.classList.add('__eui'); n.setAttribute('contenteditable', 'false'); }
    function esc(s) { var d = doc.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

    // ---------------------------------------------------------------- 스타일
    function ensureStyle() {
      if (doc.getElementById('__fmt_style')) return;
      var s = doc.createElement('style');
      s.id = '__fmt_style'; s.className = '__eui';
      s.textContent =
        '.__fmt_bar{position:fixed;z-index:2147483300;display:flex;flex-direction:column;gap:6px;max-width:min(96vw,640px);' +
          'background:#16213a;color:#fff;padding:8px 10px;border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.4);font-family:system-ui,"Malgun Gothic",sans-serif;font-size:12.5px;}' +
        '.__fmt_bar .frow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}' +
        '.__fmt_bar .frow2{border-top:1px solid #2a3a60;padding-top:6px;}' +
        '.__fmt_bar .flab{color:#8fa0c5;font-size:11px;letter-spacing:.04em;margin-right:2px;}' +
        '.__fmt_bar select,.__fmt_bar input{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;padding:3px 5px;font-size:12px;outline:none;}' +
        '.__fmt_bar input.__fmt_lhv{width:48px;text-align:center;}' +
        '.__fmt_bar button{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;min-width:26px;height:26px;font-size:12.5px;cursor:pointer;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;gap:3px;}' +
        '.__fmt_bar button:hover{background:#2e3f68;}' +
        '.__fmt_bar .sw{width:16px;height:16px;border-radius:50%;min-width:0;padding:0;border:2px solid rgba(255,255,255,.35);}' +
        '.__fmt_bar .sw:hover{border-color:#fff;transform:scale(1.15);}' +
        '.__fmt_bar .sep{width:1px;height:18px;background:#3a4a75;margin:0 2px;}' +
        '.__fmt_pop{position:fixed;z-index:2147483400;background:#16213a;color:#fff;padding:10px 12px;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.45);font-family:system-ui,sans-serif;font-size:12.5px;display:flex;flex-direction:column;gap:8px;}' +
        '.__fmt_pop .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}' +
        '.__fmt_pop .lab{color:#8fa0c5;font-size:11.5px;min-width:52px;}' +
        '.__fmt_pop button{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;height:25px;font-size:12px;cursor:pointer;padding:0 9px;}' +
        '.__fmt_pop button:hover{background:#2e3f68;}' +
        '.__fmt_pop input{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;padding:3px 6px;font-size:12px;width:52px;outline:none;text-align:center;}' +
        '.__fmt_pop .sw{width:18px;height:18px;border-radius:5px;min-width:0;padding:0;border:2px solid rgba(255,255,255,.3);}' +
        '.__fmt_pop .sw.none{background:repeating-linear-gradient(45deg,#334,#334 3px,#445 3px,#445 6px);}' +
        '.__fmt_pop .sw:hover{border-color:#fff;}' +
        '.__fmt_menu{position:fixed;z-index:2147483500;min-width:190px;background:#fff;color:#1f2733;border:1px solid #d9dee6;border-radius:10px;box-shadow:0 12px 36px rgba(20,28,40,.25);font-family:system-ui,"Malgun Gothic",sans-serif;font-size:13px;padding:5px;}' +
        '.__fmt_menu button{display:block;width:100%;text-align:left;background:none;border:none;border-radius:7px;padding:7px 11px;font-size:13px;cursor:pointer;color:#1f2733;}' +
        '.__fmt_menu button:hover{background:#eef2f8;}' +
        '.__fmt_menu button[disabled]{color:#b6bec9;cursor:default;background:none;}' +
        '.__fmt_menu .div{height:1px;background:#e7eaf0;margin:4px 6px;}' +
        '.__fmt_mark{outline:2px solid #1f5eff;outline-offset:2px;border-radius:4px;}' +
        '.__fmt_plus{position:fixed;z-index:2147483250;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
          'background:#fff;color:#64748b;border:1px solid #d0d7e2;box-shadow:0 2px 8px rgba(20,28,40,.14);cursor:pointer;font:16px/1 system-ui;padding:0;user-select:none;}' +
        '.__fmt_plus:hover{color:#1f5eff;border-color:#1f5eff;background:#f0f5ff;}' +
        'body.__fmt_colresize, body.__fmt_colresize *{cursor:col-resize!important;}';
      (doc.head || doc.documentElement).appendChild(s);
    }

    // ---------------------------------------------------------------- 선택 유틸
    function selection() { return doc.getSelection(); }
    function inUI(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      return !!(el && el.closest('.__eui, .__he'));
    }
    function keepRange() {
      var sel = selection();
      if (sel && sel.rangeCount && doc.body.contains(sel.anchorNode) && !inUI(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function restoreRange() {
      var sel = selection();
      if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
      return sel;
    }
    function currentBlock() {
      var sel = selection();
      var n = sel && sel.anchorNode;
      if (!n && savedRange) n = savedRange.startContainer;
      if (!n) return null;
      var el = n.nodeType === 1 ? n : n.parentElement;
      return el ? el.closest(BLOCKSEL) : null;
    }
    // 선택 범위에 걸친 블록들(행간 등 블록 단위 적용용)
    function blocksInRange() {
      var r = savedRange;
      if (!r) return [];
      var root = r.commonAncestorContainer;
      var rootEl = root.nodeType === 1 ? root : root.parentElement;
      var single = rootEl && rootEl.closest(BLOCKSEL);
      if (r.collapsed) return single ? [single] : [];
      var out = [];
      var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (!el.matches || !el.matches(BLOCKSEL)) return NodeFilter.FILTER_SKIP;
          if (el.closest('.__eui, .__he')) return NodeFilter.FILTER_REJECT;
          try { return r.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
          catch (e) { return NodeFilter.FILTER_SKIP; }
        }
      });
      var n;
      while ((n = walker.nextNode())) {
        // 중첩(li>p 등)은 가장 안쪽만
        if (!out.some(function (o) { return o.contains(n); })) {
          out = out.filter(function (o) { return !n.contains(o); });
          out.push(n);
        }
      }
      if (!out.length && single) out.push(single);
      // 콜아웃/일반 div처럼 p·h·li가 없는 컨테이너 안 선택 → 그 컨테이너를 블록으로 취급
      if (!out.length && rootEl && rootEl !== doc.body) {
        var g = rootEl.closest('div,section,article,blockquote,figure');
        if (g && g !== doc.body && !g.closest('.__eui, .__he')) out.push(g);
      }
      return out;
    }

    function exec(cmd, val) {
      var sel = restoreRange();
      try { doc.execCommand('styleWithCSS', false, true); } catch (e) {}
      doc.execCommand(cmd, false, val || null);
      onChange();
      if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    }

    // ---- 스타일 변경용 자체 undo/redo ----
    // 인라인 style 대입은 designMode 네이티브 undo 스택에 안 올라간다. (insertHTML로
    // 블록을 통째 교체하는 우회는 이웃 문단을 병합·훼손해서 폐기.) 대신 변경 전 값을
    // 기록해 두고 Ctrl+Z/Ctrl+Y를 가로챈다. 우리 스타일 작업이 마지막 편집(타이핑 등
    // 네이티브 input 이후)일 때만 우리가 되돌리고, 아니면 네이티브 undo에 넘긴다.
    // 통합 편집 로그: 스타일 op와 네이티브 편집(타이핑 등)의 "순서"를 기록해 두고,
    // Ctrl+Z 시 로그 최상단이 스타일이면 우리가 되돌리고, 네이티브면 브라우저에 넘긴다.
    // 네이티브 편집 단위는 input 이벤트의 inputType으로 근사(historyUndo/Redo 제외,
    // 연속 타이핑은 1초 이내 같은 종류를 한 단위로 그룹).
    var undoOps = [], redoOps = [];        // op {undo,redo,alive} (LIFO)
    var editLog = [], redoLog = [];        // {kind:'style'|'native'} 순서 로그
    var lastNativeT = 0, lastNativeType = '';
    function pushOp(op) {
      undoOps.push(op);
      editLog.push({ kind: 'style' });
      redoOps.length = 0; redoLog.length = 0; lastNativeType = '';
      onChange();
    }
    function setStylesUndoable(items) {    // items: [{el, props:{prop:새값}}]
      var olds = items.map(function (it) {
        var o = {};
        for (var k in it.props) { o[k] = it.el.style[k] || ''; it.el.style[k] = it.props[k]; }
        return o;
      });
      pushOp({
        undo: function () { items.forEach(function (it, i) { for (var k in it.props) it.el.style[k] = olds[i][k]; }); },
        redo: function () { items.forEach(function (it) { for (var k in it.props) it.el.style[k] = it.props[k]; }); },
        alive: function () { return items.every(function (it) { return doc.contains(it.el); }); }
      });
    }
    function insertBlockUndoable(node, refAfter) {   // refAfter 바로 다음에 node 삽입 (Ctrl+Z 가능)
      refAfter.parentNode.insertBefore(node, refAfter.nextSibling);
      var parent = node.parentNode;
      pushOp({
        undo: function () { node.remove(); },
        redo: function () { parent.insertBefore(node, refAfter.nextSibling); },
        alive: function () { return doc.contains(parent); }
      });
    }
    function onNativeInput(e) {
      var it = (e && e.inputType) || '';
      if (it === 'historyUndo' || it === 'historyRedo') return;   // undo/redo 자체는 편집이 아님
      if (e && e.target && e.target.closest && e.target.closest('.__eui, .__he')) return;
      var now = Date.now();
      var typing = it === 'insertText' || it === 'insertCompositionText' ||
                   it === 'deleteContentBackward' || it === 'deleteContentForward';
      var top = editLog[editLog.length - 1];
      if (typing && lastNativeType === it && now - lastNativeT < 1000 && top && top.kind === 'native') {
        lastNativeT = now;                                        // 같은 타이핑 그룹 → 단위 유지
      } else {
        editLog.push({ kind: 'native' });
        lastNativeT = now; lastNativeType = it;
      }
      redoOps.length = 0; redoLog.length = 0;
    }
    function onUndoKey(e) {
      if (!(e.ctrlKey || e.metaKey) || !e.key) return;
      var k = e.key.toLowerCase();
      var isUndo = k === 'z' && !e.shiftKey;
      var isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if (isUndo) {
        var top = editLog[editLog.length - 1];
        if (!top) return;                                         // 로그 없음 → 네이티브에 맡김
        if (top.kind === 'style') {
          var op = undoOps[undoOps.length - 1];
          editLog.pop();
          if (op && op.alive()) {
            e.preventDefault(); e.stopPropagation();
            undoOps.pop();
            op.undo();
            redoOps.push(op);
            redoLog.push({ kind: 'style' });
            onChange(); syncLH(); syncSize();
          }
        } else {
          editLog.pop(); redoLog.push({ kind: 'native' });        // 네이티브 undo 통과
          lastNativeType = '';
        }
      } else if (isRedo) {
        var rtop = redoLog[redoLog.length - 1];
        if (!rtop) return;
        if (rtop.kind === 'style') {
          var r = redoOps[redoOps.length - 1];
          redoLog.pop();
          if (r && r.alive()) {
            e.preventDefault(); e.stopPropagation();
            redoOps.pop();
            r.redo();
            undoOps.push(r);
            editLog.push({ kind: 'style' });
            onChange(); syncLH(); syncSize();
          }
        } else {
          redoLog.pop(); editLog.push({ kind: 'native' });        // 네이티브 redo 통과
          lastNativeType = '';
        }
      }
    }

    // ---------------------------------------------------------------- 행간
    function lhOf(el) {
      var cs = win.getComputedStyle(el);
      if (cs.lineHeight === 'normal') return 120; // 브라우저 기본 근사
      var v = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100;
      return Math.round(v);
    }
    function readLineHeight() {
      var blocks = blocksInRange();
      if (!blocks.length) return null;
      var vals = blocks.map(lhOf);
      var first = vals[0];
      if (vals.some(function (v) { return Math.abs(v - first) > 1; })) return { mixed: true };
      return { mixed: false, pct: first };
    }
    function applyLineHeight(pct) {
      var blocks = blocksInRange();
      if (!blocks.length) { toast('행간을 적용할 문단이 없습니다.'); return; }
      setStylesUndoable(blocks.map(function (b) {
        return { el: b, props: { lineHeight: pct + '%' } };
      }));
    }
    function syncLH() {
      if (!bar) return;
      var sel = bar.querySelector('.__fmt_lh');
      var inp = bar.querySelector('.__fmt_lhv');
      var st = readLineHeight();
      if (!st || st.mixed) { sel.value = ''; inp.value = ''; return; }
      if (LHS.indexOf(st.pct) !== -1) { sel.value = String(st.pct); inp.value = st.pct; }
      else { sel.value = 'custom'; inp.value = st.pct; }
    }
    function syncSize() {
      if (!bar) return;
      var szSel = bar.querySelector('.__fmt_size');
      var el = currentBlock();
      if (!el) { szSel.value = ''; return; }
      var px = Math.round(parseFloat(win.getComputedStyle(el).fontSize));
      szSel.value = SIZES.indexOf(px) !== -1 ? String(px) : '';
    }

    // ---------------------------------------------------------------- 글자 크기(px)
    function applyFontSizePx(px) {
      var sel = restoreRange();
      if (!sel.rangeCount) return;
      if (sel.isCollapsed) {
        var blk = currentBlock();
        if (blk) setStylesUndoable([{ el: blk, props: { fontSize: px + 'px' } }]);
        return;
      }
      try { doc.execCommand('styleWithCSS', false, true); } catch (e) {}
      doc.execCommand('fontSize', false, '7');
      Array.prototype.forEach.call(doc.querySelectorAll('font[size="7"]'), function (f) {
        var s = doc.createElement('span');
        s.style.fontSize = px + 'px';
        while (f.firstChild) s.appendChild(f.firstChild);
        f.parentNode.replaceChild(s, f);
      });
      Array.prototype.forEach.call(doc.querySelectorAll('span[style*="xxx-large"]'), function (s) {
        s.style.fontSize = px + 'px';
      });
      onChange();
      if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    }

    // ---------------------------------------------------------------- 글자색 (링크면 링크색 직접 변경)
    function applyColor(c) {
      var sel = restoreRange();
      var n = sel.anchorNode;
      var a = n && (n.nodeType === 1 ? n : n.parentElement);
      a = a && a.closest('a');
      var f = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement);
      var fa = f && f.closest('a');
      if (a && a === fa) {   // 선택 전체가 한 링크 안 → 링크 색을 직접 변경(전체 통일)
        a.style.color = c;
        Array.prototype.forEach.call(a.querySelectorAll('[style*="color"]'), function (x) { x.style.color = ''; });
        onChange();
        return;
      }
      exec('foreColor', c);
    }

    // ---------------------------------------------------------------- 표
    function tableCell() {
      var b = currentBlock();
      return b ? b.closest('td,th') : null;
    }
    function visualIndex(td) {
      var i = 0, c = td.parentElement.firstElementChild;
      while (c && c !== td) { i += c.colSpan || 1; c = c.nextElementSibling; }
      return i;
    }
    function cellAt(tr, vi) {
      var i = 0, c = tr.firstElementChild;
      while (c) {
        var span = c.colSpan || 1;
        if (vi >= i && vi < i + span) return { cell: c, start: i };
        i += span; c = c.nextElementSibling;
      }
      return null;
    }
    function insertTable(rows, cols) {
      rows = Math.max(1, Math.min(30, rows | 0)); cols = Math.max(1, Math.min(12, cols | 0));
      var t = doc.createElement('table');
      t.className = 'ed-table';
      t.style.cssText = 'border-collapse:collapse;width:100%;margin:14px 0;';
      var tb = doc.createElement('tbody');
      for (var r = 0; r < rows; r++) {
        var tr = doc.createElement('tr');
        for (var c = 0; c < cols; c++) {
          var td = doc.createElement('td');
          td.style.cssText = 'border:1px solid #d9dee6;padding:8px 10px;min-width:40px;vertical-align:top;';
          td.innerHTML = '<br>';
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      var blk = currentBlock();
      if (blk && blk.parentNode && !blk.closest('td,th')) blk.parentNode.insertBefore(t, blk.nextSibling);
      else doc.body.appendChild(t);
      onChange();
      toast('표를 삽입했습니다. 셀에 커서를 두면 행/열·병합 메뉴가 뜹니다.');
    }
    function newTd(ref) {
      var td = doc.createElement('td');
      td.style.cssText = (ref && ref.getAttribute('style')) || 'border:1px solid #d9dee6;padding:8px 10px;min-width:40px;vertical-align:top;';
      td.colSpan = 1; td.rowSpan = 1;
      td.innerHTML = '<br>';
      return td;
    }
    function addRowBelow(td) {
      var tr = td.parentElement;
      var nt = doc.createElement('tr');
      Array.prototype.forEach.call(tr.children, function (c) {
        var n = newTd(c); n.colSpan = c.colSpan || 1;
        nt.appendChild(n);
      });
      tr.parentNode.insertBefore(nt, tr.nextSibling);
      onChange();
    }
    function addColRight(td) {
      var vi = visualIndex(td) + (td.colSpan || 1) - 1;
      var table = td.closest('table');
      Array.prototype.forEach.call(table.rows, function (tr) {
        var hit = cellAt(tr, vi);
        if (hit) tr.insertBefore(newTd(hit.cell), hit.cell.nextSibling);
        else tr.appendChild(newTd(null));
      });
      onChange();
    }
    function delRow(td) {
      var tr = td.parentElement, table = td.closest('table');
      if (table.rows.length <= 1) { toast('마지막 행은 삭제할 수 없습니다.'); return; }
      tr.remove(); onChange();
    }
    function delCol(td) {
      var table = td.closest('table');
      if (td.parentElement.children.length <= 1) { toast('마지막 열은 삭제할 수 없습니다.'); return; }
      var vi = visualIndex(td);
      Array.prototype.forEach.call(table.rows, function (tr) {
        var hit = cellAt(tr, vi);
        if (!hit) return;
        if ((hit.cell.colSpan || 1) > 1) hit.cell.colSpan -= 1;
        else hit.cell.remove();
      });
      onChange();
    }
    function mergeRight(td) {
      var next = td.nextElementSibling;
      if (!next) { toast('오른쪽에 병합할 셀이 없습니다.'); return; }
      if ((td.rowSpan || 1) !== (next.rowSpan || 1)) { toast('행 병합 상태가 달라 병합할 수 없습니다.'); return; }
      while (next.firstChild) td.appendChild(next.firstChild);
      td.colSpan = (td.colSpan || 1) + (next.colSpan || 1);
      next.remove(); onChange();
    }
    function mergeDown(td) {
      var tr = td.parentElement;
      var below = tr.nextElementSibling;
      if (!below) { toast('아래에 병합할 셀이 없습니다.'); return; }
      var vi = visualIndex(td);
      var hit = cellAt(below, vi);
      if (!hit || hit.start !== vi || (hit.cell.colSpan || 1) !== (td.colSpan || 1)) {
        toast('아래 셀의 폭이 달라 병합할 수 없습니다.'); return;
      }
      while (hit.cell.firstChild) td.appendChild(hit.cell.firstChild);
      td.rowSpan = (td.rowSpan || 1) + (hit.cell.rowSpan || 1);
      hit.cell.remove();
      if (!below.children.length) below.remove();
      onChange();
    }
    function unmerge(td) {
      var cs = td.colSpan || 1, rs = td.rowSpan || 1;
      if (cs === 1 && rs === 1) { toast('병합된 셀이 아닙니다.'); return; }
      var vi = visualIndex(td);
      var tr = td.parentElement;
      td.colSpan = 1; td.rowSpan = 1;
      for (var c = 1; c < cs; c++) tr.insertBefore(newTd(td), td.nextSibling);
      var row = tr;
      for (var r = 1; r < rs; r++) {
        row = row.nextElementSibling;
        if (!row) break;
        var anchor = cellAt(row, vi);
        for (var c2 = 0; c2 < cs; c2++) {
          var n = newTd(td);
          if (anchor) row.insertBefore(n, anchor.cell); else row.appendChild(n);
        }
      }
      onChange();
    }

    // ---------------------------------------------------------------- 표 열 너비 드래그 조절
    var colDrag = null, colEdgeOn = false;
    // 셀 오른쪽 테두리 ±5px 안이면 리사이즈 대상 (마지막 열 제외)
    function cellEdge(e) {
      var t = e.target && e.target.closest ? e.target.closest('td,th') : null;
      if (!t || t.closest('.__eui, .__he')) return null;
      var r = t.getBoundingClientRect();
      var vi;
      if (Math.abs(e.clientX - r.right) <= 5) {
        vi = visualIndex(t) + (t.colSpan || 1) - 1;                 // 이 셀의 오른쪽 테두리
      } else if (Math.abs(e.clientX - r.left) <= 5) {
        var s = visualIndex(t);                                     // 다음 셀 위에서 잡힌 경우 → 이전 열
        if (s === 0) return null;
        vi = s - 1;
      } else return null;
      var total = 0, c = t.parentElement.firstElementChild;
      while (c) { total += c.colSpan || 1; c = c.nextElementSibling; }
      if (vi >= total - 1) return null;   // 마지막 열은 표 전체 폭 담당 → 제외
      return { table: t.closest('table'), vi: vi };
    }
    function updateColCursor(e) {
      var on = !colDrag && !!cellEdge(e);
      if (on !== colEdgeOn) { colEdgeOn = on; doc.body.classList.toggle('__fmt_colresize', on); }
    }
    function onColDown(e) {
      var hit = cellEdge(e);
      if (!hit) return;
      var top = cellAt(hit.table.rows[0], hit.vi);
      if (!top) return;
      e.preventDefault(); e.stopPropagation();
      colDrag = {
        table: hit.table, cell: top.cell, x0: e.clientX,
        w0: top.cell.getBoundingClientRect().width,
        oldW: top.cell.style.width || '', oldLayout: hit.table.style.tableLayout || '',
        oldBS: top.cell.style.boxSizing || ''
      };
      // 첫 행 셀 너비 + table-layout:fixed 로 열 폭을 결정적으로 만든다.
      // width가 rect(border-box)와 일치하도록 box-sizing도 고정.
      top.cell.style.boxSizing = 'border-box';
      hit.table.style.tableLayout = 'fixed';
      doc.body.classList.add('__fmt_colresize');
      win.addEventListener('mousemove', onColDragMove, true);
      win.addEventListener('mouseup', onColUp, true);
    }
    function onColDragMove(e) {
      if (!colDrag) return;
      e.preventDefault();
      var w = Math.max(36, Math.round(colDrag.w0 + (e.clientX - colDrag.x0)));
      colDrag.cell.style.width = w + 'px';
    }
    function onColUp() {
      var d = colDrag; colDrag = null;
      win.removeEventListener('mousemove', onColDragMove, true);
      win.removeEventListener('mouseup', onColUp, true);
      doc.body.classList.remove('__fmt_colresize'); colEdgeOn = false;
      if (!d) return;
      var newW = d.cell.style.width;
      if (newW === d.oldW) { d.table.style.tableLayout = d.oldLayout; d.cell.style.boxSizing = d.oldBS; return; }
      pushOp({
        undo: function () { d.cell.style.width = d.oldW; d.cell.style.boxSizing = d.oldBS; d.table.style.tableLayout = d.oldLayout; },
        redo: function () { d.table.style.tableLayout = 'fixed'; d.cell.style.boxSizing = 'border-box'; d.cell.style.width = newW; },
        alive: function () { return doc.contains(d.cell); }
      });
    }

    // ---------------------------------------------------------------- 콜아웃
    function calloutOf() {
      var b = currentBlock();
      return b ? b.closest('div.ed-callout') : null;
    }
    function makeCallout() {
      var blocks = blocksInRange();
      if (!blocks.length) { toast('콜아웃으로 만들 문단에 커서를 두세요.'); return null; }
      var first = blocks[0];
      if (first.closest('div.ed-callout')) return first.closest('div.ed-callout');
      var box = doc.createElement('div');
      box.className = 'ed-callout';
      box.style.cssText = 'margin:14px 0;padding:12px 16px;border-radius:10px;background:#F1F5F9;';
      first.parentNode.insertBefore(box, first);
      blocks.forEach(function (b) { if (b.parentNode) box.appendChild(b); });
      onChange();
      return box;
    }
    function setCalloutBg(box, c) {
      box.style.background = c || 'transparent';
      if (!c && !box.style.borderLeft) box.style.padding = '0 16px';
      else box.style.padding = '12px 16px';
      onChange();
    }
    function setCalloutBar(box, on, color) {
      if (on) box.style.borderLeft = '4px solid ' + (color || '#64748B');
      else box.style.borderLeft = '';
      onChange();
    }
    function removeCallout(box) {
      while (box.firstChild) box.parentNode.insertBefore(box.firstChild, box);
      box.remove(); onChange();
    }

    // ---------------------------------------------------------------- 팝오버
    function closePop() { if (pop) { pop.remove(); pop = null; } }
    function openPop(anchorBtn, build) {
      closePop();
      pop = doc.createElement('div');
      pop.className = '__fmt_pop'; markUI(pop);
      build(pop);
      doc.body.appendChild(pop);
      var r = anchorBtn.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, win.innerWidth - pw - 8));
      var top = r.bottom + 8;
      if (top + ph > win.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
      pop.addEventListener('mousedown', function (e) {
        if (!e.target.closest('input')) e.preventDefault();
      });
    }
    function tablePop(btn) {
      var cell = tableCell();
      openPop(btn, function (p) {
        if (!cell) {
          p.innerHTML =
            '<div class="row"><span class="lab">표 삽입</span>' +
            '<input class="__t_r" type="number" min="1" max="30" value="3"> 행 × ' +
            '<input class="__t_c" type="number" min="1" max="12" value="3"> 열 ' +
            '<button data-a="ins">삽입</button></div>';
          p.querySelector('[data-a=ins]').addEventListener('click', function () {
            insertTable(parseInt(p.querySelector('.__t_r').value, 10), parseInt(p.querySelector('.__t_c').value, 10));
            closePop();
          });
        } else {
          p.innerHTML =
            '<div class="row"><span class="lab">행/열</span>' +
            '<button data-a="row+">+행 아래</button><button data-a="col+">+열 오른쪽</button>' +
            '<button data-a="row-">행 삭제</button><button data-a="col-">열 삭제</button></div>' +
            '<div class="row"><span class="lab">병합</span>' +
            '<button data-a="mr">→ 병합</button><button data-a="md">↓ 병합</button><button data-a="um">병합 해제</button></div>';
          p.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            var c = tableCell() || cell;
            if (b.dataset.a === 'row+') addRowBelow(c);
            else if (b.dataset.a === 'col+') addColRight(c);
            else if (b.dataset.a === 'row-') delRow(c);
            else if (b.dataset.a === 'col-') delCol(c);
            else if (b.dataset.a === 'mr') mergeRight(c);
            else if (b.dataset.a === 'md') mergeDown(c);
            else if (b.dataset.a === 'um') unmerge(c);
            closePop();
          });
        }
      });
    }
    function calloutPop(btn) {
      var box = calloutOf();
      openPop(btn, function (p) {
        var bgRow = '<div class="row"><span class="lab">배경</span>' + CALL_BG.map(function (x) {
          return '<button class="sw' + (x[1] ? '' : ' none') + '" data-bg="' + x[1] + '" title="' + x[0] + '"' + (x[1] ? ' style="background:' + x[1] + '"' : '') + '></button>';
        }).join('') + '</div>';
        var barRow = '<div class="row"><span class="lab">좌측선</span>' +
          '<button data-bar="off">끄기</button>' + BAR_C.map(function (c) {
            return '<button class="sw" data-bar="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
          }).join('') + '</div>';
        p.innerHTML = (box ? '' : '<div class="row"><span class="lab"></span><button data-a="make">이 문단을 콜아웃으로</button></div>') +
          bgRow + barRow +
          (box ? '<div class="row"><span class="lab"></span><button data-a="rm">콜아웃 해제</button></div>' : '');
        p.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          var target = calloutOf() || box;
          if (b.dataset.a === 'make') { target = makeCallout(); if (!target) return; closePop(); return; }
          if (!target) { target = makeCallout(); if (!target) return; }
          if (b.dataset.a === 'rm') { removeCallout(target); closePop(); return; }
          if (b.dataset.bg !== undefined) setCalloutBg(target, b.dataset.bg);
          if (b.dataset.bar) setCalloutBar(target, b.dataset.bar !== 'off', b.dataset.bar !== 'off' ? b.dataset.bar : null);
        });
      });
    }

    // ---------------------------------------------------------------- 플로팅 바
    function buildBar() {
      var b = doc.createElement('div');
      b.className = '__fmt_bar'; markUI(b);
      var sizeOpts = '<option value="">크기</option>' + SIZES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
      var lhOpts = '<option value=""></option>' + LHS.map(function (l) { return '<option value="' + l + '">' + l + '%</option>'; }).join('') + '<option value="custom">직접</option>';
      var sws = COLORS.map(function (c) { return '<button type="button" class="sw" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('');
      b.innerHTML =
        '<div class="frow">' +
        '<select class="__fmt_blk"><option value="">문단</option><option value="h4">제목</option><option value="p">본문</option><option value="note">주석</option></select>' +
        '<select class="__fmt_size">' + sizeOpts + '</select>' +
        '<button type="button" data-a="bold"><b>B</b></button>' +
        '<span class="sep"></span>' + sws +
        '<span class="sep"></span>' +
        '<button type="button" data-a="al" data-v="justifyLeft" title="왼쪽 정렬"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M2 7h6M2 10.5h9"/></svg></button>' +
        '<button type="button" data-a="al" data-v="justifyCenter" title="가운데 정렬"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M4 7h6M3 10.5h8"/></svg></button>' +
        '<button type="button" data-a="al" data-v="justifyRight" title="오른쪽 정렬"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M6 7h6M3 10.5h9"/></svg></button>' +
        '<span class="sep"></span>' +
        '<span title="행간">↕</span><select class="__fmt_lh">' + lhOpts + '</select><input class="__fmt_lhv" type="number" min="80" max="400" placeholder="%">' +
        '<span class="sep"></span>' +
        '<button type="button" data-a="clear" title="선택한 글자의 색·크기·굵게 등 서식을 원래대로 되돌립니다">서식 지우기</button>' +
        '</div>' +
        '<div class="frow frow2">' +
        '<span class="flab">추가</span>' +
        '<button type="button" data-a="table" title="표 삽입 / 표 안에서는 행·열·병합">▦ 표</button>' +
        '<button type="button" data-a="callout" title="문단을 콜아웃 박스로">▍콜아웃</button>' +
        (onMedia ? '<button type="button" data-a="media" title="이미지·유튜브·동영상 삽입">🖼 미디어</button>' : '') +
        '</div>';
      doc.body.appendChild(b);

      b.addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) e.preventDefault();   // 선택 유지
      });
      b.addEventListener('click', function (e) {
        var btn = e.target.closest('button'); if (!btn) return;
        var a = btn.dataset.a;
        if (a === 'bold') exec('bold');
        else if (a === 'clear') exec('removeFormat');
        else if (a === 'al') exec(btn.dataset.v);
        else if (btn.dataset.c) applyColor(btn.dataset.c);
        else if (a === 'table') tablePop(btn);
        else if (a === 'callout') calloutPop(btn);
        else if (a === 'media') { hideBar(); if (onMedia) onMedia(); }
      });
      b.querySelector('.__fmt_blk').addEventListener('change', function () {
        var v = this.value; this.value = '';
        if (!v) return;
        restoreRange();
        if (v === 'note') {
          exec('formatBlock', 'p');
          var el = currentBlock();
          if (el) setStylesUndoable([{ el: el, props: { color: '#8a94a3', fontSize: '13px' } }]);
        } else {
          var el2 = currentBlock();
          if (el2) { el2.style.color = ''; el2.style.fontSize = ''; }
          exec('formatBlock', v);
        }
      });
      b.querySelector('.__fmt_size').addEventListener('change', function () {
        if (this.value) applyFontSizePx(parseInt(this.value, 10));
      });
      b.querySelector('.__fmt_lh').addEventListener('change', function () {
        if (this.value === 'custom') { b.querySelector('.__fmt_lhv').focus(); return; }
        if (this.value) { applyLineHeight(parseInt(this.value, 10)); syncLH(); }
      });
      var lhv = b.querySelector('.__fmt_lhv');
      function applyCustom() {
        var v = parseInt(lhv.value, 10);
        if (v >= 80 && v <= 400) { applyLineHeight(v); syncLH(); }
      }
      lhv.addEventListener('change', applyCustom);
      lhv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } });
      return b;
    }
    function positionBar() {
      if (!bar || !savedRange) return;
      var r = savedRange.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) {
        var blk = currentBlock();
        if (!blk) return;
        r = blk.getBoundingClientRect();
      }
      var bw = bar.offsetWidth, bh = bar.offsetHeight;
      var left = Math.max(8, Math.min(r.left + r.width / 2 - bw / 2, win.innerWidth - bw - 8));
      var top = r.top - bh - 10;
      if (top < 8) top = Math.min(win.innerHeight - bh - 8, r.bottom + 10);
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    }
    function showBar() {
      if (!enabled) return;
      ensureStyle();
      if (!bar) bar = buildBar();
      bar.style.display = 'flex';
      positionBar();
      syncLH(); syncSize();
    }
    function hideBar() {
      if (bar) bar.style.display = 'none';
      closePop();
    }

    function onSelChange() {
      if (!enabled) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(function () {
        var sel = selection();
        if (!sel || !sel.rangeCount || !sel.anchorNode || !doc.body.contains(sel.anchorNode) || inUI(sel.anchorNode)) return;
        keepRange();
        // 캐럿(포커스)만으로는 띄우지 않는다 — 1글자 이상 드래그 선택 시에만 표시.
        // 콜아웃 등 p/h 없는 컨테이너 안 선택도 텍스트만 있으면 띄운다.
        if (sel.isCollapsed || !String(sel).trim()) { hideBar(); return; }
        showBar();
      }, 140);
    }

    // ---------------------------------------------------------------- 우클릭 문단 메뉴
    function closeMenu() {
      if (menu) { menu.remove(); menu = null; }
      if (markEl) { markEl.classList.remove('__fmt_mark'); markEl = null; }
    }
    function paraOf(target) {
      var el = target && (target.nodeType === 1 ? target : target.parentElement);
      if (!el || el.closest('.__eui, .__he')) return null;
      var p = el.closest(PARASEL);
      if (p && (p === doc.body || p.matches('div') && !p.matches('div.ed-callout'))) {
        // 의미 없는 래퍼 div는 문단으로 안 침 (콜아웃 div는 허용)
        var inner = el.closest('p,h1,h2,h3,h4,h5,h6,li,figure,table,blockquote,pre,div.ed-callout');
        return inner && inner !== doc.body ? inner : null;
      }
      return p === doc.body ? null : p;
    }
    function ensureId(el) {
      if (el.id) return el.id;
      var id;
      do { id = 'p-' + Math.random().toString(36).slice(2, 8); } while (doc.getElementById(id));
      el.id = id;
      onChange();
      return id;
    }
    function copyText(t, done) {
      try {
        win.navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(fallback()); });
      } catch (e) { done(fallback()); }
      function fallback() {
        try {
          var ta = doc.createElement('textarea');
          markUI(ta);
          ta.value = t; doc.body.appendChild(ta); ta.select();
          var ok = doc.execCommand('copy');
          ta.remove();
          return ok;
        } catch (e) { return false; }
      }
    }
    function buildMenu(x, y, items) {
      closeMenu();
      menu = doc.createElement('div');
      menu.className = '__fmt_menu'; markUI(menu);
      menu.addEventListener('mousedown', function (e) { e.preventDefault(); }); // 선택 유지
      items.forEach(function (it) {
        if (it === '-') { var d = doc.createElement('div'); d.className = 'div'; menu.appendChild(d); return; }
        var b = doc.createElement('button');
        b.textContent = it.label;
        if (it.disabled) b.disabled = true;
        else b.addEventListener('click', function () { closeMenu(); it.run(); });
        menu.appendChild(b);
      });
      doc.body.appendChild(menu);
      var mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(x, win.innerWidth - mw - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(y, win.innerHeight - mh - 8)) + 'px';
    }
    function onContextMenu(e) {
      if (!enabled) return;
      if (e.target.closest && e.target.closest('.__eui, .__he')) return;   // UI 위에선 기본 메뉴
      var sel = selection();
      var hasSel = sel && sel.rangeCount && !sel.isCollapsed && !inUI(sel.anchorNode);
      if (hasSel) {
        keepRange();
        e.preventDefault();
        buildMenu(e.clientX, e.clientY, [
          { label: '문단 링크 삽입' + (copiedLink ? '' : ' (복사한 링크 없음)'), disabled: !copiedLink, run: function () {
              restoreRange();
              try { doc.execCommand('createLink', false, copiedLink); onChange(); toast('선택한 텍스트에 링크를 걸었습니다: ' + copiedLink); }
              catch (err) { toast('링크 삽입에 실패했습니다.'); }
            } }
        ]);
        return;
      }
      var para = paraOf(e.target);
      if (!para) return;
      e.preventDefault();
      markEl = para; para.classList.add('__fmt_mark');
      var hasCut = !!cutHTML;
      buildMenu(e.clientX, e.clientY, [
        { label: '잘라내기', run: function () {
            cutHTML = para.outerHTML.replace(/ class="([^"]*)__fmt_mark ?([^"]*)"/, function (m, a, b) {
              var cls = (a + b).trim(); return cls ? ' class="' + cls + '"' : '';
            });
            para.remove(); onChange(); toast('문단을 잘라냈습니다. 다른 문단에서 우클릭해 붙여넣으세요.');
          } },
        { label: '위에 붙여넣기', disabled: !hasCut, run: function () {
            para.insertAdjacentHTML('beforebegin', cutHTML); onChange();
          } },
        { label: '아래에 붙여넣기', disabled: !hasCut, run: function () {
            para.insertAdjacentHTML('afterend', cutHTML); onChange();
          } },
        '-',
        { label: '문단 링크 복사하기', run: function () {
            var id = ensureId(para);
            var link = (linkBase || '') + '#' + id;
            copiedLink = link;
            copyText(link, function (ok) {
              toast(ok ? '문단 링크를 복사했습니다: ' + link : '클립보드 복사 실패 — 링크: ' + link);
            });
          } }
      ]);
    }

    // ---------------------------------------------------------------- 문단 hover + 버튼 (노션식)
    var plusBtn = null, plusTarget = null, plusRaf = 0;
    // li/td 등 내부 요소는 상위 컨테이너(목록/표) 뒤에 문단을 넣는다
    function plusAnchor(blk) {
      var inner = blk.closest('li,td,th,dt,dd');
      if (inner) { var c = inner.closest('table,ul,ol,dl'); if (c) return c; }
      return blk.closest('figure,table,div.ed-callout') || blk;
    }
    function ensurePlus() {
      if (plusBtn) return plusBtn;
      ensureStyle();
      plusBtn = doc.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = '__fmt_plus';
      markUI(plusBtn);
      plusBtn.textContent = '+';
      plusBtn.title = '아래에 새 문단 추가';
      plusBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      plusBtn.addEventListener('click', function () {
        if (!plusTarget || !doc.contains(plusTarget)) return;
        var np = doc.createElement('p');
        np.innerHTML = '<br>';
        insertBlockUndoable(np, plusTarget);
        var r = doc.createRange(); r.selectNodeContents(np); r.collapse(true);
        var s = selection(); s.removeAllRanges(); s.addRange(r);
        positionPlus(np);
      });
      doc.body.appendChild(plusBtn);
      return plusBtn;
    }
    function positionPlus(anchor) {
      plusTarget = anchor;
      var b = ensurePlus();
      var r = anchor.getBoundingClientRect();
      b.style.display = 'flex';
      b.style.left = Math.max(4, r.left - 30) + 'px';
      b.style.top = (r.top + Math.min(r.height / 2, 14) - 11) + 'px';
    }
    function hidePlus() {
      if (plusHideT) { win.clearTimeout(plusHideT); plusHideT = null; }
      if (plusBtn) plusBtn.style.display = 'none';
      plusTarget = null;
    }
    var plusHideT = null;
    function scheduleHidePlus() {                                  // 즉시 숨기지 않고 유예 — 버튼까지 이동할 시간
      if (plusHideT) return;
      plusHideT = win.setTimeout(function () { plusHideT = null; hidePlus(); }, 450);
    }
    function cancelHidePlus() { if (plusHideT) { win.clearTimeout(plusHideT); plusHideT = null; } }
    function inPlusCorridor(x, y) {                                // 문단 왼쪽 여백(버튼으로 가는 길)인가
      if (!plusTarget || !doc.contains(plusTarget)) return false;
      var r = plusTarget.getBoundingClientRect();
      return x >= r.left - 48 && x <= r.right && y >= r.top - 10 && y <= r.bottom + 10;
    }
    function onMove(e) {
      if (!enabled) return;
      if (plusRaf) return;
      plusRaf = win.requestAnimationFrame(function () {
        plusRaf = 0;
        updateColCursor(e);
        if (colDrag) return;                                       // 열 리사이즈 중엔 다른 hover 로직 중단
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('.__fmt_plus')) { cancelHidePlus(); return; }   // 버튼 위 → 유지
        if (t.closest('.__eui, .__he')) { scheduleHidePlus(); return; }
        var blk = paraOf(t);
        if (!blk) {
          if (inPlusCorridor(e.clientX, e.clientY)) { cancelHidePlus(); return; }  // 버튼으로 가는 중
          scheduleHidePlus();
          return;
        }
        cancelHidePlus();
        var a = plusAnchor(blk);
        if (a !== plusTarget) positionPlus(a);
      });
    }

    // ---------------------------------------------------------------- on/off
    function onDocMouseDown(e) {
      if (menu && !e.target.closest('.__fmt_menu')) closeMenu();
      if (pop && !e.target.closest('.__fmt_pop') && !e.target.closest('.__fmt_bar')) closePop();
      if (bar && !e.target.closest('.__fmt_bar') && !e.target.closest('.__fmt_pop')) {
        // 본문 클릭은 곧 selectionchange로 다시 뜸. UI 밖 클릭 시 일단 숨김.
        if (!e.target.closest('.__eui')) hideBar();
      }
    }
    function onScroll() {
      if (bar && bar.style.display !== 'none') positionBar();
      if (plusTarget && doc.contains(plusTarget)) positionPlus(plusTarget);
    }

    function enable() {
      if (enabled) return;
      enabled = true;
      ensureStyle();
      doc.addEventListener('selectionchange', onSelChange);
      doc.addEventListener('contextmenu', onContextMenu, true);
      doc.addEventListener('mousedown', onColDown, true);
      doc.addEventListener('mousedown', onDocMouseDown, true);
      doc.addEventListener('keydown', onUndoKey, true);
      doc.addEventListener('input', onNativeInput, true);
      doc.addEventListener('mousemove', onMove, true);
      win.addEventListener('scroll', onScroll, true);
      win.addEventListener('resize', onScroll);
    }
    function disable() {
      enabled = false;
      doc.removeEventListener('selectionchange', onSelChange);
      doc.removeEventListener('contextmenu', onContextMenu, true);
      doc.removeEventListener('mousedown', onColDown, true);
      doc.removeEventListener('mousedown', onDocMouseDown, true);
      doc.removeEventListener('keydown', onUndoKey, true);
      if (colDrag) onColUp();
      doc.body.classList.remove('__fmt_colresize');
      doc.removeEventListener('input', onNativeInput, true);
      doc.removeEventListener('mousemove', onMove, true);
      win.removeEventListener('scroll', onScroll, true);
      win.removeEventListener('resize', onScroll);
      if (plusBtn) { plusBtn.remove(); plusBtn = null; plusTarget = null; }
      undoOps.length = 0; redoOps.length = 0; editLog.length = 0; redoLog.length = 0;
      closeMenu(); closePop();
      if (bar) { bar.remove(); bar = null; }
    }

    return { enable: enable, disable: disable, hide: hideBar };
  }

  g.EditorFormat = { create: create };
})(typeof window !== 'undefined' ? window : this);
