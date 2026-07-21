# SIMKERMA — Sistem Monitoring Masa Berlaku Kerja Sama

> 🌐 **Live:** https://simkerma.vercel.app · 📦 **Repo:** https://github.com/AnnisaBaizan/SIMKERMA · ☁️ **Vercel project:** `simkerma`

Aplikasi monitoring masa berlaku kerja sama (MoU/MoA/PKS) **Poltekkes Kemenkes Palembang**.
Tujuan utama: **tidak ada lagi kerja sama yang lupa/terlewat diperpanjang.**

Aplikasi **mengingatkan otomatis** (Email + opsional WhatsApp) saat sebuah kerja sama mendekati
tanggal berakhir — lengkap dengan lampiran berkas MoU/PKS-nya — serta menyajikan **dashboard insight**
dan **tabel data** yang bisa ditelusuri.

Pola arsitektur sama dengan project **SimpelBMN** & **Jum'at Bersih**:
**Google Apps Script** (backend di Spreadsheet) + **HTML statis** (frontend) di-deploy ke **Vercel**.

> ⚙️ **Catatan deploy:** frontend mengambil data dari Web App Apps Script lewat env **`GAS_URL`**
> (di-_inject_ saat build). Untuk mengarahkan ke Spreadsheet Anda sendiri, ganti `GAS_URL` di Vercel
> (lihat §3.E). Template spreadsheet berisi **data dummy** siap uji coba.
>
> 🧭 **Alasan pemilihan seluruh stack** (mengapa Google Sheets/Apps Script/Vercel/vanilla dipilih,
> analisis kapasitas & kapan perlu pindah database): lihat **[docs/KEPUTUSAN-ARSITEKTUR.md](docs/KEPUTUSAN-ARSITEKTUR.md)**.

---

## Daftar isi

