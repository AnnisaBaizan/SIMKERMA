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
      ? '<a class="link" href="' + esc(url) + '" target="_blank">' + (label || '📎') + '</a>' : '—';
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
  ui.thSort = function (key, label) {
    return '<th class="sortable" data-sort="' + key + '">' + esc(label) + ' <span class="ar" id="ar-' + key + '"></span></th>';
  };
  ui.emptyRow = function (colspan, text) {
    return '<tr><td colspan="' + colspan + '" style="text-align:center;padding:24px;color:#64748b">' + esc(text || 'Tidak ada data.') + '</td></tr>';
  };
  // Baris data kerja sama (mode admin menambah kolom aksi)
  ui.kerjasamaRow = function (k, admin, isOpen) {
    return '<tr data-id="' + esc(k.id) + '">' +
      '<td><span class="exp" data-exp="' + esc(k.id) + '" style="cursor:pointer;color:var(--brand-d);font-weight:700">' + (isOpen ? '▾' : '▸') + '</span></td>' +
      '<td><span style="font-weight:600">' + esc(k.namaMitra) + '</span></td>' +
      '<td>' + esc(k.jenisMitra) + '</td>' +
      '<td>' + esc(k.bentuk) + '</td>' +
      '<td>' + esc(k.nomorSurat) + '</td>' +
      '<td>' + esc(k.pengguna) + '</td>' +
      '<td>' + esc(k.mulai) + '</td>' +
      '<td>' + esc(k.berakhir) + '</td>' +
      '<td>' + ui.sisa(k.sisa) + '</td>' +
      '<td>' + ui.badge(k.status) + '</td>' +
      '<td>' + ui.fileLink(k.file) + '</td>' +
      (admin ? '<td class="admincol"><span style="display:inline-flex;gap:6px">' +
        '<button class="btn outline" data-edit="' + esc(k.id) + '" style="padding:4px 8px">✏️</button>' +
        '<button class="btn danger" data-del="' + esc(k.id) + '" style="padding:4px 8px">🗑️</button></span></td>' : '') +
    '</tr>';
  };
  ui.detailRow = function (k, colspan) {
    return '<tr class="detail"><td></td><td colspan="' + colspan + '" style="background:#faf9ff">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 18px;font-size:12px">' +
        ui.field('Wilayah', k.wilayah) + ui.field('Ruang Lingkup', k.ruangLingkup) +
        ui.field('Jabatan Penandatangan', k.jabatan) + ui.field('Biaya', ui.rupiah(k.biaya)) +
        ui.field('Masa Berlaku', k.masaBerlaku ? (k.masaBerlaku + ' tahun') : '-') +
        ui.field('Jenis Entri', k.jenisEntri) + ui.field('Dokumen Induk', k.dokumenInduk) +
        ui.field('Ref Sebelumnya', k.refSebelumnya) + ui.field('Catatan', k.catatan) +
      '</div></td></tr>';
  };

  // — Kontrol —
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
