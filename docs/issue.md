# Audit SIMKERMA — Daftar Isu

> Audit menyeluruh atas kode & alur aplikasi (backend `Code.gs`, frontend `assets/`, `build.js`,
> `tools/build_template.py`). Tanggal: **2026-07-22**. Dokumen ini **laporan** — belum ada kode yang diubah.
> Setiap temuan diberi lokasi `file:baris` (perkiraan; nomor bisa bergeser sedikit setelah edit).

**Legenda tingkat:** 🔴 Tinggi (bisa merusak data / salah hasil) · 🟠 Sedang (risiko nyata pada kondisi tertentu) · 🟡 Rendah (edge-case / higiene) · ⚪ Info/asumsi.

---

## 🔴 Tinggi

### H-1 — Sheet lama tanpa kolom `Tindak Lanjut` → data bergeser (misalignment)
- **Lokasi:** [Code.gs](../Code.gs) `handleSubmit`/`buildRow` (~390), `HEADERS_KERJASAMA` (~53), `_readAll` (273).
- **Masalah:** `buildRow` kini menghasilkan **25 kolom** (dengan `Tindak Lanjut` di posisi 21). Jika spreadsheet yang aktif masih memakai skema **24 kolom** (belum ada kolom `Tindak Lanjut`), penulisan `setValues` menaruh nilai `Tindak Lanjut` di kolom 21 padahal header kolom 21 = `Status`. Akibatnya saat dibaca kembali, `Status`/`Sisa`/`Diinput`/`Reminder` **membaca kolom yang salah** → status kacau, reminder salah.
- **Dampak:** korupsi tampilan status & logika pengingat pada instalasi yang di-*upgrade* tanpa menambah kolom.
- **Saran:** (a) Wajibkan `sinkronkanKolomKerjasama()` — fungsi baru yang menyisipkan kolom `Tindak Lanjut` setelah `Catatan` bila belum ada; **atau** (b) tambahkan penjaga di `handleSubmit`: jika `_kerjasamaSheet().getLastColumn() < HEADERS_KERJASAMA.length` atau `headers` tidak memuat semua nama → tolak dengan pesan jelas. Dokumentasikan langkah upgrade di README.

---

## 🟠 Sedang

### M-1 — Dashboard mengabaikan `Tindak Lanjut` (tak konsisten dengan mesin reminder)
- **Lokasi:** `getDashboard` [Code.gs:614](../Code.gs).
- **Masalah:** Mesin reminder `cekDanKirimReminder` **melewati** baris yang `Tindak Lanjut`-nya penutup (Diperpanjang/Tidak Diperpanjang/Selesai), tetapi `getDashboard` tetap menghitung baris tersebut sebagai `Segera Berakhir`/`Habis` dan menampilkannya di daftar **"Perlu Tindak Lanjut"**. Jadi kerja sama yang sudah diperpanjang/ditutup **masih muncul** seolah butuh perhatian.
- **Dampak:** angka & daftar dashboard menyesatkan; kerja "yang perlu ditindaklanjuti" terlihat lebih banyak dari kenyataan.
- **Saran:** di `getDashboard`, kecualikan (atau tandai terpisah) baris dengan `_tlClosed(tindakLanjut)` dari `akanBerakhir`/`sudahHabis` dan/atau dari hitungan ringkasan. Minimal: beri kolom/badge status tindak lanjut di daftar itu.

### M-2 — `getPengaturan` (GET) tanpa autentikasi → bocornya penerima notif
- **Lokasi:** `doGet` (~209), `getPengaturan` [Code.gs:571](../Code.gs).
- **Masalah:** endpoint dibaca tanpa sandi dan mengembalikan **semua** pengaturan termasuk `EMAIL_NOTIF`, `WA_TARGET`, `WA_GRUP_ID`. Siapa pun yang tahu `GAS_URL` bisa mengambilnya (`?action=getPengaturan`).
- **Dampak:** kebocoran alamat email tim & nomor/ID grup WA (bukan rahasia sistem, tapi data internal).
- **Saran:** wajibkan sandi untuk `getPengaturan` (pindah pengambilan ke `doPost` bergerbang `_authOk`, atau kirim sandi sebagai parameter dan verifikasi). Rahasia (`ADMIN_PASSWORD`/`WA_TOKEN`) memang sudah tidak diikutkan — pertahankan.

