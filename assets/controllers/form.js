const api = SIMKERMA.api, gate = SIMKERMA.gate, show = SIMKERMA.msg, overlay = SIMKERMA.overlay;
SIMKERMA.header('input', { subtitle: 'Input Kerja Sama' });

let DATA = { dataset: {}, mitra: [] }, MODE = 'Baru', EDIT_ID = null;
const ruangSelected = new Set();

function setReady(ready) { const b = document.getElementById('submitBtn'); b.disabled = !ready; b.innerHTML = ready ? '<i class="fa-solid fa-floppy-disk"></i> Simpan Kerja Sama' : '<i class="fa-solid fa-spinner fa-spin"></i> Memuat data…'; }
function revealForm() { gate.close(); document.getElementById('formArea').style.display = ''; }
function hideForm() { document.getElementById('formArea').style.display = 'none'; }
function requireLogin(msg) { hideForm(); gate.prompt(msg || '', revealForm, { mandatory: true, sub: 'Masukkan kata sandi untuk mengisi formulir.' }); }

// Popup selalu muncul lebih dulu; saat data dimuat, popup menampilkan loading.
async function load() {
  gate.loading('Memuat data…');
  try {
    DATA = await api.get('getFormData');
    if (DATA.error) throw new Error(DATA.error);
    if (DATA.instansi) SIMKERMA.setSub(DATA.instansi);
    fillSelect('jenisMitra', DATA.dataset['Jenis Mitra']);
    fillSelect('bentuk', DATA.dataset['Bentuk Kerja Sama']);
    fillSelect('pengguna', DATA.dataset['Pengguna MoU/PKS']);
    fillRuang(DATA.dataset['Ruang Lingkup'] || []);
    fillMitra(); setReady(true);
    SIMKERMA.searchify(['jenisMitra', 'bentuk', 'pengguna', 'mitraSelect', 'dokumenInduk']);
    const ep = new URLSearchParams(location.search).get('edit');
    if (ep) await loadEditRecord(ep);
    if (DATA.authRequired && !gate.pw) requireLogin();   // wajib login sebelum form tampil
    else revealForm();                                   // tanpa sandi → langsung buka
  } catch (e) { gate.close(); setReady(false); show('err', 'Gagal memuat data: ' + esc(e.message) + '. <a href="#" onclick="location.reload();return false;">Muat ulang</a>'); }
}

// Sesi di-reset tiap tab tidak aktif → saat kembali, wajib login lagi (jika perlu sandi).

function fillSelect(id, arr) {
  const s = document.getElementById(id); s.innerHTML = '<option value="">— pilih —</option>';
  (arr || []).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
  const n = document.createElement('option'); n.value = '__NEW__'; n.textContent = '+ Tambah baru…'; s.appendChild(n);
}
function fillRuang(arr) { document.getElementById('ruangChips').innerHTML = ''; arr.forEach(v => addRuangChip(v)); }
function addRuangChip(v) {
  const box = document.getElementById('ruangChips'); if ([...box.children].some(c => c.dataset.v === v)) return;
  const c = document.createElement('div'); c.className = 'chip'; c.dataset.v = v; c.textContent = v;
  c.onclick = () => { if (ruangSelected.has(v)) { ruangSelected.delete(v); c.classList.remove('on'); } else { ruangSelected.add(v); c.classList.add('on'); } }; box.appendChild(c);
}
function addRuangNew(e) {
  if (e.key !== 'Enter') return; e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
  addRuangChip(v); const c = [...document.getElementById('ruangChips').children].find(x => x.dataset.v === v); c.classList.add('on'); c.dataset.new = '1'; ruangSelected.add(v); e.target.value = '';
}
function fillMitra() {
  const s = document.getElementById('mitraSelect'); s.innerHTML = '<option value="">— pilih mitra —</option>';
  (DATA.mitra || []).slice().sort((a, b) => String(a.nama).localeCompare(b.nama)).forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.nama + (m.jenis ? ' (' + m.jenis + ')' : ''); s.appendChild(o); });
  if (s._ss) s._ss.refresh();
}

