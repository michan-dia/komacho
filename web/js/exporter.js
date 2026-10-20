/* コマ帖 — 書き出し(ストーリーエディター用テキスト、PNG、PSD、zip) */
(function () {
  'use strict';
  var KC = (window.KC = window.KC || {});

  /* ---------- ストーリーエディター用テキスト ---------- */
  function includeKind(b, st) {
    if (b.kind === 'sfx') return st.includeSfx;
    if (b.kind === 'mono') return st.includeMono;
    return true;
  }
  function cleanText(t) {
    // 台詞の中の空行は、ストーリーエディターでは台詞の区切りになってしまうので1行にまとめる
    return (t || '').replace(/\r/g, '').replace(/\n{2,}/g, '\n').replace(/^\s+|\s+$/g, '');
  }
  KC.pageLines = function (doc, page, st) {
    return KC.orderedBalloons(page, doc.vertical)
      .filter(function (b) { return includeKind(b, st); })
      .map(function (b) { return cleanText(b.text); })
      .filter(function (t) { return t.length > 0; });
  };
  KC.storyText = function (doc, st, pageIdx) {
    var sep = '\n'.repeat(Math.max(2, st.newlines || 2));
    var pages = pageIdx == null ? doc.pages : [doc.pages[pageIdx]];
    var lines = [];
    pages.forEach(function (p) { lines = lines.concat(KC.pageLines(doc, p, st)); });
    return lines.join(sep);
  };
  // 見直し用: ページ見出し付き(ストーリーエディターには貼らない)
  KC.scriptText = function (doc, st) {
    var out = ['【' + doc.title + '】', ''];
    doc.pages.forEach(function (p, i) {
      out.push('―― ' + (i + 1) + 'ページ' + (KC.isLeftPage(doc, i) ? '(めくり)' : '') + ' ――');
      var ls = KC.orderedBalloons(p, doc.vertical).filter(function (b) { return includeKind(b, st); });
      if (!ls.length) out.push('(セリフなし)');
      ls.forEach(function (b, j) {
        var mark = b.kind === 'mono' ? '[モ]' : b.kind === 'sfx' ? '[描]' : b.kind === 'shout' ? '[ハ]' : b.kind === 'flash' ? '[フ]' : '';
        out.push((j + 1) + '. ' + mark + cleanText(b.text).replace(/\n/g, ' / '));
      });
      out.push('');
    });
    return out.join('\n');
  };

  KC.toCRLF = function (s) { return s.replace(/\r?\n/g, '\r\n'); };

  /* ---------- zip(無圧縮) ---------- */
  var CRC_T = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xffffffff;
    for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  KC.makeZip = function (files) { // files: [{name, data: Uint8Array}]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosTime, true);
      c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  };

  /* ---------- PNG ---------- */
  var EXPORT_SCALE = 1.5; // 1500 x 2118 px
  function canvasToU8(canvas) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) {
        b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); });
      }, 'image/png');
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function safeName(s) { return (s || 'name').replace(/[\\/:*?"<>|]/g, '_').trim() || 'name'; }
  KC.safeName = safeName;

  KC.exportPNGs = function (doc, st) {
    var files = [], i = 0;
    function next() {
      if (i >= doc.pages.length) return Promise.resolve();
      var c = document.createElement('canvas');
      KC.renderPageTo(c, doc.pages[i], doc, EXPORT_SCALE, {});
      var name = safeName(doc.title) + '_p' + pad2(i + 1) + '.png';
      i++;
      return canvasToU8(c).then(function (u8) { files.push({ name: name, data: u8 }); return next(); });
    }
    return next().then(function () { return KC.makeZip(files); });
  };

  /* ---------- PSD(レイヤー分け) ---------- */
  function packBits(src) { // Uint8Array -> number[]
    var out = [], n = src.length, i = 0;
    while (i < n) {
      var j = i;
      while (j < n - 1 && j - i < 127 && src[j] === src[j + 1]) j++;
      if (j > i) { // 連続: i..j が同じ値
        out.push(257 - (j - i + 1) & 0xff, src[i]);
        i = j + 1;
        continue;
      }
      var s = i;
      while (i < n && i - s < 128 && !(i < n - 2 && src[i] === src[i + 1] && src[i] === src[i + 2])) i++;
      if (i === s) i++;
      out.push(i - s - 1);
      for (var k = s; k < i; k++) out.push(src[k]);
    }
    return out;
  }

  function Writer() { this.chunks = []; this.len = 0; }
  Writer.prototype.u8 = function (v) { this.chunks.push(new Uint8Array([v & 0xff])); this.len += 1; };
  Writer.prototype.u16 = function (v) { var b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff); this.chunks.push(b); this.len += 2; };
  Writer.prototype.i16 = function (v) { var b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v); this.chunks.push(b); this.len += 2; };
  Writer.prototype.u32 = function (v) { var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); this.chunks.push(b); this.len += 4; };
  Writer.prototype.i32 = function (v) { var b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v); this.chunks.push(b); this.len += 4; };
  Writer.prototype.bytes = function (a) { var b = a instanceof Uint8Array ? a : new Uint8Array(a); this.chunks.push(b); this.len += b.length; };
  Writer.prototype.str = function (s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); this.bytes(b); };
  Writer.prototype.blob = function (type) { return new Blob(this.chunks, { type: type }); };
  Writer.prototype.toU8 = function () {
    var out = new Uint8Array(this.len), o = 0;
    this.chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  };

  // チャンネル1つ分をRLEで: [行ごとのバイト数], [データ]
  function rleChannel(rgba, w, h, ch) {
    var counts = new Array(h), rows = [], row = new Uint8Array(w);
    for (var y = 0; y < h; y++) {
      var base = y * w * 4 + ch;
      for (var x = 0; x < w; x++) row[x] = rgba[base + x * 4];
      var p = packBits(row);
      counts[y] = p.length; rows.push(p);
    }
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var data = new Uint8Array(total), o = 0;
    rows.forEach(function (r) { data.set(r, o); o += r.length; });
    return { counts: counts, data: data };
  }

  function layerName(w, name, ascii) {
    // パスカル文字列(4バイト境界)
    var a = ascii.slice(0, 31), len = 1 + a.length, padded = Math.ceil(len / 4) * 4;
    var ex = new Writer();
    ex.u8(a.length); ex.str(a);
    for (var i = len; i < padded; i++) ex.u8(0);
    // 日本語のレイヤー名(luni)
    var lu = new Writer();
    lu.u32(name.length);
    for (var k = 0; k < name.length; k++) lu.u16(name.charCodeAt(k));
    while (lu.len % 4) lu.u8(0);
    ex.str('8BIM'); ex.str('luni'); ex.u32(lu.len); ex.bytes(lu.toU8());
    return ex.toU8();
  }

  // layers: [{name, ascii, rgba}] (下から上の順)、composite: 統合画像 rgba
  KC.buildPSD = function (w, h, layers, composite, dpi) {
    var out = new Writer();
    out.str('8BPS'); out.u16(1); out.bytes(new Uint8Array(6));
    out.u16(3); out.u32(h); out.u32(w); out.u16(8); out.u16(3);
    out.u32(0); // カラーモード
    // 画像リソース: 解像度
    var res = new Writer();
    res.str('8BIM'); res.u16(1005); res.u16(0); res.u32(16);
    var fixed = Math.round(dpi * 65536);
    res.u32(fixed); res.u16(1); res.u16(1); res.u32(fixed); res.u16(1); res.u16(1);
    out.u32(res.len); out.bytes(res.toU8());

    // レイヤー情報
    var recs = new Writer(), imgs = new Writer();
    layers.forEach(function (L) {
      var chs = [-1, 0, 1, 2].map(function (id) {
        var c = rleChannel(L.rgba, w, h, id === -1 ? 3 : id);
        return { id: id, c: c, len: 2 + h * 2 + c.data.length };
      });
      recs.i32(0); recs.i32(0); recs.i32(h); recs.i32(w);
      recs.u16(4);
      chs.forEach(function (c) { recs.i16(c.id); recs.u32(c.len); });
      recs.str('8BIM'); recs.str('norm');
      recs.u8(255); recs.u8(0); recs.u8(L.hidden ? 2 : 0); recs.u8(0);
      var nm = layerName(null, L.name, L.ascii);
      recs.u32(4 + 4 + nm.length);
      recs.u32(0); recs.u32(0); recs.bytes(nm);
      chs.forEach(function (c) {
        imgs.u16(1);
        c.c.counts.forEach(function (n) { imgs.u16(n); });
        imgs.bytes(c.c.data);
      });
    });
    var li = new Writer();
    li.i16(layers.length); li.bytes(recs.toU8()); li.bytes(imgs.toU8());
    if (li.len % 2) li.u8(0);
    var lm = new Writer();
    lm.u32(li.len); lm.bytes(li.toU8());
    lm.u32(0); // グローバルマスク
    out.u32(lm.len); out.bytes(lm.toU8());

    // 統合画像
    var cs = [0, 1, 2].map(function (ch) { return rleChannel(composite, w, h, ch); });
    out.u16(1);
    cs.forEach(function (c) { c.counts.forEach(function (n) { out.u16(n); }); });
    cs.forEach(function (c) { out.bytes(c.data); });
    return out.toU8();
  };

  function layerCanvas(scale) {
    var c = document.createElement('canvas');
    c.width = Math.round(KC.PW * scale); c.height = Math.round(KC.PH * scale);
    var ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return { c: c, ctx: ctx };
  }
  function rgbaOf(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }

  KC.pagePSD = function (doc, page, scale) {
    scale = scale || EXPORT_SCALE;
    var paper = layerCanvas(scale), frames = layerCanvas(scale), rough = layerCanvas(scale), text = layerCanvas(scale);
    paper.ctx.fillStyle = '#fff'; paper.ctx.fillRect(0, 0, KC.PW, KC.PH);
    KC.drawPanels(frames.ctx, page);
    KC.drawStrokes(rough.ctx, page.strokes);
    KC.drawBalloons(text.ctx, page, doc.vertical, {});
    var comp = layerCanvas(scale);
    comp.ctx.setTransform(1, 0, 0, 1, 0, 0);
    [paper, frames, rough, text].forEach(function (l) { comp.ctx.drawImage(l.c, 0, 0); });
    var w = paper.c.width, h = paper.c.height;
    // 仕上がりB5(182mm)の幅になる解像度
    var dpi = w / (182 / 25.4);
    return KC.buildPSD(w, h, [
      { name: '用紙', ascii: 'Paper', rgba: rgbaOf(paper.c) },
      { name: 'コマ枠', ascii: 'Frames', rgba: rgbaOf(frames.c) },
      { name: 'ラフ', ascii: 'Rough', rgba: rgbaOf(rough.c) },
      { name: 'セリフ', ascii: 'Text', rgba: rgbaOf(text.c) }
    ], rgbaOf(comp.c), dpi);
  };

  KC.exportPSDs = function (doc, onProgress) {
    var files = [], i = 0;
    function next() {
      if (i >= doc.pages.length) return Promise.resolve();
      if (onProgress) onProgress(i, doc.pages.length);
      return new Promise(function (res) { setTimeout(res, 0); }).then(function () {
        var u8 = KC.pagePSD(doc, doc.pages[i]);
        files.push({ name: safeName(doc.title) + '_p' + pad2(i + 1) + '.psd', data: u8 });
        i++;
        return next();
      });
    }
    return next().then(function () { return KC.makeZip(files); });
  };

  /* ---------- 保存とコピー ---------- */
  KC.saveBlob = function (blob, name) {
    if (KC.saveHook) return KC.saveHook(blob, name);
    if (window.komachoNative && window.komachoNative.saveFile) {
      return blob.arrayBuffer().then(function (ab) {
        return window.komachoNative.saveFile(name, new Uint8Array(ab));
      });
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve(true);
  };

  KC.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
  };
})();
