/* ============================================================
   SIMKERMA — Komponen UI granular (SIMKERMA.ui.*)
   Tiap fungsi = 1 komponen kecil, pure (input → string HTML),
   dikomposisi oleh halaman. Tanpa framework, tetap "component-like".
   ============================================================ */
(function () {
  var S = window.SIMKERMA || (window.SIMKERMA = {});
  var esc = S.esc || function (x) { return x; };
  var ui = S.ui = {};

  // — Atom —
  ui.badge = function (status) { return S.badge(status); };
  ui.sisa = function (sisa) { return S.sisaText(sisa); };
  ui.rupiah = function (n) { return n ? S.rupiah(n) : '-'; };
  ui.fileLink = function (url, label) {
    return (url && String(url).indexOf('http') === 0)
      ? '<a class="link" href="' + esc(url) + '" target="_blank" title="Lihat berkas">' + (label || '<i class="fa-solid fa-paperclip"></i>') + '</a>' : '<span class="muted">—</span>';
  };
  ui.spinner = function () { return '<span class="spinner"></span>'; };
  ui.sectionTitle = function (t) { return '<p class="section-title">' + esc(t) + '</p>'; };

  // — Dashboard —
  ui.statCard = function (cls, n, label, icon, title) {
    var t = title ? ' title="' + esc(title) + '"' : '';
    var ic = icon ? '<span class="stat-ic">' + icon + '</span>' : '';
    return '<div class="stat ' + cls + '"' + t + '>' +
      '<div class="stat-row"><div class="n">' + n + '</div>' + ic + '</div>' +
      '<div class="l">' + esc(label) + '</div></div>';
  };

  // — Form / detail —
  ui.field = function (label, val) {
    var v = (val == null || val === '') ? '-' : val;
    return '<div><b>' + esc(label) + ':</b> ' + esc(v) + '</div>';
  };

  // — Tabel —
  ui.thSort = function (key, label, cls) {
    return '<th class="sortable' + (cls ? ' ' + cls : '') + '" data-sort="' + key + '">' + esc(label) + ' <span class="ar" id="ar-' + key + '"></span></th>';
  };
  ui.emptyRow = function (colspan, text) {
    return '<tr><td colspan="' + colspan + '" style="text-align:center;padding:24px;color:#64748b">' + esc(text || 'Tidak ada data.') + '</td></tr>';
  };
  // Baris data kerja sama (mode admin menambah kolom aksi)
  var cell = function (v, cls) { v = (v == null ? '' : String(v)); return '<span class="ell' + (cls ? ' ' + cls : '') + '" title="' + esc(v) + '">' + esc(v) + '</span>'; };
  // Kolom utama diringkas agar tabel muat tanpa scroll & badge Status langsung terlihat.
  // Jenis Mitra, No. Surat, Tanggal Mulai dipindah ke baris detail (expand).
  ui.kerjasamaRow = function (k, admin, isOpen) {
    return '<tr data-id="' + esc(k.id) + '">' +
      '<td><span class="exp" data-exp="' + esc(k.id) + '" style="cursor:pointer;color:var(--accent)"><i class="fa-solid fa-chevron-' + (isOpen ? 'down' : 'right') + '"></i></span></td>' +
      '<td style="font-weight:600">' + cell(k.namaMitra) + '</td>' +
      '<td class="hide-md">' + cell(k.bentuk) + '</td>' +
      '<td class="hide-md">' + cell(k.pengguna) + '</td>' +
      '<td class="nowrap">' + esc(k.berakhir) + '</td>' +
      '<td class="nowrap">' + ui.sisa(k.sisa) + '</td>' +
      '<td>' + ui.badge(k.status) + '</td>' +
      '<td style="text-align:center">' + ui.fileLink(k.file) + '</td>' +
      (admin ? '<td class="admincol"><span style="display:inline-flex;gap:6px">' +
        '<button class="btn outline" data-edit="' + esc(k.id) + '" title="Edit" style="padding:5px 9px"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="btn danger" data-del="' + esc(k.id) + '" title="Hapus" style="padding:5px 9px"><i class="fa-solid fa-trash"></i></button></span></td>' : '') +
    '</tr>';
  };
  ui.detailRow = function (k, colspan) {
    return '<tr class="detail"><td></td><td colspan="' + colspan + '" style="background:#faf9ff">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 18px;font-size:12px">' +
        ui.field('Jenis Mitra', k.jenisMitra) + ui.field('No. Surat', k.nomorSurat) + ui.field('Tanggal Mulai', k.mulai) +
        ui.field('Wilayah', k.wilayah) + ui.field('Ruang Lingkup', k.ruangLingkup) +
        ui.field('Jabatan Penandatangan', k.jabatan) + ui.field('Biaya', ui.rupiah(k.biaya)) +
        ui.field('Masa Berlaku', k.masaBerlaku ? (k.masaBerlaku + ' tahun') : '-') +
        ui.field('Jenis Entri', k.jenisEntri) + ui.field('Dokumen Induk', k.dokumenInduk) +
        ui.field('Ref Sebelumnya', k.refSebelumnya) + ui.field('Catatan', k.catatan) +
      '</div></td></tr>';
  };

  // — Kontrol —
  // — Skeleton loading (biar tidak halaman kosong) —
  var sk = function (style) { return '<span class="skel" style="' + style + '"></span>'; };
  ui.skelDash = function () {
    var card = '<div class="stat">' + sk('height:26px;width:55%') + sk('height:11px;width:80%;margin-top:14px') + '</div>';
    var cards = '<div class="cards">' + new Array(7).join(card) + '</div>';
    var panel = '<div class="panel">' + sk('height:14px;width:42%;margin-bottom:16px') + sk('height:280px;border-radius:10px') + '</div>';
    var line = sk('height:15px;margin:14px 0');
    var table = '<div class="panel full">' + sk('height:16px;width:32%;margin-bottom:18px') + new Array(7).join(line) + '</div>';
    return cards + '<div class="grid" style="margin-bottom:16px">' + panel + panel + '</div>' + table;
  };
  ui.skelData = function () {
    var line = sk('height:16px;margin:15px 0');
    return '<div class="toolbar">' + sk('height:40px;border-radius:10px') + '</div>' +
      '<div class="tablewrap" style="padding:10px 16px">' + sk('height:16px;width:30%;margin:12px 0') + new Array(11).join(line) + '</div>';
  };
  ui.selectFilter = function (id, placeholder, options) {
    var opts = '<option value="">' + esc(placeholder) + '</option>' +
      (options || []).map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('');
    return '<select id="' + id + '">' + opts + '</select>';
  };
  ui.pager = function (page, pages) {
    var b = function (label, to, dis) {
      return '<button data-goto="' + to + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
    };
    return b('«', 1, page <= 1) + b('‹', page - 1, page <= 1) +
      '<span class="muted">Hal. ' + page + ' / ' + pages + '</span>' +
      b('›', page + 1, page >= pages) + b('»', pages, page >= pages) +
      '<select id="perPageSel" style="margin-left:6px;width:auto"><option value="25">25/hal</option><option value="50">50/hal</option><option value="100">100/hal</option></select>';
  };
})();
