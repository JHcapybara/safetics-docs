/*
 * editor-find.js — 두 에디터(editor.html · 최종본 숨김 편집기) 공용 찾기/치환 엔진.
 * 대상 문서(designMode 켜진 document 또는 iframe contentDocument)를 받아 동작한다.
 *
 * - 하이라이트: CSS Custom Highlight API 사용(DOM 미변형 → undo 스택 안 더럽힘).
 *   미지원 브라우저는 하이라이트만 생략하고 나머지 기능은 동작.
 * - 치환: 각 매치를 선택 후 execCommand('insertText')로 수행 → Ctrl+Z 로 되돌릴 수 있음.
 *
 * 사용:
 *   var f = EditorFind.create({ doc: targetDoc, win: targetWin });
 *   f.search('양식');   // 반환: 매치 수. 첫 매치로 스크롤
 *   f.next(); f.prev(); // 매치 순회
 *   f.replaceCurrent('서식');           // 현재 매치만
 *   f.replaceAll('양식', '서식');        // 전부 (undo 가능)
 *   f.clear();                          // 하이라이트 해제
 */
(function (g) {
  'use strict';

  function create(opts) {
    var doc = opts.doc;
    var win = opts.win || doc.defaultView || window;
    var root = opts.container || doc.body;
    // 검색에서 제외할 영역(편집기 UI, 스크립트/스타일). 대상에 따라 없을 수도 있음.
    var SKIP = 'script,style,#__he_bar,#__he_toast,#fmtbar,.__he,#__ef_style';

    var ranges = [];
    var idx = -1;
    var term = '';
    var HAS_HL = !!(win.CSS && win.CSS.highlights && win.Highlight);
    var HL_ALL = '__ef_all', HL_CUR = '__ef_cur';

    function ensureStyle() {
      if (!HAS_HL || doc.getElementById('__ef_style')) return;
      var s = doc.createElement('style');
      s.id = '__ef_style';
      if (s.classList) { s.classList.add('__he'); s.classList.add('__eui'); } // 직렬화 시 편집기 UI와 함께 제거
      s.textContent =
        '::highlight(__ef_all){background:#fff3a0;color:inherit;}' +
        '::highlight(__ef_cur){background:#ffb020;color:#1f2733;}';
      (doc.head || doc.documentElement).appendChild(s);
    }

    function collect(t) {
      ranges = [];
      idx = -1;
      if (!t) return;
      var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        var p = n.parentElement;
        if (p && p.closest(SKIP)) continue;
        var s = n.nodeValue;
        var i = s.indexOf(t);
        while (i !== -1) {
          var r = doc.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + t.length);
          ranges.push(r);
          i = s.indexOf(t, i + t.length);
        }
      }
    }

    function paint() {
      if (!HAS_HL) return;
      var hs = win.CSS.highlights;
      hs.delete(HL_ALL);
      hs.delete(HL_CUR);
      if (!ranges.length) return;
      ensureStyle();
      var all = new win.Highlight();
      for (var i = 0; i < ranges.length; i++) {
        if (i === idx) continue;
        all.add(ranges[i]);
      }
      hs.set(HL_ALL, all);
      if (idx >= 0) {
        var cur = new win.Highlight();
        cur.add(ranges[idx]);
        hs.set(HL_CUR, cur);
      }
    }

    function scrollToCurrent() {
      if (idx < 0 || !ranges[idx]) return;
      var node = ranges[idx].startContainer;
      var el = node.nodeType === 1 ? node : node.parentElement;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    function search(t) {
      term = t || '';
      collect(term);
      idx = ranges.length ? 0 : -1;
      paint();
      scrollToCurrent();
      return ranges.length;
    }

    function step(dir) {
      if (!ranges.length) return 0;
      idx = (idx + dir + ranges.length) % ranges.length;
      paint();
      scrollToCurrent();
      return idx + 1; // 1-based 위치
    }

    // 선택 영역을 대상 문서에 설정하고 텍스트로 교체(undo 가능).
    function replaceRange(range, repl) {
      var sel = doc.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      // insertText는 빈 문자열이면 삭제로 동작. designMode/contenteditable 필요.
      doc.execCommand('insertText', false, repl);
    }

    function replaceCurrent(repl) {
      if (idx < 0 || !ranges[idx]) return 0;
      replaceRange(ranges[idx], repl == null ? '' : repl);
      // 문서가 바뀌었으니 재수집(치환어가 검색어를 다시 포함할 수 있으므로 위치 보존은 생략)
      var keep = term;
      collect(keep);
      idx = ranges.length ? Math.min(idx, ranges.length - 1) : -1;
      paint();
      scrollToCurrent();
      return 1;
    }

    function replaceAll(find, repl) {
      var t = find != null ? find : term;
      if (!t) return 0;
      collect(t);
      var list = ranges.slice();
      if (!list.length) return 0;
      // 같은 텍스트 노드에서 앞쪽 매치를 먼저 바꾸면 뒤 매치의 offset이 밀린다.
      // 뒤(마지막)부터 처리하면 앞선 range의 offset이 유지된다.
      for (var i = list.length - 1; i >= 0; i--) {
        replaceRange(list[i], repl == null ? '' : repl);
      }
      var count = list.length;
      // 치환 후 상태로 재검색(보통 0). 하이라이트 정리.
      term = t;
      collect(t);
      idx = ranges.length ? 0 : -1;
      paint();
      return count;
    }

    function clear() {
      ranges = [];
      idx = -1;
      term = '';
      if (HAS_HL) {
        win.CSS.highlights.delete(HL_ALL);
        win.CSS.highlights.delete(HL_CUR);
      }
    }

    return {
      search: search,
      next: function () { return step(1); },
      prev: function () { return step(-1); },
      replaceCurrent: replaceCurrent,
      replaceAll: replaceAll,
      clear: clear,
      count: function () { return ranges.length; },
      position: function () { return idx + 1; },
      supportsHighlight: HAS_HL
    };
  }

  g.EditorFind = { create: create };
})(typeof window !== 'undefined' ? window : this);
