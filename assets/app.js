/* ============================================================
   SIMKERMA — Modul bersama (komponen "vanilla", dipakai semua halaman)
   build.js meng-inject URL Google Apps Script ke variabel GAS_URL di bawah.
   Menyediakan: SIMKERMA.{esc,rupiah,api,header,setSub,setActions,
   badge,sisaText,overlay,gate,msg}
   ============================================================ */
(function () {
  var GAS_URL = "__GAS_URL__";
  var BUG_URL = "__BUG_URL__";
  var RATING_URL = "__RATING_URL__";
  var RATING_OVERRIDE_PW = "__RATING_OVERRIDE_PASSWORD__";
  var SURVEY_AKTIF = "__SURVEY_AKTIF__" !== "0";   // '0' = overlay survei tahunan dimatikan
  var SURVEY_MONTH = 10;                            // 0-indexed → 10 = November
  function _cfg(v) { return v && v.indexOf('__') !== 0; } // placeholder belum di-inject?
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
    try { var s = JSON.parse(localStorage.getItem('simkerma_auth') || 'null'); if (s && s.exp > Date.now()) return s.pw; } catch (e) { }
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
        self.pw = v; try { localStorage.setItem('simkerma_auth', JSON.stringify({ pw: v, exp: Date.now() + SESI_MS })); } catch (e) { }
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
    clear: function () { this.pw = ''; try { localStorage.removeItem('simkerma_auth'); } catch (e) { } }
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
      items: [], filtered: [], hi: 0, open: false,
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
        this.filtered = this.items.filter(function (it) { return !q || it.l.toLowerCase().indexOf(q) > -1; });
        var idx = -1; for (var i = 0; i < this.filtered.length; i++) { if (this.filtered[i].v === sel.value) { idx = i; break; } }
        this.hi = idx > -1 ? idx : 0;
        this.paint();
      },
      paint: function () {
        var self = this, cur = sel.value;
        panel.innerHTML = this.filtered.length ? this.filtered.map(function (it, i) {
          return '<div class="ss-opt' + (it.v === cur ? ' active' : '') + (i === self.hi ? ' hi' : '') + '" data-v="' + encodeURIComponent(it.v) + '">' + S.esc(it.l) + '</div>';
        }).join('') : '<div class="ss-empty">Tidak ada pilihan</div>';
      },
      move: function (d) {
        if (!this.filtered.length) return;
        this.hi = Math.max(0, Math.min(this.filtered.length - 1, (this.hi || 0) + d));
        this.paint(); var el = panel.querySelector('.ss-opt.hi'); if (el) el.scrollIntoView({ block: 'nearest' });
      },
      openP: function () { this.open = true; wrap.classList.add('open'); this.render(''); setTimeout(function () { input.select(); }, 0); },
      closeP: function () { this.open = false; wrap.classList.remove('open'); this.sync(); },
      pick: function (v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); this.closeP(); }
    };
    input.addEventListener('focus', function () { api.openP(); });
    input.addEventListener('input', function () { if (!api.open) api.openP(); api.render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); api.open ? api.move(1) : api.openP(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); api.move(-1); }
      else if (e.key === 'Enter') { if (api.open && api.filtered[api.hi]) { e.preventDefault(); api.pick(api.filtered[api.hi].v); } }
      else if (e.key === 'Escape') { api.closeP(); input.blur(); }
    });
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

  // ---- Aduan (Lapor Bug + Nilai Aplikasi) & survei tahunan (self-inject, semua halaman) ----
  S.aduan = {
    _key: function () { return 'simkerma_rating_done_' + new Date().getFullYear(); },
    markDone: function () { try { localStorage.setItem(this._key(), '1'); } catch (e) { } },
    _isDone: function () { try { return localStorage.getItem(this._key()) === '1'; } catch (e) { return false; } },
    mount: function () {
      if (document.getElementById('aduanWrap')) return;
      var self = this, bugOk = _cfg(BUG_URL), rateOk = _cfg(RATING_URL);
      var wrap = document.createElement('div'); wrap.id = 'aduanWrap';
      wrap.innerHTML =
        '<div id="aduanMenu">' +
        '<a id="aduanBug" href="' + (bugOk ? BUG_URL : '#') + '" target="_blank" rel="noopener">' +
        '<span class="ad-ic">🐛</span><span class="ad-tx"><b>Lapor Bug</b><small>Laporkan masalah / error</small></span></a>' +
        '<a id="aduanRate" href="' + (rateOk ? RATING_URL : '#') + '" target="_blank" rel="noopener">' +
        '<span class="ad-ic">⭐</span><span class="ad-tx"><b>Nilai Aplikasi</b><small>Beri penilaian &amp; saran</small></span></a>' +
        '</div>' +
        '<button id="btnAduan" type="button" title="Aduan &amp; Penilaian Aplikasi"><i class="fa-solid fa-comment-dots"></i> Aduan</button>';
      document.body.appendChild(wrap);
      wrap.querySelector('#btnAduan').addEventListener('click', function (e) { e.stopPropagation(); wrap.classList.toggle('open'); });
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
      wrap.querySelector('#aduanBug').addEventListener('click', function (e) {
        if (!bugOk) { e.preventDefault(); alert('Form Lapor Bug belum dikonfigurasi.\nSet env BUG_URL di Vercel.'); }
      });
      wrap.querySelector('#aduanRate').addEventListener('click', function (e) {
        if (!rateOk) { e.preventDefault(); alert('Form Penilaian belum dikonfigurasi.\nSet env RATING_URL di Vercel.'); return; }
        self.markDone(); wrap.classList.remove('open');
      });
      this._maybeOverlay();
    },
    // Overlay wajib muncul sekali/tahun (mulai November) — bisa dimatikan via SURVEY_AKTIF.
    _maybeOverlay: function () {
      if (!SURVEY_AKTIF || !_cfg(RATING_URL)) return;
      if (new Date().getMonth() < SURVEY_MONTH) return;
      if (this._isDone()) return;
      this._showOverlay();
    },
    _showOverlay: function () {
      var self = this;
      var ov = document.createElement('div'); ov.id = 'survOverlay';
      ov.innerHTML = '<div class="surv-modal">' +
        '<div class="surv-ic">⭐</div>' +
        '<h2>Penilaian Tahunan SIMKERMA</h2>' +
        '<p>Tahun ini hampir berakhir. Mohon luangkan 5–10 menit untuk menilai aplikasi SIMKERMA — ' +
        'hasilnya menjadi bahan laporan tahunan &amp; arah pengembangan.</p>' +
        '<div class="surv-act">' +
        '<a class="btn primary" id="survGo" href="' + RATING_URL + '" target="_blank" rel="noopener">📝 Isi Survey Sekarang</a>' +
        '<button type="button" class="btn outline" id="survOverride">🔒 Override (Admin)</button>' +
        '</div>' +
        '<small class="muted">Muncul sekali per tahun (mulai November) sebagai bahan laporan tahunan.</small>' +
        '</div>';
      document.body.appendChild(ov);
      ov.querySelector('#survGo').addEventListener('click', function () { self.markDone(); self._hideOverlay(); });
      ov.querySelector('#survOverride').addEventListener('click', function () { self._override(); });
    },
    _hideOverlay: function () { var ov = document.getElementById('survOverlay'); if (ov) ov.remove(); },
    _override: function () {
      if (!_cfg(RATING_OVERRIDE_PW)) { alert('Kata sandi override belum dikonfigurasi.'); return; }
      var pw = prompt('Kata sandi admin untuk melewati survei tahun ini:');
      if (pw === null) return;
      if (pw === RATING_OVERRIDE_PW) { this.markDone(); this._hideOverlay(); }
      else alert('Kata sandi salah.');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { S.aduan.mount(); });
  else S.aduan.mount();
})();