### M-3 — Penulisan status per-sel dalam loop → lambat & rawan batas 6 menit
- **Lokasi:** `cekDanKirimReminder` (~800), `refreshSemuaStatus` [Code.gs:1042](../Code.gs), `_recountMitra` [Code.gs:354](../Code.gs).
- **Masalah:** menulis `Status`/`Sisa` (dan hitung mitra) dengan `getRange().setValue()` **satu sel per baris** di dalam loop. Untuk ~720 baris = ~1.400+ panggilan API Sheets → sangat lambat, berisiko melewati **batas eksekusi Apps Script 6 menit** dan boros kuota.
- **Dampak:** trigger harian bisa gagal/timeout saat data membesar (justru saat paling butuh andal).
- **Saran:** kumpulkan nilai ke array lalu tulis **sekali** dengan `getRange(2, colSisa, n, 1).setValues(...)` (atau tulis blok 2 kolom bersebelahan). Idem untuk `_recountMitra`.

### M-4 — Berkas unggahan bersifat "siapa pun dengan tautan" + gagal-diam
- **Lokasi:** `_saveFile` [Code.gs:480](../Code.gs) (sharing `ANYONE_WITH_LINK`, baris ~494; `return 'ERROR_UPLOAD…'` baris ~497).
- **Masalah 1 (privasi):** setiap MoU/PKS di-set **publik lewat tautan** agar bisa dilampirkan/diklik di email. Dokumen kerja sama bisa sensitif.
- **Masalah 2 (gagal-diam):** bila upload gagal, fungsi **mengembalikan string** `"ERROR_UPLOAD: …"` yang lalu **tersimpan sebagai link berkas**, dan `handleSubmit` tetap sukses. Baris punya "link" rusak tanpa peringatan.
- **Saran:** (1) pertimbangkan berbagi terbatas (mis. domain instansi) bila dokumen sensitif; email tetap bisa melampirkan blob tanpa link publik. (2) Deteksi kegagalan upload dan **kembalikan error ke user** (jangan simpan string error sebagai link).

---

## 🟡 Rendah

### L-1 — `Ref Kerjasama Sebelumnya` bisa menunjuk dirinya sendiri (saat edit)
- **Lokasi:** `getFormData.dokByMitra` [Code.gs:548](../Code.gs), `fillRefKerjasama` [form.js](../assets/controllers/form.js).
- **Masalah:** daftar "Kerja Sama yang Diperpanjang" berisi **semua** kerja sama mitra, termasuk baris yang sedang diedit → admin bisa memilih dirinya sendiri sebagai pendahulunya (referensi melingkar).
- **Saran:** saat edit, kecualikan `k.id` dari daftar `refKerjasama` (dan idealnya juga dari `dokumenInduk`).

### L-2 — Auto-tutup perpanjangan searah (tak bisa dibatalkan)
- **Lokasi:** `_tandaiDiperpanjang` [Code.gs:451](../Code.gs), dipanggil hanya pada CREATE (~417).
- **Masalah:** jika baris "Perpanjangan" dihapus/diubah, baris lama tetap `Diperpanjang` → **pengingatnya diam selamanya** walau perpanjangannya batal. Juga: mengedit baris menjadi Perpanjangan tidak memicu auto-tutup (hanya create).
- **Saran:** saat `deleteKerjasama` menghapus baris ber-`refSebelumnya`, kembalikan `Tindak Lanjut` baris rujukan ke kosong (bila nilainya `Diperpanjang`). Pertimbangkan panggil `_tandaiDiperpanjang` juga pada edit.

### L-3 — Mengedit baris mereset `Reminder Terakhir` → bisa memicu notif ulang
- **Lokasi:** `handleSubmit` edit [Code.gs:408](../Code.gs) (`buildRow(..., '', ...)`).
- **Masalah:** setiap edit (termasuk koreksi kecil) mengosongkan `Reminder Terakhir` → pada run berikutnya baris dianggap "belum pernah diingatkan" dan dikirim lagi.
- **Saran:** hanya reset bila `Tanggal Berakhir` benar-benar berubah; jika tidak, pertahankan `Reminder Terakhir` lama.

### L-4 — `cekDanKirimReminder` tanpa `LockService`
- **Lokasi:** [Code.gs:784](../Code.gs) (bandingkan `handleSubmit` yang memakai lock).
- **Masalah:** bila trigger berjalan bersamaan dengan submit user, penulisan `Status`/`Reminder Terakhir` bisa balapan. Kecil kemungkinannya (trigger 07:00) tapi ada.
- **Saran:** bungkus bagian tulis dengan `LockService.getScriptLock()`.

