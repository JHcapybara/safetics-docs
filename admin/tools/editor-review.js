/*
 * editor-review.js — /manual-update 자동 반영분 "검수 레이어" 공용 엔진.
 *
 * 설계 원칙(데모의 구멍 해소):
 *  - /manual-update는 매뉴얼(index.html)에 "의미 속성"만 심는다. 딱지(배지·버튼·이전문구)를
 *    HTML에 넣지 않는다:
 *      추가: <el data-rv="add"    data-rv-src="레포@sha">새 내용</el>
 *      변경: <el data-rv="change" data-rv-src="레포@sha" data-rv-old="이전 문구">새 문구</el>
 *      (스크린샷 등 사람 손 필요: data-rv-note="스크린샷 필요")
 *  - 검수 UI(배지/승인·반려 버튼/툴바)는 이 엔진이 "검수 모드"에서만 동적 생성하며 전부 class
 *    "__eui" 로 마킹 → 저장/빌드 직렬화에서 제거된다. 따라서 원본·최종본·공개 웹 어디에도
 *    딱지 자체는 남지 않는다. (구멍1·2·3)
 *  - 기본 화면은 딱지 없이 "새 본문"만 정상 노출 → 공개 웹에 미검수 항목이 있어도 사용자는
 *    검수 UI를 보지 못한다.
 *  - 승인 = data-rv* 속성 제거(순수 본문). 반려 = 추가면 삭제/변경이면 이전 문구 복원.
 *  - 빌드(build.mjs)는 미검수 data-rv가 남아 있으면 중단하고, 승인 잔재 속성은 unwrap 한다.
 *    (구멍6은 빌드 가드, 구멍5=미검출 회수율은 모델 한계 → /manual-update가 저신뢰 항목 보고)
 *
 * 사용:
 *   var rv = EditorReview.create({ doc, win, onChange, onEdit });
 *   rv.mount();          // 검수 대상 있으면 툴바 표시(기본 검수모드 ON), 없으면 아무 것도 안 함
 *   rv.setMode(true/false);
 */
