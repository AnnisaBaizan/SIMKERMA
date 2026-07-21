// ============================================================
//  SIMKERMA — Sistem Informasi Kerja Sama
//  (Monitoring Masa Berlaku Kerja Sama) — Poltekkes Kemenkes Palembang
//  Backend Google Apps Script (Web App)
//  Deploy: Web App | Execute as: Me | Who has access: Anyone
// ============================================================
//
//  Arsitektur data (4 tab di 1 Spreadsheet):
//   - "Mitra"      : master mitra (nama, jenis, wilayah, PIC) — jarang berubah
//   - "Kerjasama"  : historis/transaksi tiap MoU/PKS (baru & perpanjangan)
//   - "Dataset"    : pilihan dinamis dropdown (Jenis Mitra, Bentuk, Ruang Lingkup, Pengguna)
//   - "Pengaturan" : key-value (email penerima, ambang reminder, dll)
//
//  Lihat README.md untuk panduan setup, deploy, trigger, dan migrasi data lama.
// ============================================================

// ==================== CONFIG ====================
// Hanya ID teknis & rahasia di sini. Nilai operasional (email, ambang, toggle)
// diatur lewat tab "Pengaturan" — lihat _settings().
const CONFIG = {
  SPREADSHEET_ID:  'GANTI_DENGAN_SPREADSHEET_ID',   // ID Google Sheets utama
  DRIVE_FOLDER_ID: 'GANTI_DENGAN_FOLDER_ID',        // Folder Drive untuk file MoU/PKS yang di-upload
  WA_TOKEN:        'GANTI_DENGAN_TOKEN_FONNTE',      // Token Fonnte (rahasia) — kosongkan bila WA tidak dipakai
  ADMIN_PASSWORD:  '',                               // Kata sandi pengisian form. KOSONG = form terbuka tanpa sandi.

  // Nama tab
  MITRA_SHEET:      'Mitra',
  KERJASAMA_SHEET:  'Kerjasama',
  DATASET_SHEET:    'Dataset',
  PENGATURAN_SHEET: 'Pengaturan',

  // Migrasi: tab data lama (hasil Google Form lama) di spreadsheet yang sama atau lain
  OLD_SPREADSHEET_ID: '',                 // kosong = pakai SPREADSHEET_ID yang sama
  OLD_SHEET_NAME:     'Form Responses 1', // nama tab data lama

  // Default Pengaturan — dipakai bila tab "Pengaturan" kosong:
  NAMA_INSTANSI: 'Politeknik Kesehatan Kemenkes Palembang',
  EMAIL_NOTIF:   'lukman@poltekkespalembang.ac.id, kerjasama@poltekkespalembang.ac.id, okta@poltekkespalembang.ac.id',
  BASE_URL:      'https://simkerma.vercel.app',
  // Reminder — cadence bertingkat: "sisa:interval" (hari). Makin dekat jatuh tempo, makin sering.
  REMINDER_CADENCE: '90:30,60:14,30:7,7:1', // sisa<=90 tiap 30h, <=60 tiap 14h, <=30 tiap 7h, <=7 harian
  GRACE_HABIS_HARI: 14,            // setelah berakhir, tetap ingatkan harian s.d. N hari lalu berhenti

  // Notifikasi INTERNAL (tim Poltekkes) — rekap semua yang jatuh tempo
  EMAIL_AKTIF:    true,            // email rekap ke EMAIL_NOTIF
  WA_NOMOR_AKTIF: false,           // WA rekap ke nomor perorangan (WA_TARGET)
  WA_TARGET:      '',              // nomor WA tim, pisahkan koma (mis. 62812xxxx)
  WA_GRUP_AKTIF:  false,           // WA rekap ke grup (WA_GRUP_ID)
  WA_GRUP_ID:     '',              // ID grup WhatsApp (Fonnte) untuk rekap internal
  LAMPIRKAN_FILE: true,            // lampirkan file MoU/PKS pada email

  // Notifikasi EKSTERNAL (ke PIC mitra) — DEFAULT MATI, nyalakan saat sudah siap
  EMAIL_EKSTERNAL_AKTIF: false,    // email ke PIC mitra (hanya kerja sama miliknya)
  WA_EKSTERNAL_AKTIF:    false,    // WA ke PIC mitra — RISIKO nomor Fonnte diblokir bila banyak
  WA_EKSTERNAL_MAKS_PER_HARI: 8,   // batas jumlah WA eksternal per hari (anti-blokir)
  WA_EKSTERNAL_JEDA_DETIK:    8,   // jeda antar-kirim WA eksternal (detik), anti-burst

  // Antarmuka
  SURVEY_AKTIF: true,              // tampilkan overlay survei tahunan (Nov). FALSE = matikan
};

// ==================== HEADERS ====================
const HEADERS_MITRA = [
  'ID Mitra', 'Nama Mitra', 'Jenis Mitra', 'Wilayah/Provinsi',
  'PIC Nama', 'PIC Email', 'PIC HP', 'Jumlah Kerjasama', 'Terakhir Update',
];

const HEADERS_KERJASAMA = [
  'ID Kerjasama', 'Timestamp', 'ID Mitra', 'Nama Mitra', 'Jenis Mitra', 'Wilayah/Provinsi',
  'Nomor Surat', 'Bentuk Kerja Sama', 'Ruang Lingkup', 'Pengguna MoU/PKS', 'Jabatan Penandatangan',
  'Biaya (Rp)', 'Masa Berlaku (tahun)', 'Tanggal Mulai', 'Tanggal Berakhir',
  'Jenis Entri', 'Ref Kerjasama Sebelumnya', 'Dokumen Induk (MoU)', 'Link File MoU/PKS', 'Catatan',
  'Status', 'Sisa Hari', 'Diinput Oleh', 'Reminder Terakhir',
];

const HEADERS_DATASET = ['Kategori', 'Nilai'];

// Kategori dataset yang dikenal
const DATASET_KATEGORI = ['Jenis Mitra', 'Bentuk Kerja Sama', 'Ruang Lingkup', 'Pengguna MoU/PKS'];

// Seed dataset (dipakai saat tab "Dataset" pertama kali dibuat)
const DATASET_SEED = {
  'Jenis Mitra': [
    'Rumah Sakit', 'Puskesmas', 'Institusi Pendidikan (Poltekkes)', 'Institusi Pendidikan (Non Poltekkes)',
    'Perpustakaan', 'Organisasi Profesi', 'Praktik Bidan Mandiri', 'Apotek', 'Klinik', 'Poskesdes',
    'Badan Narkotika Nasional (BNN)', 'Dinas Kesehatan Provinsi', 'Dinas Kesehatan Kabupaten/Kota',
    'Pemerintah Provinsi/Kabupaten/Kota', 'Badan POM', 'LAMPTKes', 'Perusahaan',
    'UPT Vertikal Kemenkes', 'Balai Besar Laboratorium Kesehatan (BBLK)', 'Luar Negeri',
  ],
  'Bentuk Kerja Sama': [
    'Nota Kesepahaman Bersama (MoU)', 'Memorandum of Agreement (MoA)', 'Perjanjian Kerja sama (PKS)',
    'Perjanjian Kerja sama (PKS) Operasional', 'Addendum', 'Surat Perjanjian Kerja Sama (Kontrak)',
  ],
  'Ruang Lingkup': [
    'Pendidikan', 'Penelitian', 'Pengabdian kepada Masyarakat', 'Penerapan Teknologi',
    'Penyebaran Informasi', 'Tridarma Perguruan Tinggi', 'Rekrutmen Pegawai', 'Rekrutmen Alumni', 'Beasiswa',
  ],
  'Pengguna MoU/PKS': [
    'Poltekkes Kementerian Kesehatan Palembang', 'Direktorat Poltekkes Kemenkes Palembang',
    'Prodi DIII Keperawatan Kampus Palembang', 'Prodi DIII Keperawatan Kampus Baturaja',
    'Prodi DIII Keperawatan Kampus Lubuklinggau', 'Prodi DIII Keperawatan Kampus Lahat',
    'Prodi Sarjana Terapan Keperawatan', 'Prodi DIII Gizi', 'Prodi Sarjana Terapan Gizi',
    'Prodi DIII Kebidanan Palembang', 'Prodi DIII Kebidanan Kampus Muara Enim',
    'Prodi Sarjana Terapan Kebidanan', 'Prodi DIII Farmasi', 'Prodi DIII Keperawatan Gigi',
    'Prodi DIII Teknologi Laboratorium Medis', 'Prodi Sarjana Terapan Teknologi Laboratorium Medis',
    'Prodi DIII Kesehatan Lingkungan', 'Prodi Profesi Bidan',
  ],
};

