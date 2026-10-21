/* コマ帖 — 画面と操作 */
(function () {
  'use strict';
  var KC = window.KC;
  var PW = KC.PW, PH = KC.PH;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var VERSION = '0.1.0';

  var S = {
    docs: [],
    doc: null,
    pageIdx: 0,
    tool: 'pen',
    multi: [],        // セリフの複数選択(id)
    multiMode: false, // タップで複数選択に足していくモード
    sel: null,        // 選択した線
    selBalloon: null,
    selPanel: null,
    pending: null,       // 置く前のセリフのid
    view: { z: 1, tx: 0, ty: 0 },
    base: { w: 0, h: 0, pageW: 0, spread: false },
    boxes: [],
    hist: [],
    fut: []
  };

  /* ================= 共通 ================= */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var ICON = {
    up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/></svg>'
  };

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }

  function fmtDate(ts) {
    var d = new Date(ts), now = new Date();
    var hm = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
    if (d.toDateString() === now.toDateString()) return '今日 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  function settings() { return KC.settings.get(); }

  /* ================= モーダル ================= */
  var modalClose = null;
  function openModal(build) {
    var card = $('#modalCard');
    card.innerHTML = '';
    var api = { close: closeModal };
    build(card, api);
    $('#modal').hidden = false;
    var f = card.querySelector('[autofocus]');
    if (f) setTimeout(function () { f.focus(); if (f.select && f.tagName === 'INPUT') f.select(); }, 30);
    return api;
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modalCard').innerHTML = '';
    if (modalClose) { var f = modalClose; modalClose = null; f(); }
  }
  $('#modal').addEventListener('pointerdown', function (e) { if (e.target.id === 'modal') closeModal(); });

  function confirmBox(title, body, okLabel, danger) {
    return new Promise(function (res) {
      var done = false;
      modalClose = function () { if (!done) res(false); };
      openModal(function (c, api) {
        c.appendChild(el('h2', { text: title }));
        if (body) c.appendChild(el('p', { text: body, style: 'margin:0;color:var(--ink-2)' }));
        c.appendChild(el('div', { class: 'modal-foot' }, [
          el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
          el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', text: okLabel || 'OK', autofocus: true,
            onclick: function () { done = true; res(true); api.close(); } })
        ]));
      });
    });
  }

  function promptBox(title, value, okLabel) {
    return new Promise(function (res) {
      var done = false;
      modalClose = function () { if (!done) res(null); };
      openModal(function (c, api) {
        var inp = el('input', { type: 'text', value: value || '', autofocus: true });
        var ok = function () { done = true; res(inp.value.trim()); api.close(); };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) ok(); });
        c.appendChild(el('h2', { text: title }));
        c.appendChild(inp);
        c.appendChild(el('div', { class: 'modal-foot' }, [
          el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
          el('button', { class: 'btn primary', type: 'button', text: okLabel || '決定', onclick: ok })
        ]));
      });
    });
  }

  function menuBox(title, items) {
    openModal(function (c, api) {
      if (title) c.appendChild(el('h2', { text: title }));
      var m = el('div', { class: 'menu' });
      items.forEach(function (it) {
        if (!it) return;
        m.appendChild(el('button', { type: 'button', class: it.danger ? 'danger' : '', text: it.label,
          onclick: function () { api.close(); it.run(); } }));
      });
      c.appendChild(m);
    });
  }

  function segmented(options, value, onChange) {
    var s = el('div', { class: 'seg' });
    options.forEach(function (o) {
      var b = el('button', { type: 'button', text: o.label, 'aria-pressed': String(o.value === value) });
      b.addEventListener('click', function () {
        $$('button', s).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      });
      s.appendChild(b);
    });
    return s;
  }

  function switchEl(checked, onChange) {
    var inp = el('input', { type: 'checkbox' });
    inp.checked = !!checked;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return el('label', { class: 'switch' }, [inp, el('span')]);
  }

  /* ================= シート ================= */
  var openSheetEl = null;
  function openSheet(id, render) {
    closeSheet();
    var sh = $('#' + id);
    if (render) render();
    sh.hidden = false; $('#scrim').hidden = false;
    openSheetEl = sh;
  }
  function closeSheet() {
    if (openSheetEl) openSheetEl.hidden = true;
    openSheetEl = null;
    $('#scrim').hidden = true;
  }
  $('#scrim').addEventListener('click', closeSheet);
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheet); });

  /* ================= 一覧 ================= */
  function loadDocs() {
    return KC.store.all().then(function (all) {
      S.docs = all.filter(function (d) { return !d.deleted; })
        .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      return S.docs;
    });
  }

  function renderHome() {
    var list = $('#docList');
    list.innerHTML = '';
    $('#emptyHome').hidden = S.docs.length > 0;
    S.docs.forEach(function (d) {
      var cv = document.createElement('canvas');
      var card = el('div', { class: 'doccard', role: 'button', tabindex: '0' }, [
        el('div', { class: 'thumb' }, [cv]),
        el('div', { class: 'stack' }),
        el('div', { class: 'meta' }, [
          el('div', { class: 't', text: d.title }),
          el('div', { class: 's', text: d.pages.length + 'ページ · ' + fmtDate(d.updatedAt) })
        ])
      ]);
      var more = el('button', { class: 'iconbtn more', type: 'button', 'aria-label': 'メニュー', html: ICON.more });
      more.addEventListener('click', function (e) { e.stopPropagation(); docMenu(d); });
      card.appendChild(more);
      card.addEventListener('click', function () { openDoc(d.id); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter') openDoc(d.id); });
      list.appendChild(card);
      requestAnimationFrame(function () {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(80, card.clientWidth || 142);
        KC.renderPageTo(cv, d.pages[0] || KC.newPage('t0'), d, w * dpr / PW, {});
      });
    });
    updateSyncChip();
  }

  function docMenu(d) {
    menuBox(d.title, [
      { label: '開く', run: function () { openDoc(d.id); } },
      { label: '名前を変える', run: function () {
        promptBox('名前を変える', d.title).then(function (t) {
          if (!t) return;
          d.title = t; d.updatedAt = Date.now();
          KC.store.saveEdit(d).then(refreshHome).then(scheduleSync);
        });
      } },
      { label: '複製する', run: function () {
        var c = cloneDoc(d);
        c.title = d.title + 'のコピー';
        KC.store.put(c).then(refreshHome).then(scheduleSync);
      } },
      { label: '削除する', danger: true, run: function () {
        confirmBox('「' + d.title + '」を削除しますか？', '同期している端末からも消えます。', '削除する', true).then(function (ok) {
          if (!ok) return;
          KC.store.remove(d).then(refreshHome).then(function () { scheduleSync(); toast('削除しました'); });
        });
      } }
    ]);
  }

  function cloneDoc(d) {
    var c = JSON.parse(JSON.stringify(d));
    c.id = KC.uid(); c.remoteId = null; c.syncedAt = 0;
    c.createdAt = c.updatedAt = Date.now();
    c.pages.forEach(renewIds);
    return c;
  }
  function renewIds(p) {
    p.id = KC.uid();
    p.panels.forEach(function (x) { x.id = KC.uid(); });
    p.balloons.forEach(function (x) { x.id = KC.uid(); });
  }

  function refreshHome() { return loadDocs().then(renderHome); }

  function newDocDialog() {
    var st = settings();
    var opt = { title: '', pages: 16, startSide: 'left', vertical: true, template: st.template || 't3' };
    openModal(function (c, api) {
      c.appendChild(el('h2', { text: '新しいネーム' }));
      var title = el('input', { type: 'text', placeholder: '例: 第3話 ネーム', autofocus: true });
      c.appendChild(el('div', { class: 'field' }, [el('label', { class: 'fl', text: '名前' }), title]));
      var pages = el('input', { type: 'number', min: '1', max: '200', value: '16', inputmode: 'numeric' });
      c.appendChild(el('div', { class: 'field' }, [el('label', { class: 'fl', text: 'ページ数(あとで増減できます)' }), pages]));
      c.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'fl', text: '1ページ目の位置' }),
        segmented([{ label: '左ページから', value: 'left' }, { label: '右ページから', value: 'right' }], 'left', function (v) { opt.startSide = v; })
      ]));
      c.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'fl', text: 'セリフの向き' }),
        segmented([{ label: '縦書き', value: true }, { label: '横書き', value: false }], true, function (v) { opt.vertical = v; })
      ]));
      c.appendChild(el('div', { class: 'field' }, [el('label', { class: 'fl', text: '最初のコマ割り' }), tplPicker(opt.template, function (id) { opt.template = id; })]));
      var create = function () {
        opt.title = title.value.trim() || '無題のネーム';
        opt.pages = parseInt(pages.value, 10) || 16;
        KC.settings.set({ template: opt.template });
        var d = KC.newDoc(opt);
        KC.store.put(d).then(function () { api.close(); openDoc(d.id); scheduleSync(); });
      };
      title.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) create(); });
      c.appendChild(el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
        el('button', { class: 'btn primary', type: 'button', text: '作る', onclick: create })
      ]));
    });
  }

  function tplPicker(value, onPick) {
    var g = el('div', { class: 'tplgrid' });
    KC.TEMPLATES.forEach(function (t) {
      var cv = document.createElement('canvas');
      var b = el('button', { class: 'tplbtn', type: 'button', 'aria-pressed': String(t.id === value) }, [cv, el('div', { text: t.name })]);
      b.addEventListener('click', function () {
        $$('.tplbtn', g).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onPick(t.id);
      });
      g.appendChild(b);
      var p = { panels: KC.panelsFromTemplate(t), strokes: [], balloons: [] };
      KC.renderPageTo(cv, p, { vertical: true }, 0.14, { guide: !p.panels.length });
    });
    return g;
  }

  /* ================= 編集画面を開く ================= */
  function openDoc(id) {
    return KC.store.get(id).then(function (d) {
      if (!d || d.deleted) { toast('ネームが見つかりません'); return; }
      S.doc = d; S.dirty = false;
      S.pageIdx = Math.min(d.lastPage || 0, d.pages.length - 1);
      S.hist = []; S.fut = [];
      S.selBalloon = S.selPanel = S.pending = null;
      $('#home').hidden = true;
      $('#editor').hidden = false;
      $('#docTitle').textContent = d.title;
      setTool(S.tool);
      layoutStage(true);
      updateUndo();
    });
  }

  function backHome() {
    flushSave().then(function () {
      S.doc = null;
      $('#editor').hidden = true;
      $('#home').hidden = false;
      closeSheet();
      refreshHome();
      if (settings().autoSync && KC.drive.hasToken()) runSync(false);
    });
  }

  function curPage() { return S.doc.pages[S.pageIdx]; }

  /* ================= ステージ(表示) ================= */
  var wrap = $('#stageWrap'), stage = $('#stage');

  // 画面に並べるページ: 行の配列(各行は画面の左から右へのページ番号、-1 は空き)
  function visibleRows() {
    var r = wrap.getBoundingClientRect();
    var spreads = KC.spreads(S.doc);
    var si = Math.max(0, spreads.findIndex(function (s) { return s.indexOf(S.pageIdx) >= 0; }));
    S.base.spread = r.width >= 820 && r.width > r.height * 1.05;
    if (settings().overview) {
      // 8ページ表示: 見開き4つ。横長の画面は2見開きずつ2段、縦長は1見開きずつ4段。右から左へ読む
      var g = Math.floor(si / 4), group = spreads.slice(g * 4, g * 4 + 4);
      var perRow = r.width > r.height * 0.9 ? 2 : 1, rows = [];
      for (var k = 0; k < group.length; k += perRow) {
        var row = [];
        group.slice(k, k + perRow).reverse().forEach(function (sp) { row.push(sp[1], sp[0]); });
        rows.push(row);
      }
      return rows;
    }
    if (!S.base.spread) return [[S.pageIdx]];
    var sp = spreads[si] || [S.pageIdx, -1];
    return [[sp[1], sp[0]]]; // 画面の左 = 左ページ
  }

  function layoutStage(resetView) {
    if (!S.doc) return;
    var r = wrap.getBoundingClientRect();
    var rows = visibleRows(), ov = !!settings().overview;
    var cols = rows.reduce(function (m, row) { return Math.max(m, row.length); }, 1);
    var spreadsPerRow = Math.ceil(cols / 2);
    var pad = r.width < 500 ? 14 : 28;
    var HG = ov ? 22 : 0, VG = ov ? 30 : 0; // 見開きどうしの間 / 段の間
    var availW = r.width - pad * 2 - HG * (spreadsPerRow - 1);
    var availH = r.height - pad * 2 - 22 - VG * (rows.length - 1);
    var pw = Math.max(60, Math.min(availW / cols, availH / rows.length * PW / PH));
    var ph = pw * PH / PW;
    S.base.pageW = pw;
    S.base.w = pw * cols + HG * (spreadsPerRow - 1);
    S.base.h = ph * rows.length + VG * (rows.length - 1);
    S.layoutKey = rows.map(function (row) { return row.join(','); }).join('/');
    stage.innerHTML = '';
    stage.classList.toggle('ov', ov);
    stage.style.width = S.base.w + 'px'; stage.style.height = S.base.h + 'px';
    S.boxes = [];
    rows.forEach(function (row) {
      var rowEl = el('div', { class: 'pagerow' });
      rowEl.style.gap = '0 ' + HG + 'px';
      rowEl.style.marginBottom = VG + 'px';
      // 見開きごとにまとめる(見開きの2ページはくっつける)
      for (var c = 0; c < row.length; c += 2) {
        var pair = el('div', { class: 'pagepair' });
        row.slice(c, c + 2).forEach(function (idx) {
          var box = el('div', { class: 'pagebox' + (idx < 0 ? ' blank' : idx !== S.pageIdx ? (ov ? ' other' : ' inactive') : ' current') });
          box.style.width = pw + 'px'; box.style.height = ph + 'px';
          var o = { idx: idx, el: box, canvas: null, overlay: null };
          if (idx >= 0) {
            o.canvas = document.createElement('canvas');
            box.appendChild(o.canvas);
            if (idx === S.pageIdx || ov) { o.overlay = document.createElement('canvas'); box.appendChild(o.overlay); }
            var left = KC.isLeftPage(S.doc, idx);
            box.appendChild(el('div', { class: 'pnum', html: (idx + 1) + (left ? ' <span class="mekuri">めくり</span>' : '') }));
          }
          pair.appendChild(box);
          S.boxes.push(o);
        });
        rowEl.appendChild(pair);
      }
      stage.appendChild(rowEl);
    });
    if (resetView || !S.view.fitted) {
      S.view.z = 1;
      S.view.tx = (r.width - S.base.w) / 2;
      S.view.ty = Math.max(pad, (r.height - S.base.h - 22) / 2);
      S.view.fitted = true;
    }
    applyView();
    sizeCanvases();
    rebuildStrokeCache();
    drawAll();
    updatePageLabel();
    renderToolOpts();
  }

  function applyView() {
    stage.style.transform = 'translate(' + S.view.tx + 'px,' + S.view.ty + 'px) scale(' + S.view.z + ')';
  }

  function pixelScale() {
    var dpr = window.devicePixelRatio || 1;
    var k = S.base.pageW * dpr * Math.min(Math.max(S.view.z, 1), 3) / PW;
    return Math.min(k, 3600 / PW);
  }

  var resTimer = null;
  function scheduleRes() {
    clearTimeout(resTimer);
    resTimer = setTimeout(function () {
      var k = pixelScale();
      var c = activeBox() && activeBox().canvas;
      if (c && Math.abs(c.width - PW * k) > 4) { sizeCanvases(); rebuildStrokeCache(); drawAll(); }
    }, 160);
  }

  function sizeCanvases() {
    var k = pixelScale();
    S.boxes.forEach(function (b) {
      if (!b.canvas) return;
      var kk = b.idx === S.pageIdx ? k : Math.min(k, 1.2);
      b.canvas.width = Math.round(PW * kk); b.canvas.height = Math.round(PH * kk);
      if (b.overlay) { b.overlay.width = b.canvas.width; b.overlay.height = b.canvas.height; }
    });
  }

  function activeBox() { return S.boxes.find(function (b) { return b.idx === S.pageIdx; }); }

  var strokeCache = document.createElement('canvas');
  function rebuildStrokeCache() {
    var b = activeBox(); if (!b) return;
    strokeCache.width = b.canvas.width; strokeCache.height = b.canvas.height;
    var ctx = strokeCache.getContext('2d');
    var k = b.canvas.width / PW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, PW, PH);
    var strokes = curPage().strokes;
    // 選択した線を動かしている途中は、動かした形で描く
    if (S.tool === 'select' && S.sel && act && act.type === 'select' && act.m) {
      var set = {}; S.sel.ids.forEach(function (i) { set[i] = 1; });
      strokes = strokes.map(function (st, i) { return set[i] ? transformStroke(st, act.m, S.sel.box) : st; });
    }
    KC.drawStrokes(ctx, strokes);
  }

  function drawAll() {
    S.boxes.forEach(function (b) {
      if (!b.canvas) return;
      if (b.idx === S.pageIdx) drawActive();
      else KC.renderPageTo(b.canvas, S.doc.pages[b.idx], S.doc, b.canvas.width / PW, {});
    });
  }

  var rafPending = false;
  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; drawActive(); });
  }

  function drawActive() {
    var b = activeBox(); if (!b) return;
    var c = b.canvas, ctx = c.getContext('2d'), k = c.width / PW, page = curPage();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    KC.drawFrameGuide(ctx);
    if (S.tool === 'panel' && S.selPanel) {
      var sp = page.panels.find(function (p) { return p.id === S.selPanel; });
      if (sp) { ctx.fillStyle = 'rgba(47,111,228,.10)'; KC.panelPath(ctx, sp); ctx.fill(); }
    }
    KC.drawPanels(ctx, page);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(strokeCache, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    KC.drawBalloons(ctx, page, S.doc.vertical, {
      exclude: function (b) { return dragAway === b.id; },
      selectedId: S.tool === 'text' ? S.selBalloon : null,
      isSelected: S.tool === 'text' && S.multi && S.multi.length > 1 ? function (b) { return S.multi.indexOf(b.id) >= 0; } : null,
      numbers: settings().showOrderNumbers && (S.tool === 'text')
    });
    if (S.tool === 'panel' && S.selPanel) drawPanelHandles(ctx, page);
    if (S.tool === 'select' && S.sel) drawSelFrame(ctx);
    placePanelDelete();
  }

  // 選んだコマの右上に出す「×」ボタン
  function placePanelDelete() {
    var b = activeBox(), btn = $('#panelDel');
    var p = S.tool === 'panel' && S.selPanel && curPage().panels.find(function (x) { return x.id === S.selPanel; });
    if (!b || !p) { if (btn) btn.hidden = true; return; }
    if (!btn || btn.parentNode !== b.el) {
      if (btn) btn.remove();
      btn = el('button', { id: 'panelDel', class: 'paneldel', type: 'button', 'aria-label': 'このコマを消す',
        html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' });
      btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) { e.stopPropagation(); deleteSelPanel(); });
      b.el.appendChild(btn);
    }
    var bb = KC.bbox(p);
    btn.hidden = false;
    btn.style.left = ((bb.x + bb.w) / PW * 100) + '%';
    btn.style.top = (bb.y / PH * 100) + '%';
    btn.style.transform = 'translate(-50%, -50%) scale(' + (1 / S.view.z) + ')';
  }

  function drawPanelHandles(ctx, page) {
    var p = page.panels.find(function (x) { return x.id === S.selPanel; });
    if (!p) return;
    var r = 9 / unitsPerPx();
    ctx.save();
    ctx.strokeStyle = '#2f6fe4'; ctx.lineWidth = 3 / unitsPerPx() * 0.6;
    KC.panelPath(ctx, p); ctx.stroke();
    var a = KC.ptsOf(p);
    for (var i = 0; i < a.length; i += 2) (function (h) {
      ctx.beginPath(); ctx.arc(h[0], h[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5 / unitsPerPx() * 0.6; ctx.stroke();
    })([a[i], a[i + 1]]);
    var n = a.length / 2, hs = 7 / unitsPerPx();
    ctx.fillStyle = '#2f6fe4';
    for (var j = 0; j < n; j++) {
      var k2 = (j + 1) % n;
      var mx = (a[j * 2] + a[k2 * 2]) / 2, my = (a[j * 2 + 1] + a[k2 * 2 + 1]) / 2;
      ctx.fillRect(mx - hs, my - hs, hs * 2, hs * 2);
    }
    ctx.restore();
  }

  // 画面の1pxがページ座標でいくつか
  function unitsPerPx() { return S.base.pageW * S.view.z / PW; }

  function clearOverlay() {
    var b = activeBox(); if (!b || !b.overlay) return;
    var ctx = b.overlay.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, b.overlay.width, b.overlay.height);
  }

  function updatePageLabel() {
    var d = S.doc, i = S.pageIdx;
    var left = KC.isLeftPage(d, i);
    $('#pageLabel').innerHTML = '<b>' + (i + 1) + '</b> / ' + d.pages.length + (left ? '<span class="mekuri">めくり</span>' : '');
    if (settings().overview) {
      var sp = KC.spreads(d), si = Math.max(0, sp.findIndex(function (s2) { return s2.indexOf(i) >= 0; }));
      var g = Math.floor(si / 4);
      $('#prevPage').disabled = g <= 0;
      $('#nextPage').disabled = (g + 1) * 4 >= sp.length;
      var pages = [].concat.apply([], sp.slice(g * 4, g * 4 + 4)).filter(function (x) { return x >= 0; });
      $('#pageLabel').innerHTML = '<b>' + (Math.min.apply(null, pages) + 1) + '–' + (Math.max.apply(null, pages) + 1) + '</b> / ' + d.pages.length;
    } else {
      $('#prevPage').disabled = i <= 0;
      $('#nextPage').disabled = i >= d.pages.length - 1;
    }
  }

  function goPage(i) {
    if (!S.doc) return;
    i = Math.max(0, Math.min(S.doc.pages.length - 1, i));
    S.selBalloon = S.selPanel = null; S.multi = []; S.sel = null;
    if (S.pending && !curPageHasBalloon(S.pending, i)) S.pending = null;
    var prevKey = S.layoutKey;
    S.pageIdx = i;
    S.doc.lastPage = i;
    var key = visibleRows().map(function (row) { return row.join(','); }).join('/');
    if (key === prevKey) layoutStageKeep(); else layoutStage(true);
  }
  // 前後へ: 8ページ表示のときは8ページ(見開き4つ)ずつ進む
  function stepPage(dir) {
    if (!settings().overview) { goPage(S.pageIdx + dir); return; }
    var sp = KC.spreads(S.doc);
    var si = Math.max(0, sp.findIndex(function (s2) { return s2.indexOf(S.pageIdx) >= 0; }));
    var g = Math.floor(si / 4) + dir, gs = sp.slice(g * 4, g * 4 + 4);
    if (g < 0 || !gs.length) return;
    var first = gs[0].filter(function (i) { return i >= 0; })[0];
    goPage(first);
  }
  function curPageHasBalloon(id, i) { return S.doc.pages[i].balloons.some(function (b) { return b.id === id; }); }

  window.addEventListener('resize', function () { if (S.doc) layoutStage(true); });

  /* ================= 履歴と保存 ================= */
  function snap() { return JSON.stringify(curPage()); }
  function commit(before) {
    var after = snap();
    if (before === after) return;
    S.hist.push({ i: S.pageIdx, b: before, a: after });
    if (S.hist.length > 80) S.hist.shift();
    S.fut = [];
    touch();
  }
  // ページをまたぐ変更は { multi: [{i, b, a}, …], i } の1つの履歴にする
  function undo() {
    var e = S.hist.pop(); if (!e) return;
    (e.multi || [e]).forEach(function (x) { S.doc.pages[x.i] = JSON.parse(x.b); });
    S.fut.push(e);
    afterHistory(e.i);
  }
  function redo() {
    var e = S.fut.pop(); if (!e) return;
    (e.multi || [e]).forEach(function (x) { S.doc.pages[x.i] = JSON.parse(x.a); });
    S.hist.push(e);
    afterHistory(e.i);
  }
  function commitMulti(entries, focusIdx) {
    S.hist.push({ multi: entries, i: focusIdx });
    if (S.hist.length > 80) S.hist.shift();
    S.fut = [];
    touch();
  }
  function afterHistory(i) {
    S.selBalloon = S.selPanel = null; S.multi = []; S.sel = null;
    if (i !== S.pageIdx) { goPage(i); }
    else { rebuildStrokeCache(); drawAll(); renderToolOpts(); }
    touch();
  }
  function updateUndo() {
    $('#undo').disabled = !S.hist.length;
    $('#redo').disabled = !S.fut.length;
  }
  function clearHistory() { S.hist = []; S.fut = []; updateUndo(); }

  var saveTimer = null, savePromise = Promise.resolve();
  function touch() {
    if (!S.doc) return;
    S.doc.updatedAt = Date.now();
    S.dirty = true;
    updateUndo();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
    scheduleSync();
  }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = null;
    // 変更がないときは書かない(ほかの画面で開いている古い内容で上書きしないため)
    if (!S.doc || !S.dirty) return savePromise;
    var d = S.doc;
    S.dirty = false;
    savePromise = savePromise.then(function () { return KC.store.saveEdit(d); }).catch(function (e) {
      toast('保存できませんでした: ' + (e && e.message || e), 4000);
    });
    return savePromise;
  }

  /* ================= 道具 ================= */
  function setTool(t) {
    S.tool = t;
    if (t !== 'text') S.multi = [];
    if (t !== 'select') S.sel = null;
    if (t !== 'text') { S.selBalloon = null; S.pending = null; }
    if (t !== 'panel') S.selPanel = null;
    $$('.tool').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.tool === t)); });
    wrap.dataset.tool = t;
    renderToolOpts();
    if (S.doc) drawActive();
  }
  $$('.tool').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });

  function renderToolOpts() {
    var o = $('#toolOpts'), st = settings();
    o.innerHTML = '';
    if (!S.doc) return;
    if (S.tool === 'pen') {
      [['#222222', '黒'], ['#3d7fd6', '青'], ['#d2462e', '赤']].forEach(function (c) {
        var b = el('button', { class: 'swatch', type: 'button', 'aria-label': c[1], 'aria-pressed': String(st.penColor === c[0]) });
        b.style.background = c[0];
        b.addEventListener('click', function () { KC.settings.set({ penColor: c[0] }); renderToolOpts(); });
        o.appendChild(b);
      });
      o.appendChild(el('span', { class: 'vsep' }));
      [2, 4, 8, 14].forEach(function (s) { o.appendChild(sizeBtn(s, st.penSize === s, function () { KC.settings.set({ penSize: s }); renderToolOpts(); })); });
      o.appendChild(el('span', { class: 'vsep' }));
      o.appendChild(el('span', { class: 'opt-label', text: '手ぶれ補正' }));
      o.appendChild(segmented([{ label: 'なし', value: 0 }, { label: '弱', value: 1 }, { label: '中', value: 2 }, { label: '強', value: 3 }],
        st.stabilizer == null ? 1 : st.stabilizer, function (v) { KC.settings.set({ stabilizer: v }); }));
    } else if (S.tool === 'eraser') {
      o.appendChild(el('span', { class: 'opt-label', text: '太さ' }));
      [12, 28, 60].forEach(function (s) { o.appendChild(sizeBtn(s, st.eraserSize === s, function () { KC.settings.set({ eraserSize: s }); renderToolOpts(); }, true)); });
    } else if (S.tool === 'panel') {
      if (S.selPanel) {
        o.appendChild(el('span', { class: 'opt-msg', text: '角の丸・辺をドラッグで形を変えられます' }));
        o.appendChild(el('button', { class: 'btn small danger', type: 'button', text: 'このコマを消す', onclick: deleteSelPanel }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '選択をやめる', onclick: function () { S.selPanel = null; drawActive(); renderToolOpts(); } }));
      } else {
        o.appendChild(el('span', { class: 'opt-msg', text: 'なぞると切る(斜めもOK)・タップで選んで消す' }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: 'コマ割りを選ぶ', onclick: chooseTemplate }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: 'コマを足す', onclick: addPanel }));
      }
    } else if (S.tool === 'select') {
      if (S.sel) {
        o.appendChild(el('span', { class: 'opt-msg', text: '中をドラッグで移動・四隅で拡大縮小・青い丸で回転' }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '左右反転', onclick: selFlip }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '複製', onclick: selCopy }));
        o.appendChild(el('button', { class: 'btn small danger', type: 'button', text: '消す', onclick: selDelete }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '選択をやめる', onclick: function () { S.sel = null; drawActive(); renderToolOpts(); } }));
      } else {
        o.appendChild(el('span', { class: 'opt-msg', text: '描いた線を指で囲むと選べます' }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: 'このページを全部選ぶ', onclick: function () {
          var n = curPage().strokes.length; if (!n) { toast('このページには線がありません'); return; }
          var ids = []; for (var i = 0; i < n; i++) ids.push(i);
          S.sel = { ids: ids, box: strokesBox(ids) }; drawActive(); renderToolOpts();
        } }));
      }
    } else if (S.tool === 'text') {
      var page = curPage();
      S.multi = S.multi || [];
      var multiBtn = el('button', { class: 'btn small' + (S.multiMode ? ' primary' : ''), type: 'button', text: S.multiMode ? '複数選択中' : '複数選択',
        onclick: function () { S.multiMode = !S.multiMode; if (!S.multiMode && S.multi.length <= 1) S.multi = []; renderToolOpts(); } });
      if (S.multi.length > 1) {
        var group = function () { var pg = curPage(); return pg.balloons.filter(function (x) { return S.multi.indexOf(x.id) >= 0; }); };
        var applyAll = function (fn) {
          var bs = group(); if (!bs.length) { S.multi = []; renderToolOpts(); return; }
          var before = snap(); bs.forEach(fn); commit(before); drawActive();
        };
        var bs0 = group();
        var kinds = bs0.map(function (x) { return x.kind; });
        var sameKind = kinds.every(function (k) { return k === kinds[0]; }) ? kinds[0] : null;
        o.appendChild(multiBtn);
        o.appendChild(el('span', { class: 'opt-label', text: bs0.length + '個選択中' }));
        o.appendChild(segmented(KIND_OPTS, sameKind, function (v) {
          applyAll(function (x) { var lv = sizeLevel(x); x.kind = v; x.fs = defaultFs(v, lv); });
          KC.settings.set({ lastKind: v });
        }));
        o.appendChild(el('span', { class: 'opt-label', text: '文字' }));
        o.appendChild(segmented([{ label: '小', value: 0 }, { label: '中', value: 1 }, { label: '大', value: 2 }], null, function (lv) {
          applyAll(function (x) { x.fs = defaultFs(x.kind, lv); });
        }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '小さく', onclick: function () { applyAll(function (x) { x.fs = Math.max(14, Math.round(x.fs / 1.15)); }); } }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '大きく', onclick: function () { applyAll(function (x) { x.fs = Math.min(96, Math.round(x.fs * 1.15)); }); } }));
        o.appendChild(el('button', { class: 'btn small danger', type: 'button', text: '消す', onclick: function () {
          var ids = S.multi.slice(), before = snap();
          curPage().balloons = curPage().balloons.filter(function (x) { return ids.indexOf(x.id) < 0; });
          S.multi = []; S.selBalloon = null; commit(before); drawActive(); renderToolOpts();
          if (!$('#scriptDrawer').hidden) renderScript();
        } }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '選択をやめる', onclick: function () { S.multi = []; S.selBalloon = null; drawActive(); renderToolOpts(); } }));
        return;
      }
      o.appendChild(multiBtn);
      if (page.balloons.some(function (x) { return x.placed; })) {
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '全部選ぶ', onclick: function () {
          S.multi = curPage().balloons.filter(function (x) { return x.placed; }).map(function (x) { return x.id; });
          syncMultiSel(); drawActive(); renderToolOpts();
        } }));
      }
      var sel = page.balloons.find(function (b) { return b.id === S.selBalloon; });
      if (sel) {
        // ボタンを押したときに、いまのページから選んでいる吹き出しを探しなおす
        // (同期や取り消しでページのデータが入れかわっても、古いデータを直さないように)
        var withSel = function (fn) {
          return function (v) {
            var cur = curPage().balloons.find(function (x) { return x.id === S.selBalloon; });
            if (!cur) { S.selBalloon = null; renderToolOpts(); drawActive(); return; }
            fn(cur, v);
          };
        };
        o.appendChild(el('button', { class: 'btn small primary', type: 'button', text: '文字を直す', onclick: withSel(function (b) { editBalloon(b, false); }) }));
        o.appendChild(segmented(KIND_OPTS, sel.kind, withSel(function (b, v) {
          if (b.kind === v) return;
          var before = snap(), lv = sizeLevel(b);
          b.kind = v; b.fs = defaultFs(v, lv);
          KC.settings.set({ lastKind: v });
          commit(before); drawActive();
        })));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '小さく', onclick: withSel(function (b) { resizeBalloon(b, -1); }) }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '大きく', onclick: withSel(function (b) { resizeBalloon(b, 1); }) }));
        o.appendChild(el('button', { class: 'btn small', type: 'button', text: '別のページへ', onclick: withSel(function (b) { askMovePage(b); }) }));
        o.appendChild(el('button', { class: 'btn small danger', type: 'button', text: '消す', onclick: withSel(function (b) { deleteBalloon(b); }) }));
      } else {
        var unplaced = page.balloons.filter(function (b) { return !b.placed; });
        if (unplaced.length) {
          o.appendChild(el('span', { class: 'opt-label', text: S.pending ? '置く場所をタップ' : '未配置' }));
          unplaced.forEach(function (b) {
            var c = el('button', { class: 'btn small unplaced', type: 'button', text: (b.text || '…').replace(/\n/g, ' '), 'aria-pressed': String(S.pending === b.id) });
            c.addEventListener('click', function () { S.pending = S.pending === b.id ? null : b.id; renderToolOpts(); });
            o.appendChild(c);
          });
        } else {
          o.appendChild(el('span', { class: 'opt-msg', text: '空いているところをタップで追加。吹き出しは2回タップで文字を直す' }));
        }
      }
    } else if (S.tool === 'hand') {
      o.appendChild(el('span', { class: 'opt-msg', text: '2本指で拡大・移動もできます' }));
      o.appendChild(el('button', { class: 'btn small', type: 'button', text: '全体を表示', onclick: function () { layoutStage(true); } }));
    }
  }

  function sizeBtn(s, on, fn, ring) {
    var d = Math.max(4, Math.min(22, ring ? s / 3 : s * 1.3));
    var b = el('button', { class: 'sizebtn', type: 'button', 'aria-pressed': String(on), 'aria-label': '太さ ' + s }, [el('i')]);
    var i = b.firstChild; i.style.width = i.style.height = d + 'px';
    if (ring) { i.style.background = 'transparent'; i.style.border = '1.5px solid var(--ink)'; }
    b.addEventListener('click', fn);
    return b;
  }

  /* ================= コマ ================= */
  function chooseTemplate() {
    var page = curPage(), pick = settings().template || 't3';
    openModal(function (c, api) {
      c.appendChild(el('h2', { text: 'このページのコマ割り' }));
      if (page.panels.length) c.appendChild(el('p', { class: 'note', text: '今のコマ枠は置きかわります。ラフとセリフはそのまま残ります。', style: 'margin:0 0 10px' }));
      c.appendChild(tplPicker(pick, function (id) { pick = id; }));
      c.appendChild(el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
        el('button', { class: 'btn primary', type: 'button', text: 'これにする', onclick: function () {
          var before = snap();
          page.panels = KC.panelsFromTemplate(KC.TEMPLATES.find(function (t) { return t.id === pick; }));
          KC.settings.set({ template: pick });
          S.selPanel = null;
          commit(before); drawActive(); renderToolOpts(); api.close();
        } })
      ]));
    });
  }
  function addPanel() {
    var before = snap(), page = curPage();
    var p = KC.rectPanel(300, 500, 400, 300);
    page.panels.push(p);
    S.selPanel = p.id;
    commit(before); drawActive(); renderToolOpts();
  }
  function deleteSelPanel() {
    var page = curPage(), before = snap();
    page.panels = page.panels.filter(function (p) { return p.id !== S.selPanel; });
    S.selPanel = null;
    commit(before); drawActive(); renderToolOpts();
  }

  /* ================= 吹き出し ================= */
  var SIZES = { speech: [20, 26, 34], shout: [22, 30, 40], flash: [20, 26, 34], mono: [20, 26, 34], sfx: [32, 44, 64] };
  var KIND_OPTS = KC.KINDS.map(function (k) { return { label: k.name, value: k.id }; });
  function sizeLevel(b) {
    var arr = SIZES[b.kind] || SIZES.speech, best = 1, bd = Infinity;
    arr.forEach(function (v, i) { if (Math.abs(v - b.fs) < bd) { bd = Math.abs(v - b.fs); best = i; } });
    return best;
  }
  function defaultFs(kind, level) { return (SIZES[kind] || SIZES.speech)[level == null ? 1 : level]; }
  function resizeBalloon(b, dir) {
    var before = snap();
    b.fs = Math.max(14, Math.min(96, Math.round(b.fs * (dir > 0 ? 1.15 : 1 / 1.15))));
    commit(before); drawActive();
  }
  function deleteBalloon(b) {
    var page = pageOfBalloon(b.id), before;
    if (!page) return;
    var pi = S.doc.pages.indexOf(page), wasIdx = S.pageIdx;
    S.pageIdx = pi; before = snap();
    page.balloons = page.balloons.filter(function (x) { return x.id !== b.id; });
    commit(before); S.pageIdx = wasIdx;
    if (S.selBalloon === b.id) S.selBalloon = null;
    drawActive(); renderToolOpts();
    if (!$('#scriptDrawer').hidden) renderScript();
  }
  function pageOfBalloon(id) {
    return S.doc.pages.find(function (p) { return p.balloons.some(function (b) { return b.id === id; }); });
  }

  // 前の吹き出しの隣(縦書きなら左、横書きなら下)に置く
  function placeNext(nb, prev) {
    var v = S.doc.vertical, pr = KC.layoutBalloon(prev, v), nr = KC.layoutBalloon(nb, v);
    if (v) { nb.x = prev.x - pr.w / 2 - nr.w / 2 - 14; nb.y = prev.y; }
    else { nb.x = prev.x; nb.y = prev.y + pr.h / 2 + nr.h / 2 + 14; }
    if (nb.x - nr.w / 2 < 10) { nb.x = prev.x; nb.y = prev.y + pr.h / 2 + nr.h / 2 + 14; }
    nb.x = KC.round(Math.max(nr.w / 2, Math.min(PW - nr.w / 2, nb.x)));
    nb.y = KC.round(Math.max(nr.h / 2, Math.min(PH - nr.h / 2, nb.y)));
  }

  // isNew: 新しい吹き出し(決定するまでページに入れない)
  function editBalloon(b, isNew, pageIdx) {
    var pi = pageIdx == null ? S.pageIdx : pageIdx;
    var kind = b.kind, level = sizeLevel(b);
    openModal(function (c, api) {
      c.appendChild(el('h2', { text: isNew ? 'セリフを入れる' : 'セリフを直す' }));
      var ta = el('textarea', { class: 'editor-text', autofocus: true, placeholder: '改行は吹き出しの中の改行に。空行をはさむと、別の吹き出しに分かれます' });
      ta.value = b.text || '';
      c.appendChild(el('div', { class: 'field' }, [ta]));
      c.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'fl', text: '種類' }),
        segmented(KIND_OPTS, kind, function (v) { kind = v; KC.settings.set({ lastKind: v }); })
      ]));
      c.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'fl', text: '文字の大きさ' }),
        segmented([{ label: '小', value: 0 }, { label: '中', value: 1 }, { label: '大', value: 2 }], level, function (v) { level = v; })
      ]));
      var ok = function () {
        // 空行(スペースだけの行も)で区切ると、別の吹き出しになる(ストーリーエディターと同じ)
        var chunks = ta.value.replace(/\r/g, '').split(/\n[ \t　]*\n/)
          .map(function (t) { return t.replace(/^\n+/, '').replace(/\s+$/, ''); })
          .filter(function (t) { return t.trim(); });
        var wasIdx = S.pageIdx; S.pageIdx = pi;
        var page = curPage();
        if (!page) { S.pageIdx = wasIdx; api.close(); return; }
        var before = snap();
        var fs = defaultFs(kind, level);
        var target, at;
        if (isNew) {
          if (!chunks.length) { S.pageIdx = wasIdx; api.close(); return; }
          target = b; target.text = chunks[0]; target.kind = kind; target.fs = fs;
          page.balloons.push(target);
          at = page.balloons.length - 1;
        } else {
          target = page.balloons.find(function (x) { return x.id === b.id; });
          if (!target) { S.pageIdx = wasIdx; api.close(); toast('この吹き出しは見つかりませんでした'); return; }
          if (!chunks.length) {
            // 文字を全部消したら、吹き出しも消す
            page.balloons = page.balloons.filter(function (x) { return x.id !== target.id; });
            if (S.selBalloon === target.id) S.selBalloon = null;
            finish();
            return;
          }
          var changedLook = level !== sizeLevel(target) || kind !== target.kind;
          target.text = chunks[0]; target.kind = kind;
          if (changedLook) target.fs = fs;
          at = page.balloons.indexOf(target);
        }
        // 2つ目からは、読む順に並ぶよう隣に置く
        var prev = target;
        chunks.slice(1).forEach(function (t) {
          var nb = KC.newBalloon({ text: t, kind: kind, fs: target.fs, placed: target.placed });
          if (target.placed) placeNext(nb, prev);
          page.balloons.splice(++at, 0, nb);
          prev = nb;
        });
        S.selBalloon = target.id;
        if (chunks.length > 1) toast(chunks.length + 'つの吹き出しに分けました');
        finish();
        function finish() {
          commit(before);
          S.pageIdx = wasIdx;
          api.close();
          drawActive(); renderToolOpts();
          if (!$('#scriptDrawer').hidden) renderScript();
        }
      };
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); }
      });
      var foot = [];
      if (!isNew) foot.push(el('button', { class: 'btn danger', type: 'button', text: '消す', onclick: function () { api.close(); deleteBalloon(b); } }));
      foot.push(el('span', { class: 'grow' }));
      foot.push(el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }));
      foot.push(el('button', { class: 'btn primary', type: 'button', text: '決定', onclick: ok }));
      c.appendChild(el('div', { class: 'modal-foot' }, foot));
    });
  }

  /* ================= 入力(指・ペン・マウス) ================= */
  var ptrs = new Map(), act = null, pinch = null, pan = null, gestureLock = false, spaceDown = false;

  function pagePoint(e, box) {
    var r = box.el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * PW, y: (e.clientY - r.top) / r.height * PH };
  }
  function boxAt(e) {
    for (var i = 0; i < S.boxes.length; i++) {
      var b = S.boxes[i];
      if (b.idx < 0) continue;
      var r = b.el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return b;
    }
    return null;
  }

  wrap.addEventListener('pointerdown', function (e) {
    if (!S.doc) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    try { wrap.setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      cancelAction();
      startPinch();
      return;
    }
    if (ptrs.size > 2 || gestureLock) return;
    var box = boxAt(e);
    if (e.button === 1 || S.tool === 'hand' || spaceDown || !box) { startPan(e); return; }
    if (box.idx !== S.pageIdx) {
      if (!settings().overview) { act = { type: 'switch', idx: box.idx, x: e.clientX, y: e.clientY }; return; }
      // 8ページ表示: 触ったページをそのまま描く対象にする
      S.pageIdx = box.idx; S.doc.lastPage = box.idx;
      S.selBalloon = S.selPanel = null; S.multi = []; S.sel = null;
      if (S.pending && !curPageHasBalloon(S.pending, box.idx)) S.pending = null;
      layoutStageKeep();
      box = activeBox();
      if (!box) return;
    }
    var pt = pagePoint(e, box);
    if (S.tool === 'pen' || S.tool === 'eraser') startStroke(pt);
    else if (S.tool === 'panel') startPanelAct(pt);
    else if (S.tool === 'text') startTextAct(pt, e);
    else if (S.tool === 'select') startSelectAct(pt);
  });

  wrap.addEventListener('pointermove', function (e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) { movePinch(); return; }
    if (pan) { movePan(e); return; }
    if (!act) return;
    var box = activeBox();
    if (act.type === 'stroke') {
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (!evs.length) evs = [e];
      evs.forEach(function (ev) { addStrokePoint(pagePoint(ev, box)); });
    } else if (act.type === 'panel') movePanelAct(pagePoint(e, box));
    else if (act.type === 'text') moveTextAct(pagePoint(e, box), e);
    else if (act.type === 'select') moveSelectAct(pagePoint(e, box));
  });

  function endPointer(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (pinch) {
      if (ptrs.size < 2) { pinch = null; gestureLock = ptrs.size > 0; scheduleRes(); }
      return;
    }
    if (ptrs.size === 0) gestureLock = false;
    if (pan) { pan = null; wrap.classList.remove('panning'); return; }
    if (!act) return;
    var a = act; act = null;
    if (e.type === 'pointercancel') { cancelActionObj(a); return; }
    if (a.type === 'switch') {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 10) { S.pageIdx = a.idx; S.doc.lastPage = a.idx; S.selBalloon = S.selPanel = null; S.multi = []; S.sel = null; layoutStageKeep(); }
      return;
    }
    var box = activeBox(), pt = pagePoint(e, box);
    if (a.type === 'stroke') endStroke(a);
    else if (a.type === 'panel') endPanelAct(a, pt);
    else if (a.type === 'select') endSelectAct(a, pt);
    else if (a.type === 'text') endTextAct(a, pt);
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);

  function layoutStageKeep() {
    // 見開きの中でページを切り替える(表示位置はそのまま)
    var keep = { z: S.view.z, tx: S.view.tx, ty: S.view.ty };
    layoutStage(false);
    S.view.z = keep.z; S.view.tx = keep.tx; S.view.ty = keep.ty; applyView();
  }

  function cancelAction() { if (act) { cancelActionObj(act); act = null; } }
  function cancelActionObj(a) {
    if (dragAway) { dragAway = null; clearOtherOverlays(); }
    if ((a.type === 'stroke' || a.type === 'panel' || a.type === 'text' || a.type === 'select') && a.before) {
      S.doc.pages[S.pageIdx] = JSON.parse(a.before);
      rebuildStrokeCache();
    }
    if (a.type === 'select') { S.sel = null; rebuildStrokeCache(); renderToolOpts(); }
    clearOverlay();
    drawActive();
  }

  // ----- 拡大・移動 -----
  function startPinch() {
    var p = Array.from(ptrs.values());
    pinch = {
      d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
      m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 },
      z0: S.view.z, tx0: S.view.tx, ty0: S.view.ty
    };
    pan = null;
  }
  function movePinch() {
    var p = Array.from(ptrs.values()); if (p.length < 2) return;
    var r = wrap.getBoundingClientRect();
    var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    var m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    var z = Math.max(0.5, Math.min(6, pinch.z0 * d / pinch.d0));
    var sx = (pinch.m0.x - r.left - pinch.tx0) / pinch.z0, sy = (pinch.m0.y - r.top - pinch.ty0) / pinch.z0;
    S.view.z = z; S.view.tx = m.x - r.left - sx * z; S.view.ty = m.y - r.top - sy * z;
    applyView();
  }
  function startPan(e) {
    pan = { x: e.clientX, y: e.clientY, tx: S.view.tx, ty: S.view.ty };
    wrap.classList.add('panning');
  }
  function movePan(e) {
    S.view.tx = pan.tx + e.clientX - pan.x; S.view.ty = pan.ty + e.clientY - pan.y;
    applyView();
  }
  wrap.addEventListener('wheel', function (e) {
    if (!S.doc) return;
    e.preventDefault();
    var r = wrap.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      var z = Math.max(0.5, Math.min(6, S.view.z * Math.exp(-e.deltaY * 0.0022)));
      var sx = (e.clientX - r.left - S.view.tx) / S.view.z, sy = (e.clientY - r.top - S.view.ty) / S.view.z;
      S.view.z = z; S.view.tx = e.clientX - r.left - sx * z; S.view.ty = e.clientY - r.top - sy * z;
      scheduleRes();
    } else {
      S.view.tx -= e.deltaX; S.view.ty -= e.deltaY;
    }
    applyView();
  }, { passive: false });

  // ----- 描く・消す -----
  function startStroke(pt) {
    var st = settings(), eraser = S.tool === 'eraser';
    act = {
      type: 'stroke', before: snap(),
      s: { c: eraser ? null : st.penColor, s: eraser ? st.eraserSize : st.penSize, e: eraser, p: [KC.round(pt.x), KC.round(pt.y)] }
    };
    if (!eraser) delete act.s.e;
    if (eraser) delete act.s.c;
    // 点を打つ
    var ctx = cacheCtx();
    KC.drawStroke(ctx, { c: act.s.c, s: act.s.s, e: eraser, p: [pt.x, pt.y] });
    requestDraw();
  }
  function cacheCtx() {
    var ctx = strokeCache.getContext('2d'), k = strokeCache.width / PW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    return ctx;
  }
  // 手ぶれ補正: 入力点をなめらかに追いかける(強いほどゆっくり追う)
  var STAB = [1, 0.5, 0.3, 0.18]; // なし・弱・中・強
  function addStrokePoint(raw) {
    var a = STAB[settings().stabilizer == null ? 1 : settings().stabilizer] || 1;
    if (act.s.e) a = 1; // 消しゴムは補正しない
    act.raw = raw;
    if (!act.sm) act.sm = { x: act.s.p[0], y: act.s.p[1] };
    act.sm.x += (raw.x - act.sm.x) * a;
    act.sm.y += (raw.y - act.sm.y) * a;
    drawStrokePoint({ x: act.sm.x, y: act.sm.y });
  }
  function drawStrokePoint(pt) {
    var p = act.s.p, lx = p[p.length - 2], ly = p[p.length - 1];
    if (Math.hypot(pt.x - lx, pt.y - ly) < 0.9 / unitsPerPx() + 0.4) return;
    p.push(KC.round(pt.x), KC.round(pt.y));
    var ctx = cacheCtx();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = act.s.s;
    if (act.s.e) { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; }
    else ctx.strokeStyle = act.s.c;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    ctx.restore();
    requestDraw();
  }
  function endStroke(a) {
    // 補正で遅れた分を、ペンを離した位置まで追いつかせる
    if (a.sm && a.raw) {
      act = a;
      var al = STAB[settings().stabilizer == null ? 1 : settings().stabilizer] || 1;
      for (var i = 0; i < 12 && Math.hypot(a.raw.x - a.sm.x, a.raw.y - a.sm.y) > 1; i++) {
        a.sm.x += (a.raw.x - a.sm.x) * Math.max(al, 0.35);
        a.sm.y += (a.raw.y - a.sm.y) * Math.max(al, 0.35);
        drawStrokePoint({ x: a.sm.x, y: a.sm.y });
      }
      act = null;
    }
    curPage().strokes.push(a.s);
    commit(a.before);
  }

  // ----- コマ -----
  // 選んだコマ: 角の丸をドラッグで形を変える / なぞる: その線で切る(斜めもOK) / タップ: 選ぶ
  function startPanelAct(pt) {
    var page = curPage(), tol = 22 / unitsPerPx();
    act = { type: 'panel', before: snap(), start: pt, last: pt, moved: false };
    if (S.selPanel) {
      var p = page.panels.find(function (x) { return x.id === S.selPanel; });
      if (p) {
        var a = KC.ptsOf(p), best = tol, vi = -1;
        for (var i = 0; i < a.length; i += 2) {
          var d = Math.hypot(pt.x - a[i], pt.y - a[i + 1]);
          if (d < best) { best = d; vi = i; }
        }
        if (vi >= 0) { act.vertex = vi; act.panel = p; }
        else {
          // 辺をつかむ: いちばん近い辺(両端の頂点をいっしょに動かす)
          var n = a.length / 2, bestE = tol, ei = -1;
          for (var j = 0; j < n; j++) {
            var k2 = (j + 1) % n;
            var d2 = segDist(pt.x, pt.y, a[j * 2], a[j * 2 + 1], a[k2 * 2], a[k2 * 2 + 1]);
            if (d2 < bestE) { bestE = d2; ei = j; }
          }
          if (ei >= 0) {
            var e2 = (ei + 1) % n;
            act.edge = [ei * 2, e2 * 2];
            act.panel = p;
            act.orig = a.slice();
          }
        }
      }
    }
  }
  function movePanelAct(pt) {
    act.last = pt;
    if (Math.hypot(pt.x - act.start.x, pt.y - act.start.y) > 6 / unitsPerPx()) act.moved = true;
    if (act.edge) {
      var ea = KC.ptsOf(act.panel), o = act.orig;
      var ddx = pt.x - act.start.x, ddy = pt.y - act.start.y;
      // 辺に垂直な方向だけ動かす(辺の傾きは保つ)
      var i0 = act.edge[0], i1 = act.edge[1];
      var ex = o[i1] - o[i0], ey = o[i1 + 1] - o[i0 + 1], el2 = Math.hypot(ex, ey) || 1;
      var nx = -ey / el2, ny = ex / el2, dn = ddx * nx + ddy * ny;
      ddx = nx * dn; ddy = ny * dn;
      act.edge.forEach(function (i) {
        ea[i] = KC.round(Math.max(0, Math.min(PW, o[i] + ddx)));
        ea[i + 1] = KC.round(Math.max(0, Math.min(PH, o[i + 1] + ddy)));
      });
      requestDraw();
      return;
    }
    if (act.vertex != null) {
      var a = KC.ptsOf(act.panel);
      a[act.vertex] = KC.round(Math.max(0, Math.min(PW, pt.x)));
      a[act.vertex + 1] = KC.round(Math.max(0, Math.min(PH, pt.y)));
      requestDraw();
      return;
    }
    // 切ったあとの形を下見する
    var ov = activeBox().overlay, ctx = ov.getContext('2d'), k = ov.width / PW;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
    if (!act.moved) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var g = splitGuess(act.start, pt);
    ctx.strokeStyle = 'rgba(47,111,228,.45)'; ctx.lineWidth = 2 / unitsPerPx() * 0.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(act.start.x, act.start.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    if (g && g.preview) {
      ctx.strokeStyle = '#2f6fe4'; ctx.lineWidth = 3 / unitsPerPx() * 0.8; ctx.setLineDash([10, 7]);
      ctx.fillStyle = 'rgba(47,111,228,.08)';
      g.preview.forEach(function (q) { KC.panelPath(ctx, q); ctx.fill(); ctx.stroke(); });
    }
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  // なぞった線から、どのコマをどう切るかを決める
  function splitGuess(a, b) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 40) return null;
    var page = curPage(), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var p = KC.panelAt(page, mid.x, mid.y) || KC.panelAt(page, a.x, a.y) || KC.panelAt(page, b.x, b.y);
    if (!p) return null;
    var line = KC.snapLine(a, b);
    var trial = { panels: [{ id: 'x', pts: KC.ptsOf(p).slice() }] };
    var ok = KC.splitPanelLine(trial, 'x', line.a, line.b);
    return { panel: p, line: line, preview: ok ? trial.panels : null };
  }
  function endPanelAct(a, pt) {
    clearOverlay();
    var page = curPage();
    if (a.vertex != null || a.edge) { if (a.moved) commit(a.before); drawActive(); return; }
    if (!a.moved) {
      var p = KC.panelAt(page, pt.x, pt.y);
      S.selPanel = p && p.id !== S.selPanel ? p.id : null;
      drawActive(); renderToolOpts();
      return;
    }
    var g = splitGuess(a.start, pt);
    if (g && KC.splitPanelLine(page, g.panel.id, g.line.a, g.line.b)) {
      S.selPanel = null;
      commit(a.before);
    } else if (g) toast('コマが小さすぎて分けられません');
    drawActive(); renderToolOpts();
  }

  // ----- 選択(描いた線を囲んで、移動・拡大縮小・回転) -----
  // S.sel = { ids: [線の番号], box: {x, y, w, h} }。動かしている間だけ act.m = {tx, ty, s, r}
  function selCenter(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }
  function xf(x, y, m, box) {
    var c = selCenter(box), dx = (x - c.x) * m.s, dy = (y - c.y) * m.s;
    var cos = Math.cos(m.r), sin = Math.sin(m.r);
    return { x: c.x + dx * cos - dy * sin + m.tx, y: c.y + dx * sin + dy * cos + m.ty };
  }
  function transformStroke(st, m, box) {
    var p = st.p, out = new Array(p.length);
    for (var i = 0; i < p.length; i += 2) { var q = xf(p[i], p[i + 1], m, box); out[i] = q.x; out[i + 1] = q.y; }
    return Object.assign({}, st, { p: out, s: Math.max(0.5, st.s * m.s) });
  }
  function strokesBox(ids) {
    var st = curPage().strokes, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach(function (i) {
      var s2 = st[i], h = s2.s / 2;
      for (var k = 0; k < s2.p.length; k += 2) {
        x0 = Math.min(x0, s2.p[k] - h); x1 = Math.max(x1, s2.p[k] + h);
        y0 = Math.min(y0, s2.p[k + 1] - h); y1 = Math.max(y1, s2.p[k + 1] + h);
      }
    });
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  function inPoly(poly, x, y) {
    var c = false, n = poly.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function selCorners(m) {
    var b = S.sel.box, I = { tx: 0, ty: 0, s: 1, r: 0 };
    m = m || I;
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(function (q) { return xf(q[0], q[1], m, b); });
  }
  function selRotHandle(m) {
    var b = S.sel.box, I = { tx: 0, ty: 0, s: 1, r: 0 }; m = m || I;
    var off = 40 / unitsPerPx() / m.s;
    return xf(b.x + b.w / 2, b.y - off, m, b);
  }
  function drawSelFrame(ctx) {
    var m = act && act.type === 'select' && act.m ? act.m : null;
    var cs = selCorners(m), rh = selRotHandle(m), u = unitsPerPx();
    var topMid = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 };
    ctx.save();
    ctx.strokeStyle = '#2f6fe4'; ctx.lineWidth = 1.6 / u; ctx.setLineDash([8 / u, 5 / u]);
    ctx.beginPath(); cs.forEach(function (c, i) { if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); }); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(topMid.x, topMid.y); ctx.lineTo(rh.x, rh.y); ctx.stroke();
    var r = 8 / u;
    cs.forEach(function (c) { ctx.fillStyle = '#fff'; ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2); ctx.strokeRect(c.x - r, c.y - r, r * 2, r * 2); });
    ctx.beginPath(); ctx.arc(rh.x, rh.y, r * 1.1, 0, Math.PI * 2); ctx.fillStyle = '#2f6fe4'; ctx.fill();
    ctx.restore();
  }
  function startSelectAct(pt) {
    var tol = 24 / unitsPerPx();
    act = { type: 'select', before: snap(), start: pt, moved: false };
    if (S.sel) {
      var rh = selRotHandle(), cs = selCorners(), c = selCenter(S.sel.box);
      if (Math.hypot(pt.x - rh.x, pt.y - rh.y) < tol) { act.mode = 'rotate'; act.a0 = Math.atan2(pt.y - c.y, pt.x - c.x); }
      else if (cs.some(function (q) { return Math.hypot(pt.x - q.x, pt.y - q.y) < tol; })) { act.mode = 'scale'; act.d0 = Math.max(1, Math.hypot(pt.x - c.x, pt.y - c.y)); }
      else if (inPoly([].concat.apply([], cs.map(function (q) { return [q.x, q.y]; })), pt.x, pt.y)) act.mode = 'move';
      if (act.mode) { act.m = { tx: 0, ty: 0, s: 1, r: 0 }; return; }
    }
    act.mode = 'lasso'; act.poly = [pt.x, pt.y];
  }
  function moveSelectAct(pt) {
    if (Math.hypot(pt.x - act.start.x, pt.y - act.start.y) > 4 / unitsPerPx()) act.moved = true;
    if (act.mode === 'lasso') {
      act.poly.push(pt.x, pt.y);
      var ov = activeBox().overlay, ctx = ov.getContext('2d'), k = ov.width / PW;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.strokeStyle = '#2f6fe4'; ctx.lineWidth = 1.6 / unitsPerPx(); ctx.setLineDash([6 / unitsPerPx(), 4 / unitsPerPx()]);
      ctx.fillStyle = 'rgba(47,111,228,.07)';
      ctx.beginPath(); ctx.moveTo(act.poly[0], act.poly[1]);
      for (var i = 2; i < act.poly.length; i += 2) ctx.lineTo(act.poly[i], act.poly[i + 1]);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      return;
    }
    var c = selCenter(S.sel.box);
    if (act.mode === 'move') { act.m.tx = pt.x - act.start.x; act.m.ty = pt.y - act.start.y; }
    else if (act.mode === 'scale') act.m.s = Math.max(0.05, Math.hypot(pt.x - c.x, pt.y - c.y) / act.d0);
    else if (act.mode === 'rotate') {
      var a = Math.atan2(pt.y - c.y, pt.x - c.x) - act.a0;
      var deg = a * 180 / Math.PI, snapTo = Math.round(deg / 45) * 45;
      if (Math.abs(deg - snapTo) < 4) a = snapTo * Math.PI / 180; // 45度ごとに少し吸いつく
      act.m.r = a;
    }
    rebuildStrokeCache(); requestDraw();
  }
  function endSelectAct(a) {
    if (a.mode === 'lasso') {
      clearOverlay();
      if (!a.moved || a.poly.length < 6) { S.sel = null; drawActive(); renderToolOpts(); return; }
      var st = curPage().strokes, ids = [];
      st.forEach(function (s2, i) {
        var n = s2.p.length / 2, inside = 0;
        for (var k = 0; k < s2.p.length; k += 2) if (inPoly(a.poly, s2.p[k], s2.p[k + 1])) inside++;
        if (inside / n >= 0.5) ids.push(i);
      });
      S.sel = ids.length ? { ids: ids, box: strokesBox(ids) } : null;
      if (!ids.length) toast('囲んだ中に線がありませんでした');
      drawActive(); renderToolOpts();
      return;
    }
    if (!a.moved) { act = null; drawActive(); return; }
    var page = curPage(), m = a.m, box = S.sel.box;
    S.sel.ids.forEach(function (i) {
      var t = transformStroke(page.strokes[i], m, box);
      t.p = t.p.map(KC.round); t.s = KC.round(t.s);
      page.strokes[i] = t;
    });
    S.sel.box = strokesBox(S.sel.ids);
    commit(a.before);
    rebuildStrokeCache(); drawActive();
  }
  function selDelete() {
    if (!S.sel) return;
    var before = snap(), set = {};
    S.sel.ids.forEach(function (i) { set[i] = 1; });
    curPage().strokes = curPage().strokes.filter(function (_, i) { return !set[i]; });
    S.sel = null; commit(before); rebuildStrokeCache(); drawActive(); renderToolOpts();
  }
  function selFlip() {
    if (!S.sel) return;
    var before = snap(), page = curPage(), c = selCenter(S.sel.box);
    S.sel.ids.forEach(function (i) {
      var st = page.strokes[i];
      st.p = st.p.map(function (v, k) { return k % 2 === 0 ? KC.round(2 * c.x - v) : v; });
    });
    commit(before); rebuildStrokeCache(); drawActive();
  }
  function selCopy() {
    if (!S.sel) return;
    var before = snap(), page = curPage(), start = page.strokes.length;
    S.sel.ids.forEach(function (i) {
      var st = JSON.parse(JSON.stringify(page.strokes[i]));
      st.p = st.p.map(function (v) { return KC.round(v + 30); });
      page.strokes.push(st);
    });
    var ids = []; for (var k = start; k < page.strokes.length; k++) ids.push(k);
    S.sel = { ids: ids, box: strokesBox(ids) };
    commit(before); rebuildStrokeCache(); drawActive();
  }

  // ----- セリフ -----
  function startTextAct(pt, e) {
    var page = curPage();
    S.multi = S.multi || [];
    if (S.pending) {
      var pb = page.balloons.find(function (b) { return b.id === S.pending; });
      if (pb) {
        var before = snap();
        pb.placed = true; pb.x = KC.round(pt.x); pb.y = KC.round(pt.y);
        S.pending = null; S.selBalloon = pb.id;
        commit(before); drawActive(); renderToolOpts();
        return;
      }
      S.pending = null;
    }
    var b = KC.balloonAt(page, pt.x, pt.y, S.doc.vertical);
    var multiKey = S.multiMode || (e && (e.shiftKey || e.ctrlKey || e.metaKey));
    if (multiKey) {
      // 複数選択: タップで選択に足す/外す。選んだものはまとめてドラッグできる
      if (!S.multi.length && S.selBalloon) S.multi = [S.selBalloon];
      if (!b) { act = { type: 'text', before: snap(), start: pt, moved: false, b: null, multiClear: true }; return; }
      var had = S.multi.indexOf(b.id) >= 0;
      if (!had) S.multi.push(b.id);
      startGroupDrag(b, pt, had);
      syncMultiSel(); drawActive(); renderToolOpts();
      return;
    }
    if (b && S.multi.length > 1 && S.multi.indexOf(b.id) >= 0) { startGroupDrag(b, pt, false); return; }
    S.multi = [];
    act = { type: 'text', before: snap(), start: pt, moved: false, b: b, wasSel: b && S.selBalloon === b.id };
    if (b) {
      act.off = { x: b.x - pt.x, y: b.y - pt.y };
      if (S.selBalloon !== b.id) { S.selBalloon = b.id; drawActive(); renderToolOpts(); }
    }
  }
  function startGroupDrag(b, pt, toggleOffOnTap) {
    var page = curPage();
    act = { type: 'text', before: snap(), start: pt, moved: false, b: b, group: page.balloons.filter(function (x) { return S.multi.indexOf(x.id) >= 0; })
      .map(function (x) { return { b: x, x: x.x, y: x.y }; }), toggleOff: toggleOffOnTap };
  }
  // 1つだけになったら普通の選択に戻す
  function syncMultiSel() {
    var page = curPage();
    S.multi = S.multi.filter(function (id) { return page.balloons.some(function (x) { return x.id === id; }); });
    if (S.multi.length === 1) { S.selBalloon = S.multi[0]; }
    else if (S.multi.length === 0) S.selBalloon = null;
    else S.selBalloon = S.multi[S.multi.length - 1];
  }
  var dragAway = null; // 別のページへ持っていく途中の吹き出しのid
  function moveTextAct(pt, e) {
    if (Math.hypot(pt.x - act.start.x, pt.y - act.start.y) > 6 / unitsPerPx()) act.moved = true;
    if (act.group) {
      if (!act.moved) return;
      var dx = pt.x - act.start.x, dy = pt.y - act.start.y;
      act.group.forEach(function (g) { g.b.x = KC.round(g.x + dx); g.b.y = KC.round(g.y + dy); });
      requestDraw();
      return;
    }
    if (act.multiClear) return;
    if (act.b && act.moved) {
      // 8ページ表示: 指が別のページの上にあれば、そのページに下見を出す
      var tb = settings().overview ? boxAt(e) : null;
      clearOtherOverlays();
      if (tb && tb.idx >= 0 && tb.idx !== S.pageIdx) {
        var tp = pagePoint(e, tb);
        var ghost = Object.assign({}, act.b, { x: KC.round(tp.x + act.off.x), y: KC.round(tp.y + act.off.y) });
        var octx = tb.overlay.getContext('2d'), k = tb.overlay.width / PW;
        octx.setTransform(k, 0, 0, k, 0, 0);
        octx.globalAlpha = 0.85;
        KC.drawBalloon(octx, ghost, S.doc.vertical, { selected: true });
        octx.globalAlpha = 1;
        act.target = { idx: tb.idx, x: ghost.x, y: ghost.y };
        if (dragAway !== act.b.id) { dragAway = act.b.id; requestDraw(); }
        return;
      }
      act.target = null;
      if (dragAway) { dragAway = null; }
      act.b.x = KC.round(pt.x + act.off.x); act.b.y = KC.round(pt.y + act.off.y);
      requestDraw();
    } else if (!act.b && act.moved) {
      // 空いているところのドラッグは画面の移動
      act = null; startPan(e);
    }
  }
  var lastTap = null;
  function clearOtherOverlays() {
    S.boxes.forEach(function (b) {
      if (!b.overlay || b.idx === S.pageIdx) return;
      var c = b.overlay.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, b.overlay.width, b.overlay.height);
    });
  }
  // 吹き出しを別のページへ移す(元のページから消して、移した先のページに入れる)
  function moveBalloonToPage(a) {
    var from = S.pageIdx, to = a.target.idx;
    var srcBefore = a.before, dstBefore = JSON.stringify(S.doc.pages[to]);
    var src = S.doc.pages[from], dst = S.doc.pages[to];
    var b = src.balloons.find(function (x) { return x.id === a.b.id; });
    if (!b) return;
    src.balloons = src.balloons.filter(function (x) { return x.id !== b.id; });
    b.x = a.target.x; b.y = a.target.y; b.placed = true;
    dst.balloons.push(b);
    commitMulti([
      { i: from, b: srcBefore, a: JSON.stringify(src) },
      { i: to, b: dstBefore, a: JSON.stringify(dst) }
    ], to);
    S.pageIdx = to; S.doc.lastPage = to; S.selBalloon = b.id;
    layoutStageKeep();
    toast((from + 1) + 'ページから' + (to + 1) + 'ページへ移しました');
  }
  // ページ番号を選んで移す(同じ位置に置く)
  function askMovePage(b) {
    var n = S.doc.pages.length, cur = S.pageIdx;
    openModal(function (c, api) {
      c.appendChild(el('h2', { text: 'どのページへ移しますか？' }));
      var inp = el('input', { type: 'number', id: 'movePageNo', min: '1', max: String(n), value: String(Math.min(n, cur + 2)), inputmode: 'numeric', autofocus: true });
      c.appendChild(el('div', { class: 'field' }, [el('label', { class: 'fl', text: '1〜' + n + 'ページ' }), inp]));
      var ok = function () {
        var to = parseInt(inp.value, 10) - 1;
        if (!(to >= 0 && to < n) || to === cur) { inp.focus(); return; }
        api.close();
        moveBalloonToPage({ before: JSON.stringify(S.doc.pages[cur]), b: b, target: { idx: to, x: b.x, y: b.y } });
        if (!settings().overview) goPage(to);
      };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
      c.appendChild(el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
        el('button', { class: 'btn primary', type: 'button', text: '移す', onclick: ok })
      ]));
    });
  }
  function endTextAct(a, pt) {
    if (a.multiClear) {
      if (!a.moved) { S.multi = []; S.selBalloon = null; drawActive(); renderToolOpts(); }
      return;
    }
    if (a.group) {
      if (a.moved) { commit(a.before); drawActive(); return; }
      if (a.toggleOff) { S.multi = S.multi.filter(function (id) { return id !== a.b.id; }); syncMultiSel(); drawActive(); renderToolOpts(); }
      return;
    }
    if (a.b) {
      var wasAway = dragAway; dragAway = null; clearOtherOverlays();
      if (a.moved && a.target) { lastTap = null; moveBalloonToPage(a); return; }
      if (wasAway) drawActive();
      if (a.moved) { commit(a.before); lastTap = null; return; }
      // 同じ吹き出しをすばやく2回タップで文字を直す(1回目は選ぶだけ)
      var now = Date.now();
      if (lastTap && lastTap.id === a.b.id && now - lastTap.t < 450) { lastTap = null; editBalloon(a.b, false); }
      else lastTap = { id: a.b.id, t: now };
      return;
    }
    lastTap = null;
    if (a.moved) return;
    if (S.selBalloon) { S.selBalloon = null; drawActive(); renderToolOpts(); }
    var lk = settings().lastKind || 'speech';
    var nb = KC.newBalloon({ x: KC.round(pt.x), y: KC.round(pt.y), kind: lk, fs: defaultFs(lk, 1) });
    editBalloon(nb, true);
  }

  /* ================= キーボード(PC) ================= */
  document.addEventListener('keydown', function (e) {
    if (!S.doc || !$('#modal').hidden) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.key === ' ') { spaceDown = true; wrap.dataset.tool = 'hand'; e.preventDefault(); return; }
    var map = { p: 'pen', b: 'pen', e: 'eraser', k: 'panel', t: 'text', h: 'hand', v: 'select', s: 'select' };
    if (map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); return; }
    if (e.key === 'ArrowLeft' || e.key === 'PageDown') { stepPage(1); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageUp') { stepPage(-1); return; }
    if (e.key === 'Escape') { S.selBalloon = S.selPanel = S.pending = null; S.multi = []; S.sel = null; rebuildStrokeCache(); drawActive(); renderToolOpts(); closeSheet(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (S.tool === 'select' && S.sel) selDelete();
      else if (S.tool === 'text' && S.multi && S.multi.length > 1) { var ids = S.multi.slice(), bf = snap(); curPage().balloons = curPage().balloons.filter(function (x) { return ids.indexOf(x.id) < 0; }); S.multi = []; S.selBalloon = null; commit(bf); drawActive(); renderToolOpts(); }
      else if (S.tool === 'text' && S.selBalloon) { var b = curPage().balloons.find(function (x) { return x.id === S.selBalloon; }); if (b) deleteBalloon(b); }
      else if (S.tool === 'panel' && S.selPanel) deleteSelPanel();
      return;
    }
    if (e.key === 'Enter' && S.tool === 'text' && S.selBalloon) {
      var sb = curPage().balloons.find(function (x) { return x.id === S.selBalloon; });
      if (sb) { e.preventDefault(); editBalloon(sb, false); }
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === ' ') { spaceDown = false; wrap.dataset.tool = S.tool; }
  });

  /* ================= ページ一覧 ================= */
  function renderPages() {
    var g = $('#pageGrid'), d = S.doc;
    g.innerHTML = '';
    $('#pagesNote').textContent = d.pages.length + 'ページ・赤字はめくり(左ページ)';
    d.pages.forEach(function (p, i) {
      var cv = document.createElement('canvas');
      var left = KC.isLeftPage(d, i);
      var t = el('div', { class: 'pthumb' + (i === S.pageIdx ? ' active' : ''), role: 'button', tabindex: '0' }, [
        cv, el('div', { class: 'n', html: (i + 1) + (left ? ' <span class="mekuri">めくり</span>' : '') })
      ]);
      var m = el('button', { class: 'iconbtn pm', type: 'button', 'aria-label': 'ページのメニュー', html: ICON.more });
      m.addEventListener('click', function (e) { e.stopPropagation(); pageMenu(i); });
      t.appendChild(m);
      t.addEventListener('click', function () { closeSheet(); goPage(i); });
      g.appendChild(t);
      requestAnimationFrame(function () { KC.renderPageTo(cv, p, d, 0.2, {}); });
    });
    var add = el('button', { class: 'addpage', type: 'button', text: '＋ ページを足す' });
    add.addEventListener('click', function () { insertPage(d.pages.length); renderPages(); });
    g.appendChild(add);
  }

  function insertPage(at, copyFrom) {
    var p;
    if (copyFrom) { p = JSON.parse(JSON.stringify(copyFrom)); renewIds(p); }
    else p = KC.newPage(settings().template || 't3');
    S.doc.pages.splice(at, 0, p);
    clearHistory(); touch();
    goPage(at);
  }

  function pageMenu(i) {
    var d = S.doc;
    menuBox((i + 1) + 'ページ', [
      { label: 'この後ろにページを足す', run: function () { insertPage(i + 1); renderPages(); } },
      { label: 'この前にページを足す', run: function () { insertPage(i); renderPages(); } },
      { label: 'このページを複製', run: function () { insertPage(i + 1, d.pages[i]); renderPages(); } },
      i > 0 ? { label: '1つ前へ移す', run: function () { movePage(i, i - 1); } } : null,
      i < d.pages.length - 1 ? { label: '1つ後ろへ移す', run: function () { movePage(i, i + 1); } } : null,
      d.pages.length > 1 ? { label: 'このページを削除', danger: true, run: function () {
        confirmBox((i + 1) + 'ページを削除しますか？', 'ラフとセリフも消えます。', '削除する', true).then(function (ok) {
          if (!ok) return;
          d.pages.splice(i, 1);
          clearHistory(); touch();
          goPage(Math.min(S.pageIdx, d.pages.length - 1));
          renderPages();
        });
      } } : null
    ]);
  }
  function movePage(i, j) {
    var d = S.doc, p = d.pages.splice(i, 1)[0];
    d.pages.splice(j, 0, p);
    clearHistory(); touch();
    goPage(j); renderPages();
  }

  /* ================= セリフ一覧 ================= */
  function renderScript() {
    var body = $('#scriptBody'), d = S.doc, st = settings();
    var scroll = body.scrollTop;
    body.innerHTML = '';
    d.pages.forEach(function (p, i) {
      var list = KC.orderedBalloons(p, d.vertical);
      var sec = el('section', { class: 'sp' + (i === S.pageIdx ? ' current' : ''), 'data-page': String(i) });
      var left = KC.isLeftPage(d, i);
      sec.appendChild(el('div', { class: 'sp-head' }, [
        el('h3', { html: (i + 1) + 'ページ' + (left ? '<span class="mekuri">めくり</span>' : '') }),
        p.manualOrder ? el('button', { class: 'btn small', type: 'button', text: '順番を自動に戻す', onclick: function () {
          withPage(i, function (pg) { pg.manualOrder = false; }); renderScript();
        } }) : el('span', { class: 'sp-order', text: '自動の順番' }),
        el('button', { class: 'btn small', type: 'button', text: 'コピー', onclick: function () {
          var t = KC.storyText(d, st, i);
          if (!t) { toast('このページに書き出すセリフがありません'); return; }
          KC.copyText(t).then(function (ok) { toast(ok ? (i + 1) + 'ページのセリフをコピーしました' : 'コピーできませんでした'); });
        } })
      ]));
      list.forEach(function (b, j) {
        var kindLabel = b.kind && b.kind !== 'speech' ? KC.kindName(b.kind) : null;
        var txt = el('div', { class: 'txt' + ((b.text || '').trim() ? '' : ' emptytxt') });
        if (!b.placed) txt.appendChild(el('span', { class: 'kind unp', text: '未配置' }));
        if (kindLabel) txt.appendChild(el('span', { class: 'kind ' + b.kind, text: kindLabel }));
        txt.appendChild(document.createTextNode((b.text || '').trim() ? b.text : '(空)'));
        txt.addEventListener('click', function () { editBalloon(b, false, i); });
        var ctl = el('div', { class: 'ctl' });
        if (!b.placed) {
          var pin = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'ページに置く', html: ICON.pin });
          pin.addEventListener('click', function () {
            closeSheet();
            if (S.pageIdx !== i) goPage(i);
            setTool('text'); S.pending = b.id; renderToolOpts();
            toast('置きたい場所をタップしてください');
          });
          ctl.appendChild(pin);
        }
        var up = el('button', { class: 'iconbtn', type: 'button', 'aria-label': '前へ', html: ICON.up, disabled: j === 0 });
        var dn = el('button', { class: 'iconbtn', type: 'button', 'aria-label': '後ろへ', html: ICON.down, disabled: j === list.length - 1 });
        up.addEventListener('click', function () { reorder(i, list, j, j - 1); });
        dn.addEventListener('click', function () { reorder(i, list, j, j + 1); });
        ctl.appendChild(up); ctl.appendChild(dn);
        sec.appendChild(el('div', { class: 'line' }, [el('div', { class: 'no', text: String(j + 1) }), txt, ctl]));
      });
      // 先に打つ
      var ta = el('textarea', { rows: '1', placeholder: 'セリフを先に打つ(空行で区切ると複数)' });
      ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight + 2) + 'px'; });
      var add = el('button', { class: 'btn small', type: 'button', text: '追加' });
      add.addEventListener('click', function () {
        var chunks = ta.value.replace(/\r/g, '').split(/\n\s*\n/).map(function (s) { return s.replace(/^\n+|\s+$/g, ''); }).filter(Boolean);
        if (!chunks.length) return;
        withPage(i, function (pg) {
          chunks.forEach(function (t) { pg.balloons.push(KC.newBalloon({ text: t, placed: false })); });
        });
        renderScript();
        toast(chunks.length + '件を未配置で追加しました');
      });
      sec.appendChild(el('div', { class: 'quickadd' }, [ta, add]));
      body.appendChild(sec);
    });
    body.scrollTop = scroll;
  }

  function withPage(i, fn) {
    var was = S.pageIdx; S.pageIdx = i;
    var before = snap();
    fn(curPage());
    commit(before);
    S.pageIdx = was;
    if (i === S.pageIdx) { drawActive(); renderToolOpts(); }
  }

  function reorder(i, list, from, to) {
    withPage(i, function (pg) {
      var arr = list.slice(), x = arr.splice(from, 1)[0];
      arr.splice(to, 0, x);
      pg.balloons = arr;
      pg.manualOrder = true;
    });
    renderScript();
  }

  function openScript() {
    openSheet('scriptDrawer', renderScript);
    var cur = $('#scriptBody .sp.current');
    if (cur) cur.scrollIntoView({ block: 'start' });
  }

  $('#copyAll').addEventListener('click', function () {
    var t = KC.storyText(S.doc, settings());
    if (!t) { toast('書き出すセリフがありません'); return; }
    KC.copyText(t).then(function (ok) { toast(ok ? '全部のセリフをコピーしました' : 'コピーできませんでした'); });
  });

  /* ================= 書き出し ================= */
  // 書き出す前にファイル名を決める(拡張子はあとから付ける)
  // label: 入力欄の右に出す説明(ページごとのときは「p01.png など」)
  function askName(defBase, ext, label, note) {
    return new Promise(function (res) {
      var done = false;
      modalClose = function () { if (!done) res(null); };
      openModal(function (c, api) {
        var inp = el('input', { type: 'text', id: 'exportName', value: defBase, autofocus: true, spellcheck: 'false' });
        var ok = function () {
          var raw = inp.value.trim();
          if (raw.toLowerCase().slice(-ext.length) === ext.toLowerCase()) raw = raw.slice(0, -ext.length); // 拡張子を打っても二重にしない
          if (label) raw = raw.replace(/p\d+$/i, ''); // 「てすとp01」と打っても番号を二重にしない
          if (!raw.trim()) { inp.focus(); return; }
          var v = KC.safeName(raw.trim());
          done = true; res(v + ext); api.close();
        };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) ok(); });
        c.appendChild(el('h2', { text: 'ファイル名' }));
        c.appendChild(el('div', { class: 'namefield' }, [inp, el('span', { class: 'ext', text: label || ext })]));
        if (note) c.appendChild(el('p', { class: 'note', text: note }));
        c.appendChild(el('p', { class: 'note', text: '\\ / : * ? " < > | は使えないので、_ に置きかえます。' }));
        c.appendChild(el('div', { class: 'modal-foot' }, [
          el('button', { class: 'btn', type: 'button', text: 'やめる', onclick: function () { api.close(); } }),
          el('button', { class: 'btn primary', type: 'button', text: '書き出す', onclick: ok })
        ]));
      });
    });
  }
  // 名前を聞いてから作って保存する。btn があれば作っている間は押せなくする
  function exportAs(btn, defBase, ext, make) {
    askName(defBase, ext).then(function (name) {
      if (!name) return;
      var old = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '作っています…'; }
      setTimeout(function () {
        Promise.resolve().then(function () { return make(btn); })
          .then(function (blob) { return KC.saveBlob(blob, name); })
          .catch(function (e) { toast('書き出せませんでした: ' + (e && e.message || e), 4000); })
          .then(function () { if (btn) { btn.disabled = false; btn.textContent = old; } });
      }, 30);
    });
  }
  // ページごとに1ファイルずつ保存する(名前 + p01 …)
  function exportPages(btn, ext, makeAt) {
    var d = S.doc, n = d.pages.length;
    var ex = KC.pageFileName('', 0, n, ext) + (n > 1 ? ' 〜 ' + KC.pageFileName('', n - 1, n, ext) : '');
    askName(KC.safeName(d.title), ext, ex, 'ページ番号は自動で付きます。例: ' + KC.pageFileName(KC.safeName(d.title), 0, n, ext)).then(function (name) {
      if (!name) return;
      var base = name.slice(0, -ext.length);
      var names = d.pages.map(function (_, i) { return KC.pageFileName(base, i, n, ext); });
      var old = btn.textContent;
      btn.disabled = true; btn.textContent = '書き出しています…';
      KC.saveMany(names, function (i) { return makeAt(d, i); }, function (i) { btn.textContent = '書き出しています… ' + (i + 1) + '/' + n; })
        .then(function (cnt) { if (cnt) toast(cnt + 'ページ分を書き出しました'); })
        .catch(function (e) { toast('書き出せませんでした: ' + (e && e.message || e), 4000); })
        .then(function () { btn.disabled = false; btn.textContent = old; });
    });
  }
  function textBlob(t) { return new Blob(['\ufeff' + KC.toCRLF(t)], { type: 'text/plain;charset=utf-8' }); }

  function renderExport() {
    var b = $('#exportBody'), d = S.doc, st = settings();
    b.innerHTML = '';
    var pre = el('pre', { class: 'preview' });
    function refreshPreview() {
      var t = KC.storyText(d, settings());
      pre.textContent = t ? t.split('\n').slice(0, 14).join('\n') + (t.split('\n').length > 14 ? '\n…' : '') : '(書き出すセリフがありません)';
    }
    var g1 = el('div', { class: 'group' }, [
      el('h3', { text: 'クリスタのストーリーエディター用' }),
      el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'lbl' }, ['台詞の区切り', el('span', { class: 'sub', text: 'クリスタの環境設定と同じ改行の数にします' })]),
          segmented([{ label: '2改行', value: 2 }, { label: '3改行', value: 3 }], st.newlines, function (v) { KC.settings.set({ newlines: v }); refreshPreview(); })
        ]),
        el('div', { class: 'row' }, [el('span', { class: 'lbl', text: 'モノローグを含める' }), switchEl(st.includeMono, function (v) { KC.settings.set({ includeMono: v }); refreshPreview(); })]),
        el('div', { class: 'row' }, [el('span', { class: 'lbl', text: '描き文字を含める' }), switchEl(st.includeSfx, function (v) { KC.settings.set({ includeSfx: v }); refreshPreview(); })])
      ]),
      pre,
      el('div', { class: 'actions', style: 'grid-template-columns:1fr 1fr;margin-top:10px' }, [
        el('button', { class: 'btn primary', type: 'button', text: '全部コピー', onclick: function () {
          var t = KC.storyText(d, settings());
          if (!t) { toast('書き出すセリフがありません'); return; }
          KC.copyText(t).then(function (ok) { toast(ok ? 'コピーしました。ストーリーエディターに貼れます' : 'コピーできませんでした'); });
        } }),
        el('button', { class: 'btn', type: 'button', text: '.txtで保存', onclick: function (e) {
          var t = KC.storyText(d, settings());
          if (!t) { toast('書き出すセリフがありません'); return; }
          exportAs(null, KC.safeName(d.title) + '_セリフ', '.txt', function () { return textBlob(t); });
        } })
      ]),
      el('p', { class: 'note', text: 'まとめて貼ると、クリスタでは全部が1ページ目に入ります。ページごとに貼るときは、セリフ一覧の各ページの「コピー」を使ってください。' })
    ]);
    var pdfBtn = el('button', { class: 'btn', type: 'button', text: 'PDF(全ページを1つのファイルに)' });
    pdfBtn.addEventListener('click', function () {
      exportAs(pdfBtn, KC.safeName(d.title), '.pdf', function (btn) {
        return KC.exportPDF(d, function (i, n) { btn.textContent = '作っています… ' + (i + 1) + '/' + n; });
      });
    });
    var pngBtn = el('button', { class: 'btn', type: 'button', text: 'PNG(ページごと)' });
    pngBtn.addEventListener('click', function () { exportPages(pngBtn, '.png', KC.pagePNGBlob); });
    var psdBtn = el('button', { class: 'btn', type: 'button', text: 'PSD(ページごと・レイヤー分け)' });
    psdBtn.addEventListener('click', function () { exportPages(psdBtn, '.psd', KC.pagePSDBlob); });
    var g2 = el('div', { class: 'group' }, [
      el('h3', { text: '画像' }),
      el('div', { class: 'actions' }, [pdfBtn, pngBtn, psdBtn]),
      el('p', { class: 'note', text: 'PDFは全ページを1つのファイルにまとめます(見開きは右綴じ)。PNGとPSDは1ページずつのファイルで、パソコンでは保存するフォルダを選びます。PSDは「用紙・コマ枠・ラフ・セリフ」の4レイヤーです。大きさは仕上がりB5(1500×2118px)で、クリスタで開くとそのまま下描きの下敷きにできます。' })
    ]);
    var g3 = el('div', { class: 'group' }, [
      el('h3', { text: 'そのほか' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn', type: 'button', text: '見直し用の台本(.txt)', onclick: function () {
          exportAs(null, KC.safeName(d.title) + '_台本', '.txt', function () { return textBlob(KC.scriptText(d, settings())); });
        } }),
        el('button', { class: 'btn', type: 'button', text: 'バックアップ(.komacho.json)', onclick: function () {
          exportAs(null, KC.safeName(d.title), '.komacho.json', function () {
            var c = Object.assign({}, d); delete c.remoteId; delete c.syncedAt;
            return new Blob([JSON.stringify({ app: 'komacho', version: 1, doc: c })], { type: 'application/json' });
          });
        } })
      ])
    ]);
    b.appendChild(g1); b.appendChild(g2); b.appendChild(g3);
    refreshPreview();
  }

  /* ================= ネームの設定 ================= */
  function docSettingsMenu() {
    var d = S.doc;
    menuBox(null, [
      { label: '名前を変える', run: renameDoc },
      { label: 'セリフの向き: ' + (d.vertical ? '縦書き → 横書きにする' : '横書き → 縦書きにする'), run: function () {
        d.vertical = !d.vertical; touch(); drawAll(); toast(d.vertical ? '縦書きにしました' : '横書きにしました');
      } },
      { label: '1ページ目の位置: ' + (d.startSide === 'right' ? '右 → 左にする' : '左 → 右にする'), run: function () {
        d.startSide = d.startSide === 'right' ? 'left' : 'right'; touch(); layoutStage(true);
      } },
      { label: 'このページのコマ割りを選ぶ', run: function () { setTool('panel'); chooseTemplate(); } },
      { label: (settings().showOrderNumbers ? '読む順の番号を隠す' : '読む順の番号を出す'), run: function () {
        KC.settings.set({ showOrderNumbers: !settings().showOrderNumbers }); drawActive();
      } },
      { label: settings().overview ? '1ページ表示にする' : '8ページ表示にする', run: toggleOverview },
      { label: '全体を表示', run: function () { layoutStage(true); } }
    ]);
  }
  function toggleOverview() {
    KC.settings.set({ overview: !settings().overview });
    $('#toggleOverview').setAttribute('aria-pressed', String(!!settings().overview));
    layoutStage(true);
    toast(settings().overview ? '8ページ表示にしました。どのページにも直接描けます' : '1ページ表示にしました');
  }
  function renameDoc() {
    promptBox('名前を変える', S.doc.title).then(function (t) {
      if (!t) return;
      S.doc.title = t; $('#docTitle').textContent = t; touch();
    });
  }

  /* ================= 同期 ================= */
  var syncTimer = null;
  function scheduleSync() {
    clearTimeout(syncTimer);
    if (!settings().autoSync || !KC.drive.available() || !KC.drive.hasToken()) return;
    syncTimer = setTimeout(function () { runSync(false); }, 6000);
  }

  function runSync(interactive) {
    if (!KC.drive.available()) {
      if (interactive) toast(KC.drive.whyUnavailable(), 4000);
      return Promise.resolve();
    }
    return flushSave().then(function () {
      return KC.drive.sync({
        interactive: interactive,
        onPulled: function (d, expected) {
          // 同期中に手元で編集していたら、画面の内容は置きかえない(手元の編集が次の同期で勝つ)
          if (S.doc && d.id === S.doc.id && (S.doc.updatedAt || 0) <= (expected || 0)) {
            if (d.deleted) { toast('このネームはほかの端末で削除されました', 3500); S.doc = null; $('#editor').hidden = true; $('#home').hidden = false; return; }
            S.doc = d; S.dirty = false; clearHistory();
            S.pageIdx = Math.min(S.pageIdx, d.pages.length - 1);
            $('#docTitle').textContent = d.title;
            layoutStage(false);
            toast('ほかの端末の変更を読み込みました');
          }
        }
      });
    }).then(function () {
      if (!S.doc) refreshHome();
      if (interactive) toast('同期しました');
    }, function (e) {
      if (interactive) toast('同期できませんでした: ' + (e && e.message || e), 4500);
    });
  }

  function syncNow() {
    var st = KC.drive.state;
    if (!KC.drive.available()) { toast(KC.drive.whyUnavailable(), 4500); return; }
    if (!st.signedIn) {
      KC.drive.signIn().then(function () { return runSync(true); }, function (e) { toast(e.message || 'ログインできませんでした', 4000); });
      return;
    }
    runSync(true);
  }

  function updateSyncChip() {
    var c = $('#syncChip'), st = KC.drive.state, label = $('.label', c);
    c.classList.remove('on', 'busy', 'err');
    if (!KC.drive.available()) { label.textContent = '同期なし'; return; }
    if (st.busy) { c.classList.add('busy'); label.textContent = '同期中'; return; }
    if (st.error) { c.classList.add('err'); label.textContent = '同期エラー'; return; }
    if (!st.signedIn) { label.textContent = 'ログインして同期'; return; }
    if (!KC.drive.hasToken()) { label.textContent = 'タップで同期'; return; }
    c.classList.add('on');
    label.textContent = st.lastSync ? '同期 ' + fmtDate(st.lastSync).replace('今日 ', '') : '同期オン';
  }
  KC.drive.onChange(function () {
    updateSyncChip();
    if (!$('#settingsSheet').hidden) renderSettings();
  });

  /* ================= 設定 ================= */
  function renderSettings() {
    var b = $('#settingsBody'), st = settings(), ds = KC.drive.state;
    b.innerHTML = '';
    var syncCard = el('div', { class: 'card' });
    if (!KC.drive.available()) {
      syncCard.appendChild(el('div', { class: 'row' }, [el('span', { class: 'lbl' }, ['同期は使えません', el('span', { class: 'sub', text: KC.drive.whyUnavailable() })])]));
    } else if (KC.drive.noLogin) {
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl' }, ['同期しています',
          el('span', { class: 'sub', text: (ds.lastSync ? '最後の同期: ' + fmtDate(ds.lastSync) + '。' : '') + 'claude.aiに同じアカウントでログインした端末どうしで同期します' })])
      ]));
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl' }, ['自動で同期', el('span', { class: 'sub', text: '編集のあと数秒で同期し、ほかの端末の変更もすぐ取りこみます' })]),
        switchEl(st.autoSync, function (v) { KC.settings.set({ autoSync: v }); })
      ]));
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl', text: '今すぐ同期' }),
        el('button', { class: 'btn small', type: 'button', text: ds.busy ? '同期中…' : '同期する', disabled: ds.busy, onclick: syncNow })
      ]));
      if (ds.error) syncCard.appendChild(el('p', { class: 'err', text: ds.error }));
    } else {
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl' }, [ds.signedIn ? 'ログインしています' : 'ログインしていません',
          el('span', { class: 'sub', text: ds.email ? ds.email : (ds.lastSync ? '最後の同期: ' + fmtDate(ds.lastSync) : 'ドライブの「アプリ専用の場所」に保存します') })]),
        ds.signedIn ? el('button', { class: 'btn small', type: 'button', text: 'ログアウト', onclick: function () { KC.drive.signOut().then(renderSettings); } })
          : el('button', { class: 'btn small primary', type: 'button', text: 'Googleでログイン', onclick: syncNow })
      ]));
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl' }, ['自動で同期', el('span', { class: 'sub', text: '編集のあと数秒で同期します' })]),
        switchEl(st.autoSync, function (v) { KC.settings.set({ autoSync: v }); })
      ]));
      syncCard.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'lbl', text: '今すぐ同期' }),
        el('button', { class: 'btn small', type: 'button', text: ds.busy ? '同期中…' : '同期する', disabled: ds.busy, onclick: syncNow })
      ]));
      if (ds.error) syncCard.appendChild(el('p', { class: 'err', text: ds.error }));
    }
    b.appendChild(el('div', { class: 'group' }, [el('h3', { text: KC.drive.label || 'Googleドライブ同期' }), syncCard]));

    var theme = (function () { try { return localStorage.getItem('komacho-theme') || 'auto'; } catch (e) { return 'auto'; } })();
    b.appendChild(el('div', { class: 'group' }, [el('h3', { text: '表示' }), el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [el('span', { class: 'lbl', text: '画面の色' }), segmented([
        { label: '自動', value: 'auto' }, { label: '明るい', value: 'light' }, { label: '暗い', value: 'dark' }
      ], theme, function (v) { try { localStorage.setItem('komacho-theme', v); } catch (e) { /* なし */ } applyTheme(); })]),
      el('div', { class: 'row' }, [el('span', { class: 'lbl' }, ['読む順の番号', el('span', { class: 'sub', text: 'セリフの道具のとき、吹き出しに番号を出します' })]),
        switchEl(st.showOrderNumbers, function (v) { KC.settings.set({ showOrderNumbers: v }); })])
    ])]));

    var copies = S.docs.filter(function (d) { return /\(競合コピー\)/.test(d.title); });
    b.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'データ' }), el('div', { class: 'actions' }, [
      copies.length ? el('button', { class: 'btn danger', type: 'button', text: '競合コピーをまとめて削除(' + copies.length + '冊)', onclick: function () {
        confirmBox('競合コピー ' + copies.length + '冊を削除しますか？', '名前に「(競合コピー)」が付いたネームだけを消します。同期している端末からも消えます。', '削除する', true).then(function (ok) {
          if (!ok) return;
          copies.reduce(function (p, d) { return p.then(function () { return KC.store.remove(d); }); }, Promise.resolve())
            .then(refreshHome).then(function () { renderSettings(); scheduleSync(); if (KC.drive.hasToken()) runSync(false); toast(copies.length + '冊を削除しました'); });
        });
      } }) : null,
      el('button', { class: 'btn', type: 'button', text: 'バックアップを読み込む', onclick: function () { $('#importFile').click(); } })
    ])]));
    b.appendChild(el('p', { class: 'note', text: 'コマ帖 ' + VERSION + (window.komachoNative ? '(PC版)' : KC.drive.noLogin ? '(ブラウザ版)' : '(Web版)') }));
  }

  function applyTheme() {
    var t = 'auto';
    try { t = localStorage.getItem('komacho-theme') || 'auto'; } catch (e) { /* なし */ }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var j = JSON.parse(txt), d = j && j.doc;
      if (!d || !Array.isArray(d.pages)) throw new Error('コマ帖のバックアップではありません');
      var c = cloneDoc(d);
      return KC.store.put(c).then(function () { closeSheet(); refreshHome(); scheduleSync(); toast('「' + c.title + '」を読み込みました'); });
    }).catch(function (err) { toast('読み込めませんでした: ' + err.message, 4000); });
  });

  /* ================= ボタン ================= */
  $('#newDoc').addEventListener('click', newDocDialog);
  $('#backHome').addEventListener('click', backHome);
  $('#docTitle').addEventListener('click', renameDoc);
  $('#pageLabel').addEventListener('click', function () { openSheet('pagesDrawer', renderPages); });
  $('#openScript').addEventListener('click', openScript);
  $('#openExport').addEventListener('click', function () { openSheet('exportSheet', renderExport); });
  $('#openDocMenu').addEventListener('click', docSettingsMenu);
  $('#toggleOverview').addEventListener('click', toggleOverview);
  $('#toggleOverview').setAttribute('aria-pressed', String(!!settings().overview));
  $('#openSettings').addEventListener('click', function () { openSheet('settingsSheet', renderSettings); });
  $('#syncChip').addEventListener('click', syncNow);
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#prevPage').addEventListener('click', function () { stepPage(-1); });
  $('#nextPage').addEventListener('click', function () { stepPage(1); });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushSave();
      if (settings().autoSync && KC.drive.hasToken()) runSync(false);
    }
  });
  window.addEventListener('beforeunload', function () { flushSave(); });

  /* ================= 起動 ================= */
  applyTheme();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.komachoNative && !KC.drive.noLogin) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* オフライン対応なしで続ける */ });
  }
  refreshHome();
  KC.drive.init().then(function () {
    updateSyncChip();
    if (settings().autoSync && KC.drive.hasToken()) runSync(false);
  });
  // ほかの端末で変更されたら取りこむ(対応している同期先のみ)
  var remoteTimer = null;
  if (KC.drive.onRemote) KC.drive.onRemote(function () {
    if (!settings().autoSync) return;
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(function () { runSync(false); }, 1200);
  });

  // テスト・デバッグ用
  KC._app = { S: S, openDoc: openDoc, goPage: goPage, setTool: setTool, refreshHome: refreshHome, flushSave: flushSave, undo: undo };
})();
