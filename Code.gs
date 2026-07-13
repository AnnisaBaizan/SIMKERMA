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
  REMINDER_HARI: '90,60,30,7,0',  // ambang H- (hari). 0 = hari berakhir
  EMAIL_AKTIF:   true,
  WA_AKTIF:      false,            // aktifkan setelah WA_TOKEN & WA_TARGET diisi
  WA_TARGET:     '',              // nomor WA tujuan, pisahkan dengan koma (mis. 6281xxxx)
  LAMPIRKAN_FILE: true,           // lampirkan file MoU/PKS pada email reminder
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
function _settings() {
  if (_settingsCache) return _settingsCache;
  const s = {
    NAMA_INSTANSI: CONFIG.NAMA_INSTANSI, EMAIL_NOTIF: CONFIG.EMAIL_NOTIF, BASE_URL: CONFIG.BASE_URL,
    REMINDER_HARI: CONFIG.REMINDER_HARI, EMAIL_AKTIF: CONFIG.EMAIL_AKTIF, WA_AKTIF: CONFIG.WA_AKTIF,
    WA_TARGET: CONFIG.WA_TARGET, LAMPIRKAN_FILE: CONFIG.LAMPIRKAN_FILE,
  };
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.PENGATURAN_SHEET);
    if (!sheet) { sheet = ss.insertSheet(CONFIG.PENGATURAN_SHEET); _seedPengaturan(sheet, s); }
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

function _seedPengaturan(sheet, s) {
  sheet.appendRow(['Kunci', 'Nilai', 'Keterangan']);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  const ket = {
    NAMA_INSTANSI:  'Nama instansi pada notifikasi',
    EMAIL_NOTIF:    'Penerima notifikasi reminder (pisahkan dengan koma)',
    BASE_URL:       'Domain aplikasi (ubah saat pindah domain instansi)',
    REMINDER_HARI:  'Ambang reminder H- dalam hari, pisahkan koma. 0 = hari berakhir',
    EMAIL_AKTIF:    'Aktifkan notifikasi Email (TRUE/FALSE)',
    WA_AKTIF:       'Aktifkan notifikasi WhatsApp (TRUE/FALSE)',
    WA_TARGET:      'Nomor WhatsApp tujuan (mis. 62812xxxx), pisahkan koma',
    LAMPIRKAN_FILE: 'Lampirkan file MoU/PKS pada email reminder (TRUE/FALSE)',
  };
  Object.keys(s).forEach(k => sheet.appendRow([k, s[k], ket[k] || '']));
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 360); sheet.setColumnWidth(3, 380);
}