// ==================== PENGATURAN (dinamis) ====================
let _settingsCache = null;
function _defaultSettings() {
  return {
    NAMA_INSTANSI: CONFIG.NAMA_INSTANSI, EMAIL_NOTIF: CONFIG.EMAIL_NOTIF, BASE_URL: CONFIG.BASE_URL,
    REMINDER_CADENCE: CONFIG.REMINDER_CADENCE, GRACE_HABIS_HARI: CONFIG.GRACE_HABIS_HARI,
    EMAIL_AKTIF: CONFIG.EMAIL_AKTIF, WA_NOMOR_AKTIF: CONFIG.WA_NOMOR_AKTIF, WA_TARGET: CONFIG.WA_TARGET,
    WA_GRUP_AKTIF: CONFIG.WA_GRUP_AKTIF, WA_GRUP_ID: CONFIG.WA_GRUP_ID, LAMPIRKAN_FILE: CONFIG.LAMPIRKAN_FILE,
    EMAIL_EKSTERNAL_AKTIF: CONFIG.EMAIL_EKSTERNAL_AKTIF, WA_EKSTERNAL_AKTIF: CONFIG.WA_EKSTERNAL_AKTIF,
    WA_EKSTERNAL_MAKS_PER_HARI: CONFIG.WA_EKSTERNAL_MAKS_PER_HARI, WA_EKSTERNAL_JEDA_DETIK: CONFIG.WA_EKSTERNAL_JEDA_DETIK,
    SURVEY_AKTIF: CONFIG.SURVEY_AKTIF,
  };
}
function _settingKeterangan() {
  return {
    NAMA_INSTANSI:  'Nama instansi pada notifikasi',
    EMAIL_NOTIF:    'Email tim INTERNAL penerima rekap (pisahkan koma)',
    BASE_URL:       'Domain aplikasi (ubah saat pindah domain instansi)',
    REMINDER_CADENCE: 'Jadwal ingat "sisa:interval" hari. Makin dekat makin sering. Mis. 90:30,60:14,30:7,7:1',
    GRACE_HABIS_HARI: 'Setelah berakhir, tetap ingatkan harian sampai N hari, lalu berhenti',
    EMAIL_AKTIF:    'Aktifkan email rekap INTERNAL (TRUE/FALSE)',
    WA_NOMOR_AKTIF: 'Aktifkan WA rekap ke NOMOR perorangan tim (TRUE/FALSE)',
    WA_TARGET:      'Nomor WA tim internal (mis. 62812xxxx), pisahkan koma',
    WA_GRUP_AKTIF:  'Aktifkan WA rekap ke GRUP (TRUE/FALSE)',
    WA_GRUP_ID:     'ID grup WhatsApp (Fonnte) untuk rekap internal',
    LAMPIRKAN_FILE: 'Lampirkan file MoU/PKS pada email (TRUE/FALSE)',
    EMAIL_EKSTERNAL_AKTIF: 'Aktifkan EMAIL ke PIC mitra — hanya kerja sama miliknya (TRUE/FALSE)',
    WA_EKSTERNAL_AKTIF: 'HATI-HATI: WA ke PIC mitra. Bila banyak, nomor Fonnte bisa diblokir (TRUE/FALSE)',
    WA_EKSTERNAL_MAKS_PER_HARI: 'Batas jumlah WA eksternal per hari (anti-blokir). Mis. 8',
    WA_EKSTERNAL_JEDA_DETIK: 'Jeda antar kirim WA eksternal dalam detik (anti-burst). Mis. 8',
    SURVEY_AKTIF: 'Tampilkan overlay survei tahunan (mulai November). FALSE = matikan',
  };
}
function _settings() {
  if (_settingsCache) return _settingsCache;
  const s = _defaultSettings();
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.PENGATURAN_SHEET);
    if (!sheet) { sheet = ss.insertSheet(CONFIG.PENGATURAN_SHEET); _seedPengaturan(sheet); }
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(r => {
        const k = String(r[0]).trim();
        if (!(k in s)) return;
        let v = r[1];
        if (v === '' || v === null) return;
        if (typeof s[k] === 'boolean') v = (String(v).toUpperCase() === 'TRUE' || v === true);
        s[k] = v;
      });
    }
  } catch (e) { /* pakai default */ }
  _settingsCache = s;
  return s;
}

function _seedPengaturan(sheet) {
  const s = _defaultSettings(), ket = _settingKeterangan();
  sheet.appendRow(['Kunci', 'Nilai', 'Keterangan']);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  Object.keys(s).forEach(k => sheet.appendRow([k, s[k], ket[k] || '']));
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 210); sheet.setColumnWidth(2, 340); sheet.setColumnWidth(3, 430);
}

// Tambahkan kunci pengaturan baru ke tab "Pengaturan" yang sudah ada (jalankan setelah update sistem).
function sinkronkanPengaturan() {
  const ss = _ss();
  let sheet = ss.getSheetByName(CONFIG.PENGATURAN_SHEET);
  if (!sheet) { sheet = ss.insertSheet(CONFIG.PENGATURAN_SHEET); _seedPengaturan(sheet); _settingsCache = null; return 'Tab Pengaturan dibuat dengan semua kunci.'; }
  const s = _defaultSettings(), ket = _settingKeterangan(), ada = {};
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(r => { ada[String(r[0]).trim()] = true; });
  let tambah = 0;
  Object.keys(s).forEach(k => { if (!ada[k]) { sheet.appendRow([k, s[k], ket[k] || '']); tambah++; } });
  _settingsCache = null;
  return 'Sinkron pengaturan: ' + tambah + ' kunci baru ditambahkan.';
}

// ==================== ENTRY POINTS ====================
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let result;
  try {
    if (action === 'getFormData')      result = getFormData();
    else if (action === 'getDashboard') result = getDashboard();
    else if (action === 'getKerjasama') result = { data: _listKerjasama() };
    else if (action === 'getPublicConfig') result = getPublicConfig();
    else if (action === 'ping')         result = { status: 'ok', time: new Date().toISOString() };
    else result = { error: 'Action tidak dikenal: ' + action };
  } catch (err) {
    result = { error: String(err && err.message || err) };
  }
  return _json(result);
}

