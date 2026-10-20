(()=>{
 const accountDialog=node('dialog');accountDialog.id='pool-account-dialog';const dialogHead=node('div','dialog-head');dialogHead.append(node('b','','Pool Mining Earnings'));const close=node('button','','×');close.onclick=()=>accountDialog.close();dialogHead.append(close);const accountPanel=node('article','panel pool-account');accountPanel.dataset.poolAccount='';accountDialog.append(dialogHead,accountPanel);document.body.append(accountDialog);
 window.openPoolAccount=async id=>{accountDialog.showModal();const value=await api.poolAccountRefresh(id);state.poolAccount=value;renderPoolAccount(value)};
 const panels=[...document.querySelectorAll('[data-pool-account]')];
 const fields=[['Confirmed Balance','balance','confirmed'],['Pending Earnings','balance','pending'],['Total Paid','stats','paid'],['7-Day Earnings','stats','week'],['30-Day Earnings','stats','month'],['Payout Threshold','balance','threshold']];
 const amount=n=>typeof n==='string'&&/^\d+\.\d{8}$/.test(n)?n.replace(/\B(?=(\d{3})+\.)/g,','):typeof n!=='number'?'—':n>0&&n<1e-8?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:8});
 for(const panel of panels){
  const head=node('div','panel-head');head.append(node('b','','Pool Mining Earnings'),node('span','account-identity','Mining Pool · Address Ledger'));
  for(const [label,handler,cls]of [['Refresh',async()=>{const value=await api.poolAccountRefresh();state.poolAccount=value;renderPoolAccount(value)},'account-refresh'],['Payout History',()=>$('#payout-dialog').showModal(),'account-payouts'],['Ledger ↗',()=>api.poolAccountOpen(),'account-open']]){const b=node('button','link '+cls,label);b.onclick=()=>action(handler,b);head.append(b)}
  const values=node('div','account-values');for(const [label,section,key]of fields){const cell=node('div');cell.dataset.section=section;cell.dataset.field=key;cell.append(node('small','',label),node('b','','—'));values.append(cell)}
  const mining=node('div','portal-mining');mining.hidden=true;panel.append(head,values,mining,node('div','account-note','Auto-queries when address saved'));
 }
 let paymentsKey='';
 function portalTable(headers,rows){const table=node('table'),head=node('thead'),tr=node('tr');for(const h of headers)tr.append(node('th','',h));head.append(tr);table.append(head);const body=node('tbody');for(const row of rows){const tr=node('tr');for(const v of row)tr.append(node('td','',v??'—'));body.append(tr)}table.append(body);return table}
 const scalar=v=>v===null||v===undefined?'—':String(v),rate=v=>typeof v==='number'?hash(v):'—';
 function renderPortal(a){
  const s=a.sections,b=s.balance?.value,p=s.payouts?.value,m=s.mining?.value,policy=s.policy?.value,ysr=a.coin==='YSR';
  for(const panel of panels){
   text(panel.querySelector('.account-identity'),a.coin+' · Mining Pool · '+a.address);
   text(panel.querySelector('.account-payouts'),ysr?'Reward Records':'Payout History');
   const items=ysr?[['On-chain Balance',amount(b?.confirmed),s.balance],['Indexed Pool Rewards',amount(s.stats?.value?.paid),s.stats],['Indexed Blocks',scalar(p?.indexedBlocks),s.payouts],['Pool Blocks',scalar(p?.poolBlocks),s.payouts],['Chain Query Depth',scalar(b?.historyDepth),s.balance],['Payout Scheme','Direct Block Reward',s.payouts]]:
    [['Available Unpaid',amount(b?.confirmed),s.balance],[a.coin==='BNT'?'Immature / Est':'Immature Earnings',amount(b?.pending),s.balance],['Payout Reserved',amount(b?.reserved),s.balance],['Total Paid',amount(s.stats?.value?.paid),s.stats],['Payout Threshold',amount(policy?.threshold),s.policy],['Immature Confirmations',scalar(policy?.maturity)+(policy?.safety!==null&&policy?.safety!==undefined?' + '+policy.safety:''),s.policy]];
   [...panel.querySelectorAll('.account-values>div')].forEach((cell,i)=>{text(cell.querySelector('small'),items[i][0]);text(cell.querySelector('b'),items[i][1]);cell.classList.toggle('cached',!!items[i][2]?.stale)});
   const box=panel.querySelector('.portal-mining');box.hidden=false;const key=JSON.stringify([s.mining,b?.note,p?.complete,policy]);
   if(box.dataset.key!==key){const opened=box.querySelector('details')?.open;box.dataset.key=key;box.replaceChildren();
    const summary=node('div','portal-rates');for(const [label,value]of [['Pool Estimate',rate(m?.hash)],['15m',rate(m?.averages?.m15)],['1h',rate(m?.averages?.h1)],['24h',rate(m?.averages?.h24)],['Online Workers',scalar(m?.online)],['Accepted / Rejected',scalar(m?.accepted)+' / '+scalar(m?.rejected)]]){const v=node('span');v.append(node('small','',label),node('b','',value));summary.append(v)}summary.classList.toggle('cached',!!s.mining?.stale);box.append(summary);
    const detail=node('details');detail.open=!!opened;detail.append(node('summary','','Worker Details · '+scalar(m?.workers?.length)));const scroll=node('div','portal-workers');
    if(m?.workers?.length)scroll.append(portalTable(['Worker','Status','Pool Hashrate','Accepted / Rejected','Last Share'],m.workers.map(w=>[w.name||'—',w.online===true?'Online':w.online===false?'Offline':'—',rate(w.hash),scalar(w.accepted)+' / '+scalar(w.rejected),w.lastShare?new Date(w.lastShare).toLocaleString(GozerI18n.locale):'—'])));else scroll.append(node('p','note',s.mining?.error||'Pool returned no worker records.'));detail.append(scroll,node('p','note',m?.note||'Worker represents a pool session, not physical GPU count.'));box.append(detail);
    if(b?.note)box.append(node('p','note',b.note));if(ysr&&p?.complete!==true)box.append(node('p','note','Reward indexing in progress; covers indexed blocks only.'));if(policy?.enabled===false)box.append(node('p','note','Pool auto-payout not enabled'));if(policy?.window)box.append(node('p','note','Payout Window · '+policy.window));
   }
   const errors=Object.entries(s).filter(([k,v])=>k!=='stats'&&v?.error).map(([k,v])=>({balance:'Balance',mining:'Hashrate',payouts:'Payout History',policy:'Payout Rules'}[k]||k)+' '+v.error),old=Object.values(s).some(v=>v?.stale),at=Math.min(...Object.values(s).map(v=>v?.at).filter(Boolean));
   text(panel.querySelector('.account-note'),(a.loading?'Querying · ':'')+(errors.length?errors.join(' · ')+' · ':old?'Cached data · ':'')+(Number.isFinite(at)?'Queried '+time(at)+' · ':'')+'Hashrate 30s / Ledger 60s · Unit '+a.coin+' · Pool estimate differs from local live hashrate'+(a.mixed?' · Other pool earnings not included':''));
   panel.querySelector('.account-refresh').disabled=a.loading;panel.querySelector('.account-open').disabled=false;panel.querySelector('.account-payouts').disabled=false;
  }
  const key=JSON.stringify([a.coin,a.address,s.payouts,GozerI18n.locale]);if(paymentsKey===key)return;paymentsKey=key;
  text('#payout-dialog .dialog-head b',ysr?'On-chain Pool Reward Records':'Pool Payout Records');const body=$('#payout-body');body.replaceChildren(node('p','note','Mining Pool · '+a.coin+' · '+a.address+(s.payouts?.stale?' · Cached':'')));
  if(p?.note)body.append(node('p','note',p.note));
  if(p?.complete===false)body.append(node('p','note','Partial coverage; refer to pool website.'));
  if(!p)body.append(node('p','note',s.payouts?.error||'Reading payout records...'));
  else if(!p.rows.length)body.append(node('p','note','Pool returned no payout records. Payouts trigger when threshold is reached.'));
  else body.append(portalTable(['Time','Amount / '+a.coin,'Status','TxID'],p.rows.map(r=>[r.at?new Date(r.at).toLocaleString(GozerI18n.locale):'—',amount(r.amount),r.status,r.txid?r.txid.slice(0,8)+'…'+r.txid.slice(-6):'—'])));
  if(p){const nav=node('div','portal-pages');for(const [label,n]of [['Prev',p.page-1],['Next',p.page+1]]){const btn=node('button','link',label);btn.disabled=n<1||n>p.pages||a.loading;btn.onclick=()=>action(async()=>{const value=await api.poolAccountPage(n);state.poolAccount=value;renderPoolAccount(value)},btn);nav.append(btn)}nav.append(node('span','note',p.page+' / '+p.pages+' · '+p.count+' records'));body.append(nav)}
  const link=node('button','link','View Full Pool Ledger ↗');link.onclick=()=>action(()=>api.poolAccountOpen(),link);body.append(link);
 }
 function renderPoolAccount(a){
  if(a?.adapter==='gozero'){renderPortal(a);return}for(const panel of panels)panel.querySelector('.portal-mining').hidden=true;
  text('#payout-dialog .dialog-head b',a?.coin==='YSR'?'On-chain Rewards · Last 10':'Pool Payout Records · Last 10');
  for(const panel of panels){
   text(panel.querySelector('.account-payouts'),a?.coin==='YSR'?'Reward Records':'Payout History');
   const sections=a?.sections||{},times=Object.values(sections).map(s=>s?.at).filter(Boolean),old=Object.values(sections).some(s=>s?.stale),failed=Object.values(sections).some(s=>s?.error);
   text(panel.querySelector('.account-identity'),a?.supported?(a.coin+' · '+a.source+' · '+a.address):a?.coin||'Mining Pool');
   for(const cell of panel.querySelectorAll('.account-values>div')){const d=sections[cell.dataset.section];const original=fields.find(f=>f[1]===cell.dataset.section&&f[2]===cell.dataset.field)?.[0];text(cell.querySelector('small'),a?.coin==='YSR'?({confirmed:'On-chain Balance',pending:'Pending (N/A)',paid:'Total Payouts',week:'7-Day (N/A)',month:'30-Day (N/A)',threshold:'Direct / No threshold'}[cell.dataset.field]):original);text(cell.querySelector('b'),amount(d?.value?.[cell.dataset.field]));cell.classList.toggle('cached',!!d?.stale)}
   text(panel.querySelector('.account-note'),!a?.supported?a?.reason||'Auto-queries when address saved':a.loading?'Reading pool ledger...':(failed?'Partial API offline · retaining cached data · ':old?'Cached · ':'')+(times.length?'Queried '+time(Math.min(...times))+' · ':'')+(a.coin==='YSR'?'On-chain balance & reward records · ':'')+'Refreshes every 60s · Unit '+a.coin+' · Pool statistics for this address across all workers'+(a.mixed?' (including backup pools)':''));
   panel.querySelector('.account-refresh').disabled=!a?.supported||a.loading;panel.querySelector('.account-open').disabled=!a?.supported;panel.querySelector('.account-payouts').disabled=!a?.supported;
  }
  const p=a?.sections?.payouts,key=JSON.stringify([a?.coin,a?.address,p]);if(key!==paymentsKey){
   paymentsKey=key;const body=$('#payout-body');body.replaceChildren();body.append(node('p','note',(a?.source||'Mining Pool')+' · '+(a?.coin||'')+' · '+(a?.address||'')+' · '+(p?.stale?'Cached data · ':'')+(p?.at?'Queried '+time(p.at):'Waiting for source')));if(a?.coin==='NOID')body.append(node('p','note','NOID payout records show debit amount; total paid reflects net pool payout.'));
   if(a?.coin==='YSR')body.append(node('p','note','YSR rewards credit on-chain directly per block.'));
   if(!p?.value)body.append(node('p','note',p?.error||'Reading payout records...'));
   else if(!p.value.rows.length)body.append(node('p','note',a?.coin==='YSR'?'Node returned no reward records.':'Pool returned no payout records. Payouts trigger when threshold is reached.'));
   else{const table=node('table'),head=node('thead'),tr=node('tr');['Time','Amount / '+a.coin,'Status','TxID'].forEach(x=>tr.append(node('th','',x)));head.append(tr);table.append(head);const rows=node('tbody');for(const r of p.value.rows){const tr=node('tr');for(const value of [r.at?new Date(r.at).toLocaleString(GozerI18n.locale):'—',amount(r.amount),r.status,r.txid?r.txid.slice(0,8)+'…'+r.txid.slice(-6):'—'])tr.append(node('td','',value));tr.lastChild.title=r.txid||'';rows.append(tr)}table.append(rows);body.append(table)}
   if(p?.value)body.append(node('p','note',(a?.coin==='YSR'?'Returned reward records: ':'Pool payouts: ')+p.value.count+' total, showing latest 10. View pool for full ledger.'));
   const link=node('button','link','View Full Pool Ledger ↗');link.disabled=!a?.supported;link.onclick=()=>action(()=>api.poolAccountOpen(),link);body.append(link);
  }
 }
 $('#payout-close').onclick=()=>$('#payout-dialog').close();
 $('#temperature-default').onclick=()=>{$('#temperature').value=90;toast('Set to 90°C; click Save Settings to apply')};
 window.renderPoolAccount=renderPoolAccount;if(state)renderPoolAccount(state.poolAccount);
})();