// ==================== ENTRY POINTS ====================
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let result;
  try {
    if (action === 'getFormData')      result = getFormData();
    else if (action === 'getDashboard') result = getDashboard();
    else if (action === 'getKerjasama') result = { data: _listKerjasama() };
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
    const perluAuth = ['submitKerjasama', 'tambahDataset', 'updatePengaturan'];
    if (perluAuth.indexOf(action) > -1 && !_authOk(payload)) {
      result = { status: 'error', error: 'Kata sandi salah.', auth: true };
    }
    else if (action === 'submitKerjasama')   result = handleSubmit(payload);
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
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#6d28d9').setFontColor('#ffffff');
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
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#6d28d9').setFontColor('#ffffff');
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

    const id = 'K' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMddHHmmss') +
      Math.floor(Math.random() * 90 + 10);
    const { status, sisa } = _hitungStatus(berakhir);

    _kerjasamaSheet().appendRow([
      id, new Date(), idMitra, String(d.namaMitra).trim(), d.jenisMitra || '', d.wilayah || '',
      d.nomorSurat || '', d.bentuk || '', d.ruangLingkup || '', d.pengguna || '', d.jabatan || '',
      Number(d.biaya) || 0, masa, mulai, berakhir,
      d.jenisEntri || 'Baru', d.refSebelumnya || '', d.dokumenInduk || '', fileUrl, d.catatan || '',
      status, sisa, d.email || '', '',
    ]);

    _recountMitra();
    SpreadsheetApp.flush();
    return { status: 'success', id, idMitra, tanggalBerakhir: berakhir ? Utilities.formatDate(berakhir, 'GMT+7', 'yyyy-MM-dd') : '' };
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
function cekDanKirimReminder(manual) {
  const s = _settings();
  const ambang = String(s.REMINDER_HARI).split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n))
    .sort((a, b) => a - b); // ascending: 0,7,30,60,90
  const sheet = _kerjasamaSheet();
  const { headers, rows } = _readAll(sheet);
  const H = n => _colIndex(headers, n);
  const colSisa = H('Sisa Hari') + 1, colStatus = H('Status') + 1, colRem = H('Reminder Terakhir') + 1;

  const jatuhTempo = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const bDate = r[H('Tanggal Berakhir')] instanceof Date ? r[H('Tanggal Berakhir')] : _parseDate(r[H('Tanggal Berakhir')]);
    if (!bDate) return;
    const { status, sisa } = _hitungStatus(bDate);
    // Refresh status & sisa di sheet (sekalian)
    sheet.getRange(rowNo, colSisa).setValue(sisa);
    sheet.getRange(rowNo, colStatus).setValue(status);

    // Tentukan tahap pengingat (idempoten: 1x per tahap)
    let tag = null;
    if (sisa < 0) {
      if (sisa >= -7) tag = 'HABIS';   // baru habis (≤7 hari lalu) → ingatkan sekali
    } else {
      for (let a = 0; a < ambang.length; a++) { if (sisa <= ambang[a]) { tag = 'H-' + ambang[a]; break; } }
    }
    if (!tag) return;
    const last = String(r[colRem - 1] || '').split(' ')[0];
    if (last === tag) return; // tahap ini sudah dikirim → jangan dobel

    jatuhTempo.push({
      rowNo, tag, sisa, status,
      nama: r[H('Nama Mitra')], jenis: r[H('Jenis Mitra')], bentuk: r[H('Bentuk Kerja Sama')],
      nomor: r[H('Nomor Surat')], pengguna: r[H('Pengguna MoU/PKS')],
      berakhir: _fmt(bDate), file: r[H('Link File MoU/PKS')], ruang: r[H('Ruang Lingkup')],
    });
  });

  SpreadsheetApp.flush();
  if (jatuhTempo.length === 0) return { status: 'success', terkirim: 0, pesan: 'Tidak ada kerjasama jatuh tempo hari ini' };

  jatuhTempo.sort((a, b) => a.sisa - b.sisa);
  let emailOk = false, waOk = false;
  if (s.EMAIL_AKTIF) emailOk = _kirimEmailReminder(jatuhTempo, s);
  if (s.WA_AKTIF)    waOk = _kirimWaReminder(jatuhTempo, s);

  // tandai reminder terakhir
  const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  jatuhTempo.forEach(j => sheet.getRange(j.rowNo, colRem).setValue(j.tag + ' (' + stamp + ')'));
  SpreadsheetApp.flush();

  return { status: 'success', terkirim: jatuhTempo.length, email: emailOk, wa: waOk, manual: !!manual };
}