1. [Fitur utama](#1-fitur-utama)
2. [Arsitektur &amp; data](#2-arsitektur--data)
3. [Arsitektur frontend (MVC-ish, tanpa framework)](#3-arsitektur-frontend-mvc-ish-tanpa-framework)
4. [Setup langkah demi langkah](#4-setup-langkah-demi-langkah)
5. [Model akses &amp; sesi login](#5-model-akses--sesi-login)
6. [Pemakaian per halaman](#6-pemakaian-per-halaman)
7. [Field &amp; keputusan desain](#7-field--keputusan-desain)
8. [Tab Pengaturan](#8-tab-pengaturan)
9. [Endpoint API &amp; fungsi editor](#9-endpoint-api--fungsi-editor)
10. [Struktur file](#10-struktur-file)
11. [Dependensi](#11-dependensi)
12. [Catatan &amp; batasan](#12-catatan--batasan)

---

## 1. Fitur utama

**Backend (Google Apps Script)**

- Data di **1 Spreadsheet, 4 tab**: `Mitra` (master) · `Kerjasama` (transaksi/historis) · `Dataset` (dropdown dinamis) · `Pengaturan` (key-value).
- Upload berkas MoU/PKS → **Google Drive**, tautannya tercatat di baris.
- **Reminder otomatis harian (07:00 WIB)** dengan **cadence bertingkat** — makin dekat jatuh tempo makin sering (mis. ≤90 hari tiap 30h, ≤60 tiap 14h, ≤30 tiap 7h, ≤7 **harian**), lalu harian selama masa tenggang setelah berakhir. Dikirim ke **2 pihak**: rekap **internal** (Email + WhatsApp: nomor &/atau grup) dan **eksternal per mitra** (Email + opsional WhatsApp ke PIC, dengan **batas/throttle anti-blokir**). Satu **email digest** internal + **lampiran berkas**.
- **Gerbang kata sandi** untuk operasi tulis, **diverifikasi server-side**.
- **Tombol Aduan mengambang** di semua halaman: 🐛 **Lapor Bug** & ⭐ **Nilai Aplikasi** (Google Form), plus **overlay survei tahunan** (muncul sekali/tahun mulai November, dilacak `localStorage` + override admin). Overlay bisa **dimatikan dari tab Pengaturan** (`SURVEY_AKTIF=FALSE`) — tanpa redeploy.
- Utilitas: `setupAwal`, `sinkronkanPengaturan`, `migrasiDataLama` (aman dari dobel), `refreshSemuaStatus`, `pasangTriggerReminder`.

**Dashboard (`index.html`)**

- Kartu ringkasan (total/aktif/segera berakhir/habis/jumlah mitra/total nilai) dengan ikon.
- Panel **daftar "Perlu Tindak Lanjut"** (akan/sudah berakhir) + pencarian.
- **2 kolom grafik ber-tab** (Chart.js): Tren/Tahun · Per Bidang · Masa Berlaku · Jenis Mitra · Bentuk · Top Pengguna.
- Tabel **Mitra Terlama** & **Mitra Terbanyak**. Skeleton saat memuat.

**Tabel Data (`data.html`) — column-driven, "melebihi DataTables" tanpa jQuery**

- **Kolom dipilih user** (tombol **Kolom**): 11 kolom, sebagian tersembunyi default.
- **Filter dinamis mengikuti kolom yang tampil** — aktifkan kolom, filternya ikut muncul.
- Pencarian global + **highlight** kata yang dicari.
- **Pagination 5/10/25/50/100** (di atas, bersebelahan search), urut kolom, paginasi.
- **Klik baris** untuk expand detail; **aksen warna kiri** per status baris.
- **Chip filter aktif** + "Bersihkan semua"; info "Menampilkan X–Y dari Z" + **total nilai**.
- **Admin**: checkbox **pilih baris + hapus massal**, Edit/Hapus per baris.
- **Ekspor Excel (.xlsx) & CSV** sesuai filter.
- **State diingat** (localStorage): kolom, filter, urutan, halaman, jml/halaman.
- Responsif (kolom sekunder pindah ke detail di layar kecil); dropdown **searchable** + navigasi keyboard (↑/↓/Enter).

**Form (`form.html`)**

- Mode **Kerja Sama Baru** / **Perpanjangan** (pilih mitra → auto-isi).
- Dropdown **searchable** (Jenis/Bentuk/Pengguna/Mitra/Dokumen Induk) + **"+ Tambah baru"** (auto tersimpan ke Dataset).
- **Peringatan anti-duplikat mitra** (nama mirip).
- **Dokumen Induk / Payung MoU** (relasi 1 MoU → banyak PKS turunan).
- **Biaya format ribuan** (Rp 1.000.000), **Masa Berlaku** tombol segmen 1–5 + **"Lain…"** (angka bebas).
- **Tanggal Berakhir otomatis** + **preview live** "Berlaku s.d. … · status".
- **Upload dropzone** (drag & drop + preview nama/ukuran + hapus, maks 10 MB).
- **Mode edit** lewat `form.html?edit=<id>`.

---

## 2. Arsitektur & data

```
┌──────────────────────┐   fetch (JSON)   ┌──────────────────────┐   baca/tulis   ┌────────────────┐
│  index / form / data │ ───────────────▶ │  Google Apps Script  │ ─────────────▶ │ Google Sheets  │
│  (HTML statis · CDN)  │ ◀─────────────── │  (Code.gs / Web App) │ ◀───────────── │  4 tab data    │
└──────────────────────┘     dashboard    └──────────────────────┘                └────────────────┘
        (Vercel)                             │ trigger harian 07:00                  + Google Drive
                                             ▼                                        (file MoU/PKS)
                                    Email + WhatsApp reminder
```

### Struktur data (4 tab dalam 1 Spreadsheet)

| Tab            | Isi                                                                                  | Sifat            |
| -------------- | ------------------------------------------------------------------------------------ | ---------------- |
| **Mitra**      | Master mitra:`ID, Nama, Jenis, Wilayah, PIC (nama/email/HP), Jumlah Kerjasama`       | Jarang berubah   |
| **Kerjasama**  | Historis tiap dokumen MoU/PKS (baru & perpanjangan) +`Status` & `Sisa Hari` otomatis | Bertambah terus  |
| **Dataset**    | Pilihan dropdown dinamis (`Jenis Mitra, Bentuk, Ruang Lingkup, Pengguna`)            | Tumbuh dari form |
| **Pengaturan** | Key-value: email penerima, ambang reminder, toggle Email/WA, dll                     | Diatur admin     |

**Kenapa dipisah master vs transaksi?** Data lama mencampur _jenis mitra_ dengan _nama mitra_ di satu
kolom, sedangkan kolom "Nama Mitra" hampir selalu kosong. Pemisahan ini merapikan data dan
memungkinkan insight seperti "mitra paling lama" & "mitra dengan kerja sama terbanyak".

---

## 3. Arsitektur frontend (MVC-ish, tanpa framework)

Frontend **statis murni** (tanpa React/bundler) tapi terstruktur seperti MVC ringan agar mudah dirawat:

```
VIEW (template)        index.html · form.html · data.html   → markup + kelas, tanpa logika
   │
FONDASI BERSAMA        assets/styles.css   → design system "Ink & Indigo" (semua halaman seragam)
                       assets/app.js       → SIMKERMA.*  (api, esc, rupiah, header, badge,
                                             sisaText, overlay, gate[sesi], searchSelect, msg)
                       assets/components.js→ SIMKERMA.ui.* (statCard, detailRow, pager, thSort,
                                             selectFilter, fileLink, badge, emptyRow, skel…)
   │
CONTROLLER (per halaman) assets/controllers/dashboard.js  → event + render Dashboard
                         assets/controllers/form.js       → event + render Form
                         assets/controllers/data.js       → event + render Tabel (tipis)
   │
MODEL                   assets/controllers/data.model.js  → window.DataModel: state + akses data +
                                             logika (filter/urut/paginasi/seleksi/CRUD/export/persist)
                                             — TANPA DOM, bisa diuji terpisah
```

- **View** = HTML; hanya markup. **Controller** = "otak" tiap halaman (pasang event, panggil model, render).
  **Model** (halaman Data) memisahkan seluruh logika data dari DOM — ciri MVC yang sesungguhnya.
- Model dipisah **hanya di halaman Data** (yang logikanya berat). Dashboard & Form bersifat _view-heavy_
  sehingga cukup pola per-halaman — pemisahan Model di situ hanya jadi cangkang kosong (dihindari agar
  tidak over-engineering).
- **Tabel column-driven:** menambah/mengubah kolom cukup **satu baris** di `data.model.js`
  (`{ key, label, filter:'select'|'year', num, cls, hidden }`); header, sel, filter dinamis, dan
  visibilitas kolom menyesuaikan sendiri.

`build.js` meng-_inject_ `GAS_URL` (juga `ADMIN_PASSWORD`, `BUG_URL`, `RATING_URL`, `RATING_OVERRIDE_PASSWORD` bila diisi) ke HTML + `app.js`

- `components.js` + `controllers/*.js`, menyalin `styles.css`, lalu menaruh semua ke `dist/`.

---

## 4. Setup langkah demi langkah

### A. Spreadsheet & Apps Script

1. Buka Google Spreadsheet tujuan (boleh spreadsheet rekapan yang sudah ada).
2. Menu **Extensions → Apps Script**. Hapus isi default, **tempel seluruh `Code.gs`**.
   Pastikan `appsscript.json` memakai `timeZone: "Asia/Jakarta"` (Project Settings → _Show appsscript.json_).
3. Isi bagian `CONFIG` di atas file:
   - `SPREADSHEET_ID` → ID di URL spreadsheet (`/d/<INI>/edit`).
   - `DRIVE_FOLDER_ID` → ID folder Drive penyimpan file MoU/PKS (buat folder, ambil ID dari URL).
   - `ADMIN_PASSWORD` → kata sandi operasi tulis (kosongkan = form terbuka tanpa sandi).
   - `WA_TOKEN` → token Fonnte (kosongkan jika belum pakai WhatsApp).
4. Jalankan fungsi **`setupAwal`** sekali (pilih fungsi → **Run**, beri izin saat diminta).
   Ini membuat tab `Mitra`, `Kerjasama`, `Dataset`, `Pengaturan` beserta seed dropdown.
   > Alternatif: impor `Template_Spreadsheet_MonitoringKerjasama.xlsx` (4 tab + data dummy)
   > lewat **File → Import → Insert new sheet(s)**, lalu hapus baris contoh saat pakai data asli.

### B. Deploy sebagai Web App

1. **Deploy → New deployment → Web app**.
2. _Execute as_: **Me** · _Who has access_: **Anyone**.
3. Salin **Web app URL** (berakhiran `/exec`) → ini `GAS_URL`.

### C. Reminder otomatis

- Jalankan fungsi **`pasangTriggerReminder`** sekali → memasang trigger harian **07:00 WIB**
  yang menjalankan `cekDanKirimReminder`.
- Atur penerima & ambang di tab **Pengaturan** (lihat §8).

### D. Migrasi data lama (opsional, ±1.213 baris)

1. Pastikan tab data lama bernama `Form Responses 1` ada di spreadsheet yang sama
   (atau set `CONFIG.OLD_SPREADSHEET_ID` + `CONFIG.OLD_SHEET_NAME`).
2. Jalankan **`migrasiDataLama`** sekali. Skrip mengelompokkan mitra (dedup nama), memisahkan
   _jenis_ vs _nama_ mitra (heuristik), dan menghitung Tanggal Berakhir & Status.
   Menolak jalan bila tab `Kerjasama` sudah berisi data (paksa: `migrasiDataLama(true)`).
3. **Rapikan manual** baris `Jenis Mitra = Lainnya` (data lama memang campur).

### E. Frontend (Vercel)

Project **`simkerma`** sudah ter-deploy ke https://simkerma.vercel.app. Untuk mengarahkan ke
Web App Apps Script Anda sendiri:

```bash
vercel env rm GAS_URL production -y
printf "https://script.google.com/macros/s/XXXX/exec" | vercel env add GAS_URL production
vercel deploy --prod
```

Atau via dashboard: **Project simkerma → Settings → Environment Variables → `GAS_URL`** → ubah → **Redeploy**.

Build lokal:

```bash
cp .env.example .env         # isi GAS_URL (opsional ADMIN_PASSWORD, BUG_URL)
export $(grep -v '^#' .env | xargs)
npm run build                # → dist/  (index/form/data + assets + assets/controllers + styles.css)
```

---

## 5. Model akses & sesi login

Data kerja sama bersifat **publik untuk dibaca**, hak **tulis** dibatasi kata sandi:

| Peran                    | Bisa                                        | Halaman                                                      |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| **Publik** (tanpa login) | **Read** — lihat dashboard & telusuri tabel | `index.html`, `data.html`                                    |
| **Admin** (kata sandi)   | **CRUD** — tambah, ubah, hapus              | `form.html`, tombol Edit/Hapus & hapus massal di `data.html` |

- Gerbang admin = **`CONFIG.ADMIN_PASSWORD`** di `Code.gs`, **diverifikasi server-side** — sandi
  **tidak** ditaruh di source halaman. (Kosongkan CONFIG = tanpa sandi.)
- **Sesi login persisten 1 hari** (localStorage). Sekali login, pindah halaman (Data → Edit → dst)
  **tidak** minta login lagi sampai kedaluwarsa. Jika sandi salah/kedaluwarsa saat menyimpan/hapus,
  otomatis diminta login ulang.
- Form: popup login **selalu tampil dulu** (menampilkan loading saat memuat data); form baru terbuka
  setelah login (jika `ADMIN_PASSWORD` diisi).
- Endpoint baca (`getDashboard`, `getKerjasama`, `getFormData`) terbuka; endpoint tulis wajib sandi.

---

## 6. Pemakaian per halaman

### `index.html` — Dashboard

Ringkasan + panel "Perlu Tindak Lanjut" + 2 kolom grafik ber-tab + tabel mitra terlama/terbanyak.

### `data.html` — Tabel data (publik read-only; admin bisa tulis)

- **Toolbar:** baris atas = **filter dinamis** (mengikuti kolom yang tampil); baris berikut =
  **Search · "Tampil N / hal" (5/10/25/50/100) · Reset**.
- **Kolom** → pilih kolom yang ditampilkan (11 kolom; default sebagian tersembunyi).
- Urut (klik header), paginasi, **klik baris** untuk detail, **highlight** hasil cari,
  **aksen warna** kiri per status, chip filter aktif, info + **total nilai**.
- **Export** → Excel (.xlsx) / CSV sesuai filter.
- **Admin** (tombol kanan atas → sandi) → checkbox **pilih baris + Hapus terpilih**, Edit/Hapus per baris.

### `form.html` — Input / Edit

- Mode **Baru** atau **Perpanjangan** (pilih mitra → auto-isi Nama/Jenis/PIC).
- Dropdown searchable + "+ Tambah baru", anti-duplikat mitra, Dokumen Induk, ruang lingkup (chips),
  biaya format ribuan, masa berlaku segmen 1–5/"Lain", tanggal berakhir otomatis + preview status,
  upload dropzone. **Edit** via `?edit=<id>`.

---

## 7. Field & keputusan desain

### Field yang ditambah (beserta alasan)

| Field                             | Alasan                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Jenis Entri` (Baru/Perpanjangan) | Membedakan kesepakatan baru vs perpanjangan.                                                    |
| `Ref Kerjasama Sebelumnya`        | Menautkan riwayat perpanjangan → analisis kontinuitas & mitra terlama.                          |
| `Dokumen Induk (MoU)`             | Pola**1 MoU payung → banyak PKS/MoA turunan** untuk satu mitra (mis. PKS per prodi).            |
|                                   |                                                                                                 |
| `Status` & `Sisa Hari` (otomatis) | Kolom lama`SISA MASA BERLAKU` rusak (`#NUM!`). Dihitung ulang → penggerak reminder & dashboard. |
| `Link File MoU/PKS`               | Berkas diunggah → Drive → tautannya dilampirkan ke email reminder.                              |
| `Wilayah/Provinsi`                | Insight sebaran geografis.                                                                      |
| `PIC Nama/Email/HP` (master)      | Untuk konfirmasi ke mitra sebelum perpanjangan.                                                 |
| `Catatan`                         | Info bebas (status negosiasi, alasan tidak diperpanjang).                                       |

### Aturan yang dikonfirmasi

- **Perpanjangan:** `Nama Mitra` & `Jenis Mitra` **tetap**; yang berubah: Nomor Surat, Bentuk, Biaya,
  Masa Berlaku, Tanggal, Berkas.
- **Tanggal Berakhir = Tanggal Mulai + Masa Berlaku (tahun)** — otomatis (bisa disesuaikan manual).
- **1 mitra boleh punya banyak MoU/PKS** (per prodi) — didukung relasi _1 Mitra → banyak Kerjasama_
  - `Dokumen Induk` untuk hierarki payung. Form beri **peringatan anti-duplikat** agar satu mitra
    tidak terpecah jadi banyak master.

---

## 8. Tab Pengaturan (key-value)

**Internal (tim Poltekkes) — rekap semua yang jatuh tempo:**

| Kunci              | Default                       | Keterangan                                                     |
| ------------------ | ----------------------------- | -------------------------------------------------------------- |
| `NAMA_INSTANSI`    | Politeknik Kesehatan …        | Nama di notifikasi                                             |
| `EMAIL_NOTIF`      | kerjasama@…ac.id              | Email tim penerima rekap (pisah koma)                          |
| `BASE_URL`         | https://simkerma.vercel.app   | Domain aplikasi (tautan di email)                             |
| `REMINDER_CADENCE` | `90:30,60:14,30:7,7:1`        | **Jadwal berulang** `sisa:interval` (hari). Makin dekat makin sering |
| `GRACE_HABIS_HARI` | `14`                          | Setelah berakhir, tetap ingatkan harian s.d. N hari lalu berhenti |
| `EMAIL_AKTIF`      | TRUE                          | Aktifkan email rekap internal                                 |
| `WA_NOMOR_AKTIF`   | FALSE                         | WA rekap ke **nomor** perorangan tim (`WA_TARGET`)            |
| `WA_TARGET`        | _(kosong)_                    | Nomor WA tim (mis. `62812xxxx`), pisah koma                    |
| `WA_GRUP_AKTIF`    | FALSE                         | WA rekap ke **grup** (`WA_GRUP_ID`) — hemat kuota Fonnte       |
| `WA_GRUP_ID`       | _(kosong)_                    | ID grup WhatsApp (Fonnte)                                      |
| `LAMPIRKAN_FILE`   | TRUE                          | Lampirkan berkas MoU/PKS pada email                           |
| `SURVEY_AKTIF`     | TRUE                          | Tampilkan overlay survei tahunan (Nov). `FALSE` = matikan (tanpa redeploy) |

`WA_NOMOR_AKTIF` & `WA_GRUP_AKTIF` **independen** — bisa dua-duanya aktif (mis. kirim ke grup **dan** ke orang yang tak ada di grup).

**Eksternal (ke PIC mitra) — default MATI, hanya kerja sama milik mitra ybs:**

| Kunci                        | Default | Keterangan                                                          |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| `EMAIL_EKSTERNAL_AKTIF`      | FALSE   | Email ke `PIC Email` mitra (aman untuk dinyalakan)                  |
| `WA_EKSTERNAL_AKTIF`         | FALSE   | ⚠️ WA ke `PIC HP` mitra. **Risiko nomor Fonnte diblokir** bila banyak |
| `WA_EKSTERNAL_MAKS_PER_HARI` | `8`     | Batas WA eksternal/hari (anti-blokir); sisanya digeser ke hari berikutnya |
| `WA_EKSTERNAL_JEDA_DETIK`    | `8`     | Jeda antar-kirim WA eksternal (detik), anti-burst                   |

Rahasia (`ADMIN_PASSWORD`, `WA_TOKEN`) tetap di `CONFIG` Code.gs, **bukan** di Pengaturan/Sheet.

> Setelah meng-update sistem, jalankan **`sinkronkanPengaturan`** sekali dari editor untuk menambahkan kunci-kunci baru ke tab Pengaturan yang sudah ada.

---

## 9. Endpoint API & fungsi editor

**`GET ?action=`** (publik, read-only)

- `getFormData` → dataset dropdown + daftar mitra + `dokByMitra` + `authRequired`
- `getDashboard` → seluruh agregasi insight
- `getKerjasama` → daftar kerja sama (tabel & prefill edit)
- `getPublicConfig` → konfigurasi publik ringan (mis. `surveyAktif`)
- `ping` → cek koneksi

**`POST { action }`** (★ = wajib `password` bila `ADMIN_PASSWORD` diisi)

- ★ `submitKerjasama` → simpan baru; bila `editId` diisi → **update** baris itu (upsert mitra, dataset baru, upload/keep file)
- ★ `deleteKerjasama` `{ id }` → hapus satu kerja sama
- ★ `tambahDataset` → tambah nilai dropdown
- ★ `updatePengaturan` → ubah pengaturan
- `runReminder` → kirim reminder manual (uji)

Respons gagal-otentikasi: `{ status:'error', auth:true }` → frontend meminta sandi ulang.

**Fungsi editor (jalankan manual dari Apps Script):** `setupAwal`, `sinkronkanPengaturan`,
`pasangTriggerReminder`, `migrasiDataLama(force?)`, `refreshSemuaStatus`, `cekDanKirimReminder`.

---

## 10. Struktur file

```
Monitoring-Kerjasama/
├── Code.gs                 # Backend Google Apps Script (Web App)
├── appsscript.json         # Manifest GAS (timeZone Asia/Jakarta, akses Web App)
├── index.html              # VIEW — Dashboard
├── form.html               # VIEW — Form input/edit
├── data.html               # VIEW — Tabel data
├── assets/
│   ├── styles.css          # Design system "Ink & Indigo" (semua halaman seragam)
│   ├── app.js              # Inti: SIMKERMA.{api,esc,rupiah,header,badge,overlay,gate,searchSelect,msg}
│   ├── components.js        # Komponen UI: SIMKERMA.ui.{statCard,detailRow,pager,thSort,selectFilter,skel…}
│   └── controllers/         # Otak/logika tiap halaman (view ↔ controller dipisah)
│       ├── dashboard.js     # Controller Dashboard (Chart.js, tab grafik, ringkasan)
│       ├── form.js          # Controller Form (mode, dataset, edit, gate, dropzone, biaya, masa)
│       ├── data.js          # Controller Tabel (event + render; tipis)
│       └── data.model.js    # MODEL Tabel: state + filter/urut/paginasi/seleksi/CRUD/export (tanpa DOM)
├── build.js                # Inject GAS_URL → dist/ (HTML + assets + controllers; salin styles.css)
├── vercel.json             # Konfigurasi build statis Vercel
├── package.json            # Metadata + script build
├── .env.example            # Template environment variable
├── Template_Spreadsheet_MonitoringKerjasama.xlsx  # Template 4 tab + data dummy (impor manual; opsional)
└── README.md
```

---

## 11. Dependensi

Tanpa `npm install` untuk runtime — hanya modul bawaan Node untuk `build.js`. Frontend memuat
3 pustaka dari **CDN** (butuh internet saat halaman dibuka):

| Pustaka            | Dipakai di    | Fungsi               |
| ------------------ | ------------- | -------------------- |
| **Chart.js**       | `index.html`  | Grafik dashboard     |
| **SheetJS (xlsx)** | `data.html`   | Ekspor Excel (.xlsx) |
| **Font Awesome**   | semua halaman | Ikon                 |

> Jika butuh 100% offline, ketiganya bisa diganti ke aset lokal/inline SVG (belum dilakukan).

---

## 12. Catatan & batasan

- **"Upload file di spreadsheet yang sama":** berkas tidak bisa disisipkan ke dalam sel — disimpan di
  **folder Google Drive**, **tautannya** dicatat di kolom `Link File MoU/PKS` (praktis menempel pada datanya).
- **Pengirim email:** dikirim dari akun yang men-deploy Apps Script. Agar dari `kerjasama@…`, tempel &
  deploy `Code.gs` dari akun tersebut.
- **Zona waktu:** pastikan Apps Script **Asia/Jakarta** (`appsscript.json` + Project Settings) agar
  perhitungan "sisa hari" pada WIB tidak meleset.
- **Kuota email:** MailApp ±100/hari (akun biasa). Rekap internal dikirim sebagai **satu digest** (hemat);
  email eksternal 1 per mitra jatuh tempo — perhatikan kuota bila banyak mitra.
- **Kuota & keamanan WhatsApp (Fonnte):** paket ±1000 pesan/tahun. Kirim ke **grup** jauh lebih hemat
  (1 pesan vs per-nomor). WA **eksternal** dibatasi `WA_EKSTERNAL_MAKS_PER_HARI` + jeda `WA_EKSTERNAL_JEDA_DETIK`
  detik antar-kirim agar **nomor pengirim tidak diblokir**; kelebihan di atas batas otomatis menyusul hari berikutnya.
- **Cadence reminder:** `Reminder Terakhir` kini menyimpan **tanggal** terakhir diingatkan. Tiap pagi sistem
  cek `hari_ini − terakhir ≥ interval_zona` (dari `REMINDER_CADENCE`) → jadi frekuensi meningkat otomatis
  saat mendekati/melewati jatuh tempo, bukan sekali per ambang.
- **Endpoint Web App "Anyone":** agar form bisa mengirim tanpa login Google. Penulisan sudah dilindungi
  gerbang sandi server-side; alternatif lebih ketat: akses Web App "Anyone with a Google account".
- **State tabel** disimpan di localStorage (kunci `simkerma_data_state_v2`); mengubah struktur kolom
  menaikkan versi kunci sehingga default baru diterapkan.
