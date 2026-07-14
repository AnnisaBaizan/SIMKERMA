  const ui=SIMKERMA.ui, api=SIMKERMA.api, gate=SIMKERMA.gate;
  SIMKERMA.header('data', { subtitle:'Data Kerja Sama' });
  document.getElementById('pageActions').innerHTML =
    '<button class="btn outline" id="adminBtn"><i class="fa-solid fa-lock"></i> Admin</button>' +
    '<span class="menu" id="colMenu"><button class="btn outline" id="colBtn"><i class="fa-solid fa-table-columns"></i> Kolom <i class="fa-solid fa-caret-down" style="font-size:11px"></i></button><span class="items" id="colItems"></span></span>' +
    '<span class="menu" id="exportMenu"><button class="btn outline" id="exportBtn"><i class="fa-solid fa-file-export"></i> Export <i class="fa-solid fa-caret-down" style="font-size:11px"></i></button>' +
      '<span class="items"><button data-fmt="xlsx"><i class="fa-solid fa-file-excel" style="color:#15803d"></i> Excel (.xlsx)</button><button data-fmt="csv"><i class="fa-solid fa-file-csv" style="color:#2563eb"></i> CSV</button></span></span>';

  let curQ='';   // untuk highlight hasil pencarian
  function hl(s){ s=String(s==null?'':s); if(!curQ) return esc(s); const i=s.toLowerCase().indexOf(curQ); if(i<0) return esc(s);
    return esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+curQ.length))+'</mark>'+esc(s.slice(i+curQ.length)); }
  function ellCell(v){ v=(v==null?'':String(v)); return '<span class="ell" title="'+esc(v)+'">'+hl(v)+'</span>'; }
  const COLS=[
    {key:'namaMitra',label:'Mitra',cell:k=>'<span style="font-weight:600">'+ellCell(k.namaMitra)+'</span>'},
    {key:'bentuk',label:'Bentuk',cls:'hide-md',cell:k=>ellCell(k.bentuk)},
    {key:'pengguna',label:'Pengguna',cls:'hide-md',cell:k=>ellCell(k.pengguna)},
    {key:'berakhir',label:'Berakhir',nowrap:true,cell:k=>esc(k.berakhir)},
    {key:'sisa',label:'Sisa',num:true,nowrap:true,cell:k=>ui.sisa(k.sisa)},
    {key:'status',label:'Status',cell:k=>ui.badge(k.status)}
  ];
  let hiddenCols=new Set(), selected=new Set();
  function colsVisible(){ return COLS.filter(c=>!hiddenCols.has(c.key)); }
  const FILTERS=[
    {id:'fStatus',ph:'Semua status',opts:['Aktif','Segera Berakhir','Habis']},
    {id:'fJenis',ph:'Semua jenis mitra',key:'jenisMitra'},
    {id:'fPengguna',ph:'Semua pengguna',key:'pengguna'},
    {id:'fBentuk',ph:'Semua bentuk',key:'bentuk'},
    {id:'fTahun',ph:'Semua tahun mulai',key:'_tahun'}
  ];
  let ALL=[], VIEW=[], page=1, perPage=25, sortKey='sisa', sortDir=1, expanded=new Set(), authRequired=true;

  async function load(){
    const ld=document.getElementById('loading');
    ld.style.display='block'; ld.innerHTML=ui.skelData();
    try{
      const j=await api.get('getKerjasama');
      if(j.error) throw new Error(j.error);
      ALL=(j.data||[]).map(k=>Object.assign(k,{_tahun:String(k.mulai).slice(0,4)}));
      try{ const f=await api.get('getFormData'); authRequired=!!f.authRequired; SIMKERMA.setSub(f.instansi||'Data Kerja Sama'); }catch(e){}
      buildFilters(); restoreState(); buildColMenu(); applyFilter(true);
      ld.style.display='none';
      document.getElementById('content').style.display='block';
    }catch(e){
      ld.innerHTML='<div class="loading">❌ Gagal memuat: '+esc(e.message)+'<br><span class="muted">Pastikan GAS_URL benar & Web App aktif.</span></div>';
    }
  }

  function uniq(key){ return [...new Set(ALL.map(x=>x[key]).filter(v=>v!==''&&v!=null))].sort(); }
  function buildFilters(){
    document.getElementById('filters').innerHTML = FILTERS.map(f=>{
      let opts=f.opts; if(!opts){ opts=uniq(f.key); if(f.key==='_tahun') opts=opts.filter(v=>/^\d{4}$/.test(v)).reverse(); }
      return ui.selectFilter(f.id, f.ph, opts);
    }).join('');
    FILTERS.forEach(f=>document.getElementById(f.id).addEventListener('change', applyFilter));
    SIMKERMA.searchify(FILTERS.map(f=>f.id));
  }
  function renderHead(){
    const admin=isAdmin();
    document.getElementById('head').innerHTML =
      (admin?'<th class="selcol"><input type="checkbox" id="selAll" title="Pilih semua (hasil filter)"></th>':'') +
      '<th style="width:26px"></th>' + colsVisible().map(c=>ui.thSort(c.key,c.label,c.cls)).join('') +
      '<th>Berkas</th>' + (admin?'<th class="admincol">Aksi</th>':'');
    const sa=document.getElementById('selAll');
    if(sa){ const on=VIEW.length>0 && VIEW.every(k=>selected.has(k.id)); sa.checked=on; sa.indeterminate=!on && VIEW.some(k=>selected.has(k.id)); }
  }

  function applyFilter(keepPage){
    const q=(document.getElementById('q').value||'').toLowerCase(); curQ=q;
    const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };
    const fs=val('fStatus'), fj=val('fJenis'), fp=val('fPengguna'), fb=val('fBentuk'), ft=val('fTahun');
    VIEW=ALL.filter(k=>{
      if(fs&&k.status!==fs) return false;
      if(fj&&k.jenisMitra!==fj) return false;
      if(fp&&k.pengguna!==fp) return false;
      if(fb&&k.bentuk!==fb) return false;
      if(ft&&k._tahun!==ft) return false;
      if(q){ const hay=(k.namaMitra+' '+k.nomorSurat+' '+k.pengguna+' '+k.jenisMitra+' '+k.bentuk+' '+k.ruangLingkup).toLowerCase();
        if(!hay.includes(q)) return false; }
      return true;
    });
    sortView(); if(!keepPage) page=1; render();
  }
  function resetFilter(){ document.getElementById('q').value=''; FILTERS.forEach(f=>{const e=document.getElementById(f.id);if(e){e.value='';if(e._ss)e._ss.sync();}}); applyFilter(); }

  // ---- Ingat state (cari/filter/urut/halaman) ----
  const LSKEY='simkerma_data_state';
  function saveState(){
    try{ localStorage.setItem(LSKEY, JSON.stringify({
      q:document.getElementById('q').value,
      f:FILTERS.reduce((o,ff)=>{const e=document.getElementById(ff.id);o[ff.id]=e?e.value:'';return o;},{}),
      sortKey, sortDir, perPage, page, hidden:[...hiddenCols]
    })); }catch(e){}
  }
  function restoreState(){
    let s; try{ s=JSON.parse(localStorage.getItem(LSKEY)||'null'); }catch(e){}
    if(!s) return;
    if(s.q!=null) document.getElementById('q').value=s.q;
    if(s.f) FILTERS.forEach(ff=>{ const e=document.getElementById(ff.id); if(e && s.f[ff.id]){ e.value=s.f[ff.id]; if(e._ss) e._ss.sync(); } });
    if(s.sortKey){ sortKey=s.sortKey; sortDir=s.sortDir||1; }
    if(s.perPage) perPage=s.perPage;
    if(s.page) page=s.page;
    if(s.hidden) hiddenCols=new Set(s.hidden);
  }

  // ---- Chip filter aktif ----
  function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function renderChips(){
    const box=document.getElementById('fchips'); if(!box) return;
    const items=[]; const q=document.getElementById('q').value.trim();
    if(q) items.push({id:'q',label:'Pencarian',val:q});
    FILTERS.forEach(f=>{ const e=document.getElementById(f.id); if(e && e.value) items.push({id:f.id,label:cap(f.ph.replace(/^Semua /,'')),val:e.value}); });
    if(!items.length){ box.innerHTML=''; return; }
    box.innerHTML='<span class="lbl">Filter aktif:</span>'+
      items.map(it=>'<span class="fchip">'+esc(it.label)+': <b>'+esc(it.val)+'</b> <button data-clear="'+it.id+'" title="Hapus"><i class="fa-solid fa-xmark"></i></button></span>').join('')+
      '<span class="fchip clear" data-clear="__all__"><i class="fa-solid fa-broom"></i> Bersihkan semua</span>';
  }

  function sortView(){
    const col=COLS.find(c=>c.key===sortKey)||{};
    VIEW.sort((a,b)=>{ let x=a[sortKey], y=b[sortKey];
      if(col.num){ x=Number(x); y=Number(y); if(isNaN(x))x=1e15; if(isNaN(y))y=1e15; return (x-y)*sortDir; }
      return String(x).localeCompare(String(y))*sortDir; });
    COLS.forEach(c=>{ const el=document.getElementById('ar-'+c.key); if(el) el.innerHTML=c.key===sortKey?(sortDir>0?'<i class="fa-solid fa-caret-up"></i>':'<i class="fa-solid fa-caret-down"></i>'):''; });
  }

  function rowHtml(k, admin){
    const open=expanded.has(k.id), sel=selected.has(k.id);
    return '<tr data-id="'+esc(k.id)+'"'+(sel?' class="selrow"':'')+'>'+
      (admin?'<td class="selcol"><input type="checkbox" class="rsel" data-id="'+esc(k.id)+'"'+(sel?' checked':'')+'></td>':'')+
      '<td><span class="exp" style="color:var(--accent)"><i class="fa-solid fa-chevron-'+(open?'down':'right')+'"></i></span></td>'+
      colsVisible().map(c=>'<td'+(c.cls?' class="'+c.cls+'"':'')+(c.nowrap?' class="nowrap"':'')+'>'+c.cell(k)+'</td>').join('')+
      '<td style="text-align:center">'+ui.fileLink(k.file)+'</td>'+
      (admin?'<td class="admincol"><span style="display:inline-flex;gap:6px">'+
        '<button class="btn outline" data-edit="'+esc(k.id)+'" title="Edit" style="padding:5px 9px"><i class="fa-solid fa-pen"></i></button>'+
        '<button class="btn danger" data-del="'+esc(k.id)+'" title="Hapus" style="padding:5px 9px"><i class="fa-solid fa-trash"></i></button></span></td>':'')+
    '</tr>';
  }
  function render(){
    const admin=isAdmin();
    const total=VIEW.length, pages=Math.max(1,Math.ceil(total/perPage));
    if(page>pages) page=pages;
    const start=(page-1)*perPage, slice=VIEW.slice(start,start+perPage);
    const totalCols=(admin?1:0)+1+colsVisible().length+1+(admin?1:0);
    renderHead();
    let html='';
    slice.forEach(k=>{ html+=rowHtml(k,admin); if(expanded.has(k.id)) html+=ui.detailRow(k,totalCols); });
    document.getElementById('body').innerHTML = html || ui.emptyRow(totalCols,'Tidak ada data yang cocok.');
    const from=total?start+1:0, to=Math.min(start+perPage,total);
    const totNilai=VIEW.reduce((s,k)=>s+(Number(k.biaya)||0),0);
    document.getElementById('count').innerHTML = total
      ? 'Menampilkan <b>'+from+'–'+to+'</b> dari <b>'+total+'</b> kerja sama'+(total!==ALL.length?(' <span style="opacity:.8">(difilter dari '+ALL.length+')</span>'):'')+' · Total nilai: <b>'+SIMKERMA.rupiah(totNilai)+'</b>'
      : 'Tidak ada data yang cocok.';
    document.getElementById('pager').innerHTML = ui.pager(page,pages);
    const ps=document.getElementById('perPageSel'); if(ps) ps.value=String(perPage);
    renderChips(); renderBulk(); saveState();
  }
  function renderBulk(){
    const bar=document.getElementById('bulkbar');
    if(!isAdmin() || selected.size===0){ bar.style.display='none'; bar.innerHTML=''; return; }
    bar.style.display='flex';
    bar.innerHTML='<span><i class="fa-solid fa-square-check"></i> <b>'+selected.size+'</b> baris dipilih</span>'+
      '<button class="btn danger" id="bulkDel"><i class="fa-solid fa-trash"></i> Hapus terpilih</button>'+
      '<button class="btn outline" id="bulkClear">Batal pilih</button>';
  }

  // ---- Event delegation (granular, tanpa inline handler) ----
  document.getElementById('q').addEventListener('input', applyFilter);
  document.getElementById('resetBtn').addEventListener('click', resetFilter);
  document.getElementById('head').addEventListener('click', e=>{ const th=e.target.closest('[data-sort]'); if(!th) return;
    const k=th.dataset.sort; if(sortKey===k) sortDir*=-1; else { sortKey=k; sortDir=1; } sortView(); render(); });
  document.getElementById('body').addEventListener('click', e=>{
    const ed=e.target.closest('[data-edit]'); if(ed){ location.href='form.html?edit='+encodeURIComponent(ed.dataset.edit); return; }
    const dl=e.target.closest('[data-del]'); if(dl){ delRow(dl.dataset.del); return; }
    if(e.target.closest('a,button,input,label')) return;          // jangan toggle saat klik tautan/tombol/checkbox
    const tr=e.target.closest('tr[data-id]'); if(tr){ const id=tr.dataset.id; expanded.has(id)?expanded.delete(id):expanded.add(id); render(); }
  });
  // klik chip filter → hapus filter itu / semua
  document.getElementById('fchips').addEventListener('click', e=>{
    const b=e.target.closest('[data-clear]'); if(!b) return;
    const id=b.dataset.clear;
    if(id==='__all__'){ resetFilter(); return; }
    if(id==='q'){ document.getElementById('q').value=''; }
    else { const el=document.getElementById(id); if(el){ el.value=''; if(el._ss) el._ss.sync(); } }
    applyFilter();
  });
  document.getElementById('pager').addEventListener('click', e=>{ const b=e.target.closest('[data-goto]'); if(!b||b.disabled) return;
    page=+b.dataset.goto; render(); window.scrollTo({top:0,behavior:'smooth'}); });
  document.getElementById('pager').addEventListener('change', e=>{ if(e.target.id==='perPageSel'){ perPage=+e.target.value; page=1; render(); } });

  // ---- Seleksi baris + hapus massal (admin) ----
  document.getElementById('head').addEventListener('change', e=>{ if(e.target.id!=='selAll') return;
    if(e.target.checked) VIEW.forEach(k=>selected.add(k.id)); else VIEW.forEach(k=>selected.delete(k.id)); render(); });
  document.getElementById('body').addEventListener('change', e=>{ const c=e.target.closest('.rsel'); if(!c) return;
    c.checked?selected.add(c.dataset.id):selected.delete(c.dataset.id); render(); });
  document.getElementById('bulkbar').addEventListener('click', e=>{
    if(e.target.closest('#bulkClear')){ selected.clear(); render(); return; }
    if(e.target.closest('#bulkDel')){ bulkDelete(); return; }
  });
  async function bulkDelete(){
    const ids=VIEW.filter(k=>selected.has(k.id)).map(k=>k.id);
    if(!ids.length) return;
    if(!confirm('Hapus '+ids.length+' kerja sama terpilih?\nTindakan ini tidak bisa dibatalkan.')) return;
    SIMKERMA.overlay(true,'Menghapus '+ids.length+' data…');
    let ok=0, authFail=false;
    for(const id of ids){
      try{ const res=await api.post({action:'deleteKerjasama',id,password:gate.pw});
        if(res.status==='success'){ ok++; ALL=ALL.filter(x=>x.id!==id); selected.delete(id); }
        else if(res.auth){ authFail=true; break; }
      }catch(err){}
    }
    SIMKERMA.overlay(false);
    applyFilter();
    if(authFail){ gate.clear(); gate.prompt('Sesi/sandi tidak valid. Masuk lagi lalu ulangi.', null); }
    else alert(ok+' data terhapus.');
  }

  // ---- Tampil/sembunyi kolom ----
  function buildColMenu(){
    document.getElementById('colItems').innerHTML = COLS.map(c=>
      '<label style="display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;font-size:13px;font-weight:500;border-radius:7px">'+
      '<input type="checkbox" data-col="'+c.key+'"'+(hiddenCols.has(c.key)?'':' checked')+' style="width:auto;margin:0"> '+esc(c.label)+'</label>').join('');
  }
  const colMenu=document.getElementById('colMenu');
  document.getElementById('colBtn').addEventListener('click', e=>{ e.stopPropagation(); document.getElementById('exportMenu').classList.remove('open'); colMenu.classList.toggle('open'); });
  document.getElementById('colItems').addEventListener('click', e=>e.stopPropagation());
  document.getElementById('colItems').addEventListener('change', e=>{ const cb=e.target.closest('[data-col]'); if(!cb) return;
    cb.checked?hiddenCols.delete(cb.dataset.col):hiddenCols.add(cb.dataset.col); render(); saveState(); });
  document.addEventListener('click', ()=>colMenu.classList.remove('open'));

  // ---- Admin ----
  function isAdmin(){ return document.body.classList.contains('admin'); }
  document.getElementById('adminBtn').addEventListener('click', ()=>{
    if(isAdmin()){ lockAdmin(); return; }
    if(!authRequired){ alert('Gerbang sandi tidak aktif (ADMIN_PASSWORD kosong di server). Set ADMIN_PASSWORD di Code.gs untuk mengunci penulisan.'); enterAdmin(); return; }
    if(gate.pw){ enterAdmin(); return; }
    gate.prompt('', enterAdmin);
  });
  document.getElementById('lockLink').addEventListener('click', e=>{ e.preventDefault(); lockAdmin(); });
  function enterAdmin(){ document.body.classList.add('admin'); document.getElementById('adminbar').classList.add('on'); document.getElementById('adminBtn').innerHTML='<i class="fa-solid fa-lock-open"></i> Admin'; renderHead(); render(); }
  function lockAdmin(){ document.body.classList.remove('admin'); document.getElementById('adminbar').classList.remove('on'); document.getElementById('adminBtn').innerHTML='<i class="fa-solid fa-lock"></i> Admin'; selected.clear(); render(); }

  async function delRow(id){
    const k=ALL.find(x=>x.id===id); if(!k) return;
    if(!confirm('Hapus kerja sama:\n'+k.namaMitra+' — '+k.nomorSurat+' ?\nTindakan ini tidak bisa dibatalkan.')) return;
    try{
      const res=await api.post({action:'deleteKerjasama', id, password:gate.pw});
      if(res.status==='success'){ ALL=ALL.filter(x=>x.id!==id); applyFilter(); }
      else if(res.auth){ gate.clear(); gate.prompt('Sandi salah, coba lagi.', ()=>delRow(id)); }
      else alert('Gagal: '+(res.error||'tidak diketahui'));
    }catch(e){ alert('Gagal menghapus: '+e.message); }
  }

  // ---- Export (CSV + XLSX) ----
  const EXP_HEAD=['Mitra','Jenis Mitra','Wilayah','Bentuk','Nomor Surat','Ruang Lingkup','Pengguna','Jabatan','Biaya','Masa Berlaku','Mulai','Berakhir','Sisa Hari','Status','Jenis Entri','Dokumen Induk','Catatan','Link Berkas'];
  function expRows(){ return VIEW.map(k=>[k.namaMitra,k.jenisMitra,k.wilayah,k.bentuk,k.nomorSurat,k.ruangLingkup,k.pengguna,k.jabatan,Number(k.biaya)||0,k.masaBerlaku,k.mulai,k.berakhir,k.sisa,k.status,k.jenisEntri,k.dokumenInduk,k.catatan,k.file]); }
  function fname(ext){ return 'data-kerjasama-'+new Date().toISOString().slice(0,10)+'.'+ext; }
  function exportXlsx(){
    const ws=XLSX.utils.aoa_to_sheet([EXP_HEAD,...expRows()]);
    ws['!cols']=EXP_HEAD.map(h=>({wch:Math.max(12,h.length+2)}));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Kerja Sama');
    XLSX.writeFile(wb, fname('xlsx'));
  }
  function exportCsv(){
    const rows=[EXP_HEAD,...expRows()];
    const csv=rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob=new Blob(["﻿"+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname('csv'); a.click();
  }
  const menu=document.getElementById('exportMenu');
  document.getElementById('exportBtn').addEventListener('click', e=>{ e.stopPropagation(); menu.classList.toggle('open'); });
  menu.addEventListener('click', e=>{ const b=e.target.closest('[data-fmt]'); if(!b) return; menu.classList.remove('open'); b.dataset.fmt==='xlsx'?exportXlsx():exportCsv(); });
  document.addEventListener('click', ()=>menu.classList.remove('open'));

  load();
