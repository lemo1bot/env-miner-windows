'use strict';
const $=s=>document.querySelector(s),api=window.gozer;
let state=null,focused=null,view='overview',rowKey=null,workerKey='',incomeKey='',logsKey='',toastTimer,selectedCoin='PRL',saving=false;
const num=(v,dec=0)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:dec,minimumFractionDigits:dec}):'—';
const val=(v,u='',dec=0)=>v===null||v===undefined?'—':num(v,dec)+u;
const money=v=>v===null||v===undefined?'—':(v<0?'−$':'$')+num(Math.abs(v),2);
const time=v=>v?new Date(v).toLocaleTimeString(GozerI18n.locale,{hour12:false}):'—';
const hash=(v,unit='H/s')=>{if(v===null||v===undefined)return'—';if(unit!=='H/s')return num(v,2)+' '+unit;const units=['H/s','kH/s','MH/s','GH/s','TH/s','PH/s','EH/s'];let n=0;while(v>=1000&&n<units.length-1){v/=1000;n++}return num(v,2)+' '+units[n]};
const hashHistory=new GozerTelemetry.HashHistory();
function heat(el,temp){if(!el)return;el.classList.remove('hot','warm');const level=GozerTelemetry.thermalLevel(temp,state.config.temperature);if(level==='hot'||level==='warm')el.classList.add(level);}
function text(el,value){if(typeof el==='string')el=$(el);if(!el)return;const s=String(value??'—');GozerI18n.setText(el,s);if(el.classList.contains('value'))el.dataset.missing=String(s==='—')}
function node(tag,cls,content){const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)GozerI18n.setText(n,content);return n}
function toast(message){text('#toast',message);$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6500)}
async function action(fn,button){if(button?.disabled)return;try{if(button)button.disabled=true;return await fn()}catch(e){toast(e.message)}finally{if(button)button.disabled=false;if(state)renderControls()}}
function fields(id,labels){const parent=$(id);labels.forEach(label=>{const f=node('div','field'),l=node('label','',label),v=node('b','value','—');f.append(l,v);parent.append(f)})}
function setFields(id,values){$(id).querySelectorAll('.field').forEach((f,i)=>{const item=values[i]??['—','Unread'];text(f.lastChild,Array.isArray(item)?item[0]:item);f.title=Array.isArray(item)?item[1]:''})}
fields('#gpu-fields',['Compute Units','VRAM Capacity','Core Clock','Memory Clock','Fan','Core Temp','VRAM Used','Power Limit','Current PCIe','Max PCIe','Link Rate','Driver Version','Arch / Bus Width','Board Power','Hotspot / Junction','Sensor Source']);
fields('#cpu-fields',['Cores / Threads','CPU Total Load','Realtime Clock','SMBIOS Clock','L1 Cache','L2 / L3','CPU Pkg Temp','CPU Pkg Power','Socket','Core Sampling']);
fields('#memory-fields',['Installed / Modules','Used / Available','DIMM 1','DIMM 2','Config Rate','Actual Clock','Timings','Channels','Vendor 1','Vendor 2']);
const scrollPositions={};function showView(id){if(!document.getElementById(id)?.classList.contains('view'))return;scrollPositions[view]=$('main').scrollTop;view=id;$('main').classList.toggle('mining-layout',id==='mining');$('main').classList.toggle('rental-layout',id==='rentals');document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id===id));document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===id));$('main').scrollTop=scrollPositions[id]||0;if(state)render();document.dispatchEvent(new CustomEvent('gozer-view',{detail:id}))}
function fresh(g){return g?.sensors&&Date.now()-g.sensors.at<10000?g.sensors:null}
function brand(raw){const value=String(raw||'').trim();if(/^80AD/i.test(value))return'SK hynix';if(/^80CE/i.test(value))return'Samsung';if(/^802C/i.test(value))return'Micron';if(/^0198/i.test(value))return'Kingston';return value||'—'}
function memoryType(v){return({26:'DDR4',34:'DDR5',30:'LPDDR4',35:'LPDDR5'})[v]||'Type '+(v??'—')}
function selected(){return(state?.hardware?.gpus||[]).filter(d=>state.config.selected.includes(d.id))}
function miningSelected(){return ['ZCD','BNT','NRB','JTM'].includes(state?.config.coin)?[state.cpuDevice].filter(Boolean):selected()}
function missingDevices(){if(['ZCD','BNT','NRB','JTM'].includes(state.config.coin))return [];return state.config.selected.filter(id=>!state.hardware?.gpus.some(g=>g.id===id))}
$('#clear-missing').onclick=()=>action(()=>save({selected:selected().map(g=>g.id)}));
let configQueue=Promise.resolve();
function enqueueConfig(fn){const next=configQueue.catch(()=>{}).then(async()=>{saving=true;try{return await fn()}finally{saving=false}});configQueue=next;return next}
async function save(patch){return enqueueConfig(async()=>{const config=await api.save({...state.config,...patch});state.config=config;render();return config})}
function buildGpuRows(gpus){const key=gpus.map(d=>d.id).join('|')+'|'+state.ready;if(key===rowKey)return;rowKey=key;const parent=$('#gpu-list');parent.replaceChildren();if(!gpus.length){parent.append(node('div','empty',state.ready?'No physical GPU detected, rescan available':'Scanning local devices, please wait...'));return}for(const g of gpus){const row=node('div','gpu-row');row.dataset.id=g.id;const identity=node('div','gpu-identity'),box=node('input');box.type='checkbox';box.setAttribute('aria-label','Select '+g.name);box.onchange=()=>action(async()=>{const ids=new Set(state.config.selected);box.checked?ids.add(g.id):ids.delete(g.id);await save({selected:[...ids]})});const vendor=node('span','vendor '+g.vendor.toLowerCase(),g.vendor==='NVIDIA'?'NV':g.vendor==='AMD'?'AMD':'INT');const button=node('button','gpu-name');button.title=g.name;button.append(node('b','',g.name.replace(/^NVIDIA GeForce |^AMD Radeon /,'')),node('small','',g.pci||'PCI —'));button.onclick=()=>{focused=g.id;renderHardware()};identity.append(box,vendor,button);row.append(identity);for(let i=0;i<4;i++)row.append(node('span','value','—'));const more=node('button','link','›');more.title='View full specs for '+g.name+' specs';more.onclick=()=>{focused=g.id;showDetails('gpu')};row.append(more);parent.append(row)}}
function renderHardware(){const h=state.hardware;if(!h)return;buildGpuRows(h.gpus);if(!h.gpus.some(g=>g.id===focused))focused=(h.gpus.find(g=>g.vendor==='NVIDIA')||h.gpus.find(g=>g.vendor==='AMD')||h.gpus[0])?.id;const chosen=selected();text('#selected-count','Selected '+chosen.length+' / '+h.gpus.length+(missingDevices().length?' · '+missingDevices().length+' offline':''));text('#os-name',h.os[0]?.Caption||'Windows / Local host');text('#scan-time','Scanned '+time(h.scannedAt));let total=0,unknown=0;for(const g of h.gpus){const row=$('#gpu-list').querySelector('[data-id="'+g.id+'"]');if(!row)continue;const s=fresh(g),box=row.querySelector('input');box.checked=state.config.selected.includes(g.id);box.disabled=!state.ready||state.serviceFee?.active||state.serviceFee?.switching||state.miner.status!=='idle'||!['NVIDIA','AMD'].includes(g.vendor)||!g.pci;box.title=box.disabled&&state.miner.status==='idle'?'Device driver or PCI address not ready':'';row.classList.toggle('selected',g.id===focused);const v=row.querySelectorAll(':scope > .value');text(v[0],g.memoryMiB?num(g.memoryMiB/1024,1)+' G':'—');text(v[1],val(s?.load,'%'));text(v[2],val(s?.temp,'°'));heat(v[2],s?.temp);text(v[3],val(s?.power,' W',1));if(s?.power!==null&&s?.power!==undefined)total+=s.power;else unknown++}text('#gpu-power','Known board power '+num(total,1)+' W'+(unknown?' + '+unknown+' unknown':''));const g=h.gpus.find(g=>g.id===focused),s=fresh(g);text('#focused-name',g?g.name+' · '+(g.pci||'PCI unread'):'No GPU detected');const source='NVIDIA driver / nvidia-smi; sensors unavailable display as —';setFields('#gpu-fields',[
 [g?.cores?num(g.cores)+' CUDA':'—',g?.specSource||'Driver did not report core count'],[g?.memoryMiB?num(g.memoryMiB)+' MiB':'—','Driver reported total VRAM'],[val(s?.clock,' MHz'),source],[val(s?.memClock,' MHz'),source+' (core clock, not effective rate)'],[val(s?.fan,'%'),source],[val(s?.temp,' °C'),source],[s?val(s.usedMiB,' MiB'):'—',source],[val(s?.powerLimit,' W'),source],[s?.gen&&s?.width?s.gen+'.0 ×'+s.width:'—',source],[s?.maxGen&&s?.maxWidth?s.maxGen+'.0 ×'+s.maxWidth:'—',source],[s?.gen?({1:2.5,2:5,3:8,4:16,5:32,6:64}[s.gen]||'—')+' GT/s':'—','PCIe standard bandwidth per lane, not current throughput'],[g?.driver||'—','Windows CIM / NVIDIA driver'],[g?.architecture?(g.architecture+' / '+val(g.memoryBusWidth,'b')):'—',g?.specSource||'N/A'],[val(s?.power,' W',1),source],['—','Hotspot / Junction N/A'],[s?'Driver realtime':g?'CIM / N/A':'—',s?source:'Hardware enumeration only']]);
 heat($('#gpu-fields').children[5]?.lastChild,s?.temp);
 const c=h.cpu[0]||{},m=h.metrics||{},memory=h.memory||[];text('#cpu-name',c.Name||'Waiting for device info');const l1=(h.cache||[]).filter(x=>x.Level===3&&x.InstalledSize>0).reduce((a,x)=>a+x.InstalledSize,0);setFields('#cpu-fields',[[val(c.NumberOfCores)+' / '+val(c.NumberOfLogicalProcessors),'CIM: Primary CPU socket; see full specs for multi-socket'],[val(m.cpuLoad,'%',1),'Windows logical processor delta'],['—','Per-core effective clock sensor N/A'],[val(c.CurrentClockSpeed,' MHz'),'SMBIOS reported clock, not realtime boost'],[l1?num(l1)+' KB':'—','SMBIOS enumerated L1 cache total'],[c.L2CacheSize||c.L3CacheSize?val(c.L2CacheSize/1024)+' / '+val(c.L3CacheSize/1024)+' MB':'—','CIM cache sizes'],['—','CPU temperature sensor N/A'],['—','CPU package power sensor N/A'],[c.SocketDesignation||'—','SMBIOS socket designation'],[m.perCore?m.perCore.length+' Cores / Realtime':'—','See details for per-logical-processor usage']]);
 const installed=memory.reduce((a,r)=>a+Number(r.Capacity||0),0),available=m.freeMemory,used=m.totalMemory!==undefined?m.totalMemory-m.freeMemory:null;const rates=[...new Set(memory.map(r=>r.ConfiguredClockSpeed).filter(Boolean))];setFields('#memory-fields',[[num(installed/1073741824)+' GiB / '+memory.length,'SMBIOS installed capacity / modules'],[used===null?'—':num(used/1073741824,1)+' / '+num(available/1073741824,1)+' G','OS visible used / available RAM'],[memory[0]?num(Number(memory[0].Capacity)/1073741824)+' GiB':'—',memory[0]?.PartNumber||'Unread'],[memory[1]?num(Number(memory[1].Capacity)/1073741824)+' GiB':'—',memory[1]?.PartNumber||'Unread'],[rates.length?rates.join('/')+' MT/s':'—','SMBIOS transfer rate; not MHz clock'],['—','Memory controller clock N/A'],['—','SPD timings N/A'],['—','Channel configuration N/A'],[brand(memory[0]?.Manufacturer),'SMBIOS vendor / JEDEC code'],[brand(memory[1]?.Manufacturer),'SMBIOS vendor / JEDEC code']]);text('#board-name',h.board[0]?.Product||'Motherboard info unavailable');text('#bios-name','BIOS '+(h.bios[0]?.SMBIOSBIOSVersion||'—'));text('#footer-state',state.ready?'System Online':'Scanning local system...');text('#footer-detail',m.sensorError?'Some sensors unavailable':'Sensors '+time(m.sensorAt)+' · '+state.config.interval/1000+'s');}
