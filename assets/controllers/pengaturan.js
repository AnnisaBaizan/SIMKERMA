/* ============================================================
   SIMKERMA — Controller halaman Pengaturan
   Baca semua setting (getPengaturan) → render form berkelompok →
   simpan (updatePengaturan, bergerbang sandi). Rahasia tak diikutkan.
   ============================================================ */
(function () {
  var S = window.SIMKERMA, gate = S.gate, api = S.api, esc = S.esc;
  var authRequired = false;

  var GROUPS = [
    { t: 'Umum', icon: 'fa-building', keys: ['NAMA_INSTANSI', 'EMAIL_NOTIF', 'BASE_URL'] },
    { t: 'Jadwal Pengingat', icon: 'fa-calendar-day', keys: ['REMINDER_CADENCE', 'GRACE_HABIS_HARI'] },
    { t: 'Notifikasi Internal (tim)', icon: 'fa-users', keys: ['EMAIL_AKTIF', 'WA_NOMOR_AKTIF', 'WA_TARGET', 'WA_GRUP_AKTIF', 'WA_GRUP_ID', 'LAMPIRKAN_FILE'] },
    { t: 'Notifikasi Eksternal (mitra)', icon: 'fa-paper-plane', keys: ['EMAIL_EKSTERNAL_AKTIF', 'WA_EKSTERNAL_AKTIF', 'WA_EKSTERNAL_MAKS_PER_HARI', 'WA_EKSTERNAL_JEDA_DETIK'] },
    { t: 'Antarmuka', icon: 'fa-sliders', keys: ['SURVEY_AKTIF'] }
  ];

  function msg(type, html) {
    var m = document.getElementById('msg');
    m.className = 'msg ' + type; m.innerHTML = html; m.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fieldHtml(it) {
    var id = 'pg_' + it.key, hint = it.keterangan ? '<div class="hint">' + esc(it.keterangan) + '</div>' : '';
    if (it.type === 'boolean') {
      var on = (it.value === true || String(it.value).toUpperCase() === 'TRUE');
      return '<label class="pg-row"><input type="checkbox" id="' + id + '" data-key="' + it.key + '" data-type="boolean"' +
        (on ? ' checked' : '') + ' style="width:auto"> <span><b>' + esc(it.key) + '</b>' + hint + '</span></label>';
    }
    var t = it.type === 'number' ? 'number' : 'text';
    return '<label><b>' + esc(it.key) + '</b>' + hint +
      '<input type="' + t + '" id="' + id + '" data-key="' + it.key + '" data-type="' + it.type + '" value="' + esc(it.value == null ? '' : it.value) + '"></label>';
  }

  function render(items) {
    var byKey = {}; items.forEach(function (it) { byKey[it.key] = it; });
    var seen = {}, html = '';
    GROUPS.forEach(function (g) {
      var rows = g.keys.filter(function (k) { return byKey[k]; }).map(function (k) { seen[k] = 1; return fieldHtml(byKey[k]); }).join('');
      if (rows) html += '<div class="card"><p class="section-title"><i class="fa-solid ' + g.icon + '"></i> ' + g.t + '</p>' + rows + '</div>';
    });
    var rest = items.filter(function (it) { return !seen[it.key]; }).map(fieldHtml).join('');
    if (rest) html += '<div class="card"><p class="section-title"><i class="fa-solid fa-gear"></i> Lainnya</p>' + rest + '</div>';
    html += '<button type="submit" class="btn primary block" id="saveBtn"><i class="fa-solid fa-floppy-disk"></i> Simpan Pengaturan</button>';
    var f = document.getElementById('pgForm'); f.innerHTML = html; f.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
  }

  function collect() {
    var out = {};
    document.querySelectorAll('#pgForm [data-key]').forEach(function (el) {
      var k = el.getAttribute('data-key'), t = el.getAttribute('data-type');
      out[k] = t === 'boolean' ? (el.checked ? 'TRUE' : 'FALSE') : el.value.trim();
    });
    return out;
  }

  async function save(e) {
    e.preventDefault();
    if (authRequired && !gate.pw) { gate.prompt('Masukkan kata sandi untuk menyimpan pengaturan.', function () { document.getElementById('pgForm').requestSubmit(); }, { mandatory: true }); return; }
    S.overlay(true, 'Menyimpan pengaturan…');
    try {
      var res = await api.post({ action: 'updatePengaturan', pengaturan: collect(), password: gate.pw });
      S.overlay(false);
      if (res.status === 'success') msg('ok', '✅ Pengaturan tersimpan. Perubahan berlaku pada pengingat berikutnya.');
      else if (res.auth) { gate.clear(); gate.prompt('Kata sandi salah. Coba lagi.', function () { document.getElementById('pgForm').requestSubmit(); }, { mandatory: true }); }
      else msg('err', 'Gagal: ' + esc(res.error || 'tidak diketahui'));
    } catch (err) { S.overlay(false); msg('err', 'Gagal mengirim: ' + esc(err.message)); }
  }

  async function init() {
    S.header('pengaturan', { subtitle: 'Pengaturan' });
    try {
      var r = await api.get('getPengaturan');
      authRequired = !!r.authRequired;
      render(r.items || []);
      document.getElementById('pgForm').addEventListener('submit', save);
    } catch (e) {
      document.getElementById('loading').innerHTML = '❌ Gagal memuat: ' + esc(e.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