function doPost(e) {
  let payload;
  try { payload = JSON.parse(e.postData.contents); }
  catch (err) { return _json({ status: 'error', error: 'JSON tidak valid: ' + err.message }); }

  const action = payload.action || '';
  let result;
  try {
    const perluAuth = ['submitKerjasama', 'deleteKerjasama', 'tambahDataset', 'updatePengaturan'];
    if (perluAuth.indexOf(action) > -1 && !_authOk(payload)) {
      result = { status: 'error', error: 'Kata sandi salah.', auth: true };
    }
    else if (action === 'submitKerjasama')   result = handleSubmit(payload);
    else if (action === 'deleteKerjasama')   result = deleteKerjasama(payload.id);
    else if (action === 'tambahDataset')     result = _addDatasetValue(payload.kategori, payload.nilai);
    else if (action === 'updatePengaturan')  result = _updatePengaturan(payload);
    else if (action === 'runReminder')       result = cekDanKirimReminder(true);
    else result = { status: 'error', error: 'Action tidak dikenal: ' + action };
  } catch (err) {
    result = { status: 'error', error: String(err && err.message || err) };
  }
  return _json(result);
}

// Verifikasi kata sandi form (server-side). Kosong di CONFIG = tanpa sandi.
function _authOk(payload) {
  const pw = String(CONFIG.ADMIN_PASSWORD || '');
  if (!pw) return true;
  return String((payload && payload.password) || '') === pw;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== SHEET HELPERS ====================
function _ss() { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function _getOrCreateSheet(name, headers) {
  const ss = _ss();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _mitraSheet()     { return _getOrCreateSheet(CONFIG.MITRA_SHEET, HEADERS_MITRA); }
function _kerjasamaSheet() { return _getOrCreateSheet(CONFIG.KERJASAMA_SHEET, HEADERS_KERJASAMA); }

function _readAll(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { headers: sheet.getRange(1, 1, 1, lastCol).getValues()[0], rows: [] };
  const all = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  return { headers: all[0], rows: all.slice(1) };
}

// ==================== DATASET ====================
function _datasetSheet() {
  const ss = _ss();
  let sheet = ss.getSheetByName(CONFIG.DATASET_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.DATASET_SHEET);
    sheet.appendRow(HEADERS_DATASET);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    DATASET_KATEGORI.forEach(kat => (DATASET_SEED[kat] || []).forEach(v => sheet.appendRow([kat, v])));
  }
  return sheet;
}

function _getDataset() {
  const sheet = _datasetSheet();
  const out = {}; DATASET_KATEGORI.forEach(k => out[k] = []);
  const { rows } = _readAll(sheet);
  rows.forEach(r => {
    const kat = String(r[0] || '').trim();
    const nilai = String(r[1] || '').trim();
    if (!kat || !nilai) return;
    if (!out[kat]) out[kat] = [];
    if (out[kat].indexOf(nilai) === -1) out[kat].push(nilai);
  });
  return out;
}

function _addDatasetValue(kategori, nilai) {
  kategori = String(kategori || '').trim();
  nilai = String(nilai || '').trim();
  if (!kategori || !nilai) return { status: 'error', error: 'Kategori/nilai kosong' };
  const sheet = _datasetSheet();
  const { rows } = _readAll(sheet);
  const exists = rows.some(r => String(r[0]).trim() === kategori &&
    String(r[1]).trim().toLowerCase() === nilai.toLowerCase());
  if (!exists) sheet.appendRow([kategori, nilai]);
  return { status: 'success', kategori, nilai, added: !exists };
}

// ==================== MITRA (master) ====================
function _normNama(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

function _findMitra(nama) {
  const sheet = _mitraSheet();
  const { rows } = _readAll(sheet);
  const target = _normNama(nama);
  for (let i = 0; i < rows.length; i++) {
    if (_normNama(rows[i][1]) === target) return { rowIndex: i + 2, data: rows[i] };
  }
  return null;
}

// Buat atau update mitra; kembalikan ID Mitra
function _upsertMitra(d) {
  const sheet = _mitraSheet();
  let found = _findMitra(d.namaMitra);
  if (found) {
    // update field master bila dikirim (PIC/wilayah/jenis bisa dikoreksi)
    const row = found.data;
    const set = (col, val) => { if (val !== undefined && val !== null && String(val).trim() !== '') sheet.getRange(found.rowIndex, col).setValue(val); };
    set(3, d.jenisMitra); set(4, d.wilayah);
    set(5, d.picNama); set(6, d.picEmail); set(7, d.picHp);
    sheet.getRange(found.rowIndex, 9).setValue(new Date());
    return row[0];
  }
  const id = 'M' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMddHHmmss') +
    Math.floor(Math.random() * 90 + 10);
  sheet.appendRow([id, String(d.namaMitra || '').trim(), d.jenisMitra || '', d.wilayah || '',
    d.picNama || '', d.picEmail || '', d.picHp || '', 0, new Date()]);
  return id;
}

function _recountMitra() {
  const ksheet = _kerjasamaSheet();
  const { rows } = _readAll(ksheet);
  const count = {};
  rows.forEach(r => { const id = String(r[2] || '').trim(); if (id) count[id] = (count[id] || 0) + 1; });
  const msheet = _mitraSheet();
  const m = _readAll(msheet);
  m.rows.forEach((r, i) => msheet.getRange(i + 2, 8).setValue(count[String(r[0]).trim()] || 0));
}

// ==================== SUBMIT KERJA SAMA ====================
function handleSubmit(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!d.namaMitra)  return { status: 'error', error: 'Nama Mitra wajib diisi' };
    if (!d.nomorSurat) return { status: 'error', error: 'Nomor Surat wajib diisi' };
    if (!d.tanggalMulai) return { status: 'error', error: 'Tanggal Mulai wajib diisi' };

    // Dataset baru → masukkan ke sheet Dataset
    if (d.jenisMitraBaru) _addDatasetValue('Jenis Mitra', d.jenisMitra);
    if (d.bentukBaru)     _addDatasetValue('Bentuk Kerja Sama', d.bentuk);
    if (d.penggunaBaru)   _addDatasetValue('Pengguna MoU/PKS', d.pengguna);
    _splitMulti(d.ruangLingkup).forEach(rl => { if (d.ruangLingkupBaru) _addDatasetValue('Ruang Lingkup', rl); });

    const idMitra = _upsertMitra(d);

    // Tanggal berakhir otomatis = mulai + masa berlaku (tahun)
    const mulai = _parseDate(d.tanggalMulai);
    const masa = Number(d.masaBerlaku) || 0;
    let berakhir = d.tanggalBerakhir ? _parseDate(d.tanggalBerakhir) : null;
    if (!berakhir && mulai && masa) {
      berakhir = new Date(mulai);
      berakhir.setFullYear(berakhir.getFullYear() + masa);
      berakhir.setDate(berakhir.getDate() - 1); // berlaku s.d. sehari sebelum tanggal ulang tahun
    }

    // Upload file ke Drive (bila ada)
    let fileUrl = '';
    if (d.file && d.file.data) {
      fileUrl = _saveFile(d.file, d.namaMitra, d.nomorSurat);
    }

    const { status, sisa } = _hitungStatus(berakhir);
    const sheet = _kerjasamaSheet();
    const buildRow = (id, ts, fileVal, reminderVal, emailVal) => ([
      id, ts, idMitra, String(d.namaMitra).trim(), d.jenisMitra || '', d.wilayah || '',
      d.nomorSurat || '', d.bentuk || '', d.ruangLingkup || '', d.pengguna || '', d.jabatan || '',
      Number(d.biaya) || 0, masa, mulai, berakhir,
      d.jenisEntri || 'Baru', d.refSebelumnya || '', d.dokumenInduk || '', fileVal, d.catatan || '',
      status, sisa, emailVal, reminderVal,
    ]);

    // ── Mode EDIT (admin) ──
    if (d.editId) {
      const found = _findKerjasamaRow(d.editId);
      if (!found) return { status: 'error', error: 'Data yang diedit tidak ditemukan: ' + d.editId };
      const H = n => HEADERS_KERJASAMA.indexOf(n);
      const old = found.data;
      const fileVal = (d.file && d.file.data) ? fileUrl : old[H('Link File MoU/PKS')];
      const ts = old[H('Timestamp')] || new Date();
      const emailVal = old[H('Diinput Oleh')] || d.email || '';
      // Reminder direset ('') karena syarat/tanggal mungkin berubah → tahap pengingat dihitung ulang
      sheet.getRange(found.rowIndex, 1, 1, HEADERS_KERJASAMA.length).setValues([buildRow(d.editId, ts, fileVal, '', emailVal)]);
      _recountMitra();
      SpreadsheetApp.flush();
      return { status: 'success', id: d.editId, updated: true, tanggalBerakhir: berakhir ? Utilities.formatDate(berakhir, 'GMT+7', 'yyyy-MM-dd') : '' };
    }

    // ── Mode CREATE ──
    const id = 'K' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMddHHmmss') +
      Math.floor(Math.random() * 90 + 10);
    sheet.appendRow(buildRow(id, new Date(), fileUrl, '', d.email || ''));
    _recountMitra();
    SpreadsheetApp.flush();
    return { status: 'success', id, idMitra, tanggalBerakhir: berakhir ? Utilities.formatDate(berakhir, 'GMT+7', 'yyyy-MM-dd') : '' };
  } finally {
    lock.releaseLock();
  }
}

// Cari baris kerja sama berdasarkan ID Kerjasama → { rowIndex (1-based sheet), data }
function _findKerjasamaRow(id) {
  const { rows } = _readAll(_kerjasamaSheet());
  id = String(id || '').trim();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === id) return { rowIndex: i + 2, data: rows[i] };
  }
  return null;
}