function tableRows(id,rows){const parent=$(id);const signature=JSON.stringify(rows);if(parent.dataset.signature===signature)return;parent.dataset.signature=signature;while(parent.children.length>rows.length)parent.lastChild.remove();rows.forEach((row,i)=>{let tr=parent.children[i];if(!tr){tr=node('tr');parent.append(tr)}while(tr.children.length<row.length)tr.append(node('td'));row.forEach((value,j)=>{text(tr.children[j],value);tr.children[j].title=String(value)})})}

function renderPoolChoices(){
 const options=state.poolOptions||[],box=$('#pool-preset'),key=JSON.stringify(options);if(box.dataset.key===key)return;
 box.dataset.key=key;box.replaceChildren(...options.map(c=>{const o=node('option','',c.label.replace('Kryptex · ','').replace('Suprnova · ',''));o.value=c.url;return o}));const custom=node('option','','Custom');custom.value='custom';box.append(custom);
 $('#pool-choices').replaceChildren(...options.map(c=>{const o=node('option','',c.label);o.value=c.url;return o}));syncPoolPreset(state.config.pools[state.config.coin]);
}
function syncPoolPreset(url){$('#pool-preset').value=(state.poolOptions||[]).some(r=>r.url===url)?url:'custom';updateBackupLabel()}
function syncBackupPresets(){
 for(let i=1;i<=2;i++){
  const box=$('#pool-backup-preset-'+i),input=$('#pool-backup-'+i),value=input.value.trim();
  const entries=[{label:'Disabled',url:''},...(state.poolOptions||[]).filter(r=>r.url!==$('#pool').value.trim()),{label:'Custom',url:'custom'}];
  const key=JSON.stringify(entries);if(box.dataset.key!==key){box.dataset.key=key;box.replaceChildren(...entries.map(r=>{const o=node('option','',r.label);o.value=r.url;return o}))}
  box.value=entries.some(r=>r.url===value)?value:'custom';input.readOnly=box.value!=='custom';input.title=value;
 }
}
for(let i=1;i<=2;i++){
 $('#pool-backup-preset-'+i).onchange=()=>{const choice=$('#pool-backup-preset-'+i).value,input=$('#pool-backup-'+i);if(choice==='custom'){input.readOnly=false;input.focus();input.select();return}input.value=choice;updateBackupLabel()};
 $('#pool-backup-'+i).onchange=updateBackupLabel;
}
function updateBackupLabel(){syncBackupPresets();text('#pool-backups-open','Backup '+[1,2].filter(i=>$('#pool-backup-'+i).value.trim()).length)}
$('#pool-preset').onchange=()=>{if($('#pool-preset').value==='custom'){$('#pool').focus();return}$('#pool').value=$('#pool-preset').value;const backups=(state.poolOptions||[]).slice(0,3).filter(r=>r.url!==$('#pool').value).slice(0,2);for(let i=1;i<=2;i++)$('#pool-backup-'+i).value=backups[i-1]?.url||'';updateBackupLabel()};
$('#pool').onchange=()=>{syncPoolPreset($('#pool').value.trim());if($('#pool-preset').value==='custom'){for(let i=1;i<=2;i++)$('#pool-backup-'+i).value='';updateBackupLabel()}};
$('#pool-backups-open').onclick=()=>{syncBackupPresets();$('#pool-dialog').showModal()};$('#pool-backups-close').onclick=()=>$('#pool-dialog').close();
$('#pool-backups-save').onclick=()=>action(async()=>{await saveMining();configInputs();$('#pool-dialog').close()});
function renderHashAverage(a){
 text('#total-hash',hash(a?.hash??null));const note=$('#hash-average-note');
 if(!a){text(note,'Waiting for stats');note.title='Time-weighted average per card over selected window';return}
 const remaining=Math.max(0,Math.ceil(a.remainingMs/1000)),countdown=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
 const quality='Coverage '+Math.round(a.coverage*100)+'%';
 text(note,!a.running?'Stopped · '+(a.complete?'Last period avg':'Incomplete')+' · '+quality:a.retained?'Retained last avg':a.hash===null?'Sampling · '+countdown+' until settle':a.complete?(a.fresh?'Next '+countdown:'Sampling interrupted')+' · '+quality:'Initial estimate · '+countdown+' · '+quality);
 note.title=(a.complete?'Settled':'First window in progress')+'：'+time(a.from)+'–'+time(a.to)+'; time-weighted per device. Missing logs >60s excluded from valid sampling.'+(!a.fresh?' Current sample expired or stopped.':'');
 note.classList.toggle('average-stale',!a.fresh||a.retained);$('#total-hash').classList.toggle('average-stale',!a.running||a.retained);
}