(function (g) {
  'use strict';

  function create(opts) {
    var doc = opts.doc;
    var win = opts.win || doc.defaultView || window;
    var onChange = opts.onChange || function () {};
    var onEdit = opts.onEdit || null;   // (el, done) => {}  "수정 후 승인" 훅(편집기 연동). 없으면 인라인 편집.

    var bar = null, on = false, mounted = false;

    function items() { return Array.prototype.slice.call(doc.querySelectorAll('[data-rv]')); }
    function pending() { return items().filter(function (el) { return el.getAttribute('data-rv'); }); }

    function markUI(node) { node.classList.add('__eui'); node.setAttribute('contenteditable', 'false'); }

    function ensureStyle() {
      if (doc.getElementById('__rv_style')) return;
      var s = doc.createElement('style');
      s.id = '__rv_style'; s.className = '__eui';
      s.textContent =
        // 기본: 마커는 시각적으로 없음(공개 웹은 깔끔). 검수 모드에서만 강조.
        'body.__rv-on [data-rv="add"]{background:rgba(22,163,74,.08);box-shadow:inset 3px 0 0 #16a34a;border-radius:6px;padding:6px 10px;}' +
        'body.__rv-on [data-rv="change"]{background:rgba(255,142,43,.10);box-shadow:inset 3px 0 0 #ff7a12;border-radius:6px;padding:6px 10px;}' +
        '.__rv_chrome{display:block;margin:0 0 6px;}' +
        '.__rv_badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.03em;border-radius:999px;padding:2px 9px;}' +
        '.__rv_badge.add{color:#16a34a;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.45);}' +
        '.__rv_badge.change{color:#ff7a12;background:rgba(255,142,43,.10);border:1px solid rgba(255,142,43,.4);}' +
        '.__rv_badge .src{font-weight:500;opacity:.7;letter-spacing:0;}' +
        '.__rv_old{text-decoration:line-through;color:#dc2626;background:rgba(220,38,38,.07);border-radius:4px;padding:0 4px;margin-right:4px;font-size:.9em;}' +
        '.__rv_acts{display:inline-flex;gap:6px;margin-left:10px;vertical-align:middle;}' +
        '.__rv_acts button{cursor:pointer;font-size:11px;font-weight:700;border-radius:999px;padding:3px 11px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#333;}' +
        '.__rv_acts button.ok{color:#16a34a;border-color:rgba(22,163,74,.45);}' +
        '.__rv_acts button.ok:hover{color:#fff;background:#16a34a;}' +
        '.__rv_acts button.no:hover{color:#fff;background:#dc2626;border-color:#dc2626;}' +
        '.__rv_bar{position:fixed;top:0;left:0;right:0;z-index:2147483200;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#15171c;color:#fff;padding:9px 18px;font:13px system-ui,"Malgun Gothic",sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.3);}' +
        '.__rv_bar b{color:#4ade80;}' +
        '.__rv_bar .grow{flex:1;}' +
        '.__rv_bar button{cursor:pointer;font-size:12px;font-weight:700;border-radius:999px;padding:5px 14px;border:1px solid #3a4a75;background:#223052;color:#fff;}' +
        '.__rv_bar button:hover{background:#2e3f68;}' +
        'body.__rv-on{padding-top:44px;}';
      (doc.head || doc.documentElement).appendChild(s);
    }

    function badge(el) {
      var kind = el.getAttribute('data-rv');
      var src = el.getAttribute('data-rv-src') || '';
      var note = el.getAttribute('data-rv-note');
      var wrap = doc.createElement('span'); wrap.className = '__rv_chrome'; markUI(wrap);
      var b = doc.createElement('span');
      b.className = '__rv_badge ' + (kind === 'change' ? 'change' : 'add');
      b.innerHTML = (kind === 'change' ? '± 자동 변경 ' : '+ 자동 추가 ') +
        '<span class="src">' + esc(src) + (note ? ' · ' + esc(note) : '') + '</span>';
      wrap.appendChild(b);
      var acts = doc.createElement('span'); acts.className = '__rv_acts';
      acts.innerHTML =
        '<button class="ok" data-a="ok">✓ 승인</button>' +
        '<button data-a="edit">✎ 수정 후 승인</button>' +
        '<button class="no" data-a="no">✕ 반려</button>';
      wrap.appendChild(acts);
      acts.addEventListener('click', function (e) {
        var btn = e.target.closest('button'); if (!btn) return;
        if (btn.dataset.a === 'ok') approve(el);
        else if (btn.dataset.a === 'no') reject(el);
        else edit(el);
      });
      return wrap;
    }
    function esc(s) { var d = doc.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

    function oldPreview(el) {
      var oldTxt = el.getAttribute('data-rv-old');
      if (oldTxt == null || el.querySelector('.__rv_old')) return;
      var span = doc.createElement('span'); span.className = '__rv_old'; markUI(span);
      span.textContent = oldTxt;
      // 새 문구 바로 앞에 배치
      var anchor = el.querySelector('.__rv_chrome');
      if (anchor && anchor.nextSibling) el.insertBefore(span, anchor.nextSibling);
      else el.insertBefore(span, el.firstChild);
    }

    function decorate() {
      pending().forEach(function (el) {
        if (!el.querySelector(':scope > .__rv_chrome')) el.insertBefore(badge(el), el.firstChild);
        if (el.getAttribute('data-rv') === 'change') oldPreview(el);
      });
    }
    function undecorate() {
      Array.prototype.forEach.call(doc.querySelectorAll('.__rv_chrome, .__rv_old'), function (n) { n.remove(); });
    }

    function stripAttrs(el) {
      el.removeAttribute('data-rv'); el.removeAttribute('data-rv-src');
      el.removeAttribute('data-rv-old'); el.removeAttribute('data-rv-note');
    }
    function approve(el) {
      // 딱지 제거 + 속성 제거 → 순수 본문
      var c = el.querySelector(':scope > .__rv_chrome'); if (c) c.remove();
      var o = el.querySelector(':scope > .__rv_old'); if (o) o.remove();
      stripAttrs(el);
      onChange(); refresh();
    }
    function reject(el) {
      var kind = el.getAttribute('data-rv');
      if (kind === 'add') { el.remove(); }
      else {
        // 변경 반려 → 이전 문구 복원
        var old = el.getAttribute('data-rv-old');
        undecorateOne(el);
        if (old != null) el.textContent = old;
        stripAttrs(el);
      }
      onChange(); refresh();
    }
    function undecorateOne(el) {
      var c = el.querySelector(':scope > .__rv_chrome'); if (c) c.remove();
      var o = el.querySelector(':scope > .__rv_old'); if (o) o.remove();
    }
    function edit(el) {
      undecorateOne(el);
      if (typeof onEdit === 'function') {
        onEdit(el, function () { approve(el); });
        return;
      }
      // 인라인 편집: 잠깐 편집 가능하게, 다시 클릭하면 승인
      el.setAttribute('contenteditable', 'true');
      el.focus();
      var finish = function () {
        el.removeAttribute('contenteditable');
        el.removeEventListener('blur', finish);
        approve(el);
      };
      el.addEventListener('blur', finish);
    }

    function refresh() {
      if (!bar) return;
      var n = pending().length;
      var msg = bar.querySelector('.__rv_msg');
      if (n === 0) {
        msg.textContent = '검수 완료 — sync-state 갱신·빌드·배포 가능';
        undecorate();
      } else {
        // .__rv_n 이 완료 메시지로 대체됐을 수 있으니 항상 재구성(항목이 다시 생겨도 안전).
        msg.innerHTML = '미검수 <b class="__rv_n">' + n + '</b>건';
      }
    }

    function buildBar() {
      var b = doc.createElement('div'); b.className = '__rv_bar'; markUI(b);
      b.innerHTML =
        '<span>🤖 자동 반영분 검수</span>' +
        '<span class="__rv_msg">미검수 <b class="__rv_n">0</b>건</span>' +
        '<span class="grow"></span>' +
        '<button data-a="toggle">딱지 표시 끄기</button>' +
        '<button data-a="okall">모두 승인</button>';
      b.querySelector('[data-a=toggle]').addEventListener('click', function () { setMode(!on); });
      b.querySelector('[data-a=okall]').addEventListener('click', function () {
        if (!win.confirm('미검수 ' + pending().length + '건을 모두 승인할까요?')) return;
        pending().slice().forEach(approve);
      });
      doc.body.appendChild(b);
      return b;
    }

    function setMode(v) {
      on = v;
      doc.body.classList.toggle('__rv-on', on);
      if (on) decorate(); else undecorate();
      if (bar) bar.querySelector('[data-a=toggle]').textContent = on ? '딱지 표시 끄기' : '딱지 표시 켜기';
      refresh();
    }
    function mount() {
      if (mounted) return;
      if (items().length === 0) return;   // 검수할 것 없으면 아무 것도 안 함(공개 웹 기본)
      mounted = true;
      ensureStyle();
      bar = buildBar();
      setMode(true);
    }
    function unmount() {
      undecorate();
      if (bar) { bar.remove(); bar = null; }
      doc.body.classList.remove('__rv-on');
      mounted = false; on = false;
    }

    return {
      mount: mount, unmount: unmount, setMode: setMode,
      count: function () { return pending().length; },
      approveAll: function () { pending().slice().forEach(approve); },
      hasPending: function () { return pending().length > 0; }
    };
  }

  g.EditorReview = { create: create };
})(typeof window !== 'undefined' ? window : this);
