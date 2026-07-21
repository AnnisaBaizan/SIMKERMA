# Keputusan Arsitektur & Alasan Pemilihan Stack — SIMKERMA

Dokumen ini menjelaskan **mengapa** tiap teknologi di project ini dipilih (bukan sekadar *apa*-nya),
lengkap dengan alternatif yang dipertimbangkan dan konsekuensinya. Ditulis gaya **ADR
(Architecture Decision Record)** agar keputusan bisa ditinjau ulang di masa depan.

> Konteks: **satu instansi** — Politeknik Kesehatan Kemenkes Palembang. Tujuan aplikasi:
> memantau masa berlaku kerja sama (MoU/MoA/PKS) agar tidak ada yang terlewat diperpanjang.
> Skala data realistis: **±200 kerja sama baru/tahun** (dari data historis ±1.200 dalam ~6–7 tahun).

---

## 0. Prinsip yang memandu semua keputusan

1. **Zero-infra & gratis** — tidak ada server/DB berbayar untuk dirawat instansi.
2. **Mudah diserahterimakan** — petugas non-teknis bisa membuka & mengoreksi data langsung
   (di Google Sheets), tanpa tools khusus.
3. **Proporsional, bukan canggih** — pilih yang paling sederhana yang memenuhi kebutuhan
   ("no abstraction unless necessary"). Hindari over-engineering.
4. **Satu sumber kebenaran** — hindari data/logika terduplikasi yang bisa jadi tidak sinkron.
5. **Scalable secukupnya + jalur keluar jelas** — cukup untuk 1 instansi berpuluh tahun,
   dengan rencana migrasi bila skala berubah drastis.

---

## Peta stack

| Lapisan | Teknologi | Alasan singkat |
|---|---|---|
| Basis data | **Google Sheets** (4 tab) | Gratis, bisa dilihat/dikoreksi manusia, sudah ada di Workspace kampus |
| Backend/API | **Google Apps Script** (Web App) | Zero-hosting, terikat ke Sheets, punya trigger & email bawaan |
| Penyimpanan berkas | **Google Drive** (kuota **1 TB**) | Menyimpan file MoU/PKS; tautannya dicatat di Sheets |
| Penjadwalan | **GAS time-driven trigger** | Reminder harian tanpa server cron |
| Email | **MailApp** (GAS) | Kirim email tanpa server SMTP |
| WhatsApp (opsional) | **Fonnte** (HTTP API) | Notifikasi WA murah, opsional |
| Frontend | **HTML + CSS + JS vanilla** | App kecil (3 halaman); tanpa framework/bundler |
| Struktur frontend | **Design system + komponen + MVC-ish** | Rapi & mudah dirawat tanpa React |
| Hosting frontend | **Vercel** (static) | Deploy gratis dari Git, HTTPS+CDN, inject env |
| Pustaka (CDN) | **Chart.js, SheetJS, Font Awesome** | Grafik, ekspor Excel, ikon — tanpa build |

---

## ADR-1 — Backend: Google Apps Script + Google Sheets (bukan server + database)

**Keputusan.** Memakai Google Apps Script sebagai backend (Web App) dengan Google Sheets sebagai
penyimpanan data, alih-alih server tradisional (Node/PHP) + database (Postgres/MySQL).

**Alasan.**
- **Biaya & pemeliharaan nol.** Tidak ada server yang harus disewa, dipatch, atau dimonitor.
  Instansi pendidikan sering tak punya anggaran/SDM untuk mengelola server & DB.
- **Sudah di ekosistem kampus.** Poltekkes memakai Google Workspace → akun, izin, dan berbagi
  sudah ada. Tidak perlu sistem auth baru.
- **Bisa dibaca/dikoreksi manusia.** Petugas bisa membuka Spreadsheet, memverifikasi, memperbaiki
  typo, atau menambah kolom bantu — tanpa aplikasi. Ini krusial untuk serah terima & audit.