function renderKernelChoices(){const options=state.kernel.options||[],box=$('#kernel-select'),key=JSON.stringify(options);if(box.dataset.key===key)return;box.dataset.key=key;box.replaceChildren(...options.map(c=>{const o=node('option','',c.label);o.value=c.id;o.disabled=c.disabled;return o}));box.value=state.config.kernels?.[state.config.coin]||'auto'}
function configInputs(){const c=state.config;$('#cpu-threads').value=c.cpuThreads||(c.coin==='BNT'?GozerPerformance.bntThreadBudget(state.bntThreadLimit,c.performance):c.coin==='ZCD'?GozerPerformance.cpuThreadBudget(state.cpuDevice,c.performance):0);$('#zcd-password').value=c.zcdPassword||'x';$('#noid-connection').value=c.noidConnection||'auto';renderPoolChoices();$('#hash-window').value=String(c.hashWindowMinutes||5);for(let i=1;i<=2;i++)$('#pool-backup-'+i).value=c.poolBackups?.[c.coin]?.[i-1]||'';syncPoolPreset(c.pools[c.coin]);renderKernelChoices();$('#kernel-select').value=c.kernels?.[c.coin]||'auto';$('#electricity').value=c.electricity;$('#fee').value=c.poolFee;$('#manual-watts').value=c.manualWatts??'';$('#interval').value=c.interval;$('#temperature').value=c.temperature;$('#worker').value=c.worker;$('#performance').value=c.performance;$('#share-benchmarks').checked=c.shareBenchmarks;selectedCoin=c.coin;$('#wallet').value=c.wallets[c.coin]||'';$('#pool').value=c.pools[c.coin]||'';}
async function chooseCoin(coin){if(state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching){window.openKernelLibrary(coin);return}await window.flushMiningSettings?.();await save({coin,cpuThreads:coin==='BNT'?0:state.config.cpuThreads});configInputs();render()}
function renderInstallation(){
 const p=state.miner.installation||{stage:'idle'},panel=$('#kernel-install');panel.hidden=p.stage==='idle';if(panel.hidden)return;
 const titles={connecting:'Connecting',downloading:'Downloading Engine',verifying:'Verifying package',extracting:'Extracting',checking:'Checking executable',ready:'Engine Ready · '+(state.kernel.name||'KRig')+' '+p.version,error:'Installation failed · Retry'};
 text('#install-stage',titles[p.stage]||p.stage);panel.classList.toggle('install-error',p.stage==='error');
 const bar=$('#install-progress'),determinate=p.stage==='ready'||p.stage==='downloading'&&p.total>0;
 if(determinate)bar.value=p.stage==='ready'?100:Math.min(100,p.received/p.total*100);else if(p.stage==='error')bar.value=0;else bar.removeAttribute('value');
 const size=n=>num(n/1048576,1)+' MB';text('#install-bytes',p.stage==='ready'?(state.config.coin==='BNT'?'Verified · BNT':state.config.coin==='ZCD'?'Verified · ZCD':state.config.coin==='YSR'?'Verified · YSR':state.config.coin==='NOID'?'Verified · NOID':'Verified · Engine'):p.stage==='downloading'?size(p.received)+(p.total?' / '+size(p.total)+' · '+Math.min(100,Math.floor(p.received/p.total*100))+'%':' · Size pending'):p.stage==='error'?p.error:'Please wait...');
 text('#install-log',state.logs.filter(l=>l.type==='Kernel').slice(-3).map(l=>time(l.at)+'  '+l.text).join('\n'));
}
function renderWalletValidation(){
 const input=$('#wallet'),hint=$('#wallet-validation'),zcd=state.config.coin==='ZCD';
 hint.hidden=!zcd;input.required=zcd;
 input.placeholder=GozerI18n.t(zcd?'Enter 0x02... persistent payout address':'Enter payout wallet address');
 if(!zcd){input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');input.setCustomValidity('');return null}
 const result=GozerZcdAddress.inspect(input.value);
 text(hint,result.message);hint.dataset.status=result.valid?'valid':result.code==='empty'?'empty':'error';
 input.setAttribute('aria-describedby','wallet-validation');input.setAttribute('aria-invalid',String(!result.valid&&result.code!=='empty'));
 input.setCustomValidity(result.valid?'':GozerI18n.t(result.message));
 if(!result.valid){$('#start').disabled=true}
 return result;
}
$('#wallet').addEventListener('input',()=>{if(state)renderControls()});
function renderControls(){window.renderCoinPicker?.(state);$('#noid-connection-row').hidden=state.config.coin!=='NOID';text('#noid-connection-note',state.config.noidConnection==='auto'?'Auto-fallback to TCP if initial handshake fails':'Pre-flight check primary/backup; no live switching');$('#noid-connection').disabled=!!state.kernel.bundled||state.miner.installing||!state.ready||state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching;$('#pool-connection-check').disabled=$('#noid-connection').disabled;renderPoolChoices();renderKernelChoices();const busy=!state.ready||state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching||state.miner.installing;$('#clear-missing').hidden=!missingDevices().length;$('#clear-missing').disabled=busy;$('#start').disabled=busy||!!missingDevices().length||state.miner.installing||!state.kernel.installed||!miningSelected().length;$('#stop').disabled=!busy;$('#kernel-select').disabled=busy||state.miner.installing;$('#hash-window').disabled=busy;$('#pool-preset').disabled=busy;$('#pool-backups-open').disabled=busy;$('#install').disabled=busy||state.miner.installing||state.kernel.installed;$('#scan').disabled=busy||!state.ready;$('#save-profit').disabled=busy;$('#save-settings').disabled=busy;$('#wallet').disabled=busy;$('#worker').disabled=busy;$('#pool').disabled=busy;document.querySelectorAll('#coin-tabs button[data-coin]').forEach(b=>{b.classList.toggle('active',b.dataset.coin===state.config.coin);b.disabled=!state.ready});text('#install',state.miner.installing?'Downloading & verifying...':state.kernel.installed?'Verified':state.kernel.bundled?'Install Engine':'Download & Install');text('#kernel-state',(state.kernel.name||'KRig')+' '+state.kernel.version+' · '+(state.kernel.installed?'Ready':'Not installed'));$('#kernel-select').title='Engine selection saved per coin';text('#fee-note',state.config.coin==='YSR'?'Kernel fee 0% · App fee 0.5% · Pool fee per node':state.config.coin==='NOID'?(state.kernel.kernelFee===0.03?'Kernel fee 3% · App fee 0.5%':'Kernel fee 0% · App fee 0.5%'):state.config.coin==='TSC'?'TensorCash · Suprnova 3310 / Recommend VRAM >= 10GB':'Miner Engine fee 0% · App fee 0.5%');text('#compatibility',state.config.coin==='YSR'?'YSR: NVIDIA RTX 30+; HTTP pool session, CPU verified shares.':state.config.coin==='NOID'?(state.kernel.name==='Suprminer'?'Suprminer: Driver >= 610 required; primary/backup tested before start.':state.kernel.name==='Fl4shMiner'?'Fl4shMiner: Close AI/debugging tools if launch fails.':'NOID native CUDA miner.'):state.config.coin==='TSC'?'TensorCash (TSC): Suprnova pool; recommend 10GB+ VRAM.':'PRL / QTC / CMFD / NACR / XID: Multi-algorithm engine support.');renderWalletValidation();window.renderCpuMining?.(state);}
function renderMining(){const estimate=state.income?.coins?.find(c=>c.coin===state.config.coin);text($('#mining-net').previousElementSibling,state.config.coin==='YSR'?'Estimated Gross Coins / Day':'Estimated Net Profit / Day');text('#mining-net',state.config.coin==='YSR'?(estimate?.dailyCoins==null?'—':num(estimate.dailyCoins,4)+' YSR'):money(estimate?.net));text('#measured-net',state.config.coin==='YSR'?'Estimated gross coins/day · Before fees · Not pool settlement':estimate?.stale?'Cached estimate / Not pool settlement':'Reference estimate / Not pool settlement');const chosen=miningSelected(),m=state.miner,running=m.status!=='idle';text('#mining-devices',chosen.map(g=>g.name.replace(/^NVIDIA GeForce |^AMD Radeon /,'')).join(' + ')||'None selected');const status={idle:'Standby',starting:'Starting',running:'Running',stopping:'Stopping'}[m.status]||m.status;text('#session-status',status);text('#run-status',running?(m.session?.benchmark?'60s benchmark test, will auto-stop':'Task running · no auto-resume'):'Settings save automatically; start mining manually');const rows=chosen.map(g=>{const j=m.jobs.find(j=>j.id===g.id),s=fresh(g),t=j?.telemetry&&Date.now()-j.telemetry.at<20000?j.telemetry:null;return[g.name.replace(/^NVIDIA GeForce |^AMD Radeon /,''),hash(t?.hash??null),val(s?.power,' W',1),val(s?.temp,'°C'),!running?'Standby':j?.status==='running'?(t?'Running / Sampled':'Running / Waiting for hashrate'):j?.status==='waiting'?(j.lastMessage||'Waiting for pool job'):j?.status==='stopped'?'Stopped':j?.status==='error'?'Failed':'Preparing']});tableRows('#worker-rows',rows.length?rows:[['No devices selected','—','—','—','Standby']]);chosen.forEach((g,i)=>heat($('#worker-rows').children[i]?.children[3],fresh(g)?.temp));document.body.classList.toggle('mining-active',m.status==='running');const total=hashHistory.update(m);renderHashAverage(m.session?.coin===state.config.coin&&m.session?.selected?.join('|')===chosen.map(g=>g.id).join('|')?m.hashAverage:null);const p=chosen.map(g=>fresh(g)?.power);text('#total-power',p.length&&p.every(x=>Number.isFinite(x))?num(p.reduce((a,b)=>a+b,0),1)+' W':'—');const chart=hashHistory.geometry(),line=$('#hash-line');if(line.getAttribute('d')!==chart.line)line.setAttribute('d',chart.line);const dot=$('#hash-dot');dot.setAttribute('visibility',chart.dot?'visible':'hidden');if(chart.dot){dot.setAttribute('cx',chart.dot.x);dot.setAttribute('cy',chart.dot.y)}text('#hash-ceiling',chart.count?hash(chart.max):'—');text('#chart-caption',chart.count?'Measured samples: '+chart.count+' pts · '+(total===null?'Paused / Waiting for data':hash(total)):'Waiting for miner hashrate output');renderWorkbenchLogs();renderClock();window.renderCpuMining?.(state);}
function renderClock(){if(!state)return;const m=state.miner,seconds=m.status!=='idle'&&m.session?Math.max(0,Math.floor((Date.now()-m.session.startedAt)/1000)):0;const elapsed=state.serviceFee?.active?Math.floor((Date.now()-state.serviceFee.startedAt)/1000):seconds;text('#runtime',[Math.floor(elapsed/3600),Math.floor(elapsed/60)%60,elapsed%60].map(n=>String(n).padStart(2,'0')).join(':'));}
let workbenchLogsKey='';
function renderWorkbenchLogs(){
 const rows=state.logs.slice(-120),key=JSON.stringify(rows);if(key===workbenchLogsKey)return;workbenchLogsKey=key;
 const parent=$('#workbench-log-list'),follow=$('#workbench-follow').checked,top=parent.scrollTop;
 const keys=rows.map((l,i)=>String(l.id??[l.at,l.type,l.text,i].join('|'))),wanted=new Set(keys);let removed=0;
 for(const child of [...parent.children])if(!wanted.has(child.dataset.key)){removed+=child.getBoundingClientRect().height;child.remove()}
 const existing=new Set([...parent.children].map(n=>n.dataset.key));
 rows.forEach((l,i)=>{if(existing.has(keys[i]))return;const row=node('div','workbench-log-row');row.dataset.key=keys[i];row.classList.toggle('log-warning',/timed out|warn:|error|fail/i.test(l.type+' '+l.text));row.append(node('time','',time(l.at)),node('label','',l.type),node('span','',l.text));row.title=l.text;parent.append(row)});
 if(!rows.length)parent.append(node('div','workbench-log-empty','No miner logs yet'));
 parent.scrollTop=follow?parent.scrollHeight:Math.max(0,top-removed);
}
$('#workbench-follow').onchange=()=>{if($('#workbench-follow').checked)$('#workbench-log-list').scrollTop=$('#workbench-log-list').scrollHeight};
$('#workbench-log-list').addEventListener('scroll',()=>{const el=$('#workbench-log-list');if(el.scrollTop+el.clientHeight<el.scrollHeight-3)$('#workbench-follow').checked=false},{passive:true});
new ResizeObserver(()=>{if($('#workbench-follow').checked){const el=$('#workbench-log-list');el.scrollTop=el.scrollHeight}}).observe($('#workbench-log-list'));
function renderLogs(){const key=state.logs.length+'|'+JSON.stringify(state.logs.at(-1));if(key===logsKey)return;logsKey=key;const parent=$('#log-list'),top=parent.scrollTop;parent.replaceChildren(...state.logs.map(l=>{const row=node('div','log-row');row.append(node('time','',time(l.at)),node('label','',l.type),node('span','',l.text));return row}));parent.scrollTop=$('#follow-logs').checked?parent.scrollHeight:top}
function showDetails(type){const h=state.hardware,g=h.gpus.find(g=>g.id===focused),s=fresh(g),rows=[];let title='';if(type==='gpu'){if(!g)return;title=g.name;rows.push(['Vendor / PCIe Bus',g.vendor+' / '+(g.pci||'—'),'Windows PnP'],['Device ID',g.deviceId||'—','Windows PnP'],['Driver',g.driver,'CIM / NVIDIA'],['Cores / Arch',val(g.cores)+' / '+(g.architecture||'—'),g.specSource||'N/A'],['Memory Bus Width',val(g.memoryBusWidth,' bit'),g.specSource||'N/A'],['VRAM Capacity',val(g.memoryMiB,' MiB'),'NVIDIA Driver'],['Core / Memory Clock',val(s?.clock,' MHz')+' / '+val(s?.memClock,' MHz'),'Driver reported clock'],['GPU Load',val(s?.load,'%'),'Driver'],['Core Temp',val(s?.temp,'°C'),'Driver'],['Board Power',val(s?.power,' W',1),'Driver'],['Power Limit',val(s?.powerLimit,' W'),'Driver'],['Fan',val(s?.fan,'%'),'Hardware supported'],['Current / Max PCIe',s?s.gen+'.0 ×'+s.width+' / '+s.maxGen+'.0 ×'+s.maxWidth:'—','NVIDIA Driver'],['Hotspot / Junction','—','N/A'],['Sensor Sample Time',time(g.sensors?.at),fresh(g)?'Realtime':'N/A or stale'],['PRL / QTC','KRig selects device by PCI bus','Supports NVIDIA / AMD'])}else if(type==='cpu'){title='CPU Topology & Utilization';for(const[cpuIndex,c]of h.cpu.entries())rows.push(['CPU '+cpuIndex,c.Name,'Windows CIM'],['Cores / Threads',c.NumberOfCores+' / '+c.NumberOfLogicalProcessors,'Windows CIM'],['SMBIOS Current / Max Clock',c.CurrentClockSpeed+' / '+c.MaxClockSpeed+' MHz','SMBIOS clock, not max boost'],['L2 / L3',val(c.L2CacheSize,' KB')+' / '+val(c.L3CacheSize,' KB'),'Windows CIM']);rows.push(['P / E Core Topology','—','N/A'],['Package Temp / Power','— / —','Sensors N/A']);h.metrics?.perCore?.forEach((v,i)=>rows.push(['Logical Thread #'+i,val(v,'%',1),'Time delta sampled']))}else{title='Memory Slots / Board / BIOS';for(const [i,r]of h.memory.entries())rows.push(['DIMM '+(i+1)+' / '+r.DeviceLocator,val(Number(r.Capacity)/1073741824,' GiB'),'SMBIOS'],['Brand / Raw Field',brand(r.Manufacturer)+' / '+String(r.Manufacturer).trim(),'JEDEC manufacturer lookup'],['Part Number',String(r.PartNumber||'—').trim(),'SMBIOS'],['Configured / Rated Speed',r.ConfiguredClockSpeed+' / '+r.Speed+' MT/s','Transfer rate, not clock'],['Type / Data Width',memoryType(r.SMBIOSMemoryType)+' / '+r.DataWidth+' bit','SMBIOS']);rows.push(['Motherboard',h.board[0]?.Manufacturer+' / '+h.board[0]?.Product,'SMBIOS'],['BIOS',h.bios[0]?.SMBIOSBIOSVersion||'—','SMBIOS'],['Active Channels / Timings','— / —','Controller / SPD N/A'])}text('#details-title',title);const table=node('table'),head=node('thead'),tr=node('tr');['Parameter','Value','Source / Status'].forEach(x=>tr.append(node('th','',x)));head.append(tr);table.append(head);const body=node('tbody');for(const r of rows){const row=node('tr');r.forEach(v=>row.append(node('td','',v??'—')));if(type==='gpu'&&r[0]==='Core Temp')heat(row.children[1],s?.temp);body.append(row)}table.append(body);$('#details-body').replaceChildren(table);$('#details').showModal()}
function render(){if(state)text('#app-version',(state.displayVersion||'')+' · '+state.version);if(state?.config){GozerI18n.setLocale(state.config.language);document.querySelectorAll('[data-language]').forEach(el=>el.value=GozerI18n.locale)}if(!state?.hardware)return;document.body.classList.toggle('light',state.config.theme==='light');renderHardware();renderControls();renderNoidRequirements();renderInstallation();renderMining();window.renderCpuMining?.(state);window.renderPoolAccount?.(state.poolAccount);window.renderUpgrade?.(state);if(view==='logs')renderLogs()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)showView(b.dataset.view);if(b.dataset.window)action(()=>api.window(b.dataset.window));if(b.dataset.open)action(()=>api.open(b.dataset.open));if(b.dataset.detail)showDetails(b.dataset.detail);if(b.dataset.coin)action(()=>chooseCoin(b.dataset.coin))});
document.querySelectorAll('[data-language]').forEach(el=>el.onchange=()=>action(async()=>{const next=el.value;document.querySelectorAll('[data-language]').forEach(n=>n.disabled=true);try{state.config=await api.language(next);render()}finally{document.querySelectorAll('[data-language]').forEach(n=>{n.disabled=false;n.value=GozerI18n.locale})}}));
$('#theme').onclick=()=>action(()=>save({theme:state.config.theme==='light'?'dark':'light'}));$('#scan').onclick=()=>action(async()=>{state=await api.scan();render()},$('#scan'));$('#gpu-more').onclick=()=>showDetails('gpu');$('#details-close').onclick=()=>$('#details').close();$('#income-refresh').onclick=()=>action(async()=>{state.income=await api.income();renderMining();window.renderUpgrade?.(state)},$('#income-refresh'));$('#save-profit').onclick=()=>action(()=>save({electricity:Number($('#electricity').value),poolFee:Number($('#fee').value),manualWatts:$('#manual-watts').value===''?null:Number($('#manual-watts').value)}));
async function saveMining(){if(state.config.coin==='ZCD'){const check=renderWalletValidation();if(!check.valid){$('#wallet').focus();throw Error(check.message)}}const wallets={...state.config.wallets,[state.config.coin]:$('#wallet').value.trim()},pools={...state.config.pools};if(state.config.coin!=='TSC')pools[state.config.coin]=$('#pool').value.trim();await save({...(['ZCD','BNT','NRB','JTM'].includes(state.config.coin)?{performance:Number($('#performance').value)}:{}),wallets,pools,cpuThreads:Number($('#cpu-threads').value),zcdPassword:$('#zcd-password').value,noidConnection:$('#noid-connection').value,worker:$('#worker').value.trim(),hashWindowMinutes:Number($('#hash-window').value),poolBackups:{...state.config.poolBackups,...(state.config.coin==='TSC'?{}:{[state.config.coin]:[1,2].map(i=>$('#pool-backup-'+i).value.trim()).filter(Boolean)})},kernels:{...state.config.kernels,[state.config.coin]:$('#kernel-select').value}})}
$('#start').onclick=()=>action(async()=>{await saveMining();await api.start(false)},$('#start'));$('#stop').onclick=()=>action(()=>api.stop(),$('#stop'));$('#install').onclick=()=>action(async()=>{await api.install();toast('Kernel installed and verified; mining not started')},$('#install'));$('#pool-link').onclick=()=>action(()=>api.open(state.config.coin));$('#save-settings').onclick=()=>action(async()=>{await save({interval:Number($('#interval').value),temperature:Number($('#temperature').value)});toast('Settings saved')});$('#export-logs').onclick=()=>action(async()=>{if(await api.exportLogs())toast('Logs exported')});
if(api){api.subscribe(next=>{const first=!state;state=next;if(first)configInputs();render()});action(async()=>{state=await api.bootstrap();configInputs();render()});setInterval(()=>{renderClock();if(state&&view==='mining'){renderMining();window.renderUpgrade?.(state)}},1000)}else{toast('Please run via env.exe to access local hardware.')}