function _kirimEmailReminder(items, s) {
  const to = String(s.EMAIL_NOTIF).split(',').map(x => x.trim()).filter(Boolean);
  if (!to.length) return false;
  const subjek = '[Monitoring Kerja Sama] ' + items.length + ' kerja sama perlu perhatian — ' +
    Utilities.formatDate(new Date(), 'GMT+7', 'dd MMM yyyy');

  let rowsHtml = '';
  items.forEach((j, i) => {
    const warna = j.sisa <= 0 ? '#dc2626' : j.sisa <= 7 ? '#ea580c' : j.sisa <= 30 ? '#d97706' : '#6d28d9';
    const ket = j.sisa < 0 ? 'SUDAH HABIS (' + Math.abs(j.sisa) + ' hr lalu)'
      : j.sisa === 0 ? 'BERAKHIR HARI INI' : 'sisa ' + j.sisa + ' hari';
    rowsHtml += '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + (i + 1) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee"><b>' + _esc(j.nama) + '</b><br><span style="color:#666;font-size:12px">' + _esc(j.jenis) + '</span></td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + _esc(j.bentuk) + '<br><span style="color:#666;font-size:12px">' + _esc(j.nomor) + '</span></td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + _esc(j.pengguna) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + j.berakhir + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;color:' + warna + ';font-weight:bold">' + ket + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + (j.file && j.file.indexOf('http') === 0 ? '<a href="' + j.file + '">Lihat</a>' : '-') + '</td>' +
      '</tr>';
  });

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto">' +
    '<div style="background:#6d28d9;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0">Monitoring Masa Berlaku Kerja Sama</h2>' +
    '<div style="opacity:.9;font-size:13px">' + _esc(s.NAMA_INSTANSI) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">' +
    '<p>Berikut daftar kerja sama yang <b>akan/segera berakhir</b> dan perlu ditindaklanjuti ' +
    '(konfirmasi ke mitra & proses perpanjangan):</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
    '<thead><tr style="background:#f1f5f9;text-align:left">' +
    '<th style="padding:8px">#</th><th style="padding:8px">Mitra</th><th style="padding:8px">Bentuk / No. Surat</th>' +
    '<th style="padding:8px">Pengguna</th><th style="padding:8px">Berakhir</th><th style="padding:8px">Status</th><th style="padding:8px">Berkas</th>' +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<p style="margin-top:18px"><a href="' + s.BASE_URL + '" style="background:#6d28d9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Buka Dashboard</a></p>' +
    '<p style="color:#94a3b8;font-size:12px;margin-top:16px">Email otomatis dari Sistem Monitoring Kerja Sama. Mohon tidak membalas email ini.</p>' +
    '</div></div>';

  // Lampiran file MoU/PKS (bila diaktifkan)
  const attachments = [];
  if (s.LAMPIRKAN_FILE) {
    items.forEach(j => {
      const fid = _driveId(j.file);
      if (!fid) return;
      try { attachments.push(DriveApp.getFileById(fid).getBlob()); } catch (e) { /* skip */ }
    });
  }
  try {
    MailApp.sendEmail({ to: to.join(','), subject: subjek, htmlBody: html,
      attachments: attachments.length ? attachments.slice(0, 20) : undefined, noReply: true });
    return true;
  } catch (e) { return false; }
}

function _kirimWaReminder(items, s) {
  const targets = String(s.WA_TARGET).split(',').map(x => x.trim()).filter(Boolean);
  if (!targets.length || !CONFIG.WA_TOKEN || CONFIG.WA_TOKEN.indexOf('GANTI') === 0) return false;
  let pesan = '*Monitoring Kerja Sama — ' + s.NAMA_INSTANSI + '*\n' +
    items.length + ' kerja sama perlu perhatian:\n\n';
  items.slice(0, 30).forEach((j, i) => {
    const ket = j.sisa < 0 ? 'SUDAH HABIS (' + Math.abs(j.sisa) + ' hr lalu)'
      : j.sisa === 0 ? 'BERAKHIR HARI INI' : 'sisa ' + j.sisa + ' hari';
    pesan += (i + 1) + '. ' + j.nama + ' (' + j.bentuk + ')\n   Berakhir ' + j.berakhir + ' — ' + ket + '\n';
  });
  pesan += '\nBuka dashboard: ' + s.BASE_URL;
  let ok = false;
  targets.forEach(t => { if (_kirimWA(t, pesan)) ok = true; });
  return ok;
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
