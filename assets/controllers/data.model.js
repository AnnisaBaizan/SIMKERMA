/* ============================================================
   MODEL — Halaman Data Kerja Sama
   State + akses data + logika (filter/urut/paginasi/seleksi/CRUD).
   TANPA DOM — murni data & aturan, bisa diuji terpisah dari tampilan.
   Controller (data.js) yang menyambungkannya ke DOM.
   ============================================================ */
(function () {
  var api = SIMKERMA.api, gate = SIMKERMA.gate;
  var LSKEY = 'simkerma_data_state';

  var M = window.DataModel = {
    all: [], view: [],
    q: '', filters: {}, sortKey: 'sisa', sortDir: 1, page: 1, perPage: 25,
    hidden: new Set(), selected: new Set(), expanded: new Set(),
    // Meta kolom (untuk header/urut/visibilitas). Render sel = urusan View/Controller.
    columns: [
      { key: 'namaMitra', label: 'Mitra' },
      { key: 'bentuk', label: 'Bentuk', cls: 'hide-md' },
      { key: 'pengguna', label: 'Pengguna', cls: 'hide-md' },
      { key: 'berakhir', label: 'Berakhir', nowrap: true },
      { key: 'sisa', label: 'Sisa', num: true, nowrap: true },
      { key: 'status', label: 'Status' }
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

    // ---- Filter + urut → view ----
    compute: function () {
      var q = this.q, f = this.filters;
      var v = this.all.filter(function (k) {
        if (f.fStatus && k.status !== f.fStatus) return false;
        if (f.fJenis && k.jenisMitra !== f.fJenis) return false;
        if (f.fPengguna && k.pengguna !== f.fPengguna) return false;
        if (f.fBentuk && k.bentuk !== f.fBentuk) return false;
        if (f.fTahun && k._tahun !== f.fTahun) return false;
        if (q) {
          var hay = (k.namaMitra + ' ' + k.nomorSurat + ' ' + k.pengguna + ' ' + k.jenisMitra + ' ' + k.bentuk + ' ' + k.ruangLingkup).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      var col = this.columns.filter(function (c) { return c.key === M.sortKey; })[0] || {};
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
    toggleCol: function (key, show) { show ? this.hidden.delete(key) : this.hidden.add(key); },
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
        }).catch(function () {}).then(function () { if (onProgress) onProgress(i, ids.length); return next(); });
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
      } catch (e) {}
    },
    restore: function () {
      var s; try { s = JSON.parse(localStorage.getItem(LSKEY) || 'null'); } catch (e) {}
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
})();