- **Fitur bawaan pas kebutuhan:** *time-driven trigger* (reminder harian) & `MailApp` (email)
  tanpa infrastruktur tambahan.
- **Tahan lama & portabel.** Selama akun Google hidup, sistem jalan; tidak bergantung pada
  langganan hosting yang bisa mati.

**Alternatif yang dipertimbangkan.**
- *Node/Express + Postgres di VPS/Cloud* — paling fleksibel & scalable, tapi **berbayar**,
  butuh DevOps, dan berlebihan untuk 1 instansi.
- *Firebase/Supabase* — bagus, tapi menambah kurva belajar, potensi vendor lock-in, dan tetap
  tidak "bisa dibuka manusia" seperti Sheets.
- *Spreadsheet + Google Form saja (tanpa web app)* — inilah kondisi awal; UX buruk, tak ada
  reminder, data campur/tak konsisten. Justru masalah yang aplikasi ini selesaikan.

**Konsekuensi.**
- (+) Gratis, sederhana, mudah diserahkan.
- (−) Tidak untuk jutaan baris atau konkurensi tinggi (lihat ADR-2). Batas eksekusi Apps Script
  (6 menit) & pemuatan data ke memori membatasi skala — tapi jauh di atas kebutuhan 1 instansi.

---

## ADR-2 — Google Sheets **sudah lebih dari cukup** (analisis kapasitas)

**Klaim.** Untuk satu Poltekkes, Google Sheets cukup untuk **puluhan tahun hingga seabad+**.

**Perhitungan (laju ±200 kerja sama/tahun, dari data nyata).**

| Ambang | Jumlah baris | Estimasi umur |
|---|---|---|
| Mulai terasa berat tapi masih jalan | ~30.000 | **~150 tahun** |
| Batas performa masih wajar | ~50.000 | **~250 tahun** |
| Batas keras Sheets (10 juta sel ÷ ~24 kolom) | ~400.000 | **~2.000 tahun** |

- Bahkan bila laju **5× lipat** (~1.000/tahun), ambang nyaman ~50.000 baris tetap **~50 tahun**.
- Patokan praktis bukan penyimpanan, melainkan **kecepatan dashboard** (yang memuat semua baris
  untuk agregasi). Bila kelak lambat, cukup **arsipkan kerja sama sangat lama** ke tab terpisah —
  jauh sebelum perlu pikirkan database.

**Kesimpulan.** Menyimpan data 1 instansi di Sheets **bukan risiko nyata**. Migrasi ke DB hanya
relevan bila skala berubah menjadi **multi-instansi / tingkat nasional** (lihat ADR-11).

---

## ADR-3 — Penyimpanan berkas: Google Drive (kuota **1 TB**)

**Keputusan.** Berkas MoU/PKS yang diunggah disimpan di **folder Google Drive**; hanya *tautannya*
dicatat di kolom `Link File MoU/PKS` pada baris kerja sama.

**Alasan.**
- Sel spreadsheet **tidak bisa** menampung file mentah; tautan Drive adalah cara standar.
- Tidak membebani kuota sel Sheets (file terpisah dari data).

**Kapasitas (kuota 1 TB).** Rata-rata berkas ~1–5 MB. Ambil ~2 MB:
`1.000.000 MB ÷ 2 MB ≈ 500.000 berkas`. Pada ~200 berkas/tahun → **≈ 2.500 tahun**.
Jadi **penyimpanan berkas pun bukan kendala**.

**Konsekuensi.** Berkas & metadata memang terpisah (Drive vs Sheets), tapi terhubung via tautan —
praktis "menempel" pada datanya, dan bisa dilampirkan otomatis di email reminder.

---

## ADR-4 — Frontend: HTML/CSS/JS **vanilla** (tanpa React/Vue)

**Keputusan.** Membangun 3 halaman statis dengan JavaScript murni, tanpa framework atau bundler.

**Alasan.**
- **Ukuran aplikasi kecil** (dashboard, tabel, form). Framework SPA = kompleksitas & tooling
  (node_modules, build step) yang tak sebanding manfaatnya.
