/*
 * editor-media.js — 두 에디터(editor.html · 최종본 숨김 편집기) 공용 미디어 엔진.
 * 이미지/GIF 삽입·교체·크기조절·캡션, 유튜브 임베드, mp4/webm 동영상 삽입.
 *
 * 저장 방식: 이미지/GIF/동영상 파일은 모두 base64 data URI로 임베드(자기완결형).
 *   이미지는 삽입 시 가로 최대 1600px로 자동 축소·재압축(용량 절감). GIF는 애니메이션
 *   보존을 위해 원본 그대로. 동영상 파일도 base64 임베드(용량 클 수 있어 경고 표시).
 * 유튜브: iframe 임베드 + 오프라인/PDF 대비 링크 폴백.
 *
 * 편집 UI(모달·선택 툴바·편집기 스타일)는 전부 class "__eui"로 마킹 → 저장 직렬화 시
 * 두 편집기 모두 .__eui 를 제거하므로 저장본에는 남지 않는다. 미디어 표시용 CSS(#__media_css)
 * 는 __eui 가 아니라 저장본에 유지되어 재생·인쇄 폴백이 동작한다.
 *
 * 사용:
 *   var m = EditorMedia.create({ doc: targetDoc, win: targetWin, onChange: fn });
 *   m.enable();          // 이미지/미디어 클릭 시 선택 툴바 활성화
 *   m.openInsert();      // 미디어 삽입 모달 열기 (➕ 미디어 버튼에 연결)
 *   m.disable();         // 편집 종료 시 정리
 */
