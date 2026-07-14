/* ============================================================
   MODEL — Halaman Data Kerja Sama
   State + akses data + logika (filter/urut/paginasi/seleksi/CRUD).
   TANPA DOM — murni data & aturan, bisa diuji terpisah dari tampilan.
   Controller (data.js) yang menyambungkannya ke DOM.
   ============================================================ */
(function () {
  var api = SIMKERMA.api, gate = SIMKERMA.gate;
  var LSKEY = 'simkerma_data_state_v2';

  var M = window.DataModel = {
    all: [], view: [],
    q: '', filters: {}, sortKey: 'sisa', sortDir: 1, page: 1, perPage: 25,
    hidden: new Set(), selected: new Set(), expanded: new Set(),
    // Meta kolom: label, filter ('select'/'year'), cls responsif, num (urut angka), nowrap, hidden (default).
    // Render sel = urusan View/Controller. Filter dinamis mengikuti kolom yang tampil.
    columns: [
      { key: 'namaMitra', label: 'Mitra' },
      { key: 'jenisMitra', label: 'Jenis Mitra', filter: 'select' },
      { key: 'bentuk', label: 'Bentuk', filter: 'select', cls: 'hide-md' },
      { key: 'nomorSurat', label: 'No. Surat', nowrap: true, hidden: true },
      { key: 'pengguna', label: 'Pengguna', filter: 'select', cls: 'hide-md' },
      { key: 'wilayah', label: 'Wilayah', filter: 'select', hidden: true },
      { key: 'mulai', label: 'Mulai', filter: 'year', nowrap: true, hidden: true },
      { key: 'berakhir', label: 'Berakhir', nowrap: true },
      { key: 'sisa', label: 'Sisa', num: true, nowrap: true },
      { key: 'biaya', label: 'Biaya', num: true, nowrap: true, hidden: true },
      { key: 'status', label: 'Status', filter: 'select' }
    ],

    // ---- Akses data ----
    loadData: function () {
      return api.get('getKerjasama').then(function (j) {
        if (j.error) throw new Error(j.error);
        M.setData(j.data || []); return j;
      });
    },
    setData: function (arr) {
      this.all = (arr || []).map(function (k) { k._tahun = String(k.mulai).slice(0, 4); return k; });
      this.compute();
    },
    uniq: function (key) {
      var seen = {}, out = [];
      this.all.forEach(function (x) { var v = x[key]; if (v !== '' && v != null && !seen[v]) { seen[v] = 1; out.push(v); } });
      return out.sort();
    },

    // ---- Filter (generik, mengikuti kolom) + urut → view ----
    colOf: function (key) { for (var i = 0; i < this.columns.length; i++) if (this.columns[i].key === key) return this.columns[i]; return null; },
    filterCols: function () { var h = this.hidden; return this.columns.filter(function (c) { return c.filter && !h.has(c.key); }); },
    yearsList: function () { var s = {}, out = []; this.all.forEach(function (k) { var y = String(k.mulai).slice(0, 4); if (/^\d{4}$/.test(y) && !s[y]) { s[y] = 1; out.push(y); } }); return out.sort().reverse(); },
    compute: function () {
      var q = this.q, f = this.filters, self = this;
      var v = this.all.filter(function (k) {
        for (var key in f) {
          var val = f[key]; if (!val) continue;
          var c = self.colOf(key);
          if (c && c.filter === 'year') { if (String(k.mulai).slice(0, 4) !== val) return false; }
          else if (String(k[key] == null ? '' : k[key]) !== val) return false;
        }
        if (q) {
          var hay = (k.namaMitra + ' ' + k.nomorSurat + ' ' + k.pengguna + ' ' + k.jenisMitra + ' ' + k.bentuk + ' ' + k.ruangLingkup + ' ' + (k.wilayah || '')).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      var col = this.colOf(this.sortKey) || {};
      var dir = this.sortDir;
      v.sort(function (a, b) {
        var x = a[M.sortKey], y = b[M.sortKey];
        if (col.num) { x = Number(x); y = Number(y); if (isNaN(x)) x = 1e15; if (isNaN(y)) y = 1e15; return (x - y) * dir; }
        return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y)) * dir;
      });
      this.view = v;
    },

    // ---- Setter (mutasi state; controller yang render) ----
    setSearch: function (q) { this.q = (q || '').toLowerCase(); this.page = 1; this.compute(); },
    setFilter: function (id, val) { this.filters[id] = val || ''; this.page = 1; this.compute(); },
    setSort: function (key) { if (this.sortKey === key) this.sortDir *= -1; else { this.sortKey = key; this.sortDir = 1; } this.compute(); },
    setPage: function (p) { this.page = Math.max(1, Math.min(this.pages(), p)); },
    setPerPage: function (n) { this.perPage = n; this.page = 1; },
    resetFilters: function () { this.q = ''; this.filters = {}; this.page = 1; this.compute(); },

    // ---- Paginasi & ringkasan ----
    pages: function () { return Math.max(1, Math.ceil(this.view.length / this.perPage)); },
    slice: function () { if (this.page > this.pages()) this.page = this.pages(); var s = (this.page - 1) * this.perPage; return this.view.slice(s, s + this.perPage); },
    range: function () { var s = (this.page - 1) * this.perPage; return { from: this.view.length ? s + 1 : 0, to: Math.min(s + this.perPage, this.view.length), total: this.view.length, all: this.all.length }; },
    totalNilai: function () { return this.view.reduce(function (s, k) { return s + (Number(k.biaya) || 0); }, 0); },

    // ---- Kolom / seleksi / expand ----
    visibleCols: function () { var h = this.hidden; return this.columns.filter(function (c) { return !h.has(c.key); }); },
    toggleCol: function (key, show) { if (show) this.hidden.delete(key); else { this.hidden.add(key); delete this.filters[key]; } this.compute(); },
    toggleExpand: function (id) { this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id); },
    toggleSelect: function (id, on) { on ? this.selected.add(id) : this.selected.delete(id); },
    selectView: function (on) { var self = this; this.view.forEach(function (k) { on ? self.selected.add(k.id) : self.selected.delete(k.id); }); },
    clearSelect: function () { this.selected.clear(); },
    selectedInView: function () { var s = this.selected; return this.view.filter(function (k) { return s.has(k.id); }).map(function (k) { return k.id; }); },

    // ---- CRUD (hapus) ----
    del: function (id) {
      return api.post({ action: 'deleteKerjasama', id: id, password: gate.pw }).then(function (res) {
        if (res.status === 'success') { M.all = M.all.filter(function (x) { return x.id !== id; }); M.selected.delete(id); M.compute(); }
        return res;
      });
    },
    bulkDel: function (ids, onProgress) {
      var ok = 0, authFail = false, i = 0;
      function next() {
        if (i >= ids.length || authFail) return Promise.resolve({ ok: ok, authFail: authFail });
        var id = ids[i++];
        return api.post({ action: 'deleteKerjasama', id: id, password: gate.pw }).then(function (res) {
          if (res.status === 'success') { ok++; M.all = M.all.filter(function (x) { return x.id !== id; }); M.selected.delete(id); }
          else if (res.auth) authFail = true;
        }).catch(function () { }).then(function () { if (onProgress) onProgress(i, ids.length); return next(); });
      }
      return next().then(function (r) { M.compute(); return r; });
    },

    // ---- Data ekspor (baris mentah, bukan HTML) ----
    exportHead: ['Mitra', 'Jenis Mitra', 'Wilayah', 'Bentuk', 'Nomor Surat', 'Ruang Lingkup', 'Pengguna', 'Jabatan', 'Biaya', 'Masa Berlaku', 'Mulai', 'Berakhir', 'Sisa Hari', 'Status', 'Jenis Entri', 'Dokumen Induk', 'Catatan', 'Link Berkas'],
    exportRows: function () {
      return this.view.map(function (k) {
        return [k.namaMitra, k.jenisMitra, k.wilayah, k.bentuk, k.nomorSurat, k.ruangLingkup, k.pengguna, k.jabatan, Number(k.biaya) || 0, k.masaBerlaku, k.mulai, k.berakhir, k.sisa, k.status, k.jenisEntri, k.dokumenInduk, k.catatan, k.file];
      });
    },

    // ---- Simpan/pulihkan state (localStorage) ----
    persist: function () {
      try {
        localStorage.setItem(LSKEY, JSON.stringify({
          q: this.q, f: this.filters, sortKey: this.sortKey, sortDir: this.sortDir,
          perPage: this.perPage, page: this.page, hidden: Array.from(this.hidden)
        }));
      } catch (e) { }
    },
    restore: function () {
      var s; try { s = JSON.parse(localStorage.getItem(LSKEY) || 'null'); } catch (e) { }
      if (!s) return;
      if (s.q != null) this.q = s.q;
      if (s.f) this.filters = s.f;
      if (s.sortKey) { this.sortKey = s.sortKey; this.sortDir = s.sortDir || 1; }
      if (s.perPage) this.perPage = s.perPage;
      if (s.page) this.page = s.page;
      if (s.hidden) this.hidden = new Set(s.hidden);
      this.compute();
    }
  };

  // Kolom yang default tersembunyi (bila belum ada state tersimpan)
  M.hidden = new Set(M.columns.filter(function (c) { return c.hidden; }).map(function (c) { return c.key; }));
})();