- **Mudah dipahami & diserahkan** — siapa pun yang bisa HTML/JS dasar bisa merawat; tak perlu
  tahu ekosistem React.
- **Load cepat & hosting statis gratis.**
- Prinsip *no abstraction unless necessary*.

**Alternatif.** React/Vue/Svelte — cocok untuk aplikasi besar & interaktif kompleks, tapi
overkill di sini dan menambah beban pemeliharaan.

**Konsekuensi.**
- (+) Ringan, sederhana, tanpa build tooling berat (hanya `build.js` bawaan Node untuk inject env).
- (−) Tidak ada reaktivitas otomatis; ditangani manual lewat pola komponen & controller (ADR-5).

---

## ADR-5 — Struktur frontend: design system + komponen + **MVC-ish**

**Keputusan.** Walau vanilla, kode ditata: `styles.css` (design system) + `app.js` (inti) +
`components.js` (komponen UI) + `controllers/*.js` (logika per halaman) + `data.model.js`
(Model halaman Data: state + logika, tanpa DOM).

**Alasan.** Mencegah "spaghetti" pada JS vanilla; memisahkan **tampilan (View)**,
**logika halaman (Controller)**, dan **data/aturan (Model)** agar mudah dirawat & ditinjau.
Model dipisah **hanya di halaman Data** (yang logikanya berat); Dashboard & Form *view-heavy*
sehingga tak dipaksakan (menghindari cangkang kosong / seremonial).

**Konsekuensi.** Menambah/mengubah kolom tabel cukup 1 baris konfigurasi (column-driven);
header, sel, filter dinamis, dan visibilitas menyesuaikan sendiri.

---

## ADR-6 — Hosting frontend: Vercel (static)

**Keputusan.** Frontend di-deploy sebagai situs statis ke Vercel; backend tetap di Apps Script.

**Alasan.** Deploy gratis langsung dari Git, HTTPS + CDN global otomatis, dan **injeksi env**
(`GAS_URL`, dll) saat build lewat `build.js`. Domain bersih (`simkerma.vercel.app`) & preview
per commit. Memisahkan **tampilan** (Vercel) dari **data** (GAS) menjaga tanggung jawab tetap jelas.

**Alternatif.** GitHub Pages (bisa, tapi injeksi env & preview kurang praktis); serve HTML langsung
dari Apps Script (bisa, tapi domain & DX kurang baik, dan mencampur tampilan dengan backend).

---

## ADR-7 — Pustaka via CDN: Chart.js, SheetJS, Font Awesome

**Keputusan.** Tiga pustaka dimuat dari CDN, bukan di-*bundle*.

**Alasan.** Tanpa build step, di-cache global, selalu versi tepat. Masing-masing: **Chart.js**
(grafik matang & ringan), **SheetJS** (ekspor `.xlsx` standar), **Font Awesome** (ikon konsisten).

**Konsekuensi.** Butuh internet saat halaman dibuka — wajar, karena app memang online untuk
mengambil data dari GAS. Bila perlu tahan-blokir jaringan, ketiganya bisa di-*self-host* (unduh
ke `assets/`) tanpa mengubah logika.

---

## ADR-8 — Reminder: **cadence bertingkat** + notifikasi 2 pihak (GAS trigger + MailApp + Fonnte)

**Keputusan.** Trigger harian (07:00 WIB) menjalankan `cekDanKirimReminder`. Pengingat memakai
**cadence bertingkat** — makin dekat jatuh tempo makin sering — bukan "sekali per ambang".
Setting `REMINDER_CADENCE` = `"sisa:interval"` (mis. `90:30,60:14,30:7,7:1`) + `GRACE_HABIS_HARI`
(harian selama masa tenggang setelah berakhir). Dikirim ke **2 pihak**:

- **Internal** (tim): email **digest** (+ lampiran) & WA ke **nomor dan/atau grup** (toggle terpisah).
- **Eksternal** (per mitra): email ke `PIC Email` (hanya kerja samanya) + WA opsional ke `PIC HP`.
  **Default MATI**.