(function (g) {
  'use strict';

  function create(opts) {
    var doc = opts.doc;
    var win = opts.win || doc.defaultView || window;
    var onChange = opts.onChange || function () {};
    var MAXW = opts.maxImageWidth || 1600;

    var selBar = null, selFig = null, modal = null, docClick = null;
    var lastBlock = null, selTrack = null;   // 마지막으로 커서가 놓인 "콘텐츠" 블록(편집기 UI 제외)

    // 정렬 아이콘(가로줄 3개, currentColor). 좌/가운데/우
    var ALIGN_ICON = {
      left:   '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M2 7h6M2 10.5h9"/></svg>',
      center: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M4 7h6M3 10.5h8"/></svg>',
      right:  '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h10M6 7h6M3 10.5h9"/></svg>'
    };

    // ---------------------------------------------------------------- 스타일
    function markUI(node) {
      node.classList.add('__eui');
      node.setAttribute('contenteditable', 'false');
    }
    function ensureChromeStyle() {
      if (doc.getElementById('__em_style')) return;
      var s = doc.createElement('style');
      s.id = '__em_style';
      s.className = '__eui';
      s.textContent =
        '.__em_modal_ov{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;}' +
        '.__em_modal{background:#fff;color:#1f2733;border-radius:14px;width:520px;max-width:100%;max-height:86vh;overflow:auto;box-shadow:0 12px 48px rgba(0,0,0,.3);font-family:system-ui,"Malgun Gothic",sans-serif;}' +
        '.__em_modal h3{font-size:16px;padding:16px 20px 4px;margin:0;}' +
        '.__em_modal .__em_body{padding:8px 20px 16px;}' +
        '.__em_tabs{display:flex;gap:6px;padding:8px 20px 0;}' +
        '.__em_tabs button{flex:1;padding:8px;border:1px solid #d8deea;background:#f4f7fb;border-radius:8px;cursor:pointer;font-size:13px;}' +
        '.__em_tabs button.on{background:#1f5eff;color:#fff;border-color:#1f5eff;font-weight:700;}' +
        '.__em_pane{display:none;padding-top:10px;}.__em_pane.on{display:block;}' +
        '.__em_row{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap;font-size:13px;}' +
        '.__em_modal input[type=text],.__em_modal input[type=url]{flex:1;min-width:180px;padding:8px 10px;border:1.5px solid #c9d2e0;border-radius:6px;font-size:13px;}' +
        '.__em_modal input[type=file]{font-size:13px;}' +
        '.__em_modal label.__em_ck{display:inline-flex;align-items:center;gap:5px;cursor:pointer;}' +
        '.__em_foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid #e3e8ef;background:#f8fafc;}' +
        '.__em_foot button{padding:8px 18px;border-radius:8px;border:1px solid #1f5eff;background:#1f5eff;color:#fff;font-size:13px;font-weight:700;cursor:pointer;}' +
        '.__em_foot button.ghost{background:#fff;color:#1f5eff;}' +
        '.__em_hint{font-size:12px;color:#7a8496;}' +
        '.__em_selbar{position:fixed;z-index:2147482000;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#16213a;color:#fff;padding:8px 12px;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-family:system-ui,sans-serif;font-size:12.5px;max-width:94vw;}' +
        '.__em_selbar button{background:#223052;color:#fff;border:1px solid #3a4a75;border-radius:6px;height:28px;padding:0 10px;font-size:12.5px;cursor:pointer;}' +
        '.__em_selbar button:hover{background:#2e3f68;}' +
        '.__em_selbar button.danger{border-color:#5a2330;background:#3a1a22;}' +
        '.__em_selbar .__em_lab{color:#8fa0c5;}' +
        '.__em_selbar button.on{background:#1f5eff;border-color:#1f5eff;font-weight:700;}' +
        '.__em_handles{position:fixed;z-index:2147481500;pointer-events:none;outline:2px solid #1f5eff;box-shadow:0 0 0 1px rgba(255,255,255,.6) inset;}' +
        '.__em_handles .__em_h{position:absolute;width:14px;height:14px;background:#1f5eff;border:2px solid #fff;border-radius:3px;pointer-events:auto;box-shadow:0 1px 3px rgba(0,0,0,.4);}' +
        '.__em_h_nw{left:-8px;top:-8px;cursor:nwse-resize;}' +
        '.__em_h_ne{right:-8px;top:-8px;cursor:nesw-resize;}' +
        '.__em_h_sw{left:-8px;bottom:-8px;cursor:nesw-resize;}' +
        '.__em_h_se{right:-8px;bottom:-8px;cursor:nwse-resize;}' +
        '.__em_draglab{position:fixed;z-index:2147483600;background:#16213a;color:#fff;font:12px system-ui;padding:3px 8px;border-radius:6px;pointer-events:none;}';
      (doc.head || doc.documentElement).appendChild(s);
    }
    // 저장본에 유지되는 미디어 표시 CSS (한 번만).
    function ensureContentStyle() {
      if (doc.getElementById('__media_css')) return;
      var s = doc.createElement('style');
      s.id = '__media_css';
      s.textContent =
        'figure.editor-media{margin:18px auto;text-align:center;}' +
        'figure.editor-media img,figure.editor-media video{max-width:100%;height:auto;border-radius:8px;}' +
        'figure.editor-media .embed-16x9{position:relative;width:100%;max-width:720px;margin:0 auto;padding-top:56.25%;}' +
        'figure.editor-media .embed-16x9 iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px;}' +
        'figure.editor-media .media-fallback{display:none;font-size:12px;color:#1f5eff;word-break:break-all;}' +
        'figure.editor-media figcaption{font-size:13px;color:#5a6472;margin-top:8px;line-height:1.5;}' +
        '@media print{figure.editor-media .embed-16x9{display:none;}figure.editor-media video{display:none;}figure.editor-media .media-fallback{display:inline;}}';
      (doc.head || doc.documentElement).appendChild(s);
    }

    // ---------------------------------------------------------------- 유틸
    function fileToDataURL(file, cb) {
      var fr = new win.FileReader();
      fr.onload = function () { cb(fr.result); };
      fr.onerror = function () { cb(null); };
      fr.readAsDataURL(file);
    }
    // 이미지 축소·재압축 → dataURL. GIF는 애니메이션 보존 위해 원본 유지.
    function imageToDataURL(file, cb) {
      if (file.type === 'image/gif') { fileToDataURL(file, cb); return; }
      var img = new win.Image();
      var url = win.URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAXW / (w || 1));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var c = doc.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        win.URL.revokeObjectURL(url);
        // PNG는 투명도 보존, 그 외는 JPEG로 압축
        var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        try { cb(c.toDataURL(type, 0.9)); } catch (e) { fileToDataURL(file, cb); }
      };
      img.onerror = function () { win.URL.revokeObjectURL(url); fileToDataURL(file, cb); };
      img.src = url;
    }
    function ytId(url) {
      if (!url) return null;
      var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})/);
      if (m) return m[1];
      var t = url.trim();
      return /^[\w-]{11}$/.test(t) ? t : null;
    }
    function approxKB(dataURL) { return Math.round((dataURL.length * 0.75) / 1024); }

    // ---------------------------------------------------------------- 콘텐츠 빌더
    function newFigure() {
      var f = doc.createElement('figure');
      f.className = 'shot editor-media';
      return f;
    }
    function addCaption(f, text) {
      var cap = doc.createElement('figcaption');
      cap.textContent = text && text.trim() ? text : '설명을 입력하세요';
      f.appendChild(cap);
    }
    function imageFigure(src, caption, withCap) {
      var f = newFigure();
      var im = doc.createElement('img');
      im.src = src;
      f.appendChild(im);
      if (withCap) addCaption(f, caption);
      return f;
    }
    function youtubeFigure(id, o) {
      var f = newFigure(); f.classList.add('media-embed');
      var wrap = doc.createElement('div'); wrap.className = 'embed-16x9';
      var ifr = doc.createElement('iframe');
      var p = 'rel=0';
      if (o.autoplay) p += '&autoplay=1&mute=1';
      if (o.loop) p += '&loop=1&playlist=' + id;
      ifr.src = 'https://www.youtube.com/embed/' + id + '?' + p;
      ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      ifr.setAttribute('allowfullscreen', '');
      wrap.appendChild(ifr);
      f.appendChild(wrap);
      var fb = doc.createElement('a');
      fb.className = 'media-fallback';
      fb.href = 'https://youtu.be/' + id;
      fb.textContent = '▶ 영상 보기: https://youtu.be/' + id;
      f.appendChild(fb);
      if (o.caption != null) addCaption(f, o.caption);
      return f;
    }
    function videoFigure(src, o) {
      var f = newFigure(); f.classList.add('media-embed');
      var v = doc.createElement('video');
      v.src = src;
      v.style.maxWidth = '100%';
      if (o.controls !== false) v.controls = true;
      if (o.autoplay) { v.autoplay = true; v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); }
      if (o.loop) v.loop = true;
      f.appendChild(v);
      if (o.srcIsUrl) {
        var fb = doc.createElement('a');
        fb.className = 'media-fallback'; fb.href = src; fb.textContent = '▶ 영상: ' + src;
        f.appendChild(fb);
      }
      if (o.caption != null) addCaption(f, o.caption);
      return f;
    }

    var BLOCKSEL = 'p,h1,h2,h3,h4,h5,h6,li,figure,article,section,blockquote,div';
    // 현재 커서가 놓인 콘텐츠 블록. 편집기 UI(.__eui) 안이면 무시.
    function contentBlockFromSelection() {
      var sel = doc.getSelection();
      if (!sel || !sel.anchorNode || !doc.body.contains(sel.anchorNode)) return null;
      var e = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      if (!e || e.closest('.__eui')) return null;
      var b = e.closest(BLOCKSEL);
      return (b && b !== doc.body) ? b : null;
    }
    function trackSelection() {
      var b = contentBlockFromSelection();
      if (b) lastBlock = b;
    }
    function insertNode(node) {
      ensureContentStyle();
      // 삽입 위치: 현재 콘텐츠 커서 → 없으면 마지막 커서 → 없으면 본문 끝.
      // 절대 편집기 UI(.__eui: 모달·툴바) 하위에 넣지 않는다(모달 닫힐 때 같이 지워짐).
      var block = contentBlockFromSelection();
      if (!block && lastBlock && doc.body.contains(lastBlock) && !lastBlock.closest('.__eui')) block = lastBlock;
      if (block && block.parentNode && block !== doc.body && !block.closest('.__eui')) {
        block.parentNode.insertBefore(node, block.nextSibling);
      } else {
        (doc.querySelector('main,article,.content,#content') || doc.body).appendChild(node);
      }
      onChange();
    }

    // ---------------------------------------------------------------- 선택 툴바(크기·캡션·교체·삭제)
    function figureOf(target) {
      if (!target || target.nodeType !== 1) return null;
      if (target.closest('.__eui')) return null;
      return target.closest('figure.editor-media, figure.shot') || (target.tagName === 'IMG' ? wrapLooseImg(target) : null);
    }
    // 편집기로 만들지 않은 기존 <img>도 클릭하면 figure로 감싸 크기조절 대상이 되게.
    function wrapLooseImg(img) {
      if (img.closest('figure')) return img.closest('figure');
      var f = newFigure();
      img.parentNode.insertBefore(f, img);
      f.appendChild(img);
      return f;
    }
    function widthOfFigurePct(fig) {
      var m = (fig.style.width || '').match(/([\d.]+)%/);
      return m ? Math.round(parseFloat(m[1])) : 100;
    }
    function setWidth(fig, pct) {
      if (!pct || pct >= 100) { fig.style.width = ''; fig.style.maxWidth = ''; }
      else { fig.style.width = pct + '%'; fig.style.maxWidth = pct + '%'; }
      onChange();
    }
    function toggleCaption(fig) {
      var c = fig.querySelector('figcaption');
      if (c) { c.remove(); } else { addCaption(fig, ''); }
      onChange();
    }
    // 정렬: 폭이 100% 미만일 때 좌/가운데/우 배치. (figure는 block, margin auto 활용)
    function alignOf(fig) {
      var ml = fig.style.marginLeft, mr = fig.style.marginRight;
      if (ml === '0px' || ml === '0') return 'left';
      if (mr === '0px' || mr === '0') return 'right';
      return 'center';
    }
    function setAlign(fig, a) {
      fig.style.display = 'block';
      fig.style.marginLeft = (a === 'left') ? '0' : 'auto';
      fig.style.marginRight = (a === 'right') ? '0' : 'auto';
      fig.style.textAlign = a;
      onChange();
    }

    function buildSelBar() {
      var bar = doc.createElement('div');
      bar.className = '__em_selbar';
      markUI(bar);
      bar.innerHTML =
        '<span class="__em_lab">정렬</span>' +
        '<button data-al="left" title="좌측 정렬">' + ALIGN_ICON.left + '</button>' +
        '<button data-al="center" title="가운데 정렬">' + ALIGN_ICON.center + '</button>' +
        '<button data-al="right" title="우측 정렬">' + ALIGN_ICON.right + '</button>' +
        '<span class="__em_lab">|</span>' +
        '<span class="__em_lab">크기</span>' +
        '<span class="__em_wv" style="min-width:40px;text-align:center">100%</span>' +
        '<button data-act="reset">원본크기</button>' +
        '<span class="__em_lab">|</span>' +
        '<button data-act="cap" title="캡션 켜기/끄기">캡션</button>' +
        '<button data-act="replace">이미지 교체</button>' +
        '<button data-act="del" class="danger">삭제</button>' +
        '<button data-act="close">닫기</button>';
      doc.body.appendChild(bar);
      bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || !selFig) return;
        if (b.dataset.al) { setAlign(selFig, b.dataset.al); syncSelBar(); positionHandles(); }
        else if (b.dataset.act === 'reset') { setWidth(selFig, 100); syncSelBar(); positionHandles(); }
        else if (b.dataset.act === 'cap') { toggleCaption(selFig); syncSelBar(); positionHandles(); }
        else if (b.dataset.act === 'replace') { replaceImageIn(selFig); }
        else if (b.dataset.act === 'del') { selFig.remove(); hideSelBar(); onChange(); }
        else if (b.dataset.act === 'close') { hideSelBar(); }
      });
      return bar;
    }
    function syncSelBar() {
      if (!selBar || !selFig) return;
      selBar.querySelector('.__em_wv').textContent = widthOfFigurePct(selFig) + '%';
      var al = alignOf(selFig);
      Array.prototype.forEach.call(selBar.querySelectorAll('[data-al]'), function (b) {
        b.classList.toggle('on', b.dataset.al === al);
      });
      var capBtn = selBar.querySelector('[data-act=cap]');
      if (capBtn) capBtn.classList.toggle('on', !!selFig.querySelector('figcaption'));
    }
    function showSelBar(fig) {
      selFig = fig;
      if (!selBar) selBar = buildSelBar();
      selBar.style.display = 'flex';
      selBar.querySelector('[data-act=replace]').style.display = fig.querySelector('img') ? '' : 'none';
      syncSelBar();
      positionHandles();
    }
    function hideSelBar() {
      if (selBar) selBar.style.display = 'none';
      if (handles) handles.style.display = 'none';
      selFig = null;
    }

    // ---------------------------------------------------------------- 드래그 크기조절 핸들
    var handles = null, drag = null, dragLab = null, suppressClick = false;
    function resizeTarget(fig) {
      return fig.querySelector('img, video') || fig.querySelector('.embed-16x9') || fig;
    }
    function buildHandles() {
      var ov = doc.createElement('div'); ov.className = '__em_handles'; markUI(ov);
      ['nw', 'ne', 'sw', 'se'].forEach(function (c) {
        var h = doc.createElement('span'); h.className = '__em_h __em_h_' + c; h.dataset.c = c; ov.appendChild(h);
      });
      doc.body.appendChild(ov);
      ov.addEventListener('mousedown', onHandleDown, true);
      return ov;
    }
    function positionHandles() {
      if (!selFig) { if (handles) handles.style.display = 'none'; return; }
      var el = resizeTarget(selFig);
      var r = el.getBoundingClientRect();
      if (!handles) handles = buildHandles();
      handles.style.display = 'block';
      handles.style.left = r.left + 'px';
      handles.style.top = r.top + 'px';
      handles.style.width = r.width + 'px';
      handles.style.height = r.height + 'px';
    }
    function onHandleDown(e) {
      var h = e.target.closest('.__em_h'); if (!h || !selFig) return;
      e.preventDefault(); e.stopPropagation();
      suppressClick = true;   // 드래그 종료 직후 배경 click이 선택바를 닫지 않게
      var el = resizeTarget(selFig);
      var container = selFig.parentElement;
      var startRect = el.getBoundingClientRect();
      drag = {
        corner: h.dataset.c,
        startX: e.clientX,
        startW: startRect.width,
        contW: container ? container.getBoundingClientRect().width : startRect.width
      };
      win.addEventListener('mousemove', onDragMove, true);
      win.addEventListener('mouseup', onDragUp, true);
    }
    function onDragMove(e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX;
      var dir = (drag.corner === 'ne' || drag.corner === 'se') ? 1 : -1; // 오른쪽 모서리는 +dx로 커짐
      var newW = drag.startW + dir * dx;
      var pct = Math.max(10, Math.min(100, Math.round(newW / (drag.contW || 1) * 100)));
      setWidth(selFig, pct);
      syncSelBar();
      positionHandles();
      showDragLab(e, pct);
    }
    function onDragUp() {
      drag = null;
      win.removeEventListener('mousemove', onDragMove, true);
      win.removeEventListener('mouseup', onDragUp, true);
      hideDragLab();
      // mouseup 직후 발생할 수 있는 click 1회를 무시(선택바 유지). 그 다음 tick에 해제.
      win.setTimeout(function () { suppressClick = false; }, 0);
      onChange();
    }
    function showDragLab(e, pct) {
      if (!dragLab) { dragLab = doc.createElement('div'); dragLab.className = '__em_draglab'; markUI(dragLab); doc.body.appendChild(dragLab); }
      dragLab.style.display = 'block';
      dragLab.style.left = (e.clientX + 14) + 'px';
      dragLab.style.top = (e.clientY + 14) + 'px';
      dragLab.textContent = pct + '%';
    }
    function hideDragLab() { if (dragLab) dragLab.style.display = 'none'; }
    function reposition() { if (selFig) positionHandles(); }

    function replaceImageIn(fig) {
      var img = fig.querySelector('img'); if (!img) return;
      pickFile('image/*', function (file) {
        imageToDataURL(file, function (data) { if (data) { img.src = data; onChange(); setTimeout(positionHandles, 60); } });
      });
    }

    // ---------------------------------------------------------------- 파일 선택
    function pickFile(accept, cb) {
      var inp = doc.createElement('input');
      inp.type = 'file'; inp.accept = accept;
      markUI(inp); inp.style.display = 'none';
      doc.body.appendChild(inp);
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        inp.remove();
        if (f) cb(f);
      });
      inp.click();
    }

    // ---------------------------------------------------------------- 삽입 모달
    function openInsert() {
      ensureChromeStyle();
      if (modal) modal.remove();
      var ov = doc.createElement('div'); ov.className = '__em_modal_ov'; markUI(ov);
      ov.innerHTML =
        '<div class="__em_modal">' +
        '<h3>➕ 미디어 삽입</h3>' +
        '<div class="__em_tabs">' +
          '<button data-tab="img" class="on">🖼 이미지·GIF</button>' +
          '<button data-tab="yt">▶ 유튜브</button>' +
          '<button data-tab="vid">🎬 동영상 파일</button>' +
        '</div>' +
        '<div class="__em_body">' +
          '<div class="__em_pane on" data-pane="img">' +
            '<div class="__em_row"><button class="__em_pick" data-for="img">파일 선택 (PNG·JPG·GIF)</button><span class="__em_hint __em_name" data-for="img">선택된 파일 없음</span></div>' +
            '<div class="__em_row"><input type="text" class="__em_cap" data-for="img" placeholder="캡션(설명) — 비우면 캡션 없음"></div>' +
            '<div class="__em_row __em_hint">이미지는 가로 최대 ' + MAXW + 'px로 자동 축소되어 문서에 포함됩니다. GIF는 원본 유지.</div>' +
          '</div>' +
          '<div class="__em_pane" data-pane="yt">' +
            '<div class="__em_row"><input type="url" class="__em_url" data-for="yt" placeholder="유튜브 주소 (watch/youtu.be/shorts 모두 가능)"></div>' +
            '<div class="__em_row">' +
              '<label class="__em_ck"><input type="checkbox" class="__em_ap" data-for="yt"> 자동재생(음소거)</label>' +
              '<label class="__em_ck"><input type="checkbox" class="__em_lp" data-for="yt"> 반복</label>' +
            '</div>' +
            '<div class="__em_row"><input type="text" class="__em_cap" data-for="yt" placeholder="캡션(설명) — 선택"></div>' +
            '<div class="__em_row __em_hint">인쇄(PDF)·오프라인에서는 재생이 안 되며 링크로 대체 표시됩니다.</div>' +
          '</div>' +
          '<div class="__em_pane" data-pane="vid">' +
            '<div class="__em_row"><button class="__em_pick" data-for="vid">파일 선택 (MP4·WEBM)</button><span class="__em_hint __em_name" data-for="vid">선택된 파일 없음</span></div>' +
            '<div class="__em_row __em_hint">또는 주소로:</div>' +
            '<div class="__em_row"><input type="url" class="__em_url" data-for="vid" placeholder="동영상 파일 주소 (mp4/webm URL)"></div>' +
            '<div class="__em_row">' +
              '<label class="__em_ck"><input type="checkbox" class="__em_ap" data-for="vid"> 자동재생(음소거)</label>' +
              '<label class="__em_ck"><input type="checkbox" class="__em_lp" data-for="vid"> 반복</label>' +
              '<label class="__em_ck"><input type="checkbox" class="__em_ct" data-for="vid" checked> 재생 컨트롤</label>' +
            '</div>' +
            '<div class="__em_row"><input type="text" class="__em_cap" data-for="vid" placeholder="캡션(설명) — 선택"></div>' +
            '<div class="__em_row __em_hint">파일은 문서에 base64로 포함됩니다. 큰 파일은 문서가 무거워지니 짧은 클립 권장.</div>' +
          '</div>' +
        '</div>' +
        '<div class="__em_foot"><button class="ghost" data-act="cancel">취소</button><button data-act="insert">삽입</button></div>' +
        '</div>';
      doc.body.appendChild(ov);
      modal = ov;
      // designMode 문서에서 버튼 클릭이 커서를 모달로 옮기지 않도록(→ 삽입 위치 보존)
      ov.addEventListener('mousedown', function (e) {
        if (e.target.closest('button') && !e.target.closest('input')) e.preventDefault();
      });

      var picked = { img: null, vid: null };
      var tab = 'img';
      ov.querySelectorAll('.__em_tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
          tab = b.dataset.tab;
          ov.querySelectorAll('.__em_tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
          ov.querySelectorAll('.__em_pane').forEach(function (p) { p.classList.toggle('on', p.dataset.pane === tab); });
        });
      });
      ov.querySelectorAll('.__em_pick').forEach(function (b) {
        b.addEventListener('click', function () {
          var forT = b.dataset.for;
          pickFile(forT === 'img' ? 'image/*' : 'video/mp4,video/webm', function (f) {
            picked[forT] = f;
            ov.querySelector('.__em_name[data-for=' + forT + ']').textContent = f.name;
          });
        });
      });
      function close() { ov.remove(); modal = null; }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      ov.querySelector('[data-act=cancel]').addEventListener('click', close);
      ov.querySelector('[data-act=insert]').addEventListener('click', function () {
        var cap = ov.querySelector('.__em_cap[data-for=' + tab + ']').value;
        if (tab === 'img') {
          if (!picked.img) { alertUI('이미지 파일을 선택하세요.'); return; }
          imageToDataURL(picked.img, function (data) {
            if (!data) { alertUI('이미지를 읽지 못했습니다.'); return; }
            insertNode(imageFigure(data, cap, !!cap.trim()));
            close();
          });
        } else if (tab === 'yt') {
          var id = ytId(ov.querySelector('.__em_url[data-for=yt]').value);
          if (!id) { alertUI('유튜브 주소를 확인하세요.'); return; }
          insertNode(youtubeFigure(id, {
            autoplay: ov.querySelector('.__em_ap[data-for=yt]').checked,
            loop: ov.querySelector('.__em_lp[data-for=yt]').checked,
            caption: cap.trim() ? cap : (cap === '' ? null : cap)
          }));
          close();
        } else {
          var o = {
            autoplay: ov.querySelector('.__em_ap[data-for=vid]').checked,
            loop: ov.querySelector('.__em_lp[data-for=vid]').checked,
            controls: ov.querySelector('.__em_ct[data-for=vid]').checked,
            caption: cap.trim() ? cap : null
          };
          var urlV = ov.querySelector('.__em_url[data-for=vid]').value.trim();
          if (picked.vid) {
            fileToDataURL(picked.vid, function (data) {
              if (!data) { alertUI('동영상을 읽지 못했습니다.'); return; }
              insertNode(videoFigure(data, o));
              close();
            });
          } else if (urlV) {
            o.srcIsUrl = true;
            insertNode(videoFigure(urlV, o));
            close();
          } else { alertUI('동영상 파일 또는 주소를 지정하세요.'); }
        }
      });
    }

    function alertUI(msg) {
      if (opts.onToast) opts.onToast(msg); else win.alert(msg);
    }

    // ---------------------------------------------------------------- 활성/정리
    function onClickDoc(e) {
      if (suppressClick) return; // 드래그 리사이즈 직후의 click 무시
      var fig = figureOf(e.target);
      if (fig) { showSelBar(fig); }
      else if (!e.target.closest('.__eui')) { hideSelBar(); } // 편집기 UI(선택바·핸들·모달) 클릭은 유지
    }
    function enable() {
      ensureChromeStyle();
      if (!docClick) { docClick = onClickDoc; doc.addEventListener('click', docClick, true); }
      if (!selTrack) { selTrack = trackSelection; doc.addEventListener('selectionchange', selTrack); }
      win.addEventListener('scroll', reposition, true);
      win.addEventListener('resize', reposition);
    }
    function disable() {
      if (docClick) { doc.removeEventListener('click', docClick, true); docClick = null; }
      if (selTrack) { doc.removeEventListener('selectionchange', selTrack); selTrack = null; }
      win.removeEventListener('scroll', reposition, true);
      win.removeEventListener('resize', reposition);
      lastBlock = null;
      hideSelBar();
      if (selBar) { selBar.remove(); selBar = null; }
      if (handles) { handles.remove(); handles = null; }
      if (dragLab) { dragLab.remove(); dragLab = null; }
      if (modal) { modal.remove(); modal = null; }
    }

    return { enable: enable, disable: disable, openInsert: openInsert, insertImageFile: function (file, cap) { imageToDataURL(file, function (d) { if (d) insertNode(imageFigure(d, cap, !!cap)); }); } };
  }

  g.EditorMedia = { create: create };
})(typeof window !== 'undefined' ? window : this);
