let election = null;
const $=id=>document.getElementById(id);
document.addEventListener('DOMContentLoaded', async()=>{
  await App.requireRole('admin'); $('logout').onclick=()=>App.logout(); bind(); await refresh();
  sb.channel('admin-live').on('postgres_changes',{event:'*',schema:'public',table:'sections'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'voters'},refresh).subscribe();
});
function bind(){
 $('createElection').onclick=createElection; $('startElection').onclick=()=>setStatus('open'); $('closeElection').onclick=()=>setStatus('closed'); $('addSection').onclick=addSection; $('addSlate').onclick=addSlate; $('importVoters').onclick=importVoters; $('totalize').onclick=totalize;
}
async function refresh(){
 const {data}=await sb.from('elections').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle(); election=data;
 $('mStatus').textContent=election?.status?.toUpperCase()||'SEM ELEICAO';
 if(!election){$('mEleitores').textContent=0;$('mVotantes').textContent=0;$('mSecoes').textContent=0;return;}
 const [{count:ec},{count:vc},{data:secs},{data:slates}]=await Promise.all([
   sb.from('voters').select('*',{count:'exact',head:true}).eq('election_id',election.id),
   sb.from('voters').select('*',{count:'exact',head:true}).eq('election_id',election.id).eq('has_voted',true),
   sb.from('sections').select('*').eq('election_id',election.id).order('code'),
   sb.from('slates').select('*').eq('election_id',election.id).order('number')]);
 $('mEleitores').textContent=ec||0;$('mVotantes').textContent=vc||0;$('mSecoes').textContent=secs?.length||0;
 $('sections').innerHTML=(secs||[]).map(s=>`<div class="list"><b>${s.code}</b><span>${s.name}</span><em>${s.status}</em></div>`).join('')||'<p>Nenhuma secao.</p>';
 $('slates').innerHTML=(slates||[]).map(s=>`<div class="list"><b>${s.number}</b><span>${s.name}</span></div>`).join('')||'<p>Nenhuma chapa.</p>';
 const {data:stats}=await sb.rpc('admin_section_stats',{p_election_id:election.id});
 $('sectionMonitor').innerHTML=(stats||[]).map(s=>`<div class="section-card"><strong>Secao ${s.code}</strong><span>${s.voted}/${s.registered} votaram</span><span class="pill ${s.status}">${s.status}</span></div>`).join('')||'<p>Nenhuma secao.</p>';
 $('totalize').disabled=election.status!=='closed';
}
async function createElection(){const {data,error}=await sb.from('elections').insert({name:$('electionName').value.trim(),status:'setup'}).select().single();if(error)return App.flash($('electionMsg'),error.message,'error');election=data;App.flash($('electionMsg'),'Eleicao criada.','ok');refresh()}
async function setStatus(status){if(!election)return App.flash($('electionMsg'),'Crie uma eleicao primeiro.','error');if(status==='closed'&&!confirm('Encerrar a eleicao em todas as secoes?'))return;const {error}=await sb.from('elections').update({status}).eq('id',election.id);if(error)return App.flash($('electionMsg'),error.message,'error');if(status==='closed')await sb.from('sections').update({status:'closed'}).eq('election_id',election.id);App.flash($('electionMsg'),status==='open'?'Eleicao iniciada.':'Eleicao encerrada.','ok');refresh()}
async function addSection(){if(!election)return;const code=$('sectionCode').value.trim(),name=$('sectionName').value.trim();const {error}=await sb.from('sections').insert({election_id:election.id,code,name,status:'ready'});if(error)return App.flash($('sectionMsg'),error.message,'error');$('sectionCode').value='';$('sectionName').value='';refresh()}
async function addSlate(){if(!election)return;const number=$('slateNumber').value.trim(),name=$('slateName').value.trim();if(!/^\d{2}$/.test(number)||!name)return App.flash($('slateMsg'),'Informe numero de 2 digitos e nome.','error');const {error}=await sb.from('slates').insert({election_id:election.id,number,name});if(error)return App.flash($('slateMsg'),error.message,'error');$('slateNumber').value='';$('slateName').value='';refresh()}
async function importVoters(){if(!election)return;const f=$('xlsx').files[0];if(!f)return App.flash($('importMsg'),'Selecione uma planilha.','error');const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});const {data:secs}=await sb.from('sections').select('id,code').eq('election_id',election.id);const map=new Map(secs.map(s=>[String(s.code),s.id]));const payload=[];for(const r of rows){const ra=String(r.RA??r.ra??'').trim(),name=String(r.NOME??r.Nome??r.nome??'').trim(),code=String(r.SECAO??r.Secao??r.secao??'').trim();if(ra&&name&&map.has(code))payload.push({election_id:election.id,section_id:map.get(code),ra,name,has_voted:false});}if(!payload.length)return App.flash($('importMsg'),'Nenhum registro valido. Confira RA, NOME e SECAO.','error');const {error}=await sb.from('voters').upsert(payload,{onConflict:'election_id,ra'});if(error)return App.flash($('importMsg'),error.message,'error');App.flash($('importMsg'),`${payload.length} eleitor(es) importado(s).`,'ok');refresh()}
async function totalize(){if(!election||election.status!=='closed')return;const {data,error}=await sb.rpc('totalize_election',{p_election_id:election.id});if(error)return $('results').textContent=error.message;const valid=data.filter(x=>x.kind==='slate');const max=Math.max(0,...valid.map(x=>Number(x.votes)));const winners=valid.filter(x=>Number(x.votes)===max&&max>0);$('results').innerHTML=(data||[]).map(x=>`<div class="result"><span>${x.label}</span><b>${x.votes}</b></div>`).join('')+(winners.length===1?`<div class="winner">CHAPA VENCEDORA: ${winners[0].label} - ${winners[0].votes} votos</div>`:winners.length>1?'<div class="winner">EMPATE ENTRE AS CHAPAS MAIS VOTADAS</div>':'');}
