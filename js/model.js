/* コマ帖 — ページの形、コマ割り、吹き出し、描画(画面と書き出しで共通) */
(function () {
  'use strict';
  var KC = (window.KC = window.KC || {});

  // 1ページ = 仕上がりB5の比率(182:257)。座標はこの単位で保存する
  var PW = 1000, PH = 1412;
  var FRAME = { x: 80, y: 90, w: 840, h: 1212 }; // 基本枠
  var GAP_Y = 34, GAP_X = 16; // 段の間 / コマの間

  KC.PW = PW; KC.PH = PH; KC.FRAME = FRAME;

  var uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  KC.uid = uid;

  /* ---------- コマ割りテンプレート ---------- */
  // 各段: h = 高さの比, c = 横幅の比(右から並べても左からでも形は同じ)
  KC.TEMPLATES = [
    { id: 't0', name: 'なし', rows: [] },
    { id: 't1', name: '1コマ', rows: [{ h: 1, c: [1] }] },
    { id: 't2', name: '2段', rows: [{ h: 1, c: [1] }, { h: 1, c: [1] }] },
    { id: 't3', name: '3段', rows: [{ h: 1, c: [1] }, { h: 1, c: [1] }, { h: 1, c: [1] }] },
    { id: 't4', name: '4段', rows: [{ h: 1, c: [1] }, { h: 1, c: [1] }, { h: 1, c: [1] }, { h: 1, c: [1] }] },
    { id: 't5', name: '3段・中割り', rows: [{ h: 1, c: [1] }, { h: 1, c: [1, 1] }, { h: 1, c: [1] }] },
    { id: 't6', name: '3段・上下割り', rows: [{ h: 1, c: [1, 1] }, { h: 1.25, c: [1] }, { h: 1, c: [2, 1] }] },
    { id: 't7', name: '4段・混合', rows: [{ h: 1, c: [1, 1] }, { h: 1, c: [1] }, { h: 1, c: [1, 2] }, { h: 1, c: [1] }] },
    { id: 't8', name: '6コマ', rows: [{ h: 1, c: [1, 1] }, { h: 1, c: [1, 1] }, { h: 1, c: [1, 1] }] },
    { id: 't9', name: '見せゴマ', rows: [{ h: 2, c: [1] }, { h: 1, c: [1, 1] }] }
  ];

  KC.panelsFromTemplate = function (tpl) {
    var rows = tpl.rows, out = [];
    if (!rows.length) return out;
    var totalH = FRAME.h - GAP_Y * (rows.length - 1);
    var sumH = rows.reduce(function (a, r) { return a + r.h; }, 0);
    var y = FRAME.y;
    rows.forEach(function (r) {
      var h = totalH * r.h / sumH;
      var totalW = FRAME.w - GAP_X * (r.c.length - 1);
      var sumW = r.c.reduce(function (a, b) { return a + b; }, 0);
      var x = FRAME.x;
      r.c.forEach(function (cw) {
        var w = totalW * cw / sumW;
        out.push(KC.rectPanel(x, y, w, h));
        x += w + GAP_X;
      });
      y += h + GAP_Y;
    });
    return out;
  };

  function round(v) { return Math.round(v * 10) / 10; }
  KC.round = round;

  /* ---------- コマの形 ----------
     コマは多角形: { id, pts: [x1,y1, x2,y2, ...] }
     (前の版の { x, y, w, h } の四角も読めるようにする) */
  KC.rectPanel = function (x, y, w, h) {
    return { id: uid(), pts: [x, y, x + w, y, x + w, y + h, x, y + h].map(round) };
  };
  KC.ptsOf = function (p) {
    if (!p.pts) {
      p.pts = [p.x, p.y, p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.x, p.y + p.h];
      delete p.x; delete p.y; delete p.w; delete p.h;
    }
    return p.pts;
  };
  KC.bbox = function (p) {
    var a = KC.ptsOf(p), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < a.length; i += 2) {
      x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]);
      y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  function area(a) {
    var s = 0, n = a.length / 2;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      s += a[i * 2] * a[j * 2 + 1] - a[j * 2] * a[i * 2 + 1];
    }
    return Math.abs(s) / 2;
  }
  KC.panelArea = function (p) { return area(KC.ptsOf(p)); };

  function inside(a, x, y) {
    var c = false, n = a.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = a[i * 2], yi = a[i * 2 + 1], xj = a[j * 2], yj = a[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  KC.panelAt = function (page, x, y) {
    for (var i = page.panels.length - 1; i >= 0; i--) {
      if (inside(KC.ptsOf(page.panels[i]), x, y)) return page.panels[i];
    }
    return null;
  };

  // 半平面 dot(v - P, n) >= c で切り取る
  function clip(a, px, py, nx, ny, c) {
    var out = [], n = a.length / 2;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var ax = a[i * 2], ay = a[i * 2 + 1], bx = a[j * 2], by = a[j * 2 + 1];
      var sa = (ax - px) * nx + (ay - py) * ny - c, sb = (bx - px) * nx + (by - py) * ny - c;
      if (sa >= 0) out.push(ax, ay);
      if ((sa >= 0) !== (sb >= 0)) {
        var t = sa / (sa - sb);
        out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
    return out.map(round);
  }

  // 線(始点 a、終点 b)でコマを2つに切る。斜めもOK。溝の幅は線の向きで決める
  KC.splitPanelLine = function (page, panelId, a, b) {
    var i = page.panels.findIndex(function (p) { return p.id === panelId; });
    if (i < 0) return false;
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1) return false;
    dx /= len; dy /= len;
    var nx = -dy, ny = dx;                         // 線の法線
    var gap = GAP_X + (GAP_Y - GAP_X) * Math.abs(dx); // 横線ほど広い
    var pts = KC.ptsOf(page.panels[i]);
    var A = clip(pts, a.x, a.y, nx, ny, gap / 2), B = clip(pts, a.x, a.y, -nx, -ny, gap / 2);
    if (A.length < 6 || B.length < 6 || area(A) < 1200 || area(B) < 1200) return false;
    var pa = { id: uid(), pts: A }, pb = { id: uid(), pts: B };
    page.panels.splice(i, 1, pa, pb);
    return true;
  };

  // ほぼ水平・垂直の線は、まっすぐにそろえる
  KC.snapLine = function (a, b) {
    var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    var t = ((ang % 180) + 180) % 180;
    var my = (a.y + b.y) / 2, mx = (a.x + b.x) / 2;
    if (t < 5 || t > 175) return { a: { x: a.x, y: my }, b: { x: b.x, y: my }, snapped: 'h' };
    if (Math.abs(t - 90) < 5) return { a: { x: mx, y: a.y }, b: { x: mx, y: b.y }, snapped: 'v' };
    return { a: a, b: b, snapped: null };
  };

  /* ---------- 新しいデータ ---------- */
  KC.newPage = function (tplId) {
    var tpl = KC.TEMPLATES.find(function (t) { return t.id === tplId; }) || KC.TEMPLATES[3];
    return { id: uid(), panels: KC.panelsFromTemplate(tpl), strokes: [], balloons: [], manualOrder: false };
  };

  KC.newDoc = function (opt) {
    opt = opt || {};
    var n = Math.max(1, Math.min(200, opt.pages || 8));
    var pages = [];
    for (var i = 0; i < n; i++) pages.push(KC.newPage(opt.template || 't3'));
    var now = Date.now();
    return {
      id: uid(),
      title: opt.title || '無題のネーム',
      vertical: opt.vertical !== false,
      startSide: opt.startSide || 'left', // 1ページ目が左ページ(右綴じの一般的な形)
      pages: pages,
      createdAt: now,
      updatedAt: now,
      syncedAt: 0,
      remoteId: null
    };
  };

  KC.newBalloon = function (opt) {
    return {
      id: uid(),
      kind: opt.kind || 'speech', // speech | shout | flash | mono | sfx
      text: opt.text || '',
      x: opt.x == null ? 0 : opt.x,
      y: opt.y == null ? 0 : opt.y,
      placed: opt.placed !== false,
      fs: opt.fs || (opt.kind === 'sfx' ? 44 : 26)
    };
  };

  /* ---------- めくり・見開き ---------- */
  // 右綴じ: startSide='left' なら 1ページ目は左ページ。左ページ = めくり
  KC.isLeftPage = function (doc, idx) {
    var firstLeft = doc.startSide !== 'right';
    return (idx % 2 === 0) === firstLeft;
  };
  // 見開き [右ページidx, 左ページidx] (無いところは -1)
  KC.spreads = function (doc) {
    var out = [], n = doc.pages.length, i = 0;
    if (doc.startSide !== 'right') { out.push([-1, 0]); i = 1; }
    for (; i < n; i += 2) out.push([i, i + 1 < n ? i + 1 : -1]);
    return out;
  };

  /* ---------- セリフの読む順 ---------- */
  function panelOrder(panels) {
    // 上の段から。同じ段の中では右から
    var boxes = new Map(panels.map(function (p) { return [p, KC.bbox(p)]; }));
    var ps = panels.slice().sort(function (a, b) { return boxes.get(a).y - boxes.get(b).y; });
    var tiers = [];
    ps.forEach(function (pp) {
      var p = boxes.get(pp);
      var t = tiers.find(function (t) {
        var top = Math.max(t.y, p.y), bot = Math.min(t.y + t.h, p.y + p.h);
        return bot - top > Math.min(p.h, t.h) * 0.5;
      });
      if (t) {
        t.items.push(pp);
        var y2 = Math.max(t.y + t.h, p.y + p.h);
        t.y = Math.min(t.y, p.y); t.h = y2 - t.y;
      } else tiers.push({ y: p.y, h: p.h, items: [pp] });
    });
    var out = [];
    tiers.forEach(function (t) {
      t.items.sort(function (a, b) {
        var A = boxes.get(a), B = boxes.get(b);
        return (B.x + B.w / 2) - (A.x + A.w / 2);
      });
      out = out.concat(t.items);
    });
    return out;
  }
  KC.panelOrder = panelOrder;

  KC.autoOrder = function (page, vertical) {
    var order = panelOrder(page.panels);
    var placed = page.balloons.filter(function (b) { return b.placed; });
    var unplaced = page.balloons.filter(function (b) { return !b.placed; });
    var keyed = placed.map(function (b) {
      var p = KC.panelAt(page, b.x, b.y);
      var pi = p ? order.indexOf(p) : -1;
      if (pi < 0) {
        // コマの外: いちばん近いコマに入れる
        var best = Infinity;
        order.forEach(function (qq, i) {
          var q = KC.bbox(qq);
          var dx = Math.max(q.x - b.x, 0, b.x - q.x - q.w);
          var dy = Math.max(q.y - b.y, 0, b.y - q.y - q.h);
          var d = dx * dx + dy * dy;
          if (d < best) { best = d; pi = i; }
        });
      }
      return { b: b, pi: pi };
    });
    keyed.sort(function (a, b) {
      if (a.pi !== b.pi) return a.pi - b.pi;
      if (vertical) {
        if (Math.abs(a.b.x - b.b.x) > 30) return b.b.x - a.b.x; // 右から
        return a.b.y - b.b.y;
      }
      if (Math.abs(a.b.y - b.b.y) > 30) return a.b.y - b.b.y;
      return a.b.x - b.b.x;
    });
    return keyed.map(function (k) { return k.b; }).concat(unplaced);
  };

  KC.orderedBalloons = function (page, vertical) {
    return page.manualOrder ? page.balloons.slice() : KC.autoOrder(page, vertical);
  };

  /* ---------- 吹き出しの大きさ ---------- */
  var ROTATE = 'ー－—―‐-~〜～…‥「」『』（）()【】〈〉《》［］[]｛｝{}＝=→←';
  var SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ';
  var COMMA = '、。，．';

  KC.FONT_MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","BIZ UDMincho","Noto Serif CJK JP","Noto Serif JP",serif';
  KC.FONT_GOTHIC = '"Hiragino Sans","Yu Gothic UI","Yu Gothic","YuGothic","BIZ UDGothic","Noto Sans CJK JP","Noto Sans JP",sans-serif';

  function linesOf(text) {
    var t = (text || '').replace(/\r/g, '');
    var ls = t.split('\n').map(function (l) { return Array.from(l); });
    if (!t.trim()) ls = [Array.from('…')];
    return ls;
  }

  KC.layoutBalloon = function (b, vertical) {
    var fs = b.fs || 26, ls = linesOf(b.text);
    var maxLen = ls.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    var tw, th, px, py;
    if (vertical) {
      tw = ls.length * fs * 1.3; th = maxLen * fs * 1.04;
    } else {
      tw = maxLen * fs * 1.02; th = ls.length * fs * 1.4;
    }
    if (b.kind === 'speech' || b.kind === 'flash') { px = fs * 1.25 + tw * 0.12; py = fs * 1.0 + th * 0.1; }
    else if (b.kind === 'shout') { px = fs * 1.6 + tw * 0.16; py = fs * 1.35 + th * 0.14; }
    else if (b.kind === 'mono') { px = fs * 0.6; py = fs * 0.6; }
    else { px = fs * 0.15; py = fs * 0.15; }
    var w = tw + px * 2, h = th + py * 2;
    return { x: b.x - w / 2, y: b.y - h / 2, w: w, h: h, px: px, py: py, fs: fs, lines: ls };
  };

  var ROUND_KINDS = { speech: 1, shout: 1, flash: 1 };
  KC.KINDS = [
    { id: 'speech', name: 'セリフ' }, { id: 'shout', name: 'ハリ' }, { id: 'flash', name: 'フラッシュ' },
    { id: 'mono', name: 'モノローグ' }, { id: 'sfx', name: '描き文字' }
  ];
  KC.kindName = function (k) { var f = KC.KINDS.find(function (x) { return x.id === k; }); return f ? f.name : 'セリフ'; };

  // 吹き出しごとに決まった形にするための乱数(idから作る)
  function rng(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5; var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ハリ吹き出し(叫び): 楕円のまわりにトゲ
  function shoutPath(ctx, cx, cy, rx, ry, seed) {
    var rnd = rng(seed), per = Math.PI * (rx + ry);
    var n = Math.max(14, Math.min(40, Math.round(per / 34)));
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (i / (n * 2)) * Math.PI * 2 + rnd() * 0.04;
      var k = i % 2 === 0 ? 1.12 + rnd() * 0.16 : 0.9 + rnd() * 0.04;
      var x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // フラッシュ: 白い楕円のまわりに、外へ向かう細い線
  function flashLines(ctx, cx, cy, rx, ry, seed) {
    var rnd = rng(seed), per = Math.PI * (rx + ry);
    var n = Math.max(48, Math.min(160, Math.round(per / 9)));
    ctx.fillStyle = '#1b1b1b';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.05;
      var r0 = 1.04 + rnd() * 0.06, r1 = r0 + 0.22 + rnd() * 0.3;
      var w = 0.012 + rnd() * 0.012; // 根元の太さ(角度)
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - w) * rx * r0, cy + Math.sin(a - w) * ry * r0);
      ctx.lineTo(cx + Math.cos(a) * rx * r1, cy + Math.sin(a) * ry * r1);
      ctx.lineTo(cx + Math.cos(a + w) * rx * r0, cy + Math.sin(a + w) * ry * r0);
      ctx.closePath();
      ctx.fill();
    }
  }

  KC.balloonAt = function (page, x, y, vertical) {
    for (var i = page.balloons.length - 1; i >= 0; i--) {
      var b = page.balloons[i];
      if (!b.placed) continue;
      var r = KC.layoutBalloon(b, vertical);
      if (ROUND_KINDS[b.kind]) {
        // 丸い吹き出しは楕円の中だけ(角の空いているところで別の吹き出しを作れるように)
        var ex = (x - (r.x + r.w / 2)) / (r.w / 2), ey = (y - (r.y + r.h / 2)) / (r.h / 2);
        if (ex * ex + ey * ey <= 1) return b;
      } else if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return b;
    }
    return null;
  };

  /* ---------- 描画 ---------- */
  function drawStrokePath(ctx, s) {
    var p = s.p, n = p.length / 2;
    ctx.beginPath();
    if (n === 1) {
      ctx.arc(p[0], p[1], s.s / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.moveTo(p[0], p[1]);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i * 2] + p[i * 2 + 2]) / 2, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mx, my);
    }
    ctx.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
    ctx.stroke();
  }

  KC.drawStroke = function (ctx, s) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = s.s;
    if (s.e) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = ctx.fillStyle = '#000';
    } else {
      ctx.strokeStyle = ctx.fillStyle = s.c || '#222';
    }
    drawStrokePath(ctx, s);
    ctx.restore();
  };

  KC.drawStrokes = function (ctx, strokes) {
    strokes.forEach(function (s) { KC.drawStroke(ctx, s); });
  };

  KC.panelPath = function (ctx, p) {
    var a = KC.ptsOf(p);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    for (var i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
    ctx.closePath();
  };

  KC.drawPanels = function (ctx, page, opt) {
    opt = opt || {};
    ctx.save();
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = opt.lineWidth || 3;
    ctx.lineJoin = 'miter';
    page.panels.forEach(function (p) { KC.panelPath(ctx, p); ctx.stroke(); });
    ctx.restore();
  };

  KC.drawFrameGuide = function (ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(70,140,200,.35)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
    ctx.restore();
  };

  function drawChar(ctx, ch, cx, cy, fs, vertical) {
    if (vertical && ROTATE.indexOf(ch) >= 0) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0); ctx.restore();
      return;
    }
    if (vertical && COMMA.indexOf(ch) >= 0) { cx += fs * 0.55; cy -= fs * 0.55; }
    else if (vertical && SMALL.indexOf(ch) >= 0) { cx += fs * 0.1; cy -= fs * 0.1; }
    ctx.fillText(ch, cx, cy);
  }

  /* ---------- 吹き出しの描画 ----------
     重なった吹き出しは1つに合体する(内側の線を消して、外側だけ線を引く)。
     手順: ①フラッシュの線 → ②全部の外形を「太い線」で描く → ③全部の外形を白で塗る → ④文字
     ③の白が②の内側半分と、重なった部分の線を消すので、外まわりの線だけが残る */
  var LINE_W = { speech: 2.4, shout: 2.4, mono: 1.6 };
  function shapePath(ctx, b, r, grow) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (b.kind === 'shout') { shoutPath(ctx, cx, cy, r.w / 2, r.h / 2, b.id || 'x'); return true; }
    if (b.kind === 'speech' || b.kind === 'flash') {
      var k = b.kind === 'flash' ? 1.02 : 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 * k, r.h / 2 * k, 0, 0, Math.PI * 2); return true;
    }
    if (b.kind === 'mono') { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); return true; }
    return false; // 描き文字は形なし
  }

  function drawText(ctx, b, r, vertical) {
    var fs = r.fs, empty = !(b.text || '').trim();
    ctx.save();
    ctx.fillStyle = empty ? '#9aa' : '#141414';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = (b.kind === 'sfx' ? '900 ' : b.kind === 'shout' ? '800 ' : '500 ') + fs + 'px ' + (b.kind === 'sfx' ? KC.FONT_GOTHIC : KC.FONT_MINCHO);
    if (b.kind === 'sfx') { ctx.lineWidth = fs * 0.22; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; }
    r.lines.forEach(function (line, li) {
      line.forEach(function (ch, ci) {
        var cx, cy;
        if (vertical) {
          cx = r.x + r.w - r.px - fs * 1.3 * (li + 0.5);
          cy = r.y + r.py + fs * 1.04 * (ci + 0.5);
        } else {
          cx = r.x + r.px + fs * 1.02 * (ci + 0.5);
          cy = r.y + r.py + fs * 1.4 * (li + 0.5);
        }
        if (b.kind === 'sfx') { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeText(ch, cx, cy); ctx.restore(); }
        drawChar(ctx, ch, cx, cy, fs, vertical);
      });
    });
    ctx.restore();
  }

  function drawMarks(ctx, r, opt) {
    ctx.save();
    if (opt.selected) {
      ctx.strokeStyle = '#2f6fe4'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
      ctx.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
    }
    if (opt.number) {
      ctx.setLineDash([]);
      var nx = r.x + r.w - 4, ny = r.y + 4;
      ctx.beginPath(); ctx.arc(nx, ny, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#2f6fe4'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 17px ' + KC.FONT_GOTHIC;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(opt.number), nx, ny + 1);
    }
    ctx.restore();
  }

  // 2つの吹き出しの形が重なっているか(輪郭の点がもう一方の中に入るか)
  function insideShape(b, r, x, y) {
    if (b.kind === 'mono') return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    var ex = (x - (r.x + r.w / 2)) / (r.w / 2), ey = (y - (r.y + r.h / 2)) / (r.h / 2);
    return ex * ex + ey * ey <= 1;
  }
  function outline(b, r) {
    var pts = [], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (b.kind === 'mono') {
      for (var i = 0; i <= 8; i++) {
        pts.push([r.x + r.w * i / 8, r.y], [r.x + r.w * i / 8, r.y + r.h], [r.x, r.y + r.h * i / 8], [r.x + r.w, r.y + r.h * i / 8]);
      }
    } else {
      for (var j = 0; j < 48; j++) { var a = j / 48 * Math.PI * 2; pts.push([cx + Math.cos(a) * r.w / 2, cy + Math.sin(a) * r.h / 2]); }
    }
    pts.push([cx, cy]);
    return pts;
  }
  function overlaps(A, ra, B, rb) {
    if (ra.x > rb.x + rb.w || rb.x > ra.x + ra.w || ra.y > rb.y + rb.h || rb.y > ra.y + ra.h) return false;
    return outline(A, ra).some(function (p) { return insideShape(B, rb, p[0], p[1]); }) ||
      outline(B, rb).some(function (p) { return insideShape(A, ra, p[0], p[1]); });
  }

  // 重なっている吹き出しのまとまり(つながっていれば3つ以上でも1つ)
  KC.balloonGroups = function (list, vertical) {
    var items = list.map(function (b) { return { b: b, r: KC.layoutBalloon(b, vertical), shaped: b.kind !== 'sfx' }; });
    var parent = items.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (var i = 0; i < items.length; i++) {
      if (!items[i].shaped) continue;
      for (var j = i + 1; j < items.length; j++) {
        if (!items[j].shaped) continue;
        if (overlaps(items[i].b, items[i].r, items[j].b, items[j].r)) parent[find(j)] = find(i);
      }
    }
    var groups = {}, order = [];
    items.forEach(function (it, i) {
      var k = find(i);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(it);
    });
    return order.map(function (k) { return groups[k]; });
  };

  function drawGroup(ctx, g, vertical) {
    ctx.save();
    // ① フラッシュの線
    g.forEach(function (it) {
      if (it.b.kind === 'flash') flashLines(ctx, it.r.x + it.r.w / 2, it.r.y + it.r.h / 2, it.r.w / 2, it.r.h / 2, it.b.id || 'x');
    });
    // ② 外形を2倍の太さで
    ctx.strokeStyle = '#1b1b1b'; ctx.lineJoin = 'miter';
    g.forEach(function (it) {
      var lw = LINE_W[it.b.kind];
      if (!lw || !shapePath(ctx, it.b, it.r)) return;
      ctx.lineWidth = lw * 2; ctx.stroke();
    });
    // ③ 白で塗る(内側の線が消える)
    ctx.fillStyle = '#fff';
    g.forEach(function (it) { if (shapePath(ctx, it.b, it.r)) ctx.fill(); });
    ctx.restore();
    // ④ 文字
    g.forEach(function (it) { drawText(ctx, it.b, it.r, vertical); });
  }

  KC.drawBalloon = function (ctx, b, vertical, opt) {
    var r = KC.layoutBalloon(b, vertical);
    drawGroup(ctx, [{ b: b, r: r }], vertical);
    drawMarks(ctx, r, opt || {});
  };

  KC.drawBalloons = function (ctx, page, vertical, opt) {
    opt = opt || {};
    var list = page.balloons.filter(function (b) { return b.placed && !(opt.exclude && opt.exclude(b)); });
    KC.balloonGroups(list, vertical).forEach(function (g) { drawGroup(ctx, g, vertical); });
    var order = opt.numbers ? KC.orderedBalloons(page, vertical).filter(function (b) { return b.placed; }) : null;
    list.forEach(function (b) {
      var sel = opt.isSelected ? opt.isSelected(b) : opt.selectedId === b.id, num = order ? order.indexOf(b) + 1 : 0;
      if (sel || num) drawMarks(ctx, KC.layoutBalloon(b, vertical), { selected: sel, number: num });
    });
  };

  /* 1ページを1枚の画像に(サムネイル・PNG書き出し用) */
  KC.renderPageTo = function (canvas, page, doc, scale, opt) {
    opt = opt || {};
    canvas.width = Math.round(PW * scale);
    canvas.height = Math.round(PH * scale);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (opt.guide) KC.drawFrameGuide(ctx);
    KC.drawPanels(ctx, page);
    var sc = document.createElement('canvas');
    sc.width = canvas.width; sc.height = canvas.height;
    var sctx = sc.getContext('2d');
    sctx.setTransform(scale, 0, 0, scale, 0, 0);
    KC.drawStrokes(sctx, page.strokes);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sc, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    KC.drawBalloons(ctx, page, doc.vertical, { exclude: opt.exclude });
    return canvas;
  };
})();
