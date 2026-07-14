// build.js — Inject env variables & susun output ke dist/ sebelum deploy
// Dijalankan otomatis oleh Vercel saat build, atau manual: node build.js
// Catatan: HANYA memakai modul bawaan Node (fs, path) — TIDAK butuh npm install.

const fs   = require('fs');
const path = require('path');

const GAS_URL        = process.env.GAS_URL        || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BUG_URL        = process.env.BUG_URL        || '';

if (!GAS_URL) { console.error('ERROR: GAS_URL tidak diset. Set di Vercel atau file .env'); process.exit(1); }

const SRC  = __dirname;
const DIST = path.join(__dirname, 'dist');
const DIST_ASSETS = path.join(DIST, 'assets');
fs.mkdirSync(DIST_ASSETS, { recursive: true });

const inject = (s) => s
  .replaceAll('__GAS_URL__',        GAS_URL)
  .replaceAll('__ADMIN_PASSWORD__', ADMIN_PASSWORD)
  .replaceAll('__BUG_URL__',        BUG_URL);

// 1) Halaman HTML (root dist) — dengan injeksi env
['index.html', 'form.html', 'data.html'].forEach(file => {
  const src = path.join(SRC, file);
  if (!fs.existsSync(src)) return;
  fs.writeFileSync(path.join(DIST, file), inject(fs.readFileSync(src, 'utf8')), 'utf8');
  console.log(`✅ ${file} → dist/${file}`);
});

// 2) Aset JS inti (dist/assets) — dengan injeksi env
['app.js', 'components.js'].forEach(file => {
  const src = path.join(SRC, 'assets', file);
  if (!fs.existsSync(src)) return;
  fs.writeFileSync(path.join(DIST_ASSETS, file), inject(fs.readFileSync(src, 'utf8')), 'utf8');
  console.log(`✅ assets/${file} → dist/assets/${file}`);
});

// 2b) Controller per-halaman (dist/assets/controllers)
const DIST_CTRL = path.join(DIST_ASSETS, 'controllers');
fs.mkdirSync(DIST_CTRL, { recursive: true });
['dashboard.js', 'form.js', 'data.js'].forEach(file => {
  const src = path.join(SRC, 'assets', 'controllers', file);
  if (!fs.existsSync(src)) return;
  fs.writeFileSync(path.join(DIST_CTRL, file), inject(fs.readFileSync(src, 'utf8')), 'utf8');
  console.log(`✅ assets/controllers/${file} → dist/assets/controllers/${file}`);
});

// 3) Aset statis (dist/assets) — disalin apa adanya
['styles.css'].forEach(file => {
  const src = path.join(SRC, 'assets', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST_ASSETS, file));
    console.log(`📁 assets/${file} → dist/assets/${file}`);
  }
});

// 4) Aset root opsional (logo/favicon) bila ada
['KOP.png', 'logo.png', 'favicon.ico'].forEach(file => {
  const src = path.join(SRC, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, file));
    console.log(`📁 ${file} → dist/${file}`);
  }
});

console.log('\nBuild selesai. Output: dist/');
