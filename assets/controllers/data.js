/* ============================================================
   CONTROLLER — Halaman Data Kerja Sama
   Menyambungkan Model (DataModel) ↔ DOM: pasang event, baca input,
   panggil model, lalu render. Tidak menyimpan logika data sendiri.
   Render sel tabel (View) memakai SIMKERMA.ui + CELL di bawah.
   ============================================================ */
(function () {
  const ui = SIMKERMA.ui, gate = SIMKERMA.gate, M = DataModel, $ = id => document.getElementById(id);
  let authRequired = true;

  SIMKERMA.header('data', { subtitle: 'Data Kerja Sama' });
  $('pageActions').innerHTML =
    '<button class="btn outline" id="adminBtn"><i class="fa-solid fa-lock"></i> Admin</button>' +
    '<span class="menu" id="colMenu"><button class="btn outline" id="colBtn"><i class="fa-solid fa-table-columns"></i> Kolom <i class="fa-solid fa-caret-down" style="font-size:11px"></i></button><span class="items" id="colItems"></span></span>' +
    '<span class="menu" id="exportMenu"><button class="btn outline" id="exportBtn"><i class="fa-solid fa-file-export"></i> Export <i class="fa-solid fa-caret-down" style="font-size:11px"></i></button>' +
    '<span class="items"><button data-fmt="xlsx"><i class="fa-solid fa-file-excel" style="color:#15803d"></i> Excel (.xlsx)</button><button data-fmt="csv"><i class="fa-solid fa-file-csv" style="color:#2563eb"></i> CSV</button></span></span>';

  const FILTER_DEFS = [
    { id: 'fStatus', ph: 'Semua status', opts: ['Aktif', 'Segera Berakhir', 'Habis'] },
    { id: 'fJenis', ph: 'Semua jenis mitra', key: 'jenisMitra' },
    { id: 'fPengguna', ph: 'Semua pengguna', key: 'pengguna' },
    { id: 'fBentuk', ph: 'Semua bentuk', key: 'bentuk' },
    { id: 'fTahun', ph: 'Semua tahun mulai', key: '_tahun' }
  ];

  // ---- View: render sel tabel (highlight pakai M.q) ----
  function hl(s) {
    s = String(s == null ? '' : s); const q = M.q; if (!q) return esc(s);
    const i = s.toLowerCase().indexOf(q); if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  }
  function ell(v) { v = (v == null ? '' : String(v)); return '<span class="ell" title="' + esc(v) + '">' + hl(v) + '</span>'; }
  const CELL = {
    namaMitra: k => '<span style="font-weight:600">' + ell(k.namaMitra) + '</span>',
    bentuk: k => ell(k.bentuk), pengguna: k => ell(k.pengguna),
    berakhir: k => esc(k.berakhir), sisa: k => ui.sisa(k.sisa), status: k => ui.badge(k.status)
  };
  function isAdmin() { return document.body.classList.contains('admin'); }

  // ---- Load ----
  async function load() {
    const ld = $('loading'); ld.style.display = 'block'; ld.innerHTML = ui.skelData();
    try {
      await M.loadData();
      try { const f = await SIMKERMA.api.get('getFormData'); authRequired = !!f.authRequired; SIMKERMA.setSub(f.instansi || 'Data Kerja Sama'); } catch (e) { }
      buildFilters(); M.restore(); syncInputs(); buildColMenu(); render();
      ld.style.display = 'none'; $('content').style.display = 'block';
    } catch (e) {
      ld.innerHTML = '<div class="loading">❌ Gagal memuat: ' + esc(e.message) + '<br><span class="muted">Pastikan GAS_URL benar & Web App aktif.</span></div>';
    }
  }

  function buildFilters() {
    $('filters').innerHTML = FILTER_DEFS.map(f => {
      let o = f.opts; if (!o) { o = M.uniq(f.key); if (f.key === '_tahun') o = o.filter(v => /^\d{4}$/.test(v)).reverse(); }
      return ui.selectFilter(f.id, f.ph, o);
    }).join('');
    FILTER_DEFS.forEach(f => $(f.id).addEventListener('change', () => { M.setFilter(f.id, $(f.id).value); render(); }));
    SIMKERMA.searchify(FILTER_DEFS.map(f => f.id));
  }
  function syncInputs() { $('q').value = M.q; FILTER_DEFS.forEach(f => { const e = $(f.id); if (e) { e.value = M.filters[f.id] || ''; if (e._ss) e._ss.sync(); } }); }

  // ---- Render (orkestrasi View) ----
  function renderHead() {
    const admin = isAdmin();
    $('head').innerHTML =
      (admin ? '<th class="selcol"><input type="checkbox" id="selAll" title="Pilih semua (hasil filter)"></th>' : '') +
      '<th style="width:26px"></th>' + M.visibleCols().map(c => ui.thSort(c.key, c.label, c.cls)).join('') +
      '<th>Berkas</th>' + (admin ? '<th class="admincol">Aksi</th>' : '');
    M.visibleCols().forEach(c => { const el = $('ar-' + c.key); if (el) el.innerHTML = c.key === M.sortKey ? (M.sortDir > 0 ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>') : ''; });
    const sa = $('selAll'); if (sa) { const on = M.view.length > 0 && M.view.every(k => M.selected.has(k.id)); sa.checked = on; sa.indeterminate = !on && M.view.some(k => M.selected.has(k.id)); }
  }
  function rowHtml(k, admin) {
    const open = M.expanded.has(k.id), sel = M.selected.has(k.id);
    return '<tr data-id="' + esc(k.id) + '"' + (sel ? ' class="selrow"' : '') + '>' +
      (admin ? '<td class="selcol"><input type="checkbox" class="rsel" data-id="' + esc(k.id) + '"' + (sel ? ' checked' : '') + '></td>' : '') +
      '<td><span class="exp" style="color:var(--accent)"><i class="fa-solid fa-chevron-' + (open ? 'down' : 'right') + '"></i></span></td>' +
      M.visibleCols().map(c => { const cl = [c.cls, c.nowrap ? 'nowrap' : ''].filter(Boolean).join(' '); return '<td' + (cl ? ' class="' + cl + '"' : '') + '>' + CELL[c.key](k) + '</td>'; }).join('') +
      '<td style="text-align:center">' + ui.fileLink(k.file) + '</td>' +
      (admin ? '<td class="admincol"><span style="display:inline-flex;gap:6px">' +
        '<button class="btn outline" data-edit="' + esc(k.id) + '" title="Edit" style="padding:5px 9px"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="btn danger" data-del="' + esc(k.id) + '" title="Hapus" style="padding:5px 9px"><i class="fa-solid fa-trash"></i></button></span></td>' : '') +
      '</tr>';
  }
  function render() {
    const admin = isAdmin();
    renderHead();
    const slice = M.slice(), totalCols = (admin ? 1 : 0) + 1 + M.visibleCols().length + 1 + (admin ? 1 : 0);
    let html = '';
    slice.forEach(k => { html += rowHtml(k, admin); if (M.expanded.has(k.id)) html += ui.detailRow(k, totalCols); });
    $('body').innerHTML = html || ui.emptyRow(totalCols, 'Tidak ada data yang cocok.');
    const r = M.range();
    $('count').innerHTML = r.total
      ? 'Menampilkan <b>' + r.from + '–' + r.to + '</b> dari <b>' + r.total + '</b> kerja sama' + (r.total !== r.all ? (' <span style="opacity:.8">(difilter dari ' + r.all + ')</span>') : '') + ' · Total nilai: <b>' + SIMKERMA.rupiah(M.totalNilai()) + '</b>'
      : 'Tidak ada data yang cocok.';
    $('pager').innerHTML = ui.pager(M.page, M.pages());
    const ps = $('perPageSel'); if (ps) ps.value = String(M.perPage);
    renderChips(); renderBulk(); M.persist();
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function renderChips() {
    const box = $('fchips'); const items = [];
    if (M.q) items.push({ id: 'q', label: 'Pencarian', val: M.q });
    FILTER_DEFS.forEach(f => { if (M.filters[f.id]) items.push({ id: f.id, label: cap(f.ph.replace(/^Semua /, '')), val: M.filters[f.id] }); });
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="lbl">Filter aktif:</span>' +
      items.map(it => '<span class="fchip">' + esc(it.label) + ': <b>' + esc(it.val) + '</b> <button data-clear="' + it.id + '" title="Hapus"><i class="fa-solid fa-xmark"></i></button></span>').join('') +
      '<span class="fchip clear" data-clear="__all__"><i class="fa-solid fa-broom"></i> Bersihkan semua</span>';
  }
  function renderBulk() {
    const bar = $('bulkbar');
    if (!isAdmin() || M.selected.size === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '<span><i class="fa-solid fa-square-check"></i> <b>' + M.selected.size + '</b> baris dipilih</span>' +
      '<button class="btn danger" id="bulkDel"><i class="fa-solid fa-trash"></i> Hapus terpilih</button>' +
      '<button class="btn outline" id="bulkClear">Batal pilih</button>';
  }
  function buildColMenu() {
    $('colItems').innerHTML = M.columns.map(c =>
      '<label style="display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;font-size:13px;font-weight:500;border-radius:7px">' +
      '<input type="checkbox" data-col="' + c.key + '"' + (M.hidden.has(c.key) ? '' : ' checked') + ' style="width:auto;margin:0"> ' + esc(c.label) + '</label>').join('');
  }

  // ---- Events (Controller) ----
  $('q').addEventListener('input', () => { M.setSearch($('q').value); render(); });
  $('resetBtn').addEventListener('click', () => { M.resetFilters(); syncInputs(); render(); });
  $('head').addEventListener('click', e => { const th = e.target.closest('[data-sort]'); if (!th) return; M.setSort(th.dataset.sort); render(); });
  $('head').addEventListener('change', e => { if (e.target.id !== 'selAll') return; M.selectView(e.target.checked); render(); });
  $('body').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'); if (ed) { location.href = 'form.html?edit=' + encodeURIComponent(ed.dataset.edit); return; }
    const dl = e.target.closest('[data-del]'); if (dl) { delRow(dl.dataset.del); return; }
    if (e.target.closest('a,button,input,label')) return;
    const tr = e.target.closest('tr[data-id]'); if (tr) { M.toggleExpand(tr.dataset.id); render(); }
  });
  $('body').addEventListener('change', e => { const c = e.target.closest('.rsel'); if (!c) return; M.toggleSelect(c.dataset.id, c.checked); render(); });
  $('fchips').addEventListener('click', e => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    if (b.dataset.clear === '__all__') { M.resetFilters(); syncInputs(); render(); return; }
    if (b.dataset.clear === 'q') { M.setSearch(''); $('q').value = ''; }
    else { M.setFilter(b.dataset.clear, ''); const el = $(b.dataset.clear); if (el) { el.value = ''; if (el._ss) el._ss.sync(); } }
    render();
  });
  $('pager').addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (!b || b.disabled) return; M.setPage(+b.dataset.goto); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('pager').addEventListener('change', e => { if (e.target.id === 'perPageSel') { M.setPerPage(+e.target.value); render(); } });
  $('bulkbar').addEventListener('click', e => {
    if (e.target.closest('#bulkClear')) { M.clearSelect(); render(); return; }
    if (e.target.closest('#bulkDel')) bulkDelete();
  });
  $('colItems').addEventListener('click', e => e.stopPropagation());
  $('colItems').addEventListener('change', e => { const cb = e.target.closest('[data-col]'); if (!cb) return; M.toggleCol(cb.dataset.col, cb.checked); render(); });

  // ---- Admin ----
  $('adminBtn').addEventListener('click', () => {
    if (isAdmin()) { lockAdmin(); return; }
    if (!authRequired) { alert('Gerbang sandi tidak aktif (ADMIN_PASSWORD kosong di server). Set ADMIN_PASSWORD di Code.gs untuk mengunci penulisan.'); enterAdmin(); return; }
    if (gate.pw) { enterAdmin(); return; }
    gate.prompt('', enterAdmin);
  });
  $('lockLink').addEventListener('click', e => { e.preventDefault(); lockAdmin(); });
  function enterAdmin() { document.body.classList.add('admin'); $('adminbar').classList.add('on'); $('adminBtn').innerHTML = '<i class="fa-solid fa-lock-open"></i> Admin'; render(); }
  function lockAdmin() { document.body.classList.remove('admin'); $('adminbar').classList.remove('on'); $('adminBtn').innerHTML = '<i class="fa-solid fa-lock"></i> Admin'; M.clearSelect(); render(); }

  async function delRow(id) {
    const k = M.all.find(x => x.id === id); if (!k) return;
    if (!confirm('Hapus kerja sama:\n' + k.namaMitra + ' — ' + k.nomorSurat + ' ?\nTindakan ini tidak bisa dibatalkan.')) return;
    try {
      const res = await M.del(id);
      if (res.status === 'success') render();
      else if (res.auth) { gate.clear(); gate.prompt('Sandi salah, coba lagi.', () => delRow(id)); }
      else alert('Gagal: ' + (res.error || 'tidak diketahui'));
    } catch (e) { alert('Gagal menghapus: ' + e.message); }
  }
  async function bulkDelete() {
    const ids = M.selectedInView(); if (!ids.length) return;
    if (!confirm('Hapus ' + ids.length + ' kerja sama terpilih?\nTindakan ini tidak bisa dibatalkan.')) return;
    SIMKERMA.overlay(true, 'Menghapus ' + ids.length + ' data…');
    const r = await M.bulkDel(ids, (done, tot) => SIMKERMA.overlay(true, 'Menghapus ' + done + '/' + tot + '…'));
    SIMKERMA.overlay(false); render();
    if (r.authFail) { gate.clear(); gate.prompt('Sesi/sandi tidak valid. Masuk lagi lalu ulangi.', null); }
    else alert(r.ok + ' data terhapus.');
  }

  // ---- Export (I/O) ----
  function fname(ext) { return 'data-kerjasama-' + new Date().toISOString().slice(0, 10) + '.' + ext; }
  function exportXlsx() {
    const ws = XLSX.utils.aoa_to_sheet([M.exportHead, ...M.exportRows()]);
    ws['!cols'] = M.exportHead.map(h => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Kerja Sama'); XLSX.writeFile(wb, fname('xlsx'));
  }
  function exportCsv() {
    const rows = [M.exportHead, ...M.exportRows()];
    const csv = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8' })); a.download = fname('csv'); a.click();
  }
  const exportMenu = $('exportMenu'), colMenu = $('colMenu');
  $('exportBtn').addEventListener('click', e => { e.stopPropagation(); colMenu.classList.remove('open'); exportMenu.classList.toggle('open'); });
  exportMenu.addEventListener('click', e => { const b = e.target.closest('[data-fmt]'); if (!b) return; exportMenu.classList.remove('open'); b.dataset.fmt === 'xlsx' ? exportXlsx() : exportCsv(); });
  $('colBtn').addEventListener('click', e => { e.stopPropagation(); exportMenu.classList.remove('open'); colMenu.classList.toggle('open'); });
  document.addEventListener('click', () => { exportMenu.classList.remove('open'); colMenu.classList.remove('open'); });

  load();
})();