**Alasan.** User butuh pengingat **berulang yang meningkat** (mis. bulanan → mingguan → harian),
bukan satu kali per tahap. Kolom `Reminder Terakhir` kini menyimpan **tanggal** terakhir kirim;
sistem cek `hari_ini − terakhir ≥ interval_zona`. Penjadwalan & email **bawaan & gratis**.

**WA eksternal anti-blokir.** Karena mengirim WA ke banyak nomor tak dikenal berisiko memblokir
nomor pengirim Fonnte, WA eksternal dibatasi `WA_EKSTERNAL_MAKS_PER_HARI` + jeda
`WA_EKSTERNAL_JEDA_DETIK` antar-kirim; kelebihan digeser ke hari berikutnya. Kirim ke **grup** lebih
hemat kuota (~1000 pesan/tahun Fonnte).

**Alternatif ditolak.** Cron server + SendGrid/Mailgun (berbayar, butuh infra). "Sekali per ambang"
(lama) — tidak cukup menekan agar ditindaklanjuti.

---

## ADR-9 — Data: pisah **Mitra (master)** vs **Kerjasama (transaksi)**

**Keputusan.** Dua tab: `Mitra` (identitas mitra, jarang berubah) dan `Kerjasama` (tiap dokumen,
bertambah terus), dihubungkan `ID Mitra`.

**Alasan.** Data lama mencampur *jenis* & *nama* mitra dalam satu kolom (dan kolom nama sering
kosong) → tidak konsisten. Pemisahan merapikan data, mencegah mitra ganda (via peringatan
anti-duplikat di form), dan memungkinkan insight ("mitra terlama", "mitra terbanyak"), serta
hierarki **1 MoU payung → banyak PKS turunan** lewat `Dokumen Induk`.

---

## ADR-10 — Status & Sisa Hari: **dihitung di backend (compute-on-read)**, bukan rumus Sheets

**Keputusan.** `Status` & `Sisa Hari` diturunkan dari `Tanggal Berakhir` oleh fungsi backend
`_hitungStatus()` **setiap kali data diambil** (UI & reminder pakai fungsi yang sama). Kolom
Status/Sisa di sheet hanya **snapshot** yang disegarkan trigger harian (`refreshSemuaStatus`).

**Alasan.**
- **Satu sumber kebenaran = `Tanggal Berakhir`.** Status & Sisa selalu turunannya → mustahil
  UI dan notifikasi berbeda.
- **Rumus spreadsheet rapuh** — persis yang merusak data lama (`#NUM!`). Paste value, hapus baris,
  sisip kolom, atau format tanggal beda bisa merusaknya.
- **`TODAY()` volatile tak bisa diandalkan headless** — recalc terjadi saat dokumen aktif/terbuka;
  bila dibaca via API sementara sheet lama tak dibuka, nilai bisa **basi** tepat saat dibutuhkan.
- **`appendRow` tak mengisi rumus**; `ARRAYFORMULA` malah bentrok dengan penulisan Apps Script.
- **Biaya hitung sepele** — pengurangan tanggal atas ratusan/ribuan baris = milidetik.

**Kapan berubah.** Pada skala DB (ADR-11), pola tetap sama (turunkan dari tanggal berakhir), tapi
lewat *computed column*/SQL + **indeks** + **paginasi** — hanya menghitung baris yang diambil.

---

## ADR-11 — Kapan harus pindah ke database?

Pertahankan Sheets **selama** ini benar:
- Satu instansi, laju ratusan kerja sama/tahun.
- Total baris masih puluhan ribu; dashboard masih responsif.

Pertimbangkan migrasi ke **database** (Postgres/MySQL/Firestore) **hanya bila**:
- Menjadi **multi-instansi / tingkat nasional** (banyak Poltekkes/PT dalam satu sistem).
- Baris menuju **ratusan ribu+** atau butuh **konkurensi tinggi** / laporan berat real-time.
- Butuh integrasi/hak akses granular yang tak nyaman di Sheets.

