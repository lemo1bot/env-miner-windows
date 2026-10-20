'use strict';
(()=>{
 const panel=node('section','view');panel.id='kernels';
 const bar=node('div','section-bar');bar.append(node('b','','Coin & Engine Library'));
 const back=node('button','','Back to Workbench');back.onclick=()=>showView('mining');bar.append(back);
 const note=node('p','note library-notice','Browse coins and install engines while active tasks continue running.');
 const tabs=node('div','library-tabs'),body=node('div','library-body');
 tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Select coin');
 panel.append(bar,note,tabs,body);$('main').append(panel);
 const stages={connecting:'Connecting',downloading:'Downloading',verifying:'Verifying package',extracting:'Extracting',checking:'Checking executable',ready:'Engine Ready',error:'Installation failed · Retry',idle:'Not installed'};
 let coin='NOID',key='',rows=new Map(),count;
 const busy=()=>state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching||Object.values(state.dual?.tasks||{}).some(t=>t.busy);
 window.openKernelLibrary=symbol=>{coin=symbol||state.config.coin;showView('kernels');update(state)};
 $('#kernel-library-open').onclick=()=>openKernelLibrary();
 const extra=node('button','library-mode-link','Engine Library ↗');extra.onclick=()=>openKernelLibrary();$('.workbench-modes').append(extra);
 function cardHeader(name,version){
  const head=node('div','library-head'),identity=node('div','library-identity');
  identity.append(node('b','',name),node('span','library-version','v'+version));head.append(identity);return head;
 }
 function build(lib,current){
  tabs.replaceChildren(...lib.map(c=>{
   const b=node('button',c.symbol===coin?'active':'');b.setAttribute('aria-pressed',String(c.symbol===coin));
   b.append(node('b','',c.symbol),node('small','',c.hardware||'GPU'));b.onclick=()=>openKernelLibrary(c.symbol);return b;
  }));
  body.replaceChildren();rows=new Map();
  const info=node('div','panel library-info'),identity=node('div','library-summary');
  identity.append(node('b','',current.symbol+' · '+current.name),node('span','muted',current.algorithm));
  count=node('span','library-count');identity.append(count);
  const select=node('button','primary','Configure Coin Mining');select.onclick=()=>action(async()=>{
   if(busy())throw Error('A mining task is already running. Please stop active task before switching coins.');
   if(state.config.workbenchMode==='dual'){toast('Please select coin in the corresponding CPU / GPU task card on Dual Workbench');return}
   await chooseCoin(coin);showView('mining');
  });info.append(identity,select);body.append(info);
  const grid=node('div','library-grid');body.append(grid);
  for(const [index,k]of current.kernels.entries()){
   const card=node('article','panel library-kernel');card.dataset.kernel=k.id;
   const head=cardHeader(k.name||'KRig',k.version),badge=node('span','library-badge',index===0?'Recommended':'Alternative');head.append(badge);
   const statusRow=node('div','library-status-row'),status=node('span','library-status'),bytes=node('span','library-bytes');statusRow.append(status,bytes);
   const progressSlot=node('div','library-progress'),progress=node('progress');progress.max=100;progress.setAttribute('aria-label','Kernel installation progress');progressSlot.append(progress);
   const source=node('p','library-source',k.bundled?'Bundled open-source core · SHA256 verified':k.adapter==='bnt-seine'?'Seine official release · Kernel fee 2.5% (bntpool 1%) · App fee 0.5% · SHA256 verified':'Official GitHub download · Dual SHA256 verified');
   const button=node('button','primary library-install','Download & Install');
   const symbol=current.symbol;button.onclick=()=>action(async()=>{await api.libraryInstall(symbol,k.id);toast('Kernel installed and verified; mining not started')},button);
   const error=node('p','library-error');error.hidden=true;error.setAttribute('role','status');
   card.append(head,statusRow,source,button,progressSlot,error);grid.append(card);rows.set(k.id,{card,status,bytes,progress,button,error});
  }
  if(coin==='BNT'){
   const section=node('div','library-external');section.append(node('h3','','Official Full Node · Standalone'));
   const card=node('article','panel library-kernel library-node'),head=cardHeader('Blocknet Core','0.20.0');head.append(node('span','library-badge','Official Full Node'));
   const description=node('p','library-source','Full node solo mining requires blockchain sync. Not for pool stratum.');
   const actions=node('div','library-node-actions'),download=node('button','primary','Download Windows Core ↗'),source=node('button','','Release / Checksum ↗');
   download.onclick=()=>action(()=>api.open('bntOfficialDownload'),download);source.onclick=()=>action(()=>api.open('bntOfficialRelease'),source);actions.append(download,source);
   const details=node('details','library-checksum');details.append(node('summary','','SHA256'),node('code','','f9ca1ac5dd55ddb9af963c44df9152479f05d6c55be3fb2bbf69cfe7d9fa7435'));
   card.append(head,description,actions,details);section.append(card);body.append(section);
  }
 }
 function update(s){
  if(!s)return;const lib=s.kernelLibrary||[],current=lib.find(c=>c.symbol===coin);if(!current)return;
  const next=coin+':'+lib.map(c=>c.symbol+':'+c.kernels.map(k=>k.id).join(',')).join('|');
  if(key!==next){key=next;build(lib,current)}
  text(count,'Installed '+current.kernels.filter(k=>k.installed).length+' / '+current.kernels.length);
  const installing=lib.some(c=>c.kernels.some(k=>k.installing));
  for(const k of current.kernels){
   const r=rows.get(k.id);if(!r)continue;const p=k.installation||{};
   const phase=k.installing?'working':p.stage==='error'?'error':k.installed?'ready':'idle';r.card.dataset.phase=phase;
   text(r.status,k.installing?(stages[p.stage]||'Downloading & verifying...'):p.stage==='error'?stages.error:k.installed?'Installed · Ready':'Not installed');
   text(r.bytes,k.installing&&p.received?num(p.received/1048576,1)+' MB'+(p.total?' / '+num(p.total/1048576,1)+' MB':''):'');
   r.progress.hidden=!k.installing;if(p.total)r.progress.value=Math.min(100,p.received/p.total*100);else r.progress.removeAttribute('value');
   r.error.hidden=p.stage!=='error';text(r.error,p.stage==='error'?p.error||'Installation failed · Retry':'');
   r.button.disabled=installing;text(r.button,k.installing?'Downloading & verifying...':k.installed?'Reinstall':k.bundled?'Install Engine':'Download & Install');
  }
 }
 api.subscribe(update);if(state)update(state);
})();
