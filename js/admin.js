const sbAdmin = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (s,r=document)=>r.querySelector(s);
const bytes=n=>{if(!n)return '0 B';const u=['B','KB','MB','GB'];let i=0,x=Number(n);while(x>=1024&&i<3){x/=1024;i++;}return `${x.toFixed(i?1:0)} ${u[i]}`};
const slugify=s=>String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const publicUrl=p=>p?sbAdmin.storage.from('assets').getPublicUrl(p).data.publicUrl:'';
const msg=t=>{$('#msg').textContent=t;};

let current=null;
let imgDimensions = { width: 0, height: 0 };

async function session(){
  const {data}=await sbAdmin.auth.getSession();
  if(!data.session){$('#loginView').hidden=false;$('#appView').hidden=true;return null;}
  const {data:a}=await sbAdmin.from('admins').select('user_id').eq('user_id',data.session.user.id).maybeSingle();
  if(!a){await sbAdmin.auth.signOut();msg('This account is not an admin.');return null;}
  $('#loginView').hidden=true;$('#appView').hidden=false;return data.session;
}
async function list(){
  const {data,error}=await sbAdmin.from('assets').select('*').order('created_at',{ascending:false});
  if(error){msg(error.message);return;}
  $('#rows').innerHTML=(data||[]).map(a=>`<tr>
    <td><img class="mini" src="${publicUrl(a.preview_path)}"></td>
    <td><b>${a.title}</b><small>${a.category} ${a.width && a.height ? `(${a.width}×${a.height})` : ''}</small></td>
    <td>${bytes(a.file_size_bytes)}</td>
    <td>${a.storage_mode}</td>
    <td>${a.published?'Published':'Hidden'}</td>
    <td><button data-edit="${a.id}">Edit</button> <button data-del="${a.id}" class="danger">Delete</button></td>
  </tr>`).join('');
}
function reset(){current=null;imgDimensions={width:0,height:0};$('#form').reset();$('#assetId').value='';$('#storageMode').value='direct';$('#telegramWrap').hidden=true;$('#formTitle').textContent='Add Asset';}
async function edit(id){
  const {data:a}=await sbAdmin.from('assets').select('*').eq('id',id).single(); if(!a)return;
  current=a;imgDimensions={width:a.width||0,height:a.height||0};$('#assetId').value=a.id;$('#title').value=a.title;$('#slug').value=a.slug;$('#category').value=a.category;$('#description').value=a.description||'';$('#tags').value=(a.tags\vert{}\vert{}[]).join(', ');$('#storageMode').value=a.storage_mode;$('#telegramUrl').value=a.telegram_url\vert{}\vert{}'';$('#published').checked=a.published;$('#telegramWrap').hidden=a.storage_mode!=='telegram';$('#formTitle').textContent='Edit Asset';
  scrollTo({top:0,behavior:'smooth'});
}
async function remove(id){
  if(!confirm('Delete this asset record? Files are not automatically removed.'))return;
  const {error}=await sbAdmin.from('assets').delete().eq('id',id); if(error)msg(error.message); else {msg('Deleted');list();}
}
async function uploadFile(file,path){
  const {error}=await sbAdmin.storage.from('assets').upload(path,file,{upsert:true,contentType:file.type||'application/octet-stream'});
  if(error)throw error;
}

$('#previewFile')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    const img = new Image();
    img.onload = () => {
      imgDimensions = { width: img.naturalWidth, height: img.naturalHeight };
      msg(`Image dimensions detected: ${imgDimensions.width}x${imgDimensions.height}px`);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

$('#loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();msg('Signing in…');
  const {error}=await sbAdmin.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if(error)msg(error.message);else {msg('');await session();await list();}
});
$('#logout')?.addEventListener('click',()=>sbAdmin.auth.signOut().then(()=>location.reload()));
$('#newAsset')?.addEventListener('click',reset);
$('#storageMode')?.addEventListener('change',()=>$('#telegramWrap').hidden=$('#storageMode').value!=='telegram');
$('#rows')?.addEventListener('click',e=>{const ed=e.target.dataset.edit,del=e.target.dataset.del;if(ed)edit(ed);if(del)remove(del);});
$('#title')?.addEventListener('input',()=>{if(!current)$('#slug').value=slugify($('#title').value);});
$('#form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const title=$('#title').value.trim(), slug=slugify($('#slug').value\vert{}\vert{}title), mode=$('#storageMode').value;
    if(!title)throw Error('Title is required.');
    if(mode==='telegram' && !$('#telegramUrl').value.trim())throw Error('Telegram URL is required for Telegram mode.');
    const preview=$('#previewFile').files[0], file=$('#downloadFile').files[0];
    if(preview && !preview.type.startsWith('image/'))throw Error('Preview must be an image.');
    if(file && file.size>50*1024*1024)throw Error('Direct website files are limited to 50 MB. Use Telegram mode for larger packs.');
    const id=current?.id||crypto.randomUUID();
    let previewPath=current?.preview_path||'', filePath=current?.file_path||'', size=current?.file_size_bytes||null;
    if(preview){previewPath=`previews/${id}-${Date.now()}-${preview.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;await uploadFile(preview,previewPath);}
    if(mode==='direct' && file){filePath=`files/${id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;await uploadFile(file,filePath);size=file.size;}
    
    const payload={
      id,title,slug,
      description:$('#description').value.trim(),
      category:$('#category').value.trim()||'Other',
      tags:$('#tags').value.split(',').map(x=>x.trim()).filter(Boolean),
      preview_path:previewPath,
      file_path:mode==='direct'?filePath:null,
      telegram_url:mode==='telegram'?$('#telegramUrl').value.trim():null,
      storage_mode:mode,
      file_name:mode==='direct'?(file?.name||current?.file_name||''):(file?.name||current?.file_name||''),
      file_size_bytes:size,
      width:imgDimensions.width || current?.width || null,
      height:imgDimensions.height || current?.height || null,
      published:$('#published').checked,
      updated_at:new Date().toISOString()
    };
    
    const {error}=await sbAdmin.from('assets').upsert(payload);if(error)throw error;
    msg(current?'Updated successfully.':'Published successfully.');reset();await list();
  }catch(err){msg(err.message||String(err));}
});
session().then(s=>s&&list());