document.addEventListener('visibilitychange',()=>document.body.classList.toggle('window-hidden',document.hidden));

$('#noid-connection').onchange=()=>action(async()=>{await save({noidConnection:$('#noid-connection').value});render()},$('#noid-connection'));
$('#pool-connection-check').onclick=()=>action(async()=>{await saveMining();const r=await api.poolConnectionCheck();state=await api.bootstrap();render();toast('NOID handshake verified; pool session ready');return r},$('#pool-connection-check'));
$('#kernel-select').onchange=()=>action(async()=>{try{await save({kernels:{...state.config.kernels,[state.config.coin]:$('#kernel-select').value}});state=await api.bootstrap();render()}finally{$('#kernel-select').value=state.config.kernels?.[state.config.coin]||'auto'}},$('#kernel-select'));
function renderNoidRequirements(){const panel=$('#noid-requirements'),r=state.noidRequirements;panel.hidden=!r;if(!r)return;text('#noid-summary',state.kernel.minimumDriver?'CPU x64 · NVIDIA SM ≥ 8.0 · Driver ≥ 610':'CPU x64 · NVIDIA SM ≥ 8.0 · CUDA 13');text('#noid-runtime-note',state.kernel.bundled?'Pool mining does not require a local full node. Self-test runs on startup.':'Official third-party engine; standalone per GPU UUID.');const key=JSON.stringify(r);if(panel.dataset.key!==key){panel.dataset.key=key;$('#noid-specs').replaceChildren(...[['CPU',r.cpu],['GPU',r.gpu],['RAM',r.memory],['Driver',r.driver]].map(([label,value])=>{const row=node('div','noid-spec');row.append(node('b','',label),node('span','',value));return row}));$('#noid-device-check').replaceChildren(...r.devices.map(g=>{const row=node('div','noid-device');row.append(node('b','',g.name),node('span','',g.status));return row}))}if(r.blocked){$('#start').disabled=true}}

