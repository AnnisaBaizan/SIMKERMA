# SIMKERMA — Sistem Monitoring Masa Berlaku Kerja Sama

> 🌐 **Live:** https://simkerma.vercel.app · 📦 **Repo:** https://github.com/AnnisaBaizan/SIMKERMA
>
> ⚙️ **Status:** Frontend sudah ter-deploy. Saat ini `GAS_URL` masih **placeholder**, jadi
> dashboard belum menarik data. Setelah Apps Script Web App di-deploy, ganti env `GAS_URL`
> di Vercel dengan URL asli lalu redeploy (lihat §3E). Tab `Mitra`/`Kerjasama` di template
> sudah berisi **data dummy** untuk uji coba dashboard.

Aplikasi monitoring masa berlaku kerja sama (MoU/MoA/PKS) **Poltekkes Kemenkes Palembang**.
Tujuan utama: **tidak ada lagi kerja sama yang lupa/terlewat diperpanjang.**

Aplikasi otomatis mengingatkan (Email + opsional WhatsApp) saat sebuah kerja sama mendekati
tanggal berakhir — lengkap dengan lampiran berkas MoU/PKS-nya — serta menyajikan dashboard
insight dari seluruh data kerja sama.

Pola arsitektur sama dengan project **SimpelBMN** & **Jum'at Bersih**:
**Google Apps Script** (backend di Spreadsheet) + **HTML statis** (form & dashboard) di-deploy ke **Vercel**.

---

## 1. Arsitektur

```
┌─────────────┐   fetch (JSON)   ┌──────────────────────┐   baca/tulis   ┌────────────────┐
│ form.html   │ ───────────────▶ │  Google Apps Script  │ ─────────────▶ │ Google Sheets  │
│ index.html  │ ◀─────────────── │  (Code.gs / Web App) │ ◀───────────── │  4 tab data    │
└─────────────┘     dashboard    └──────────────────────┘                └────────────────┘
  (Vercel)                          │ trigger harian 07:00                  + Google Drive
                                    ▼                                        (file MoU/PKS)
                            Email + WhatsApp reminder
```

### Struktur data (4 tab dalam 1 Spreadsheet)

| Tab | Isi | Sifat |
|-----|-----|-------|
| **Mitra** | Master mitra: `ID, Nama, Jenis, Wilayah, PIC (nama/email/HP), Jumlah Kerjasama` | Jarang berubah |
| **Kerjasama** | Historis tiap dokumen MoU/PKS (baru & perpanjangan) + `Status` & `Sisa Hari` otomatis | Bertambah terus |
| **Dataset** | Pilihan dropdown dinamis: `Jenis Mitra, Bentuk, Ruang Lingkup, Pengguna` | Tumbuh dari form |
| **Pengaturan** | Key-value: email penerima, ambang reminder, toggle Email/WA, dll | Diatur admin |

**Kenapa dipisah master vs transaksi?** Data lama mencampur *jenis mitra* dengan *nama mitra* di satu
kolom, sedangkan kolom "Nama Mitra" hampir selalu kosong. Pemisahan ini merapikan data dan
memungkinkan insight seperti "mitra paling lama" & "mitra dengan kerja sama terbanyak".

---

## 2. Field & keputusan desain

### Field yang ditambah (beserta alasan)
| Field | Alasan |
|-------|--------|
| `Jenis Entri` (Baru/Perpanjangan) | Membedakan kesepakatan baru vs perpanjangan (permintaan inti). |
| `Ref Kerjasama Sebelumnya` | Menautkan riwayat perpanjangan → analisis kontinuitas & mitra terlama. |
| `Dokumen Induk (MoU)` | Merepresentasikan pola **1 MoU payung → banyak PKS/MoA turunan** untuk satu mitra (mis. PKS per prodi). Dipilih dari daftar dokumen mitra di form. |
| `Status` & `Sisa Hari` (otomatis) | Kolom lama `SISA MASA BERLAKU` rusak (`#NUM!`). Dihitung ulang otomatis; jadi penggerak reminder & dashboard. |
| `Link File MoU/PKS` | Berkas diunggah dari form → Drive → tautannya dilampirkan ke email reminder. |
| `Wilayah/Provinsi` | Membuka insight sebaran geografis. |
| `PIC Nama/Email/HP` (di master) | Untuk konfirmasi ke mitra sebelum perpanjangan. |
| `Catatan` | Info bebas (status negosiasi, alasan tidak diperpanjang). |

