/* コマ帖 — Googleドライブ同期
   ・保存先は「アプリ専用フォルダ(appDataFolder)」。ドライブの普通の画面には出ず、ほかのファイルにも触れない
   ・ネーム1冊 = JSONファイル1つ
   ・Web版: Google Identity Services でログイン
   ・PC版(Electron): メイン側がブラウザ経由でログインし、通信もメイン側で行う */
(function () {
  'use strict';
  var KC = (window.KC = window.KC || {});
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var API = 'https://www.googleapis.com/drive/v3/files';
  var UP = 'https://www.googleapis.com/upload/drive/v3/files';
  var native = window.komachoNative || null;

  var token = null, tokenExp = 0, tokenClient = null, gisLoading = null;
  var listeners = [];
  var state = { signedIn: false, busy: false, lastSync: 0, error: '', email: '' };

  function emit() { listeners.forEach(function (f) { f(state); }); }
  function set(p) { Object.assign(state, p); emit(); }

  function clientId() { return (window.KOMACHO_CONFIG && window.KOMACHO_CONFIG.googleClientId) || ''; }

  KC.drive = {
    state: state,
    onChange: function (f) { listeners.push(f); },
    available: function () {
      if (native) return true;
      return !!clientId() && /^https?:$/.test(location.protocol);
    },
    whyUnavailable: function () {
      if (native) return '';
      if (!/^https?:$/.test(location.protocol)) return 'このページはファイルとして開かれているため、同期できません。';
      if (!clientId()) return 'config.js に GoogleのクライアントIDが入っていません(READMEの手順2)。';
      return '';
    },
    // ポップアップなしで通信できる状態か(Web版はログイン後1時間ほど)
    hasToken: function () {
      if (native) return state.signedIn;
      return !!token && tokenExp > Date.now() + 60000;
    },
    init: init,
    signIn: signIn,
    signOut: signOut,
    sync: sync
  };

  function init() {
    if (native) {
      return native.authStatus().then(function (s) {
        set({ signedIn: !!s.signedIn, email: s.email || '' });
      }).catch(function () {});
    }
    try {
      var saved = JSON.parse(sessionStorage.getItem('komacho-token') || 'null');
      if (saved && saved.exp > Date.now() + 60000) { token = saved.t; tokenExp = saved.exp; }
    } catch (e) { /* なし */ }
    var was = false;
    try { was = localStorage.getItem('komacho-signed-in') === '1'; } catch (e) { /* なし */ }
    set({ signedIn: !!token || was });
    return Promise.resolve();
  }

  /* ---------- Web版のログイン ---------- */
  function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { gisLoading = null; rej(new Error('Googleのログイン部品を読み込めませんでした。ネット接続を確認してください。')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  function requestToken(interactive) {
    return loadGIS().then(function () {
      return new Promise(function (res, rej) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: function (r) {
            if (r.error) { rej(new Error(r.error_description || r.error)); return; }
            token = r.access_token;
            tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
            try {
              sessionStorage.setItem('komacho-token', JSON.stringify({ t: token, exp: tokenExp }));
              localStorage.setItem('komacho-signed-in', '1');
            } catch (e) { /* なし */ }
            res(token);
          },
          error_callback: function (e) {
            rej(new Error(e && e.type === 'popup_closed' ? 'ログインの画面が閉じられました。' :
              e && e.type === 'popup_failed_to_open' ? 'ログインの画面を開けませんでした。ポップアップを許可してください。' : 'ログインできませんでした。'));
          }
        });
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
    });
  }

  function getToken(interactive) {
    if (token && tokenExp > Date.now() + 60000) return Promise.resolve(token);
    return requestToken(interactive);
  }

  function signIn() {
    if (native) {
      set({ busy: true, error: '' });
      return native.signIn().then(function (s) {
        set({ signedIn: !!s.signedIn, email: s.email || '', busy: false });
      }, function (e) { set({ busy: false, error: msg(e) }); throw e; });
    }
    set({ busy: true, error: '' });
    return requestToken(true).then(function () {
      set({ signedIn: true, busy: false });
    }, function (e) { set({ busy: false, error: msg(e) }); throw e; });
  }

  function signOut() {
    if (native) return native.signOut().then(function () { set({ signedIn: false, email: '' }); });
    if (token && window.google && google.accounts) { try { google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* なし */ } }
    token = null; tokenExp = 0;
    try { sessionStorage.removeItem('komacho-token'); localStorage.removeItem('komacho-signed-in'); } catch (e) { /* なし */ }
    set({ signedIn: false });
    return Promise.resolve();
  }

  function msg(e) { return (e && e.message) || String(e); }

  /* ---------- 通信 ---------- */
  // 返り値: { status, text }
  function request(opt, interactive) {
    if (native) return native.driveRequest(opt);
    return getToken(interactive).then(function (t) {
      var h = Object.assign({ Authorization: 'Bearer ' + t }, opt.headers || {});
      return fetch(opt.url, { method: opt.method || 'GET', headers: h, body: opt.body }).then(function (r) {
        return r.text().then(function (text) {
          if (r.status === 401) { token = null; tokenExp = 0; }
          return { status: r.status, text: text };
        });
      });
    });
  }
  function json(r, what) {
    if (r.status < 200 || r.status >= 300) {
      var m = '';
      try { m = JSON.parse(r.text).error.message; } catch (e) { m = r.text.slice(0, 120); }
      throw new Error(what + 'に失敗しました(' + r.status + '): ' + m);
    }
    return r.text ? JSON.parse(r.text) : {};
  }

  function listRemote(interactive) {
    var all = [];
    function page(tok) {
      var url = API + '?spaces=appDataFolder&pageSize=1000&fields=' +
        encodeURIComponent('nextPageToken,files(id,name,appProperties)') +
        '&q=' + encodeURIComponent("name contains 'komacho-'") + (tok ? '&pageToken=' + encodeURIComponent(tok) : '');
      return request({ url: url }, interactive).then(function (r) {
        var j = json(r, '一覧の取得');
        all = all.concat(j.files || []);
        return j.nextPageToken ? page(j.nextPageToken) : all;
      });
    }
    return page(null);
  }

  function download(id) {
    return request({ url: API + '/' + id + '?alt=media' }).then(function (r) { return json(r, 'ダウンロード'); });
  }

  function upload(doc, remoteId) {
    var boundary = 'komacho' + Math.random().toString(36).slice(2);
    var meta = { name: 'komacho-' + doc.id + '.json', appProperties: { docId: doc.id, updatedAt: String(doc.updatedAt), deleted: doc.deleted ? '1' : '0' } };
    if (!remoteId) meta.parents = ['appDataFolder'];
    var body = JSON.stringify(stripLocal(doc));
    var payload = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--' + boundary + '--';
    return request({
      url: (remoteId ? UP + '/' + remoteId : UP) + '?uploadType=multipart&fields=id',
      method: remoteId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: payload
    }).then(function (r) { return json(r, 'アップロード').id; });
  }

  function stripLocal(doc) {
    var d = Object.assign({}, doc);
    delete d.syncedAt; delete d.remoteId;
    return d;
  }

  /* ---------- 同期 ----------
     updatedAt = 最後に編集した時刻、syncedAt = 最後に同期したときの updatedAt
     新しく編集されたほうを使う */
  var running = null;
  function sync(opt) {
    opt = opt || {};
    if (running) return running;
    if (!KC.drive.available()) return Promise.reject(new Error(KC.drive.whyUnavailable()));
    set({ busy: true, error: '' });
    var changed = 0;
    running = Promise.all([KC.store.all(), listRemote(!!opt.interactive)]).then(function (res) {
      var locals = {}, remotes = {};
      res[0].forEach(function (d) { locals[d.id] = d; });
      res[1].forEach(function (f) {
        var id = f.appProperties && f.appProperties.docId;
        if (!id) return;
        var prev = remotes[id];
        if (!prev || Number(f.appProperties.updatedAt) > Number(prev.appProperties.updatedAt)) remotes[id] = f;
      });
      var ids = Object.keys(Object.assign({}, locals, remotes));
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () { return syncOne(locals[id], remotes[id]); });
      });
      return chain;
    }).then(function () {
      set({ busy: false, signedIn: true, lastSync: Date.now() });
      running = null;
      return changed;
    }, function (e) {
      running = null;
      set({ busy: false, error: msg(e) });
      throw e;
    });
    return running;

    function syncOne(L, R) {
      if (L && !R) {
        if (L.deleted && !L.remoteId) return KC.store.purge(L.id);
        return push(L, null); // ドライブに無い(新規、または向こうで消えた)ので新しく上げる
      }
      if (!L && R) {
        if (R.appProperties.deleted === '1') return;
        return pull(R);
      }
      var lu = L.updatedAt || 0, ru = Number(R.appProperties.updatedAt) || 0, s = L.syncedAt || 0;
      if (lu === ru) {
        if (L.remoteId !== R.id || (L.syncedAt || 0) < lu) return KC.store.markSynced(L.id, lu, R.id);
        return;
      }
      // 新しく編集されたほうを使う(競合コピーは作らない)
      if (lu > ru) return push(L, R.id);
      return pull(R, L);
    }

    function push(doc, remoteId) {
      changed++;
      return upload(doc, remoteId || null).then(function (id) {
        return KC.store.markSynced(doc.id, doc.updatedAt, id);
      });
    }
    function pull(R, L) {
      changed++;
      var expected = L ? L.updatedAt || 0 : 0;
      return download(R.id).then(function (d) {
        d.remoteId = R.id;
        d.updatedAt = Number(R.appProperties.updatedAt) || d.updatedAt;
        d.syncedAt = d.updatedAt;
        if (R.appProperties.deleted === '1') d.deleted = true;
        return KC.store.putIfNotNewer(d, expected).then(function (ok) { if (ok && opt.onPulled) opt.onPulled(d, expected); });
      });
    }
  }
})();