$('#bnt-connection-check').onclick=()=>action(async()=>{await saveMining();const r=await api.bntConnectionCheck();toast('BNT handshake verified · '+r.endpoint)},$('#bnt-connection-check'));


// --- Remote VPS Mining UI Handling ---
(function initVps() {
  const vpsHost = document.getElementById('vps-host');
  const vpsPort = document.getElementById('vps-port');
  const vpsUser = document.getElementById('vps-user');
  const vpsPass = document.getElementById('vps-pass');
  const vpsCoin = document.getElementById('vps-coin');
  const vpsWallet = document.getElementById('vps-wallet');
  const vpsPool = document.getElementById('vps-pool');
  const vpsConnectBtn = document.getElementById('vps-connect-btn');
  const vpsStopBtn = document.getElementById('vps-stop-btn');
  const vpsBadge = document.getElementById('vps-status-badge');
  const vpsText = document.getElementById('vps-status-text');
  const vpsConsole = document.getElementById('vps-console');
  const vpsClear = document.getElementById('vps-clear-log');

  if (vpsClear && vpsConsole) {
    vpsClear.onclick = () => { vpsConsole.textContent = ''; };
  }

  if (window.gozer && window.gozer.onVpsLog) {
    window.gozer.onVpsLog(line => {
      if (vpsConsole) {
        vpsConsole.textContent += '\n' + line;
        vpsConsole.scrollTop = vpsConsole.scrollHeight;
      }
    });
  }

  if (vpsConnectBtn) {
    vpsConnectBtn.onclick = async () => {
      const host = vpsHost.value.trim();
      const port = Number(vpsPort.value) || 22;
      const user = vpsUser.value.trim() || 'root';
      const password = vpsPass.value;
      const coin = vpsCoin.value;
      const wallet = vpsWallet.value.trim();
      const pool = vpsPool.value.trim();

      if (!host) {
        alert('Please enter VPS Host/IP');
        return;
      }
      if (!wallet) {
        alert('Please enter your payout wallet address');
        return;
      }

      vpsConnectBtn.disabled = true;
      vpsStopBtn.disabled = false;
      vpsBadge.textContent = 'RUNNING';
      vpsBadge.style.color = '#26e07f';
      vpsText.textContent = 'Connecting to ' + host + '...';

      try {
        await window.gozer.vpsStart({ host, port, user, password, coin, wallet, pool });
        vpsText.textContent = 'Mining actively on ' + host;
      } catch (err) {
        alert('VPS Error: ' + err.message);
        vpsConnectBtn.disabled = false;
        vpsStopBtn.disabled = true;
        vpsBadge.textContent = 'DISCONNECTED';
        vpsBadge.style.color = 'var(--muted)';
        vpsText.textContent = 'Connection failed';
      }
    };
  }

  if (vpsStopBtn) {
    vpsStopBtn.onclick = async () => {
      try {
        await window.gozer.vpsStop();
      } catch (e) {}
      vpsConnectBtn.disabled = false;
      vpsStopBtn.disabled = true;
      vpsBadge.textContent = 'STOPPED';
      vpsBadge.style.color = 'var(--muted)';
      vpsText.textContent = 'Remote mining stopped';
    };
  }
})();
