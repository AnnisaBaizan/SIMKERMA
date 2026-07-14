/* ============================================================
   SIMKERMA — Modul bersama (komponen "vanilla", dipakai semua halaman)
   build.js meng-inject URL Google Apps Script ke variabel GAS_URL di bawah.
   Menyediakan: SIMKERMA.{esc,rupiah,api,header,setSub,setActions,
   badge,sisaText,overlay,gate,msg}
   ============================================================ */
(function () {
  var GAS_URL = "__GAS_URL__";
  var S = window.SIMKERMA = { GAS_URL: GAS_URL };

  // ---- Util ----
  S.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  S.rupiah = function (n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); };
  S.sisaText = function (sisa) {
    if (sisa === '' || sisa == null) return '—';
    return sisa < 0 ? Math.abs(sisa) + ' hr lalu' : sisa + ' hr';
  };
  window.esc = S.esc; // alias praktis

  // ---- API (GAS Web App) ----
  S.api = {
    get: function (action, params) {
      var q = Object.assign({ action: action }, params || {});
      return fetch(GAS_URL + '?' + new URLSearchParams(q).toString()).then(function (r) { return r.json(); });
    },
    post: function (payload) {
      return fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
    }
  };

  // ---- Header / navigasi (komponen) ----
  var NAV = [
    { k: 'dashboard', label: '<i class="fa-solid fa-gauge-high"></i> Dashboard', href: 'index.html' },
    { k: 'data', label: '<i class="fa-solid fa-table-list"></i> Data', href: 'data.html' },
    { k: 'input', label: '<i class="fa-solid fa-plus"></i> Input', href: 'form.html' }
  ];
  S.header = function (active, opts) {
    opts = opts || {};
    var host = document.getElementById('appbar');
    if (!host) return;
    var links = NAV.map(function (n) {
      return '<a class="navlink' + (n.k === active ? ' active' : '') + '" href="' + n.href + '">' + n.label + '</a>';
    }).join('');
    host.innerHTML =
      '<div class="wrap bar">' +
        '<div class="brand"><span class="logo">S</span><div>' +
          '<div class="btitle">' + (opts.title || 'SIMKERMA') + '</div>' +
          '<div class="bsub" id="appsub">' + (opts.subtitle || 'Monitoring Masa Berlaku Kerja Sama') + '</div>' +
        '</div></div>' +
        '<nav class="nav">' + links + '</nav>' +
        '<div class="actions" id="page-actions"></div>' +
      '</div>';
  };
  S.setSub = function (t) { var e = document.getElementById('appsub'); if (e && t) e.textContent = t; };
  S.setActions = function (html) { var e = document.getElementById('page-actions'); if (e) e.innerHTML = html; };

  // ---- Badge status ----
  S.badge = function (status) {
    var c = status === 'Habis' ? 'b-red' : status === 'Segera Berakhir' ? 'b-amber' : status === 'Aktif' ? 'b-green' : 'b-gray';
    return '<span class="badge ' + c + '">' + S.esc(status) + '</span>';
  };

  // ---- Overlay proses (self-inject) ----
  var _ov = null;
  S.overlay = function (on, text) {
    if (!_ov) {
      _ov = document.createElement('div'); _ov.className = 'overlay';
      _ov.innerHTML = '<div class="spinner-lg"></div><div class="ovtext"></div><div class="ovsub">Mohon tunggu, jangan tutup halaman.</div>';
      document.body.appendChild(_ov);
    }
    if (text) _ov.querySelector('.ovtext').textContent = text;
    _ov.style.display = on ? 'flex' : 'none';
  };

  // ---- Gerbang kata sandi (self-inject modal) ----
  // Sesi login PERSISTEN 1 hari (localStorage) — sekali login, pindah halaman/edit tak perlu login lagi.
  var SESI_MS = 24 * 60 * 60 * 1000;
  function _loadPw() {
    try { var s = JSON.parse(localStorage.getItem('simkerma_auth') || 'null'); if (s && s.exp > Date.now()) return s.pw; } catch (e) {}
    return '';
  }
  S.gate = {
    pw: _loadPw(),
    _m: null, _cb: null, _mandatory: false,
    _ensure: function () {
      if (this._m) return; var self = this;
      var m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<div class="box">' +
        '<div class="gload"><div class="spin"></div><div class="gloadtext">Memuat…</div></div>' +
        '<div class="gmain"><div class="glock"><i class="fa-solid fa-lock"></i></div>' +
          '<h3>Masuk Admin</h3><p class="muted gsub">Kata sandi untuk menambah/ubah/hapus data.</p>' +
          '<input type="password" class="gpw" placeholder="Kata sandi" autocomplete="current-password"/>' +
          '<div class="gmsg"></div>' +
          '<div class="grow"><button class="btn outline gcancel" style="flex:1">Batal</button>' +
          '<button class="btn primary gok" style="flex:1">Masuk</button></div></div></div>';
      document.body.appendChild(m); this._m = m;
      var inp = m.querySelector('.gpw'), msg = m.querySelector('.gmsg');
      function submit() {
        var v = inp.value.trim(); if (!v) { msg.textContent = 'Kata sandi belum diisi'; return; }
        self.pw = v; try { localStorage.setItem('simkerma_auth', JSON.stringify({ pw: v, exp: Date.now() + SESI_MS })); } catch (e) {}
        inp.value = ''; self.close();
        var cb = self._cb; self._cb = null; if (cb) cb();
      }
      m.querySelector('.gok').onclick = submit;
      m.querySelector('.gcancel').onclick = function () { self.close(); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    },
    _view: function (loading) {
      this._m.querySelector('.gload').style.display = loading ? '' : 'none';
      this._m.querySelector('.gmain').style.display = loading ? 'none' : '';
    },
    // Tampilkan popup dalam keadaan "loading" (dipakai saat data sedang dimuat)
    loading: function (text) {
      this._ensure(); this._mandatory = true;
      this._m.querySelector('.gloadtext').textContent = text || 'Memuat…';
      this._view(true); this._m.classList.add('on');
    },
    // Tampilkan popup login. opts.mandatory = true → tanpa tombol Batal (wajib login).
    prompt: function (message, cb, opts) {
      opts = opts || {}; this._ensure(); this._cb = cb || null; this._mandatory = !!opts.mandatory;
      this._m.querySelector('.gsub').textContent = opts.sub || 'Masukkan kata sandi untuk melanjutkan.';
      this._m.querySelector('.gmsg').textContent = message || '';
      this._m.querySelector('.gcancel').style.display = this._mandatory ? 'none' : '';
      this._view(false); this._m.classList.add('on');
      var inp = this._m.querySelector('.gpw'); setTimeout(function () { inp.focus(); }, 60);
    },
    close: function () { if (this._m) this._m.classList.remove('on'); },
    clear: function () { this.pw = ''; try { localStorage.removeItem('simkerma_auth'); } catch (e) {} }
  };

  // ---- Pesan inline (butuh elemen #msg) ----
  S.msg = function (type, html) {
    var m = document.getElementById('msg'); if (!m) return;
    m.className = 'msg ' + type; m.innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- Searchable select (bungkus <select> native jadi bisa dicari) ----
  // Nilai tetap tersimpan di <select> asli → kode .value & event 'change' tetap jalan.
  S.searchSelect = function (sel) {
    if (!sel) return null;
    if (sel._ss) { sel._ss.refresh(); return sel._ss; }
    sel.style.display = 'none';
    var wrap = document.createElement('div'); wrap.className = 'ss';
    wrap.innerHTML = '<div class="ss-field"><input class="ss-input" type="text" autocomplete="off" spellcheck="false"/>' +
      '<span class="ss-caret"><i class="fa-solid fa-chevron-down"></i></span></div><div class="ss-panel"></div>';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    var input = wrap.querySelector('.ss-input'), panel = wrap.querySelector('.ss-panel'), caret = wrap.querySelector('.ss-caret');
    input.placeholder = sel.getAttribute('data-ph') || 'Cari / pilih…';

    var api = {
      items: [], open: false,
      refresh: function () {
        this.items = Array.prototype.map.call(sel.options, function (o) { return { v: o.value, l: o.textContent }; });
        this.sync(); if (this.open) this.render(input.value);
      },
      sync: function () {
        var o = sel.options[sel.selectedIndex];
        input.value = (o && o.value !== '') ? o.textContent : '';
      },
      render: function (q) {
        q = (q || '').toLowerCase();
        var cur = sel.value, html = '';
        this.items.forEach(function (it) {
          if (q && it.l.toLowerCase().indexOf(q) === -1) return;
          html += '<div class="ss-opt' + (it.v === cur ? ' active' : '') + '" data-v="' + encodeURIComponent(it.v) + '">' + S.esc(it.l) + '</div>';
        });
        panel.innerHTML = html || '<div class="ss-empty">Tidak ada pilihan</div>';
      },
      openP: function () { this.open = true; wrap.classList.add('open'); this.render(''); setTimeout(function () { input.select(); }, 0); },
      closeP: function () { this.open = false; wrap.classList.remove('open'); this.sync(); },
      pick: function (v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); this.closeP(); }
    };
    input.addEventListener('focus', function () { api.openP(); });
    input.addEventListener('input', function () { if (!api.open) api.openP(); api.render(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { api.closeP(); input.blur(); } });
    panel.addEventListener('mousedown', function (e) { var o = e.target.closest('.ss-opt'); if (!o) return; e.preventDefault(); api.pick(decodeURIComponent(o.getAttribute('data-v'))); });
    caret.addEventListener('mousedown', function (e) { e.preventDefault(); if (api.open) { api.closeP(); } else { input.focus(); } });
    document.addEventListener('mousedown', function (e) { if (api.open && !wrap.contains(e.target)) api.closeP(); });

    sel._ss = api; api.refresh();
    return api;
  };
  // Enhance beberapa select sekaligus (by id). Aman dipanggil berulang (auto-refresh).
  S.searchify = function (ids) {
    (ids || []).forEach(function (id) { S.searchSelect(document.getElementById(id)); });
  };
})();
