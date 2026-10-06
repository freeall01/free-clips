const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (s, r=document) => r.querySelector(s);
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes = n => {
  if (!n) return '—';
  const u=['B','KB','MB','GB']; let i=0, x=Number(n);
  while(x>=1024 && i<u.length-1){x/=1024;i++;}
  return `${x.toFixed(x>=10||i===0?0:1)} ${u[i]}`;
};
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const qs = new URLSearchParams(location.search);

function publicUrl(path) {
  if (!path) return '';
  return sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
}
async function getAssets({search='', category='', limit=60}={}) {
  let q = sb.from('assets').select('*').eq('published', true).order('created_at',{ascending:false}).limit(limit);
  if(category) q=q.eq('category',category);
  if(search){
    const s=search.replace(/[%_]/g,'');
    q=q.or(`title.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`);
  }
  const {data,error}=await q;
  if(error) throw error;
  return data||[];
}
function card(a){
  const img=publicUrl(a.preview_path);
  return `<article class="card">
    <a href="asset.html?id=${encodeURIComponent(a.id)}" class="thumb"><img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy"></a>
    <div class="cardbody"><div class="pill">${esc(a.category)}</div><h3><a href="asset.html?id=${encodeURIComponent(a.id)}">${esc(a.title)}</a></h3><p>${esc(bytes(a.file_size_bytes))} · ${Number(a.downloads||0)} downloads</p></div>
  </article>`;
}
async function loadHome(){
  const grid=$('#assetGrid'); if(!grid)return;
  const search=qs.get('q')||'';
  const category=qs.get('category')||'';
  $('#searchInput').value=search;
  const assets=await getAssets({search,category});
  grid.innerHTML=assets.length?assets.map(card).join(''):`<div class="empty">No assets found.</div>`;
  const {data}=await sb.from('assets').select('category').eq('published',true);
  const cats=[...new Set((data||[]).map(x=>x.category).filter(Boolean))].sort();
  const nav=$('#categoryNav');
  if(nav) nav.innerHTML=`<a href="index.html">All</a>`+cats.map(c=>`<a href="?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('');
}
async function loadAsset(){
  const box=$('#assetDetail'); if(!box)return;
  const id=qs.get('id');
  if(!id){box.innerHTML='<div class="empty">Asset not found.</div>';return;}
  const {data:a,error}=await sb.from('assets').select('*').eq('id',id).maybeSingle();
  if(error||!a){box.innerHTML='<div class="empty">Asset not found.</div>';return;}
  const preview=publicUrl(a.preview_path);
  const direct=a.storage_mode==='direct' && a.file_path;
  box.innerHTML=`<section class="asset-layout">
    <div class="preview"><img src="${esc(preview)}" alt="${esc(a.title)}"></div>
    <div class="asset-info">
      <div class="pill">${esc(a.category)}</div>
      <h1>${esc(a.title)}</h1>
      <p class="desc">${esc(a.description||'')}</p>
      <dl class="meta">
        <div><dt>File</dt><dd>${esc(a.file_name||'')}</dd></div>
        <div><dt>Size</dt><dd>${esc(bytes(a.file_size_bytes))}</dd></div>
        <div><dt>Dimensions</dt><dd>${a.width&&a.height?`${a.width} × ${a.height}`:'—'}</dd></div>
        <div><dt>Downloads</dt><dd>${Number(a.downloads||0)}</dd></div>
      </dl>
      ${direct?`<a class="btn primary" id="downloadBtn" href="${esc(publicUrl(a.file_path))}" target="_blank" rel="noopener">Download PNG</a>`:
      a.telegram_url?`<a class="btn primary" href="${esc(a.telegram_url)}" target="_blank" rel="noopener">Download Pack</a>`:
      `<button class="btn disabled" disabled>Download unavailable</button>`}
      <div class="tags">${(a.tags||[]).map(t=>`<span>#${esc(t)}</span>`).join('')}</div>
    </div>
  </section>`;
  const btn=$('#downloadBtn');
  if(btn) btn.addEventListener('click',async()=>{try{await sb.rpc('increment_download',{asset_id:a.id});}catch(e){}});
}
function bindSearch(){
  const form=$('#searchForm'); if(!form)return;
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const q=$('#searchInput').value.trim();
    location.href=q?`index.html?q=${encodeURIComponent(q)}`:'index.html';
  });
}
document.addEventListener('DOMContentLoaded',()=>{bindSearch();loadHome().catch(e=>console.error(e));loadAsset().catch(e=>console.error(e));});