### Aturan yang dikonfirmasi (dari diskusi)
- **Perpanjangan**: `Nama Mitra` & `Jenis Mitra` **tetap**. Yang berubah: Nomor Surat, Bentuk, Biaya,
  Masa Berlaku, Tanggal Mulai/Berakhir, Berkas.
- **Tanggal Berakhir = Tanggal Mulai + Masa Berlaku (tahun)** — dihitung otomatis (bisa disesuaikan manual).
- 1 mitra boleh punya banyak MoU/PKS (mis. per prodi) — didukung lewat relasi
  **1 Mitra (master) → banyak Kerjasama (transaksi)**, plus `Dokumen Induk` untuk hierarki
  MoU payung → PKS turunan. Form memberi **peringatan anti-duplikat** bila nama mitra mirip
  dengan yang sudah ada, agar satu mitra tidak terpecah jadi banyak master.

---

## 3. Setup (langkah demi langkah)

### A. Spreadsheet & Apps Script
1. Buka Google Spreadsheet tujuan (boleh spreadsheet rekapan yang sudah ada).
2. Menu **Extensions → Apps Script**. Hapus isi default, **tempel seluruh `Code.gs`**.
3. Isi bagian `CONFIG` di atas file:
   - `SPREADSHEET_ID` → ID di URL spreadsheet (`/d/<INI>/edit`).
   - `DRIVE_FOLDER_ID` → ID folder Drive penyimpan file MoU/PKS (buat folder, ambil ID dari URL).
   - `WA_TOKEN` → token Fonnte (kosongkan jika belum pakai WhatsApp).
4. Jalankan fungsi **`setupAwal`** sekali (pilih fungsi → **Run**, beri izin saat diminta).
   Ini membuat tab `Mitra`, `Kerjasama`, `Dataset`, `Pengaturan` beserta seed dropdown.
   > Alternatif: impor `Template_Spreadsheet_MonitoringKerjasama.xlsx` (4 tab sudah jadi)
   > lewat **File → Import → Insert new sheet(s)**, lalu hapus baris contoh.

### B. Deploy sebagai Web App
1. **Deploy → New deployment → Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone**.
3. Salin **Web app URL** (berakhiran `/exec`) → ini `GAS_URL`.

### C. Reminder otomatis
- Jalankan fungsi **`pasangTriggerReminder`** sekali → memasang trigger harian **07:00 WIB**
  yang menjalankan `cekDanKirimReminder`.
- Atur penerima & ambang di tab **Pengaturan** (lihat §5).

### D. Migrasi data lama (1.213 baris)
> Hanya jika ingin memindahkan data dari rekapan Google Form lama.
1. Pastikan tab data lama bernama `Form Responses 1` ada di spreadsheet yang sama
   (atau set `CONFIG.OLD_SPREADSHEET_ID` + `CONFIG.OLD_SHEET_NAME`).
2. Jalankan fungsi **`migrasiDataLama`** sekali. Skrip akan:
   - Mengelompokkan mitra (dedup berdasarkan nama),
   - Memisahkan *jenis* vs *nama* mitra (heuristik),
   - Menghitung Tanggal Berakhir & Status untuk tiap baris.
3. **Rapikan manual** baris yang `Jenis Mitra = Lainnya` atau Nama Mitra masih berupa jenis
   (data lama memang campur — lihat catatan di §6).

### E. Frontend (Vercel) — sudah ter-deploy
Project Vercel **`simkerma`** sudah dibuat & ter-deploy ke https://simkerma.vercel.app
(env `GAS_URL` saat ini masih placeholder).

Untuk mengaktifkan data asli setelah Apps Script Web App siap:
```bash
# ganti GAS_URL dengan URL Web App asli, lalu redeploy
vercel env rm GAS_URL production -y
printf "https://script.google.com/macros/s/XXXX/exec" | vercel env add GAS_URL production
vercel deploy --prod
```
Atau lewat dashboard Vercel: **Project simkerma → Settings → Environment Variables → `GAS_URL`** → ubah → **Redeploy**.

Build otomatis: Vercel menjalankan `node build.js` → meng-inject `GAS_URL` (juga `ADMIN_PASSWORD`,
`BUG_URL` bila diisi) → output `dist/` berisi `index.html` & `form.html`.

Build lokal:
```bash
cp .env.example .env                    # isi GAS_URL
export $(grep -v '^#' .env | xargs)
npm run build                           # → dist/
```

---

## 4. Pemakaian