### L-5 — `_updatePengaturan` menerima kunci apa pun
- **Lokasi:** [Code.gs:1009](../Code.gs).
- **Masalah:** kunci yang tidak dikenal tetap ditulis sebagai baris baru di tab Pengaturan (payload bisa mengotori sheet). Sudah bergerbang sandi, jadi risikonya rendah.
- **Saran:** validasi `k` terhadap `Object.keys(_defaultSettings())` sebelum menulis.

### L-6 — Sandi override survei tampak di sumber halaman
- **Lokasi:** `__RATING_OVERRIDE_PASSWORD__` di-inject ke `app.js` (build.js), dipakai `S.aduan._override`.
- **Masalah:** nilai ada di JS publik → bisa dilihat. Dampak rendah (hanya melewati pop-up survei, bukan gerbang data).
- **Saran:** cukup dokumentasikan bahwa ini bukan kontrol keamanan; gerbang data tetap `ADMIN_PASSWORD` server-side.

### L-7 — Perubahan `SURVEY_AKTIF` tertunda ≤6 jam
- **Lokasi:** `S.aduan._surveyAktif` cache 6 jam ([app.js](../assets/app.js)).
- **Masalah:** mematikan survei dari tab Pengaturan baru terasa setelah cache kedaluwarsa.
- **Saran:** terima; atau turunkan TTL, atau sediakan tombol "paksa segarkan".

---

## ⚪ Info / Asumsi / Higiene

### I-1 — Baris "UJI COBA" ikut di template yang di-commit
- **Lokasi:** `tools/build_template.py` `make_test_rows`, `Template_Spreadsheet_MonitoringKerjasama.xlsx`.
- **Catatan:** 20 baris `K-UJI-*` sengaja ada untuk uji notif, tetapi bila template dipakai sebagai basis **produksi**, baris ini ikut menghitung di dashboard & memicu email. **Hapus dulu** sebelum dipakai sungguhan (mudah difilter dari `ID Kerjasama` diawali `K-UJI-`).

### I-2 — Pengiriman WA ke grup Fonnte = asumsi
- **Lokasi:** `_kirimWA(target, …)` [Code.gs:988](../Code.gs) dengan `target = WA_GRUP_ID`.
- **Catatan:** perilaku `target` sebagai ID grup bergantung pada konfigurasi akun/perangkat Fonnte. **Belum diverifikasi** end-to-end (butuh token & grup nyata).

### I-3 — Verifikasi sandi plaintext + disimpan di localStorage
- **Lokasi:** `_authOk` [Code.gs:240](../Code.gs); sesi klien `simkerma_auth` (24 jam) di [app.js](../assets/app.js).
- **Catatan:** sesuai model ancaman aplikasi internal (bukan data super-rahasia) — dapat diterima. Perbandingan bukan *constant-time* (tak kritis di sini). Pertahankan sandi hanya di CONFIG server-side.

### I-4 — Dua skema ID mitra/kerjasama
- **Catatan:** template/migrasi memakai `M-0001`/`K-0001`; input via form memakai `M`/`K`+timestamp. Tidak salah, tapi tidak seragam secara kosmetik.

### I-5 — Kuota email untuk notif eksternal
- **Catatan:** email eksternal = 1 per mitra jatuh tempo. MailApp ±100/hari (akun biasa) → bila banyak mitra jatuh tempo serentak, kuota bisa habis. `EMAIL_NOTIF` internal (digest) aman; awasi bila eksternal diaktifkan massal.

---

## Prioritas perbaikan yang disarankan

1. **H-1** (penjaga/penyisip kolom `Tindak Lanjut`) — cegah korupsi data saat upgrade.
2. **M-1** (dashboard hormati `Tindak Lanjut`) — konsistensi angka.
3. **M-3** (batch `setValues`) — keandalan trigger saat data membesar.
4. **M-2** (auth `getPengaturan`) & **M-4** (upload gagal-diam + privasi berkas) — keamanan/privasi.
5. Sisanya (L-*) sebagai higiene bertahap.

> Catatan: laporan ini fokus pada **logika, keandalan, keamanan, konsistensi**. Tidak ada perubahan kode
> dilakukan dalam audit ini — silakan pilih mana yang mau dikerjakan, saya bantu perbaiki bertahap.
