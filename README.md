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
> (di-*inject* saat build). Untuk mengarahkan ke Spreadsheet Anda sendiri, ganti `GAS_URL` di Vercel
> (lihat §3.E). Template spreadsheet berisi **data dummy** siap uji coba.

---

## Daftar isi
1. [Fitur utama](#1-fitur-utama)
2. [Arsitektur & data](#2-arsitektur--data)
3. [Arsitektur frontend (MVC-ish, tanpa framework)](#3-arsitektur-frontend-mvc-ish-tanpa-framework)
4. [Setup langkah demi langkah](#4-setup-langkah-demi-langkah)
5. [Model akses & sesi login](#5-model-akses--sesi-login)
6. [Pemakaian per halaman](#6-pemakaian-per-halaman)
7. [Field & keputusan desain](#7-field--keputusan-desain)
8. [Tab Pengaturan](#8-tab-pengaturan)
9. [Endpoint API & fungsi editor](#9-endpoint-api--fungsi-editor)
10. [Struktur file](#10-struktur-file)
11. [Dependensi](#11-dependensi)
12. [Catatan & batasan](#12-catatan--batasan)

---

## 1. Fitur utama

**Backend (Google Apps Script)**
- Data di **1 Spreadsheet, 4 tab**: `Mitra` (master) · `Kerjasama` (transaksi/historis) · `Dataset` (dropdown dinamis) · `Pengaturan` (key-value).
- Upload berkas MoU/PKS → **Google Drive**, tautannya tercatat di baris.
- **Reminder otomatis harian (07:00 WIB)**: Email (+ opsional WhatsApp via Fonnte) pada ambang **H-90/60/30/7/0** dan sekali saat **baru habis** (≤7 hari). Satu **email digest** + **lampiran berkas**; **anti-spam** (sekali per tahap).
- **Gerbang kata sandi** untuk operasi tulis, **diverifikasi server-side**.
- Utilitas: `setupAwal`, `migrasiDataLama` (aman dari dobel), `refreshSemuaStatus`, `pasangTriggerReminder`.

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

| Tab | Isi | Sifat |
|-----|-----|-------|
| **Mitra** | Master mitra: `ID, Nama, Jenis, Wilayah, PIC (nama/email/HP), Jumlah Kerjasama` | Jarang berubah |
| **Kerjasama** | Historis tiap dokumen MoU/PKS (baru & perpanjangan) + `Status` & `Sisa Hari` otomatis | Bertambah terus |
| **Dataset** | Pilihan dropdown dinamis (`Jenis Mitra, Bentuk, Ruang Lingkup, Pengguna`) | Tumbuh dari form |
| **Pengaturan** | Key-value: email penerima, ambang reminder, toggle Email/WA, dll | Diatur admin |

**Kenapa dipisah master vs transaksi?** Data lama mencampur *jenis mitra* dengan *nama mitra* di satu
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
- Model dipisah **hanya di halaman Data** (yang logikanya berat). Dashboard & Form bersifat *view-heavy*
  sehingga cukup pola per-halaman — pemisahan Model di situ hanya jadi cangkang kosong (dihindari agar
  tidak over-engineering).
- **Tabel column-driven:** menambah/mengubah kolom cukup **satu baris** di `data.model.js`
  (`{ key, label, filter:'select'|'year', num, cls, hidden }`); header, sel, filter dinamis, dan
  visibilitas kolom menyesuaikan sendiri.

`build.js` meng-*inject* `GAS_URL` (juga `ADMIN_PASSWORD`, `BUG_URL` bila diisi) ke HTML + `app.js`
+ `components.js` + `controllers/*.js`, menyalin `styles.css`, lalu menaruh semua ke `dist/`.

---

## 4. Setup langkah demi langkah

### A. Spreadsheet & Apps Script
1. Buka Google Spreadsheet tujuan (boleh spreadsheet rekapan yang sudah ada).
2. Menu **Extensions → Apps Script**. Hapus isi default, **tempel seluruh `Code.gs`**.
   Pastikan `appsscript.json` memakai `timeZone: "Asia/Jakarta"` (Project Settings → *Show appsscript.json*).
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
2. *Execute as*: **Me** · *Who has access*: **Anyone**.
3. Salin **Web app URL** (berakhiran `/exec`) → ini `GAS_URL`.

### C. Reminder otomatis
- Jalankan fungsi **`pasangTriggerReminder`** sekali → memasang trigger harian **07:00 WIB**
  yang menjalankan `cekDanKirimReminder`.
- Atur penerima & ambang di tab **Pengaturan** (lihat §8).

### D. Migrasi data lama (opsional, ±1.213 baris)
1. Pastikan tab data lama bernama `Form Responses 1` ada di spreadsheet yang sama
   (atau set `CONFIG.OLD_SPREADSHEET_ID` + `CONFIG.OLD_SHEET_NAME`).
2. Jalankan **`migrasiDataLama`** sekali. Skrip mengelompokkan mitra (dedup nama), memisahkan
   *jenis* vs *nama* mitra (heuristik), dan menghitung Tanggal Berakhir & Status.
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

| Peran | Bisa | Halaman |
|-------|------|---------|
| **Publik** (tanpa login) | **Read** — lihat dashboard & telusuri tabel | `index.html`, `data.html` |
| **Admin** (kata sandi) | **CRUD** — tambah, ubah, hapus | `form.html`, tombol Edit/Hapus & hapus massal di `data.html` |

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
| Field | Alasan |
|-------|--------|
| `Jenis Entri` (Baru/Perpanjangan) | Membedakan kesepakatan baru vs perpanjangan. |
| `Ref Kerjasama Sebelumnya` | Menautkan riwayat perpanjangan → analisis kontinuitas & mitra terlama. |
| `Dokumen Induk (MoU)` | Pola **1 MoU payung → banyak PKS/MoA turunan** untuk satu mitra (mis. PKS per prodi). |
| `Status` & `Sisa Hari` (otomatis) | Kolom lama `SISA MASA BERLAKU` rusak (`#NUM!`). Dihitung ulang → penggerak reminder & dashboard. |
| `Link File MoU/PKS` | Berkas diunggah → Drive → tautannya dilampirkan ke email reminder. |
| `Wilayah/Provinsi` | Insight sebaran geografis. |
| `PIC Nama/Email/HP` (master) | Untuk konfirmasi ke mitra sebelum perpanjangan. |
| `Catatan` | Info bebas (status negosiasi, alasan tidak diperpanjang). |

### Aturan yang dikonfirmasi
- **Perpanjangan:** `Nama Mitra` & `Jenis Mitra` **tetap**; yang berubah: Nomor Surat, Bentuk, Biaya,
  Masa Berlaku, Tanggal, Berkas.
- **Tanggal Berakhir = Tanggal Mulai + Masa Berlaku (tahun)** — otomatis (bisa disesuaikan manual).
- **1 mitra boleh punya banyak MoU/PKS** (per prodi) — didukung relasi *1 Mitra → banyak Kerjasama*
  + `Dokumen Induk` untuk hierarki payung. Form beri **peringatan anti-duplikat** agar satu mitra
  tidak terpecah jadi banyak master.

---

## 8. Tab Pengaturan (key-value)

| Kunci | Default | Keterangan |
|-------|---------|-----------|
| `NAMA_INSTANSI` | Politeknik Kesehatan Kemenkes Palembang | Nama di notifikasi |
| `EMAIL_NOTIF` | lukman@, kerjasama@, okta@ …ac.id | Penerima reminder (pisah koma) |
| `BASE_URL` | https://simkerma.vercel.app | Domain aplikasi (tautan di email) |
| `REMINDER_HARI` | `90,60,30,7,0` | Ambang H- (hari). `0` = hari berakhir |
| `EMAIL_AKTIF` | TRUE | Aktifkan email |
| `WA_AKTIF` | FALSE | Aktifkan WhatsApp (butuh `WA_TOKEN` di CONFIG + `WA_TARGET`) |
| `WA_TARGET` | _(kosong)_ | Nomor WA tujuan (mis. `62812xxxx`), pisah koma |
| `LAMPIRKAN_FILE` | TRUE | Lampirkan berkas MoU/PKS pada email |

Rahasia (`ADMIN_PASSWORD`, `WA_TOKEN`) tetap di `CONFIG` Code.gs, **bukan** di Pengaturan/Sheet.

---

## 9. Endpoint API & fungsi editor

**`GET ?action=`** (publik, read-only)
- `getFormData` → dataset dropdown + daftar mitra + `dokByMitra` + `authRequired`
- `getDashboard` → seluruh agregasi insight
- `getKerjasama` → daftar kerja sama (tabel & prefill edit)
- `ping` → cek koneksi

**`POST { action }`** (★ = wajib `password` bila `ADMIN_PASSWORD` diisi)
- ★ `submitKerjasama` → simpan baru; bila `editId` diisi → **update** baris itu (upsert mitra, dataset baru, upload/keep file)
- ★ `deleteKerjasama` `{ id }` → hapus satu kerja sama
- ★ `tambahDataset` → tambah nilai dropdown
- ★ `updatePengaturan` → ubah pengaturan
- `runReminder` → kirim reminder manual (uji)

Respons gagal-otentikasi: `{ status:'error', auth:true }` → frontend meminta sandi ulang.

**Fungsi editor (jalankan manual dari Apps Script):** `setupAwal`, `pasangTriggerReminder`,
`migrasiDataLama(force?)`, `refreshSemuaStatus`, `cekDanKirimReminder`.

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

| Pustaka | Dipakai di | Fungsi |
|---------|-----------|--------|
| **Chart.js** | `index.html` | Grafik dashboard |
| **SheetJS (xlsx)** | `data.html` | Ekspor Excel (.xlsx) |
| **Font Awesome** | semua halaman | Ikon |

> Jika butuh 100% offline, ketiganya bisa diganti ke aset lokal/inline SVG (belum dilakukan).

---

## 12. Catatan & batasan

- **"Upload file di spreadsheet yang sama":** berkas tidak bisa disisipkan ke dalam sel — disimpan di
  **folder Google Drive**, **tautannya** dicatat di kolom `Link File MoU/PKS` (praktis menempel pada datanya).
- **Pengirim email:** dikirim dari akun yang men-deploy Apps Script. Agar dari `kerjasama@…`, tempel &
  deploy `Code.gs` dari akun tersebut.
- **Zona waktu:** pastikan Apps Script **Asia/Jakarta** (`appsscript.json` + Project Settings) agar
  perhitungan "sisa hari" pada WIB tidak meleset.
- **Kuota email:** MailApp ±100/hari (akun biasa). Reminder dikirim sebagai **satu digest**, hemat kuota.
- **Reminder idempoten:** tiap dokumen dikirim **sekali per tahap** (H-90/60/30/7/0 + sekali "baru habis").
  Kolom `Reminder Terakhir` mencatat tahap terakhir.
- **Endpoint Web App "Anyone":** agar form bisa mengirim tanpa login Google. Penulisan sudah dilindungi
  gerbang sandi server-side; alternatif lebih ketat: akses Web App "Anyone with a Google account".
- **State tabel** disimpan di localStorage (kunci `simkerma_data_state_v2`); mengubah struktur kolom
  menaikkan versi kunci sehingga default baru diterapkan.