function setMode(m) {
  MODE = m; document.getElementById('modeBaru').classList.toggle('active', m === 'Baru');
  document.getElementById('modePerpanjangan').classList.toggle('active', m === 'Perpanjangan');
  document.getElementById('perpanjanganBox').style.display = m === 'Perpanjangan' ? 'block' : 'none';
}
function prefillMitra() {
  const id = document.getElementById('mitraSelect').value; const m = (DATA.mitra || []).find(x => x.id === id); if (!m) return;
  document.getElementById('namaMitra').value = m.nama || ''; setSelect('jenisMitra', m.jenis || '');
  document.getElementById('wilayah').value = m.wilayah || ''; document.getElementById('picNama').value = m.picNama || '';
  document.getElementById('picEmail').value = m.picEmail || ''; document.getElementById('picHp').value = m.picHp || '';
  document.getElementById('mitraSuggest').innerHTML = ''; fillInduk(id);
}
function fillInduk(idMitra) {
  const s = document.getElementById('dokumenInduk'); s.innerHTML = '<option value="">— tidak ada / dokumen ini berdiri sendiri —</option>';
  const docs = (DATA.dokByMitra || {})[idMitra] || []; docs.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = (d.bentuk || 'Dokumen') + ' — ' + (d.nomor || d.id); s.appendChild(o); });
  document.getElementById('indukHint').textContent = docs.length ? docs.length + ' dokumen mitra ini tersedia sebagai induk.' : 'Mitra ini belum punya dokumen lain.';
  if (s._ss) s._ss.refresh();
}

