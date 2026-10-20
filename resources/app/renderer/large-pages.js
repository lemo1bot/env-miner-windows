'use strict';
(()=>{
 const api=window.gozer,rows=[];let latest;
 const labels={checking:'Checking large page privileges',disabled:'Large pages not authorized',pending:'Requires sign out or reboot',available:'Large-page allocation available','allocation-failed':'Authorized, but allocation failed',error:'Failed to read large page status'};
 const put=(n,s)=>GozerI18n.setText(n,s);
 function row(parent,kind){if(!parent)return;const root=document.createElement('div');root.className='large-pages-row';root.dataset.location=kind;
  const button=document.createElement('button'),refresh=document.createElement('button'),note=document.createElement('span');button.className='large-pages-enable';refresh.className='large-pages-refresh';put(button,'Enable Large Pages');put(refresh,'Check');root.append(button,refresh,note);if(kind==='settings')parent.querySelector('.panel-head').after(root);else if(kind==='dual')parent.querySelector('.dual-performance').after(root);else parent.append(root);rows.push({root,button,refresh,note,kind});
  button.onclick=async()=>{button.disabled=true;try{await api.largePagesEnable()}catch(e){window.toast?.(e.message)}finally{update(await api.bootstrap())}};
  refresh.onclick=async()=>{refresh.disabled=true;try{await api.largePagesStatus()}catch(e){window.toast?.(e.message)}finally{update(await api.bootstrap())}};
 }
 const single=document.createElement('div');document.querySelector('.mining-config').before(single);row(single,'single');
 row(document.querySelector('.dual-card.cpu'),'dual');row(document.querySelector('#settings .panel'),'settings');
 function update(s){if(!s?.config)return;latest=s;const p=s.largePages||{phase:'checking'},blocked=!s.ready||p.busy||s.bntTuning?.running||s.miner?.status!=='idle'||s.serviceFee?.active||Object.values(s.dual?.tasks||{}).some(v=>v.busy);const session=s.config.workbenchMode==='dual'?s.dual?.tasks?.cpu?.miner?.session:s.miner?.session;
  for(const r of rows){r.root.dataset.phase=p.phase;r.root.hidden=r.kind==='single'?(s.config.workbenchMode==='dual'||!['BNT','ZCD'].includes(s.config.coin)):r.kind==='dual'?s.config.workbenchMode!=='dual':false;
   r.button.disabled=blocked||p.phase==='pending'||p.preferred&&p.tokenAvailable;r.refresh.disabled=p.busy||!s.ready;
   put(r.button,p.phase==='pending'?'Pending reboot':p.preferred&&p.tokenAvailable?'Large pages enabled':'Enable Large Pages');
   let text=labels[p.phase]||labels.error;if(session?.coin==='BNT'&&session.bntOptimization&&((s.config.workbenchMode==='dual'?s.dual.tasks.cpu.miner.status:s.miner.status)==='running'))text+=' · '+'Active hugepage threads'+' '+session.bntOptimization.largePageWorkers+'/'+session.cpuThreads;
   put(r.note,text);r.note.title=p.error||'Privilege does not guarantee 100% allocation; verified by miner engine log.';
  }
 }
 api.subscribe(update);api.bootstrap().then(update);document.addEventListener('gozer-language',()=>latest&&update(latest));
})();