// Hapus satu kerja sama (admin, bergerbang sandi lewat doPost)
function deleteKerjasama(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const found = _findKerjasamaRow(id);
    if (!found) return { status: 'error', error: 'Data tidak ditemukan: ' + id };
    _kerjasamaSheet().deleteRow(found.rowIndex);
    _recountMitra();
    SpreadsheetApp.flush();
    return { status: 'success', deleted: id };
  } finally {
    lock.releaseLock();
  }
}

function _saveFile(file, namaMitra, nomor) {
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const m = String(file.data).match(/^data:([^;]+);base64,(.*)$/);
    let mime = file.mime || 'application/octet-stream';
    let b64 = file.data;
    if (m) { mime = m[1]; b64 = m[2]; }
    const bytes = Utilities.base64Decode(b64);
    const safe = s => String(s || '').replace(/[\/\\:*?"<>|]+/g, '_').trim().slice(0, 60);
    const ext = (file.name && file.name.indexOf('.') > -1) ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const fname = safe(namaMitra) + '__' + safe(nomor) + '__' +
      Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd') + ext;
    const blob = Utilities.newBlob(bytes, mime, fname);
    const f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();
  } catch (e) {
    return 'ERROR_UPLOAD: ' + e.message;
  }
}

// ==================== STATUS & TANGGAL ====================
function _parseDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  const s = String(v || '').trim();
  if (!s) return null;
  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // dd/mm/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// "Hari ini" dihitung pada zona WIB (GMT+7) agar konsisten dengan tanggal di Sheet,
// tidak tergantung zona waktu default project Apps Script.
function _today() {
  const s = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd').split('-');
  return new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
}

function _hitungStatus(berakhir) {
  if (!berakhir) return { status: 'Tidak Ada Tanggal', sisa: '' };
  const b = new Date(berakhir.getFullYear(), berakhir.getMonth(), berakhir.getDate());
  const sisa = Math.round((b - _today()) / 86400000);
  let status;
  if (sisa < 0) status = 'Habis';
  else if (sisa <= 90) status = 'Segera Berakhir';
  else status = 'Aktif';
  return { status, sisa };
}

// ==================== FORM DATA (untuk dropdown & prefill) ====================
function getFormData() {
  const msheet = _mitraSheet();
  const { rows } = _readAll(msheet);
  const mitra = rows.map(r => ({
    id: r[0], nama: r[1], jenis: r[2], wilayah: r[3],
    picNama: r[4], picEmail: r[5], picHp: r[6],
  })).filter(m => m.nama);

  // Kandidat "Dokumen Induk" (terutama MoU) per mitra — untuk relasi payung → turunan
  const ks = _kerjasamaSheet();
  const k = _readAll(ks);
  const Hk = n => _colIndex(k.headers, n);
  const dokByMitra = {};
  k.rows.forEach(r => {
    const idm = String(r[Hk('ID Mitra')] || '').trim();
    if (!idm) return;
    (dokByMitra[idm] = dokByMitra[idm] || []).push({
      id: r[Hk('ID Kerjasama')], nomor: r[Hk('Nomor Surat')], bentuk: r[Hk('Bentuk Kerja Sama')],
    });
  });

  return {
    instansi: _settings().NAMA_INSTANSI,
    dataset: _getDataset(),
    mitra, dokByMitra,
    authRequired: String(CONFIG.ADMIN_PASSWORD || '') !== '',
  };
}

// Konfigurasi publik ringan untuk frontend (mis. toggle survei) — tanpa data sensitif.
function getPublicConfig() {
  return { surveyAktif: !!_settings().SURVEY_AKTIF };
}

// ==================== LIST & DASHBOARD ====================
function _colIndex(headers, name) { return headers.indexOf(name); }

function _listKerjasama() {
  const sheet = _kerjasamaSheet();
  const { headers, rows } = _readAll(sheet);
  const H = n => _colIndex(headers, n);
  return rows.map(r => {
    const berakhir = r[H('Tanggal Berakhir')];
    const bDate = berakhir instanceof Date ? berakhir : _parseDate(berakhir);
    const { status, sisa } = _hitungStatus(bDate);
    return {
      id: r[H('ID Kerjasama')], idMitra: r[H('ID Mitra')], namaMitra: r[H('Nama Mitra')],
      jenisMitra: r[H('Jenis Mitra')], wilayah: r[H('Wilayah/Provinsi')],
      nomorSurat: r[H('Nomor Surat')], bentuk: r[H('Bentuk Kerja Sama')],
      ruangLingkup: r[H('Ruang Lingkup')], pengguna: r[H('Pengguna MoU/PKS')],
      jabatan: r[H('Jabatan Penandatangan')], biaya: r[H('Biaya (Rp)')],
      masaBerlaku: r[H('Masa Berlaku (tahun)')],
      mulai: _fmt(r[H('Tanggal Mulai')]), berakhir: _fmt(bDate),
      jenisEntri: r[H('Jenis Entri')], file: r[H('Link File MoU/PKS')],
      dokumenInduk: r[H('Dokumen Induk (MoU)')], refSebelumnya: r[H('Ref Kerjasama Sebelumnya')],
      catatan: r[H('Catatan')], status, sisa,
    };
  });
}

function _fmt(v) {
  const d = v instanceof Date ? v : _parseDate(v);
  return d ? Utilities.formatDate(d, 'GMT+7', 'yyyy-MM-dd') : '';
}

function _splitMulti(v) {
  return String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

function getDashboard() {
  const list = _listKerjasama();
  const today = _today();

  const ringkasan = { total: list.length, aktif: 0, segeraBerakhir: 0, habis: 0, totalBiaya: 0 };
  const perBidang = {}, perJenis = {}, perPengguna = {}, perBentuk = {}, perTahun = {}, distMasa = {};
  const perMitra = {};      // idMitra -> {nama, jumlah, earliest, latestBerakhir}
  const akanBerakhir = [], sudahHabis = [];

  list.forEach(k => {
    if (k.status === 'Aktif') ringkasan.aktif++;
    else if (k.status === 'Segera Berakhir') ringkasan.segeraBerakhir++;
    else if (k.status === 'Habis') ringkasan.habis++;
    ringkasan.totalBiaya += Number(k.biaya) || 0;

    _splitMulti(k.ruangLingkup).forEach(b => perBidang[b] = (perBidang[b] || 0) + 1);
    if (k.jenisMitra) perJenis[k.jenisMitra] = (perJenis[k.jenisMitra] || 0) + 1;
    if (k.pengguna)   perPengguna[k.pengguna] = (perPengguna[k.pengguna] || 0) + 1;
    if (k.bentuk)     perBentuk[k.bentuk] = (perBentuk[k.bentuk] || 0) + 1;
    if (k.masaBerlaku) distMasa[k.masaBerlaku] = (distMasa[k.masaBerlaku] || 0) + 1;

    const mulaiD = _parseDate(k.mulai);
    if (mulaiD) { const th = mulaiD.getFullYear(); perTahun[th] = (perTahun[th] || 0) + 1; }

    const idm = k.idMitra || k.namaMitra;
    if (!perMitra[idm]) perMitra[idm] = { nama: k.namaMitra, jenis: k.jenisMitra, jumlah: 0, earliest: null };
    perMitra[idm].jumlah++;
    if (mulaiD && (!perMitra[idm].earliest || mulaiD < perMitra[idm].earliest)) perMitra[idm].earliest = mulaiD;

    if (k.status === 'Segera Berakhir') akanBerakhir.push(k);
    if (k.status === 'Habis') sudahHabis.push(k);
  });

  akanBerakhir.sort((a, b) => (a.sisa - b.sisa));
  sudahHabis.sort((a, b) => (a.berakhir < b.berakhir ? 1 : -1));

  // Mitra terlama: berdasarkan tanggal mulai paling awal
  const mitraTerlama = Object.values(perMitra)
    .filter(m => m.earliest)
    .map(m => ({ nama: m.nama, jenis: m.jenis, jumlah: m.jumlah,
      sejak: Utilities.formatDate(m.earliest, 'GMT+7', 'yyyy-MM-dd'),
      lamaTahun: Math.floor((today - m.earliest) / 31557600000) }))
    .sort((a, b) => (a.sejak < b.sejak ? -1 : 1)).slice(0, 10);

  // Top mitra: terbanyak kerjasama
  const topMitra = Object.values(perMitra)
    .map(m => ({ nama: m.nama, jenis: m.jenis, jumlah: m.jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah).slice(0, 10);

  return {
    instansi: _settings().NAMA_INSTANSI,
    generatedAt: Utilities.formatDate(new Date(), 'GMT+7', "yyyy-MM-dd HH:mm 'WIB'"),
    ringkasan: { ...ringkasan, totalMitra: Object.keys(perMitra).length },
    perBidang, perJenisMitra: perJenis, perPengguna, perBentuk,
    trenPerTahun: perTahun, distribusiMasaBerlaku: distMasa,
    akanBerakhir: akanBerakhir.slice(0, 100),
    sudahHabis: sudahHabis.slice(0, 100),
    mitraTerlama, topMitra,
  };
}

// ==================== REMINDER (Email + WhatsApp) ====================
// Dipanggil oleh trigger waktu harian (lihat pasangTriggerReminder).
// ---- Cadence helpers ----
// "90:30,60:14,30:7,7:1" → [{th:90,iv:30},...] urut naik berdasarkan ambang.
function _parseCadence(str) {
  return String(str || '').split(',').map(p => {
    const x = p.split(':');
    return { th: parseInt(x[0], 10), iv: parseInt(x[1], 10) };
  }).filter(z => !isNaN(z.th) && !isNaN(z.iv)).sort((a, b) => a.th - b.th);
}
// Interval (hari) pengingat untuk sisa tertentu. 0 = belum/tidak perlu diingatkan.
function _intervalFor(sisa, zones, grace) {
  if (sisa < 0) return sisa >= -grace ? 1 : 0;          // sudah habis → harian selama masa tenggang
  for (let i = 0; i < zones.length; i++) { if (sisa <= zones[i].th) return zones[i].iv; }
  return 0;                                              // masih di luar zona reminder terjauh
}
// Tanggal terakhir diingatkan dari sel (format baru 'yyyy-MM-dd'; toleran format lama).
function _lastRemindDate(cell) {
  const m = String(cell || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
// Peta kontak mitra: diindeks ID Mitra & nama (lowercase) → {pic, email, hp}.
function _mitraContactMap() {
  const { headers, rows } = _readAll(_mitraSheet());
  const H = n => _colIndex(headers, n);
  const map = {};
  rows.forEach(r => {
    const c = { pic: r[H('PIC Nama')], email: String(r[H('PIC Email')] || '').trim(), hp: String(r[H('PIC HP')] || '').trim() };
    const id = String(r[H('ID Mitra')] || '').trim();
    const nm = String(r[H('Nama Mitra')] || '').trim().toLowerCase();
    if (id) map[id] = c;
    if (nm) map['nama:' + nm] = c;
  });
  return map;
}
function _contactOf(map, item) {
  return map[String(item.idMitra || '').trim()] || map['nama:' + String(item.nama || '').trim().toLowerCase()] || {};
}
// Kelompokkan item jatuh tempo per mitra (urutan mengikuti input = paling mendesak dulu).
function _groupByMitra(due) {
  const g = {}, order = [];
  due.forEach(d => {
    const key = String(d.idMitra || '').trim() || 'nama:' + String(d.nama || '').trim().toLowerCase();
    if (!g[key]) { g[key] = { idMitra: d.idMitra, nama: d.nama, items: [] }; order.push(key); }
    g[key].items.push(d);
  });
  return order.map(k => g[k]);
}

// Diagnostik: jelaskan MENGAPA reminder terkirim/tidak — TANPA mengirim apa pun.
// Jalankan dari editor, lalu buka menu "Execution log".
function diagReminder() {
  const s = _settings();
  const zones = _parseCadence(s.REMINDER_CADENCE);
  const grace = parseInt(s.GRACE_HABIS_HARI, 10) || 0;
  const sheet = _kerjasamaSheet();
  const { headers, rows } = _readAll(sheet);
  const H = n => _colIndex(headers, n);
  const colRem = H('Reminder Terakhir') + 1;
  const today = _today();
  const L = [];
  L.push('=== DIAGNOSTIK REMINDER (tidak mengirim) ===');
  L.push('Tanggal (WIB): ' + Utilities.formatDate(today, 'GMT+7', 'yyyy-MM-dd'));
  L.push('Spreadsheet: ' + CONFIG.SPREADSHEET_ID);
  L.push('EMAIL_AKTIF=' + s.EMAIL_AKTIF + ' | EMAIL_NOTIF="' + s.EMAIL_NOTIF + '"');
  L.push('EMAIL_EKSTERNAL_AKTIF=' + s.EMAIL_EKSTERNAL_AKTIF + ' | WA_NOMOR_AKTIF=' + s.WA_NOMOR_AKTIF +
    ' | WA_GRUP_AKTIF=' + s.WA_GRUP_AKTIF + ' | WA_EKSTERNAL_AKTIF=' + s.WA_EKSTERNAL_AKTIF);
  L.push('REMINDER_CADENCE="' + s.REMINDER_CADENCE + '" | GRACE_HABIS_HARI=' + grace);
  L.push('Total baris kerja sama: ' + rows.length);

  let inWindow = 0, due = 0, suppressed = 0, noDate = 0;
  const contohDue = [], contohSuppressed = [];
  rows.forEach((r, i) => {
    const bRaw = r[H('Tanggal Berakhir')];
    const bDate = bRaw instanceof Date ? bRaw : _parseDate(bRaw);
    if (!bDate) { noDate++; return; }
    const { sisa } = _hitungStatus(bDate);
    const iv = _intervalFor(sisa, zones, grace);
    if (!iv) return;                       // di luar jendela pengingat
    inWindow++;
    const last = _lastRemindDate(r[colRem - 1]);
    const gap = last ? Math.round((today - last) / 86400000) : null;
    const nama = r[H('Nama Mitra')];
    if (last && gap < iv) {
      suppressed++;
      if (contohSuppressed.length < 8) contohSuppressed.push(nama + ' (sisa ' + sisa + ', interval ' + iv + 'h, terakhir ' + gap + 'h lalu)');
    } else {
      due++;
      if (contohDue.length < 8) contohDue.push(nama + ' (sisa ' + sisa + ', interval ' + iv + 'h)');
    }
  });

  L.push('--- Ringkasan ---');
  L.push('Tanpa tanggal berakhir: ' + noDate);
  L.push('Masuk jendela pengingat: ' + inWindow);
  L.push('AKAN dikirim (due): ' + due);
  L.push('Ditahan cadence (belum waktunya): ' + suppressed);
  if (contohDue.length) L.push('Contoh due: \n  - ' + contohDue.join('\n  - '));
  if (contohSuppressed.length) L.push('Contoh ditahan: \n  - ' + contohSuppressed.join('\n  - '));
  if (!due) L.push('>> KESIMPULAN: tidak ada yang dikirim karena due=0 (lihat sebab di atas). ' +
    'Untuk uji paksa: kosongkan sel "Reminder Terakhir" pada baris yang Status-nya Segera/Habis, lalu run lagi.');
  const out = L.join('\n');
  Logger.log(out);
  return out;
}

function cekDanKirimReminder(manual) {
  const s = _settings();
  const zones = _parseCadence(s.REMINDER_CADENCE);
  const grace = parseInt(s.GRACE_HABIS_HARI, 10) || 0;
  const sheet = _kerjasamaSheet();
  const { headers, rows } = _readAll(sheet);
  const H = n => _colIndex(headers, n);
  const colSisa = H('Sisa Hari') + 1, colStatus = H('Status') + 1, colRem = H('Reminder Terakhir') + 1;
  const today = _today();

  const due = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const bRaw = r[H('Tanggal Berakhir')];
    const bDate = bRaw instanceof Date ? bRaw : _parseDate(bRaw);
    if (!bDate) return;
    const { status, sisa } = _hitungStatus(bDate);
    // Segarkan status & sisa di sheet untuk SEMUA baris (sekalian).
    sheet.getRange(rowNo, colSisa).setValue(sisa);
    sheet.getRange(rowNo, colStatus).setValue(status);

    const iv = _intervalFor(sisa, zones, grace);
    if (!iv) return;                                     // di luar rentang pengingat
    const last = _lastRemindDate(r[colRem - 1]);
    if (last && Math.round((today - last) / 86400000) < iv) return; // belum waktunya diingatkan lagi

    due.push({
      rowNo, sisa, status, idMitra: String(r[H('ID Mitra')] || '').trim(),
      nama: r[H('Nama Mitra')], jenis: r[H('Jenis Mitra')], bentuk: r[H('Bentuk Kerja Sama')],
      nomor: r[H('Nomor Surat')], pengguna: r[H('Pengguna MoU/PKS')],
      berakhir: _fmt(bDate), file: r[H('Link File MoU/PKS')], ruang: r[H('Ruang Lingkup')],
    });
  });

  SpreadsheetApp.flush();
  if (!due.length) return { status: 'success', terkirim: 0, pesan: 'Tidak ada yang perlu diingatkan hari ini' };
  due.sort((a, b) => a.sisa - b.sisa);                   // paling mendesak (sisa terkecil) di atas

  // --- INTERNAL: rekap semua ---
  let emailInt = false, waInt = false;
  if (s.EMAIL_AKTIF) emailInt = _kirimEmailInternal(due, s);
  if (s.WA_NOMOR_AKTIF || s.WA_GRUP_AKTIF) waInt = _kirimWaInternal(due, s);

  // --- EKSTERNAL: per mitra (hanya kerja samanya) ---
  let emailEks = 0, waEks = 0;
  if (s.EMAIL_EKSTERNAL_AKTIF || s.WA_EKSTERNAL_AKTIF) {
    const map = _mitraContactMap();
    const byMitra = _groupByMitra(due);
    if (s.EMAIL_EKSTERNAL_AKTIF) {
      byMitra.forEach(g => {
        const c = _contactOf(map, g.items[0]);
        if (c.email && _kirimEmailMitra(g, c, s)) emailEks++;
      });
    }
    if (s.WA_EKSTERNAL_AKTIF) waEks = _kirimWaEksternal(byMitra, map, s);
  }

  // Tandai "terakhir diingatkan = hari ini" untuk baris yang benar-benar diproses.
  const stamp = Utilities.formatDate(today, 'GMT+7', 'yyyy-MM-dd');
  due.forEach(d => sheet.getRange(d.rowNo, colRem).setValue(stamp));
  SpreadsheetApp.flush();

  return {
    status: 'success', terkirim: due.length,
    emailInternal: emailInt, waInternal: waInt, emailEksternal: emailEks, waEksternal: waEks,
    manual: !!manual,
  };
}

// ---------- EMAIL INTERNAL (rekap semua) ----------
function _kirimEmailInternal(items, s) {
  const to = String(s.EMAIL_NOTIF).split(',').map(x => x.trim()).filter(Boolean);
  if (!to.length) return false;
  const subjek = '[Monitoring Kerja Sama] ' + items.length + ' kerja sama perlu perhatian — ' +
    Utilities.formatDate(new Date(), 'GMT+7', 'dd MMM yyyy');
  const html = _emailShell(s,
    '<p>Berikut daftar kerja sama yang <b>akan/segera berakhir</b> dan perlu ditindaklanjuti ' +
    '(konfirmasi ke mitra & proses perpanjangan):</p>' + _tabelItems(items, true));
  const attachments = _lampiran(items, s);
  try {
    MailApp.sendEmail({ to: to.join(','), subject: subjek, htmlBody: html,
      attachments: attachments.length ? attachments : undefined, noReply: true });
    return true;
  } catch (e) { return false; }
}

// ---------- EMAIL EKSTERNAL (per mitra, hanya kerja samanya) ----------
function _kirimEmailMitra(group, contact, s) {
  const to = String(contact.email).split(',').map(x => x.trim()).filter(Boolean);
  if (!to.length) return false;
  const sapaan = contact.pic ? 'Yth. ' + _esc(contact.pic) : 'Yth. Bapak/Ibu Mitra';
  const n = group.items.length;
  const subjek = '[' + s.NAMA_INSTANSI + '] Pengingat masa berlaku kerja sama — ' + group.nama;
  const html = _emailShell(s,
    '<p>' + sapaan + ',</p>' +
    '<p>Menindaklanjuti kerja sama antara <b>' + _esc(group.nama) + '</b> dengan <b>' + _esc(s.NAMA_INSTANSI) +
    '</b>, berikut ' + n + ' dokumen kerja sama yang <b>akan/segera berakhir</b>. ' +
    'Mohon konfirmasi rencana perpanjangan atau tindak lanjutnya:</p>' +
    _tabelItems(group.items, false) +
    '<p style="margin-top:14px">Atas perhatian dan kerja samanya, kami ucapkan terima kasih.</p>');
  const attachments = s.LAMPIRKAN_FILE ? _lampiran(group.items, s) : [];
  try {
    MailApp.sendEmail({ to: to.join(','), subject: subjek, htmlBody: html,
      attachments: attachments.length ? attachments : undefined, noReply: true });
    return true;
  } catch (e) { return false; }
}

// ---------- WA INTERNAL (rekap ke nomor &/ grup) ----------
function _kirimWaInternal(items, s) {
  if (!CONFIG.WA_TOKEN || CONFIG.WA_TOKEN.indexOf('GANTI') === 0) return false;
  const pesan = _waPesanRekap(items, s);
  let ok = false;
  if (s.WA_NOMOR_AKTIF) {
    String(s.WA_TARGET).split(',').map(x => x.trim()).filter(Boolean)
      .forEach(t => { if (_kirimWA(t, pesan)) ok = true; });
  }
  if (s.WA_GRUP_AKTIF && String(s.WA_GRUP_ID).trim()) {
    if (_kirimWA(String(s.WA_GRUP_ID).trim(), pesan)) ok = true;
  }
  return ok;
}

// ---------- WA EKSTERNAL (ke PIC mitra) — dibatasi & di-throttle anti-blokir ----------
function _kirimWaEksternal(byMitra, map, s) {
  if (!CONFIG.WA_TOKEN || CONFIG.WA_TOKEN.indexOf('GANTI') === 0) return 0;
  const maks = Math.max(0, parseInt(s.WA_EKSTERNAL_MAKS_PER_HARI, 10) || 0);
  const jeda = Math.max(0, parseInt(s.WA_EKSTERNAL_JEDA_DETIK, 10) || 0);
  let terkirim = 0;
  for (let i = 0; i < byMitra.length && terkirim < maks; i++) {
    const g = byMitra[i];
    const c = _contactOf(map, g.items[0]);
    const hp = String(c.hp || '').trim();
    if (!hp) continue;
    if (terkirim > 0 && jeda) Utilities.sleep(jeda * 1000);   // jeda anti-burst
    if (_kirimWA(hp, _waPesanMitra(g, c, s))) terkirim++;
  }
  return terkirim;                                            // sisanya (di atas batas) menyusul hari berikutnya
}

// ---------- Util pesan & email ----------
function _ketSisa(sisa) {
  return sisa < 0 ? 'SUDAH HABIS (' + Math.abs(sisa) + ' hr lalu)'
    : sisa === 0 ? 'BERAKHIR HARI INI' : 'sisa ' + sisa + ' hari';
}
function _emailShell(s, isi) {
  return '<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto">' +
    '<div style="background:#4f46e5;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0">Monitoring Masa Berlaku Kerja Sama</h2>' +
    '<div style="opacity:.9;font-size:13px">' + _esc(s.NAMA_INSTANSI) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">' + isi +
    '<p style="margin-top:18px"><a href="' + s.BASE_URL + '" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Buka Dashboard</a></p>' +
    '<p style="color:#94a3b8;font-size:12px;margin-top:16px">Email otomatis dari Sistem Monitoring Kerja Sama. Mohon tidak membalas email ini.</p>' +
    '</div></div>';
}
function _tabelItems(items, withPengguna) {
  let rows = '';
  items.forEach((j, i) => {
    const warna = j.sisa <= 0 ? '#dc2626' : j.sisa <= 7 ? '#ea580c' : j.sisa <= 30 ? '#d97706' : '#4f46e5';
    rows += '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + (i + 1) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee"><b>' + _esc(j.nama) + '</b><br><span style="color:#666;font-size:12px">' + _esc(j.jenis) + '</span></td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + _esc(j.bentuk) + '<br><span style="color:#666;font-size:12px">' + _esc(j.nomor) + '</span></td>' +
      (withPengguna ? '<td style="padding:8px;border-bottom:1px solid #eee">' + _esc(j.pengguna) + '</td>' : '') +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + j.berakhir + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;color:' + warna + ';font-weight:bold">' + _ketSisa(j.sisa) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + (j.file && String(j.file).indexOf('http') === 0 ? '<a href="' + j.file + '">Lihat</a>' : '-') + '</td>' +
      '</tr>';
  });
  return '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
    '<thead><tr style="background:#f1f5f9;text-align:left">' +
    '<th style="padding:8px">#</th><th style="padding:8px">Mitra</th><th style="padding:8px">Bentuk / No. Surat</th>' +
    (withPengguna ? '<th style="padding:8px">Pengguna</th>' : '') +
    '<th style="padding:8px">Berakhir</th><th style="padding:8px">Status</th><th style="padding:8px">Berkas</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}
function _lampiran(items, s) {
  if (!s.LAMPIRKAN_FILE) return [];
  const out = [];
  items.forEach(j => {
    const fid = _driveId(j.file);
    if (!fid) return;
    try { out.push(DriveApp.getFileById(fid).getBlob()); } catch (e) { /* skip */ }
  });
  return out.slice(0, 20);
}
function _waPesanRekap(items, s) {
  let p = '*Monitoring Kerja Sama — ' + s.NAMA_INSTANSI + '*\n' + items.length + ' kerja sama perlu perhatian:\n\n';
  items.slice(0, 30).forEach((j, i) => {
    p += (i + 1) + '. ' + j.nama + ' (' + j.bentuk + ')\n   Berakhir ' + j.berakhir + ' — ' + _ketSisa(j.sisa) + '\n';
  });
  return p + '\nBuka dashboard: ' + s.BASE_URL;
}
function _waPesanMitra(g, c, s) {
  let p = (c.pic ? 'Yth. ' + c.pic : 'Yth. Bapak/Ibu') + ',\n\n' +
    'Pengingat dari *' + s.NAMA_INSTANSI + '* untuk kerja sama *' + g.nama + '* yang akan/segera berakhir:\n\n';
  g.items.slice(0, 20).forEach((j, i) => {
    p += (i + 1) + '. ' + j.bentuk + (j.nomor ? ' (' + j.nomor + ')' : '') + '\n   Berakhir ' + j.berakhir + ' — ' + _ketSisa(j.sisa) + '\n';
  });
  return p + '\nMohon konfirmasi rencana perpanjangan/tindak lanjutnya. Terima kasih.';
}

function _kirimWA(target, pesan) {
  try {
    const res = UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post', headers: { 'Authorization': CONFIG.WA_TOKEN },
      payload: { target: target, message: pesan }, muteHttpExceptions: true,
    });
    return res.getResponseCode() === 200;
  } catch (e) { return false; }
}

function _driveId(url) {
  const s = String(url || '');
  let m = s.match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== PENGATURAN UPDATE (admin) ====================
function _updatePengaturan(payload) {
  const ss = _ss();
  let sheet = ss.getSheetByName(CONFIG.PENGATURAN_SHEET);
  if (!sheet) { _settings(); sheet = ss.getSheetByName(CONFIG.PENGATURAN_SHEET); }
  const data = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 2).getValues();
  const updates = payload.pengaturan || {};
  Object.keys(updates).forEach(k => {
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === k) { sheet.getRange(i + 2, 2).setValue(updates[k]); found = true; break; }
    }
    if (!found) sheet.appendRow([k, updates[k], '']);
  });
  _settingsCache = null;
  return { status: 'success' };
}

// ==================== TRIGGER SETUP (jalankan sekali dari editor) ====================
function pasangTriggerReminder() {
  // hapus trigger lama
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'cekDanKirimReminder') ScriptApp.deleteTrigger(t);
  });
  // jalankan tiap hari jam 07:00 WIB
  ScriptApp.newTrigger('cekDanKirimReminder').timeBased().everyDays(1).atHour(7).create();
  return 'Trigger reminder harian terpasang (07:00).';
}

