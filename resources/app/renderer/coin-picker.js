'use strict';
(()=>{
 let kind='all',catalogKey='';
 const tuning=document.createElement('div');tuning.id='bnt-tuning';tuning.className='bnt-tuning note';tuning.hidden=true;
 const tuneButton=node('button','','Auto-tune'),cancelTune=node('button','','Cancel tuning'),tuneMessage=node('span','','Offline benchmark · ~5–15 min · Applied when finished');
 tuning.append(tuneButton,cancelTune,tuneMessage);$('#cpu-options').after(tuning);
 tuneButton.onclick=()=>action(async()=>{await saveMining();await api.bntTune();state=await api.bootstrap();configInputs();render()},tuneButton);
 cancelTune.onclick=()=>action(()=>api.bntTuneCancel(),cancelTune);

 const busy=s=>!s.ready||s.miner.status!=='idle'||s.serviceFee?.active||s.serviceFee?.switching||s.miner.installing;
 window.renderCoinPicker=s=>{
  if(!s)return;
  const key=JSON.stringify(s.coins.map(c=>[c.symbol,c.name,c.algorithm,c.hardware]));
  if(key!==catalogKey){catalogKey=key;$('#coin-tabs').replaceChildren(...s.coins.map(c=>{
   const b=node('button','coin-choice');b.dataset.coin=c.symbol;b.dataset.kind=c.hardware||'GPU';
   const head=node('span','coin-choice-head');head.append(node('b','',c.symbol),node('em','',c.hardware||'GPU'));
   b.append(head,node('small','',c.name));b.title=c.name+' · '+c.algorithm;return b;
  }));}
  const query=$('#coin-search').value.trim().toLowerCase();let count=0;
  for(const c of s.coins){const b=$('#coin-tabs').querySelector('[data-coin="'+c.symbol+'"]');b.hidden=(kind!=='all'&&(c.hardware||'GPU')!==kind)||!`${c.symbol} ${c.name} ${c.algorithm}`.toLowerCase().includes(query);if(!b.hidden)count++;b.disabled=!s.ready;b.classList.toggle('active',c.symbol===s.config.coin);b.setAttribute('aria-pressed',String(c.symbol===s.config.coin));}
  text('#coin-count',count+' / '+s.coins.length);$('#coin-empty').hidden=count>0;
  const current=s.coins.find(c=>c.symbol===s.config.coin);text('#coin-current',current?current.symbol+' · '+current.name+' · '+(current.hardware||'GPU')+' / '+current.algorithm:'—');
 };
 $('#coin-search').addEventListener('input',()=>window.renderCoinPicker(state));
 document.querySelectorAll('[data-coin-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.coinKind;document.querySelectorAll('[data-coin-kind]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.renderCoinPicker(state)});
 window.renderCpuMining=s=>{
  const cpu=['ZCD','BNT','NRB','JTM'].includes(s.config.coin),blocked=busy(s);tuning.hidden=s.config.coin!=='BNT'||s.kernel.adapter==='bnt-seine';tuneButton.disabled=blocked||!s.kernel.installed;cancelTune.hidden=!s.bntTuning?.running;cancelTune.disabled=false;GozerI18n.setText(tuneMessage,s.bntTuning?.message||'Offline benchmark · ~5–15 min · Applied when finished');$('#cpu-options').hidden=!cpu;$('#pool-row').hidden=false;$('#zcd-node').hidden=!cpu;
  $('#performance').disabled=cpu&&blocked;$('#performance').title=cpu&&blocked?'CPU mining active: stop to adjust threads':'';$('#cpu-threads').disabled=blocked;$('#worker').disabled=blocked;$('#zcd-password').disabled=blocked;
  $('#mining-devices').nextElementSibling.hidden=cpu;
  text('#device-runtime-note',cpu?'CPU task · Does not affect GPU selection':'Per-PCI scheduling / totals by algorithm');
  text('.performance-note',cpu?'CPU allocated by logical threads. 100% utilizes full CPU budget.':'Top level reserves 10% scheduling time.');
  text('#pool-link',cpu?'Official ↗':'Pool ↗');$('#pool').placeholder=cpu?'stratum+tcp://host:port':'';
  $('#bnt-connection-check').hidden=s.config.coin!=='BNT';$('#bnt-connection-check').disabled=blocked;if(!cpu)return;if(s.config.coin==='BNT'){const b=s.bntMemory||{},g=v=>(Number(v||0)/1073741824).toFixed(1),n=Number($('#cpu-threads').value)||GozerPerformance.bntThreadBudget(s.bntThreadLimit,Number($('#performance').value));text('.performance-note','BNT per thread 2 GiB + 128 MiB · Reserved '+g(b.reserveBytes)+' GiB · Est usage '+g(n*b.perThreadBytes)+' GiB');text('#pool-link','Pool ↗'); $('#cpu-threads').max=s.bntThreadLimit||1;$('#zcd-node').hidden=true;$('#zcd-password').disabled=true;text('#cpu-summary','RAM '+g(b.totalBytes)+' / Available '+g(s.hardware?.metrics?.freeMemory)+' GiB · Limit '+s.bntThreadLimit+' T');if(!blocked&&(!s.bntThreadLimit||n>s.bntThreadLimit)){$('#start').disabled=true;text('#run-status','Insufficient memory or thread limit exceeded')} text('#fee-note',s.kernel.adapter==='bnt-seine'?'Seine kernel fee 2.5% (bntpool 1%) · App fee 0.5%':'Kernel fee 0% · App fee 0.5%');text('#compatibility','BNT · Argon2id · CPU / AVX2 / SSE2; 2 GiB per thread');text('#measured-net','BNT price and income sources not connected');const conn=s.miner.connection;if(s.miner.status==='running'&&conn&&(!s.miner.jobs.some(j=>j.status==='running')||conn.stage!=='work')){text('#session-status',conn.stage==='work'?'Compute initializing':'Waiting for pool');text('#run-status',conn.message)}if(!s.serviceFee?.addresses?.BNT){text('#compatibility','BNT dev fee address unconfigured');$('#start').disabled=true}return;}
  const d=s.cpuDevice,threads=Number($('#cpu-threads').value)||GozerPerformance.cpuThreadBudget(d,Number($('#performance').value)),j=s.miner.jobs?.[0];
  $('#cpu-threads').max=d?.maxThreads||1;
  text('#cpu-summary',d?d.cores+' C / '+d.logical+' T · '+threads+' T':'No supported CPU detected');
  text('#zcd-cpu-budget','CPU '+threads+' T · '+s.config.performance+'%');
  text('#zcd-status',!s.config.pools.ZCD?'Pool unconfigured':s.miner.status==='idle'?'Standby':j?.telemetry?.hash>0?'Running / Sampled':'Waiting for pool / RandomX warmup');
  text('#zcd-shares',j?.shares?'A '+j.shares.accepted+' / R '+j.shares.rejected:'A — / R —');
  text('#fee-note',s.kernel.kernelFee===0?'XMRig Kernel fee 0% · App fee 0.5%':'XMRig Kernel fee 1% · App fee 0.5%');
  text('#compatibility','ZCD · CPU RandomX v2 (rx/2); enter primary and backup pools to start.');
  text('#zcd-note',s.config.coin==='NRB'?'Enter Stratum pool URL. Payout address requires N address.':s.config.coin==='JTM'?'Enter Stratum pool URL. Payout address requires j1 address.':'Enter Stratum pool URL. Payout address requires 02 persistent address.');
  text('#measured-net','ZCD price and income not connected');
  const invalidThreads=s.config.cpuThreads>(d?.maxThreads||0);
  const noFee=!s.serviceFee?.addresses?.[s.config.coin];
  if(!d||invalidThreads||noFee||!s.config.pools[s.config.coin]){$('#start').disabled=true;}
  if(!s.config.pools[s.config.coin]&&s.miner.status==='idle')text('#run-status','Enter and save pool address to start');
  if(noFee)text('#zcd-note','Persistent dev fee address unconfigured');
  if(s.miner.session?.benchmark&&s.miner.status!=='idle'&&!s.miner.session.measurementAt)text('#run-status','Waiting for pool / RandomX warmup');
 };
 if(state){window.renderCoinPicker(state);window.renderCpuMining(state)}
})();