function normNama(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function checkDup() {
  const box = document.getElementById('mitraSuggest'); const v = document.getElementById('namaMitra').value.trim(); box.innerHTML = ''; if (v.length < 4) return;
  const nv = normNama(v); const match = (DATA.mitra || []).filter(m => { const nm = normNama(m.nama); if (!nm || nm === nv) return false; return nm.indexOf(nv) > -1 || nv.indexOf(nm) > -1; }).slice(0, 4);
  if (!match.length) return; box.appendChild(document.createTextNode('⚠️ Mirip mitra yang sudah ada: '));
  match.forEach((m, i) => { const a = document.createElement('a'); a.href = '#'; a.textContent = m.nama; a.style.fontWeight = '600'; a.onclick = e => { e.preventDefault(); useExisting(m.id); }; box.appendChild(a); if (i < match.length - 1) box.appendChild(document.createTextNode(' · ')); });
  box.appendChild(document.createTextNode(' — klik untuk pakai data yang ada (hindari mitra ganda).'));
}
function useExisting(id) { setMode('Perpanjangan'); document.getElementById('mitraSelect').value = id; prefillMitra(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function setSelect(id, val) { const s = document.getElementById(id); if (val && ![...s.options].some(o => o.value === val)) { const o = document.createElement('option'); o.value = val; o.textContent = val; s.insertBefore(o, s.lastChild); } s.value = val; if (s._ss) s._ss.refresh(); }
function checkNew(sel, newId) { const box = document.getElementById(newId); if (sel.value === '__NEW__') { box.classList.add('show'); box.required = true; } else { box.classList.remove('show'); box.value = ''; } }
function hitungBerakhir() {
  const mulai = document.getElementById('tanggalMulai').value, masa = parseInt(document.getElementById('masaBerlaku').value, 10), tb = document.getElementById('tanggalBerakhir');
  if (mulai && masa) { const d = new Date(mulai); d.setFullYear(d.getFullYear() + masa); d.setDate(d.getDate() - 1); tb.value = d.toISOString().slice(0, 10); }
  updateBerlakuPreview();
}

// Biaya: format ribuan otomatis (tampilan), nilai murni via biayaValue()
function formatBiaya() { const el = document.getElementById('biaya'); const d = el.value.replace(/\D/g, ''); el.value = d ? Number(d).toLocaleString('id-ID') : ''; }
function biayaValue() { return Number((document.getElementById('biaya').value || '').replace(/\D/g, '')) || 0; }

// Masa berlaku: tombol segmen 1–5 + "Lain…" (input angka custom)
function setMasa(val, fromCustom) {
  const seg = document.getElementById('masaSeg'), custom = document.getElementById('masaCustom'), hidden = document.getElementById('masaBerlaku');
  const mark = key => [...seg.children].forEach(b => b.classList.toggle('active', b.dataset.m === key));
  if (val === 'lain') { custom.style.display = ''; mark('lain'); hidden.value = custom.value || ''; setTimeout(() => custom.focus(), 0); hitungBerakhir(); return; }
  if (fromCustom) { hidden.value = (val || '').replace(/\D/g, ''); mark('lain'); hitungBerakhir(); return; }
  custom.style.display = 'none'; custom.value = ''; hidden.value = val; mark(val); hitungBerakhir();
}
function applyMasa(v) {
  v = String(v == null ? '' : v).replace(/\D/g, '');
  if (!v) { setMasa(''); [...document.getElementById('masaSeg').children].forEach(b => b.classList.remove('active')); document.getElementById('masaCustom').style.display = 'none'; document.getElementById('masaBerlaku').value = ''; return; }
  if (['1', '2', '3', '4', '5'].includes(v)) setMasa(v);
  else { const c = document.getElementById('masaCustom'); c.style.display = ''; c.value = v; setMasa(v, true); }
}

// Preview "berlaku s.d. + status" (live)
function updateBerlakuPreview() {
  const mulai = document.getElementById('tanggalMulai').value, tb = document.getElementById('tanggalBerakhir').value, prev = document.getElementById('berlakuPrev');
  if (!prev) return;
  if (!mulai || !tb) { prev.style.display = 'none'; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sisa = Math.round((new Date(tb) - today) / 86400000);
  let cls = 'b-green', label = 'Aktif'; if (sisa < 0) { cls = 'b-red'; label = 'Sudah habis'; } else if (sisa <= 90) { cls = 'b-amber'; label = 'Segera berakhir'; }
  const sisaTxt = sisa < 0 ? Math.abs(sisa) + ' hari lalu' : sisa + ' hari lagi';
  prev.innerHTML = '<i class="fa-solid fa-circle-info"></i> Berlaku s.d. <b>' + tb + '</b> · <span class="badge ' + cls + '">' + label + '</span> <span class="muted">(' + sisaTxt + ')</span>';
  prev.style.display = 'flex';
}

// Dropzone: preview & hapus berkas
function onFilePick() {
  const f = document.getElementById('file').files[0], empty = document.getElementById('dzEmpty'), box = document.getElementById('dzFile');
  if (!f) { empty.style.display = ''; box.style.display = 'none'; box.innerHTML = ''; return; }
  const kb = f.size / 1024, size = kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB', over = f.size > 10 * 1024 * 1024;
  box.innerHTML = '<i class="fa-solid fa-file-lines"></i><div class="dz-meta"><div class="dz-name">' + esc(f.name) + '</div>' +
    '<div class="hint' + (over ? ' dz-over' : '') + '">' + size + (over ? ' — melebihi 10 MB' : '') + '</div></div>' +
    '<button type="button" class="dz-rm" onclick="removeFile(event)" title="Hapus"><i class="fa-solid fa-xmark"></i></button>';
  empty.style.display = 'none'; box.style.display = 'flex';
}
function removeFile(e) { if (e) e.stopPropagation(); document.getElementById('file').value = ''; onFilePick(); }
function clearDropzone() { const inp = document.getElementById('file'); inp.value = ''; onFilePick(); }
function valSelect(id, newId, out) { const s = document.getElementById(id); if (s.value === '__NEW__') { out.val = document.getElementById(newId).value.trim(); out.isNew = true; return out.val; } out.val = s.value; out.isNew = false; return s.value; }
function readFile(input) { return new Promise(res => { const f = input.files[0]; if (!f) { res(null); return; } const rd = new FileReader(); rd.onload = () => res({ name: f.name, mime: f.type, data: rd.result }); rd.onerror = () => res(null); rd.readAsDataURL(f); }); }

async function loadEditRecord(id) {
  try {
    const j = await api.get('getKerjasama'); const k = (j.data || []).find(x => x.id === id);
    if (!k) { show('err', 'Data yang diedit tidak ditemukan.'); return; }
    EDIT_ID = id; setMode(k.jenisEntri === 'Perpanjangan' ? 'Perpanjangan' : 'Baru');
    if (k.jenisEntri === 'Perpanjangan' && k.idMitra) document.getElementById('mitraSelect').value = k.idMitra;
    document.getElementById('namaMitra').value = k.namaMitra || ''; setSelect('jenisMitra', k.jenisMitra || '');
    document.getElementById('wilayah').value = k.wilayah || '';
    const m = (DATA.mitra || []).find(x => x.id === k.idMitra);
    if (m) { document.getElementById('picNama').value = m.picNama || ''; document.getElementById('picEmail').value = m.picEmail || ''; document.getElementById('picHp').value = m.picHp || ''; }
    setSelect('bentuk', k.bentuk || ''); document.getElementById('nomorSurat').value = k.nomorSurat || '';
    String(k.ruangLingkup || '').split(',').map(s => s.trim()).filter(Boolean).forEach(v => { addRuangChip(v); const c = [...document.getElementById('ruangChips').children].find(x => x.dataset.v === v); if (c) { c.classList.add('on'); ruangSelected.add(v); } });
    setSelect('pengguna', k.pengguna || ''); document.getElementById('jabatan').value = k.jabatan || '';
    document.getElementById('biaya').value = k.biaya || ''; formatBiaya(); applyMasa(k.masaBerlaku);
    document.getElementById('tanggalMulai').value = k.mulai || ''; document.getElementById('tanggalBerakhir').value = k.berakhir || '';
    updateBerlakuPreview();
    if (k.file && String(k.file).indexOf('http') === 0) {
      const box = document.getElementById('dzFile'); document.getElementById('dzEmpty').style.display = 'none'; box.style.display = 'flex';
      box.innerHTML = '<i class="fa-solid fa-paperclip"></i><div class="dz-meta"><div class="dz-name">Berkas terlampir</div><div class="hint"><a class="link" href="' + esc(k.file) + '" target="_blank">Lihat berkas saat ini</a> — pilih berkas baru untuk mengganti</div></div>';
    }
    fillInduk(k.idMitra); if (k.dokumenInduk) { const s = document.getElementById('dokumenInduk'); if (![...s.options].some(o => o.value === k.dokumenInduk)) { const o = document.createElement('option'); o.value = k.dokumenInduk; o.textContent = k.dokumenInduk; s.appendChild(o); } s.value = k.dokumenInduk; }
    document.getElementById('catatan').value = k.catatan || '';
    SIMKERMA.setSub('Edit Kerja Sama'); document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Perbarui Kerja Sama';
    show('ok', '✏️ <b>Mode edit</b> — mengubah «' + esc(k.namaMitra || '') + '». Ubah seperlunya lalu simpan.');
  } catch (e) { show('err', 'Gagal memuat data edit: ' + esc(e.message)); }
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const jm = {}, bk = {}, pg = {};
  const jenisMitra = valSelect('jenisMitra', 'jenisMitraNew', jm), bentuk = valSelect('bentuk', 'bentukNew', bk), pengguna = valSelect('pengguna', 'penggunaNew', pg);
  const ruang = [...ruangSelected];
  const ruangNew = [...document.getElementById('ruangChips').children].some(c => c.dataset.new && ruangSelected.has(c.dataset.v));
  if (ruang.length === 0) { show('err', 'Pilih minimal satu Ruang Lingkup.'); return; }
  if (!jenisMitra || !bentuk || !pengguna) { show('err', 'Lengkapi Jenis Mitra, Bentuk, dan Pengguna.'); return; }
  if (!document.getElementById('masaBerlaku').value) { show('err', 'Pilih atau isi Masa Berlaku (tahun).'); return; }
  if (DATA.authRequired && !gate.pw) { gate.prompt('Masukkan kata sandi untuk menyimpan.', () => document.getElementById('form').requestSubmit(), { mandatory: true }); return; }

  const fileInput = document.getElementById('file'), theFile = fileInput.files[0];
  if (theFile && theFile.size > 10 * 1024 * 1024) { show('err', 'Ukuran berkas ' + (theFile.size / 1048576).toFixed(1) + ' MB melebihi batas 10 MB. Mohon kompres dulu.'); return; }

  btn.disabled = true; overlay(true, theFile ? 'Mengunggah berkas & menyimpan…' : 'Mengirim data…');
  const file = await readFile(fileInput);
  const payload = {
    action: 'submitKerjasama', jenisEntri: MODE,
    namaMitra: document.getElementById('namaMitra').value.trim(), jenisMitra, jenisMitraBaru: jm.isNew,
    wilayah: document.getElementById('wilayah').value.trim(), picNama: document.getElementById('picNama').value.trim(),
    picEmail: document.getElementById('picEmail').value.trim(), picHp: document.getElementById('picHp').value.trim(),
    bentuk, bentukBaru: bk.isNew, nomorSurat: document.getElementById('nomorSurat').value.trim(),
    ruangLingkup: ruang.join(', '), ruangLingkupBaru: ruangNew, pengguna, penggunaBaru: pg.isNew,
    jabatan: document.getElementById('jabatan').value.trim(), biaya: biayaValue(),
    masaBerlaku: document.getElementById('masaBerlaku').value, tanggalMulai: document.getElementById('tanggalMulai').value,
    tanggalBerakhir: document.getElementById('tanggalBerakhir').value,
    refSebelumnya: MODE === 'Perpanjangan' ? document.getElementById('mitraSelect').value : '',
    dokumenInduk: document.getElementById('dokumenInduk').value, catatan: document.getElementById('catatan').value.trim(),
    password: gate.pw, editId: EDIT_ID, file
  };

  try {
    const res = await api.post(payload);
    if (res.status === 'success' && res.updated) { overlay(false); show('ok', '✅ Perubahan tersimpan. Mengalihkan ke halaman Data…'); setTimeout(() => location.href = 'data.html', 900); }
    else if (res.status === 'success') {
      overlay(false);
      show('ok', '✅ Tersimpan! Berlaku s.d. <b>' + (res.tanggalBerakhir || '-') + '</b>. <a href="data.html">Lihat data</a> · <a href="index.html">dashboard</a>');
      document.getElementById('form').reset(); ruangSelected.clear();
      [...document.getElementById('ruangChips').children].forEach(c => c.classList.remove('on'));
      document.getElementById('mitraSuggest').innerHTML = ''; setMode('Baru');
      applyMasa(''); clearDropzone(); document.getElementById('berlakuPrev').style.display = 'none';
      await load();
    }
    else if (res.auth) { overlay(false); gate.clear(); gate.prompt('Kata sandi salah. Coba lagi.', () => document.getElementById('form').requestSubmit(), { mandatory: true }); }
    else { overlay(false); show('err', 'Gagal: ' + (res.error || 'tidak diketahui')); }
  } catch (err) { overlay(false); show('err', 'Gagal mengirim: ' + esc(err.message)); }
  finally { overlay(false); btn.disabled = false; if (!EDIT_ID) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Kerja Sama'; }
});

// Dropzone: klik untuk pilih + drag & drop
(function () {
  const dz = document.getElementById('dropzone'); if (!dz) return; const inp = document.getElementById('file');
  dz.addEventListener('click', e => { if (e.target.closest('.dz-rm') || e.target.closest('a')) return; inp.click(); });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach(ev => dz.addEventListener(ev, e => { if (e.target === dz) dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; onFilePick();
  });
})();

load();
