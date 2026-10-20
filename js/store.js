/* コマ帖 — 端末内の保存(IndexedDB)と設定 */
(function () {
  'use strict';
  var KC = (window.KC = window.KC || {});
  var DB_NAME = 'komacho', STORE = 'docs';
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var rq;
      try { rq = indexedDB.open(DB_NAME, 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      setTimeout(function () { rej(new Error('IndexedDB timeout')); }, 4000);
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }

  // IndexedDBが使えない環境(プライベートモードなど)では、開いている間だけメモリに置く
  var mem = null;
  function memTx(fn) {
    var out;
    var st = {
      getAll: function () { return { result: Object.keys(mem).map(function (k) { return JSON.parse(mem[k]); }) }; },
      get: function (id) { return { result: mem[id] ? JSON.parse(mem[id]) : undefined }; },
      put: function (d) { mem[d.id] = JSON.stringify(d); return { result: d.id }; },
      delete: function (id) { delete mem[id]; return { result: undefined }; }
    };
    var r = fn(st);
    out = r ? r.result : undefined;
    return Promise.resolve(out);
  }
  function tx(mode, fn) {
    if (mem) return memTx(fn);
    return open().catch(function () { mem = mem || {}; return null; }).then(function (db) {
      if (!db) return memTx(fn);
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out;
        var r = fn(st);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  KC.store = {
    all: function () { return tx('readonly', function (st) { return st.getAll(); }); },
    get: function (id) { return tx('readonly', function (st) { return st.get(id); }); },
    put: function (doc) { return tx('readwrite', function (st) { return st.put(doc); }); },
    // 削除は「削除済み」の印を残す(ほかの端末にも消したことを伝えるため)
    remove: function (doc) {
      var t = { id: doc.id, deleted: true, title: doc.title, updatedAt: Date.now(), syncedAt: doc.syncedAt || 0, remoteId: doc.remoteId || null };
      return KC.store.put(t);
    },
    purge: function (id) { return tx('readwrite', function (st) { return st.delete(id); }); },

    // 編集の保存: 同期の印(syncedAt / remoteId)は保存されている新しいほうを残す
    saveEdit: function (doc) {
      return update(doc.id, function (ex) {
        // 保存されているほうが新しい(ほかの画面・端末で編集された)ときは上書きしない
        if (ex && (ex.updatedAt || 0) > (doc.updatedAt || 0)) return null;
        if (ex && !ex.deleted) {
          doc.syncedAt = Math.max(doc.syncedAt || 0, ex.syncedAt || 0);
          if (!doc.remoteId) doc.remoteId = ex.remoteId || null;
        }
        return doc;
      });
    },
    // 同期で送ったあと: 中身はさわらず、同期の印だけ付ける
    markSynced: function (id, syncedAt, remoteId) {
      return update(id, function (ex) {
        if (!ex) return null;
        ex.syncedAt = Math.max(ex.syncedAt || 0, syncedAt);
        ex.remoteId = remoteId;
        return ex;
      });
    },
    // 同期で受け取ったとき: 同期を始めたあとに手元で編集されていたら、上書きしない
    putIfNotNewer: function (doc, expectedUpdatedAt) {
      var replaced = false;
      return update(doc.id, function (ex) {
        if (ex && (ex.updatedAt || 0) > (expectedUpdatedAt || 0)) return null;
        replaced = true;
        return doc;
      }).then(function () { return replaced; });
    }
  };

  // 1つの取引の中で「読む→直す→書く」(途中でほかの保存が割りこまない)
  function update(id, fn) {
    if (mem) { var r = fn(mem[id] ? JSON.parse(mem[id]) : undefined); if (r) mem[r.id] = JSON.stringify(r); return Promise.resolve(); }
    return open().catch(function () { mem = mem || {}; return null; }).then(function (db) {
      if (!db) return update(id, fn);
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, 'readwrite'), st = t.objectStore(STORE);
        var g = st.get(id);
        g.onsuccess = function () { var r = fn(g.result); if (r) st.put(r); };
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  /* ---------- 設定 ---------- */
  var DEFAULTS = {
    newlines: 2,          // ストーリーエディターで台詞を分ける改行の数
    includeMono: true,    // 書き出しにモノローグを含める
    includeSfx: false,    // 書き出しに描き文字を含める
    autoSync: true,
    penColor: '#222222',
    penSize: 4,
    stabilizer: 1,        // 手ぶれ補正 0なし 1弱 2中 3強
    eraserSize: 28,
    showOrderNumbers: false, // 吹き出しの読む順の番号(初期は出さない)
    template: 't3'
  };
  var KEY = 'komacho-settings';
  var cache = null;
  KC.settings = {
    get: function () {
      if (cache) return cache;
      var s = {};
      try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
      cache = Object.assign({}, DEFAULTS, s);
      return cache;
    },
    set: function (patch) {
      cache = Object.assign({}, KC.settings.get(), patch);
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* 保存できない環境では今回だけ有効 */ }
      return cache;
    }
  };
})();