Saat itu: Status/Sisa via *computed column*/view SQL + indeks tanggal + query berpaginasi
(tak pernah memuat semua baris), agregasi dashboard via `GROUP BY` di server. Migrasi bisa
**bertahap** karena data sudah rapi & ternormalisasi (Mitra vs Kerjasama).

---

## ADR-12 — Berhenti mengingatkan: kolom **Tindak Lanjut** + deteksi perpanjangan **by-Ref**

**Keputusan.** Pengingat berhenti untuk sebuah kerja sama bila **kolom `Tindak Lanjut`** berisi
status penutup (`Diperpanjang` / `Tidak Diperpanjang` / `Selesai`). Kosong atau `Sedang Diproses`
= **terus diingatkan** (justru itu tujuannya: menekan sampai ada keputusan). Deteksi "sudah
diperpanjang" memakai **tautan eksplisit by-ID** `Ref Kerjasama Sebelumnya`: saat Perpanjangan
diinput, baris baru menunjuk ID kerja sama lama, dan backend **otomatis** menandai yang lama
`Diperpanjang` (`_tandaiDiperpanjang`) → pengingatnya berhenti.

**Alasan.** Aturan harus **eksplisit & tak ambigu**. Alternatif *implicit grouping* (menebak dari
`mitra + bentuk + pengguna` lalu ambil yang terbaru) **ditolak**: pada data asli, satu mitra sering
punya **beberapa PKS berbeda yang sah** dengan kombinasi sama, sehingga tebakan bisa keliru
"menelan" kerja sama yang sebenarnya beda. `Tindak Lanjut` juga menangani data historis (yang tak
punya rantai Ref) secara manual, sekaligus kasus "memang tak diperpanjang".

**Konsekuensi.** Form Perpanjangan kini **wajib** memilih kerja sama sebelumnya (memperbaiki bug
lama yang menyimpan *id mitra* sebagai Ref). Fungsi diagnostik `diagReminder()` menghitung berapa
baris ditutup Tindak Lanjut.

---

## ADR-13 — Konfigurasi runtime dari **tab Pengaturan** + halaman UI Pengaturan

**Keputusan.** Toggle operasional (mis. `SURVEY_AKTIF`, aktif/nonaktif kanal notif, cadence)
tinggal di **tab Pengaturan** (dibaca `getPengaturan`/`getPublicConfig`), **bukan** env build.
Disediakan halaman **`pengaturan.html`** untuk mengubahnya dari web (bergerbang sandi via
`updatePengaturan`), tanpa perlu buka spreadsheet atau redeploy.

**Alasan.** Perubahan operasional harus bisa dilakukan admin **tanpa deploy ulang** dan tanpa
menyentuh kode. Rahasia (`ADMIN_PASSWORD`, `WA_TOKEN`) **tetap** di `CONFIG` Code.gs (server-side),
tidak pernah dikirim ke frontend. URL Google Form (bug/survei) tetap env build (config sekali-set).

**Konsekuensi.** `getPublicConfig` di-cache ~6 jam di `localStorage` agar overlay survei tak
mem-fetch tiap halaman; `runReminder` kini butuh sandi (hardening).

---

## Ringkasan

Stack ini dipilih karena **paling pas dengan konteks nyata**: satu instansi pendidikan, anggaran
& SDM teknis terbatas, kebutuhan utama = pengingat perpanjangan + rekap rapi. Google Workspace
(Sheets + Apps Script + Drive) memberi **backend + database + penyimpanan + penjadwalan + email
gratis dan tahan lama**, dengan data yang **bisa dibaca manusia**. Frontend vanilla + Vercel
menjaga semuanya **ringan, murah, dan mudah dirawat**. Untuk skala 1 Poltekkes, kombinasi ini
**lebih dari cukup untuk berpuluh tahun** — dan bila suatu saat skalanya meloncat, jalur migrasi
ke database sudah jelas dan datanya sudah siap.