- **`form.html`** — Input kerja sama.
  - Mode **Kerja Sama Baru**: isi semua field; mitra boleh baru atau pilih yang sudah ada.
  - Mode **Perpanjangan**: pilih mitra dari daftar → data mitra ter-isi otomatis; isi ulang
    detail dokumen baru.
  - Dropdown (Jenis/Bentuk/Pengguna/Ruang Lingkup) diambil dari tab **Dataset**. Pilih
    **"+ Tambah baru…"** untuk menambah nilai baru — otomatis tersimpan ke Dataset.
  - Upload berkas MoU/PKS → tersimpan di Drive, tautannya tercatat di baris.
- **`index.html`** — Dashboard insight:
  ringkasan (total/aktif/segera berakhir/habis/nilai), daftar **perlu tindak lanjut**,
  tren per tahun, per bidang, per jenis mitra, per bentuk, top pengguna, distribusi masa berlaku,
  **mitra terlama**, **mitra terbanyak**.

---

## 5. Tab Pengaturan (key-value)

| Kunci | Default | Keterangan |
|-------|---------|-----------|
| `NAMA_INSTANSI` | Politeknik Kesehatan Kemenkes Palembang | Nama di notifikasi |
| `EMAIL_NOTIF` | lukman@, kerjasama@, okta@ …ac.id | Penerima reminder (pisah koma) |
| `BASE_URL` | https://simkerma.vercel.app | Domain aplikasi |
| `REMINDER_HARI` | `90,60,30,7,0` | Ambang H- (hari). `0` = hari berakhir |
| `EMAIL_AKTIF` | TRUE | Aktifkan email |
| `WA_AKTIF` | FALSE | Aktifkan WhatsApp (butuh `WA_TOKEN` di CONFIG + `WA_TARGET`) |
| `WA_TARGET` | _(kosong)_ | Nomor WA tujuan (mis. `62812xxxx`), pisah koma |
| `LAMPIRKAN_FILE` | TRUE | Lampirkan berkas MoU/PKS pada email |

Reminder bersifat **anti-spam**: tiap baris hanya dikirim sekali per ambang
(kolom `Reminder Terakhir` mencatat `H-30 (tanggal)`).

---

## 6. Catatan & batasan

- **"Upload file di spreadsheet yang sama"**: secara teknis berkas tidak bisa disisipkan ke dalam
  sel. Berkas disimpan di **folder Google Drive** dan **tautannya** dicatat di kolom
  `Link File MoU/PKS` pada baris kerja sama yang sama — praktis "menempel" pada datanya.
- **Notifikasi pengirim**: email dikirim dari akun yang men-deploy Apps Script. Agar dikirim dari
  `kerjasama@…`, tempel & deploy `Code.gs` dari akun tersebut.
- **Data lama campur**: kolom "Mitra" lama berisi campuran jenis & nama. Migrasi merapikan
  sebisanya secara heuristik; sisanya dirapikan manual di tab `Mitra`/`Kerjasama`.
- **Batas kuota**: Email MailApp ±100/hari (akun biasa). Reminder dikirim sebagai **satu email
  digest** berisi banyak baris, jadi hemat kuota.

---

## 7. Struktur file

```
Monitoring-Kerjasama/
├── Code.gs            # Backend Google Apps Script (Web App)
├── form.html          # Form input (mode Baru/Perpanjangan)
├── index.html         # Dashboard insight (Chart.js)
├── build.js           # Inject GAS_URL → dist/ (Node bawaan, tanpa npm install)
├── vercel.json        # Konfigurasi build statis Vercel
├── package.json       # Metadata + script build
├── .env.example       # Template environment variable
├── Template_Spreadsheet_MonitoringKerjasama.xlsx  # Template 4 tab (impor manual; opsional)
└── README.md
```

## 8. Endpoint API (Web App)

`GET ?action=`
- `getFormData` → dataset dropdown + daftar mitra (untuk form)
- `getDashboard` → seluruh agregasi insight
- `getKerjasama` → daftar kerja sama
- `ping` → cek koneksi

`POST { action }`
- `submitKerjasama` → simpan kerja sama (+ upsert mitra, dataset baru, upload file)
- `tambahDataset` → tambah nilai dropdown
- `updatePengaturan` → ubah pengaturan
- `runReminder` → kirim reminder manual (uji)

Fungsi editor (jalankan manual): `setupAwal`, `pasangTriggerReminder`, `migrasiDataLama`,
`refreshSemuaStatus`, `cekDanKirimReminder`.