function refreshSemuaStatus() {
  const sheet = _kerjasamaSheet();
  const { headers, rows } = _readAll(sheet);
  const H = n => _colIndex(headers, n);
  const colSisa = H('Sisa Hari') + 1, colStatus = H('Status') + 1;
  rows.forEach((r, i) => {
    const bDate = r[H('Tanggal Berakhir')] instanceof Date ? r[H('Tanggal Berakhir')] : _parseDate(r[H('Tanggal Berakhir')]);
    const { status, sisa } = _hitungStatus(bDate);
    sheet.getRange(i + 2, colSisa).setValue(sisa);
    sheet.getRange(i + 2, colStatus).setValue(status);
  });
  _recountMitra();
  SpreadsheetApp.flush();
  return 'Status & sisa hari diperbarui untuk ' + rows.length + ' baris.';
}

// ==================== MIGRASI DATA LAMA ====================
// Jalankan SEKALI dari editor Apps Script setelah mengisi CONFIG.
// Membaca tab "Form Responses 1" lama dan mengisi tab Mitra + Kerjasama.
function migrasiDataLama(force) {
  // Pengaman idempoten: cegah migrasi dobel. Paksa dengan migrasiDataLama(true).
  if (!force && _readAll(_kerjasamaSheet()).rows.length > 0) {
    throw new Error('Tab "Kerjasama" sudah berisi data. Migrasi dibatalkan agar tidak dobel. ' +
      'Jika memang ingin menambah, jalankan: migrasiDataLama(true)');
  }
  const srcId = CONFIG.OLD_SPREADSHEET_ID || CONFIG.SPREADSHEET_ID;
  const src = SpreadsheetApp.openById(srcId).getSheetByName(CONFIG.OLD_SHEET_NAME);
  if (!src) throw new Error('Tab data lama "' + CONFIG.OLD_SHEET_NAME + '" tidak ditemukan.');
  const data = src.getDataRange().getValues();
  if (data.length < 2) return 'Tidak ada data untuk dimigrasi.';

  // Kolom data lama (indeks 0-based):
  // 0 Timestamp,1 Email,2 Bentuk,3 Nomor,4 Mitra(jenis/nama campur),5 Nama Mitra,
  // 6 Jabatan,7 Ruang Lingkup,8 Pengguna,9 Biaya,10 Masa,11 Mulai,12 Berakhir
  const jenisDikenal = DATASET_SEED['Jenis Mitra'].map(x => x.toLowerCase());

  const mitraSheet = _mitraSheet();
  const kerjasamaSheet = _kerjasamaSheet();
  const mitraMap = {}; // normNama -> id
  // muat mitra existing
  _readAll(mitraSheet).rows.forEach(r => { if (r[1]) mitraMap[_normNama(r[1])] = r[0]; });

  const mitraRows = [], ksRows = [];
  let seq = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[3] && !r[4] && !r[5]) continue; // baris kosong

    const rawMitra = String(r[4] || '').trim();
    const namaExplisit = String(r[5] || '').trim();
    let jenis, nama;
    if (jenisDikenal.indexOf(rawMitra.toLowerCase()) > -1) {
      jenis = rawMitra;
      nama = namaExplisit || rawMitra; // bila nama kosong, pakai jenis sebagai nama (akan dirapikan manual)
    } else {
      // kolom "Mitra" ternyata berisi nama spesifik
      nama = namaExplisit || rawMitra || 'Tidak Diketahui';
      jenis = 'Lainnya';
    }

    const key = _normNama(nama);
    let idMitra = mitraMap[key];
    if (!idMitra) {
      seq++;
      idMitra = 'M' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd') + ('000' + seq).slice(-4);
      mitraMap[key] = idMitra;
      mitraRows.push([idMitra, nama, jenis, '', '', '', '', 0, new Date()]);
    }

    const mulai = _parseDate(r[11]);
    let berakhir = _parseDate(r[12]);
    const masa = Number(r[10]) || 0;
    if (!berakhir && mulai && masa) {
      berakhir = new Date(mulai); berakhir.setFullYear(berakhir.getFullYear() + masa); berakhir.setDate(berakhir.getDate() - 1);
    }
    const { status, sisa } = _hitungStatus(berakhir);
    const id = 'K' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd') + ('00000' + i).slice(-5);

    ksRows.push([
      id, r[0] || new Date(), idMitra, nama, jenis, '',
      r[3] || '', r[2] || '', r[7] || '', r[8] || '', r[6] || '',
      Number(r[9]) || 0, masa, mulai, berakhir,
      'Baru', '', '', '', '',
      status, sisa, r[1] || '', '',
    ]);
  }

  if (mitraRows.length) mitraSheet.getRange(mitraSheet.getLastRow() + 1, 1, mitraRows.length, HEADERS_MITRA.length).setValues(mitraRows);
  if (ksRows.length) kerjasamaSheet.getRange(kerjasamaSheet.getLastRow() + 1, 1, ksRows.length, HEADERS_KERJASAMA.length).setValues(ksRows);
  _recountMitra();
  SpreadsheetApp.flush();
  return 'Migrasi selesai: ' + mitraRows.length + ' mitra baru, ' + ksRows.length + ' kerja sama.';
}

// Inisialisasi manual: buat semua tab + seed dataset (jalankan sekali bila perlu)
function setupAwal() {
  _settings(); _datasetSheet(); _mitraSheet(); _kerjasamaSheet();
  return 'Semua tab dibuat: Mitra, Kerjasama, Dataset, Pengaturan.';
}
