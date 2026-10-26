'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {validate}=require('./config.cjs');
const {installKernel}=require('./kernel-install.cjs');
const {HashWindows}=require('./hash-windows.cjs');
const {poolUrls}=require('./pool-catalog.cjs');
const {KRIG,resolve:resolveKernel}=require('./kernel-catalog.cjs');
const {miningDevices,cpuThreads}=require('./mining-devices.cjs');
const COINS=[
  {symbol:'BNT',name:'Blocknet',algorithm:'Argon2id / 2 GiB',hardware:'CPU',supported:true,source:'https://bntpool.com/'},
  {symbol:'PRL',name:'Pearl',algorithm:'PearlHash',supported:true,source:'https://compute.pearlresearch.ai/wallet'},
  {symbol:'QTC',name:'Quantus',algorithm:'Quantus PoW',supported:true,source:'https://www.quantus.com/'},
  {symbol:'TSC',name:'TensorCash',algorithm:'Tensor PoW',supported:true,source:'https://tensorcash.org/'},
  {symbol:'NOID',name:'Parano1d',algorithm:'Poseidon2b',supported:true,source:'https://parano1d.org/'},
  {symbol:'YSR',name:'YSKAR',algorithm:'SHA-256d',supported:true,source:'https://www.yskar.app/'},
  {symbol:'ZCD',name:'Zycord',algorithm:'RandomX v2',hardware:'CPU',supported:true,source:'https://zycord.com/'},
  {symbol:'CMFD',name:'Common Foundry',algorithm:'ForgeMatrix',hardware:'GPU',supported:true,source:'https://pool.ariabrain.com/cmfd.html'},
  {symbol:'NACR',name:'Nacre',algorithm:'PearlHash (AuxPoW)',hardware:'GPU',supported:true,source:'https://nacre.network/'},
  {symbol:'XID',name:'xCoin',algorithm:'MetalDAG',hardware:'GPU',supported:true,source:'https://pool.ariabrain.com/xid.html'},
  {symbol:'MDS',name:'Midstate',algorithm:'BLAKE3 (PoW)',hardware:'GPU',supported:true,source:'https://midstate.cash/'},
  {symbol:'NRB',name:'Nerbus',algorithm:'VerusHash',hardware:'CPU',supported:true,source:'https://nerbus.com/'},
  {symbol:'JTM',name:'Jetsam',algorithm:'TowerWalk',hardware:'CPU',supported:true,source:'https://jetsamchain.com/'},
  {symbol:'RGR',name:'Rigor',algorithm:'OpuHash / SHA3-256',hardware:'GPU (CUDA) / CPU',supported:true,source:'https://rigorchain.com/'}
];
function argsFor(config,gpu,logFile){
  const c=validate(config);
  resolveKernel(c);
  if(c.coin==='ZCD')return require('./zcd.cjs').args(c,gpu,logFile);
  if(c.coin==='YSR')return require('./ysr.cjs').args(c,gpu,logFile);
  if(c.coin==='NOID')return require('./noid-adapters.cjs').args(c,gpu,logFile,resolveKernel(c));
  if(c.coin==='CMFD')return['--coin','cmfd',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.CMFD||'4c9aa957a2122a177734b9c50b8eaa1260525790b203048c88c3cba6f4d01c21')+'/'+c.worker,'--devices-pci',gpu.pci,'--no-tui','--log-file',logFile];
  if(c.coin==='XID')return['--coin','xid',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.XID||'xpa1rae0wyxdh38pzsmr7gfrhklmm3k4253smu52mztvt9dyta582uzdq63pkn4')+'/'+c.worker,'--devices-pci',gpu.pci,'--no-tui','--log-file',logFile];
  if(c.coin==='TSC')return['--coin','tsc',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.TSC||'tc1qhnfytkdy6y0znzf0r9uakvww7qfpvnmfx3gujz')+'/'+c.worker,'--devices-pci',gpu?.pci||'0','--no-tui','--log-file',logFile];
  if(c.coin==='MDS')return['--coin','mds',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.MDS||'795f5d7a1f7a1e2268a9757d60b9ba9981d561d7b19c2e9508d7765e29d9a49d0aa09fd4')+'/'+c.worker,'--devices-pci',gpu?.pci||'0','--no-tui','--log-file',logFile];
  if(c.coin==='NRB')return['--coin','nrb',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.NRB||'NYpwEcqL7kv996izQWzB1iBEv62xJ4Y17v')+'.'+c.worker,'--threads',String(c.cpuThreads||4),'--no-tui','--log-file',logFile];
  if(c.coin==='JTM')return['--coin','jtm',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets.JTM||'j1a5mcsk96aw55x7tkgfrp22ufd2cqef5k0s7vr6xj5gtk3p6pd9hqcvl0rc')+'.'+c.worker,'--threads',String(c.cpuThreads||4),'--no-tui','--log-file',logFile];
  if(c.coin==='RGR'){const wallet=c.wallets.RGR||'rg1q9m002y0hpuy9kxrtpud3pex2pj7kypjxjh60t9';const k=resolveKernel(c);if(k.exe==='rigor-core.exe'){let raw=poolUrls(c)[0]||'http://127.0.0.1:8761';let httpUrl=raw.replace(/^stratum\+tcp:\/\//i,'http://').replace(/^stratum\+ssl:\/\//i,'https://');if(!/^https?:\/\//i.test(httpUrl))httpUrl='http://'+httpUrl;return['-a','rgrpow01','-q','-t',String(c.cpuThreads||4),'--coinbase-addr='+wallet,'-o',httpUrl,'-u',wallet,'-p','x'];}return['--coin','rgr',...poolUrls(c).flatMap(url=>['--url',url]),'--user',wallet+'.'+c.worker,'--devices-pci',gpu?.pci||'0','--threads',String(c.cpuThreads||4),'--no-tui','--log-file',logFile];}
  if(c.coin==='NACR'||c.coin==='PRL'||c.coin==='QTC'){
    if(!['NVIDIA','AMD'].includes(gpu.vendor)||!gpu.pci||!/^\w{2,}:\w{2}\.[0-7]$/.test(gpu.pci))throw Error('Device missing supported vendor or explicit PCI address');
    return['--coin',c.coin==='QTC'?'quantus':'pearl',...poolUrls(c).flatMap(url=>['--url',url]),'--user',(c.wallets[c.coin]||'community')+'/'+c.worker,'--devices-pci',gpu.pci,'--no-tui','--log-file',logFile];
  }
  if(!c.wallets[c.coin])throw Error('Please enter your payout wallet address');
  if(!['NVIDIA','AMD'].includes(gpu.vendor)||!gpu.pci||!/^\w{2,}:\w{2}\.[0-7]$/.test(gpu.pci))throw Error('Device missing supported vendor or explicit PCI address');
  return['--coin',c.coin.toLowerCase(),...poolUrls(c).flatMap(url=>['--url',url]),'--user',c.wallets[c.coin]+'/'+c.worker,'--devices-pci',gpu.pci,'--no-tui','--log-file',logFile];
}
function parseTelemetry(text,coin){const clean=text.replace(/\x1b\[[0-9;]*m/g,'');const matches=[...clean.matchAll(/(?:^|[^\w.])([\d]+(?:[.,][\d]+)?)\s*([kMGTPE]?)(?:hash|[HN])\/s\b/gi)];if(!matches.length)return null;const m=matches.at(-1),scale={K:1e3,M:1e6,G:1e9,T:1e12,P:1e15,E:1e18,'':1};const hash=Number(m[1].replace(',','.'))*scale[m[2].toUpperCase()];if(!Number.isFinite(hash)||hash<0)return null;const counts=/accepted=(\d+) rejected=(\d+) stale=(\d+)/.exec(clean);return{hash,unit:(coin==='TSC'?'N/s':coin==='RGR'?'MH/s':'H/s'),at:Date.now(),...(counts?{accepted:Number(counts[1]),rejected:Number(counts[2]),stale:Number(counts[3])}:{})}}
function parseExternalTelemetry(line,coin){
 const clean=line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 if(/\b(?:network|benchmark|target|expected)\b|pool\s+(?:hashrate|speed)/i.test(clean)||!/(?:gpu|hashrate|speed|total)/i.test(clean))return null;
 const rate=/(?:^|[^\w.])([\d]+(?:[.,][\d]+)?)\s*([kMGTPE]?)(?:hash|[HN])\/s\b(?!\s*\/)/i.exec(clean);
 return rate?parseTelemetry(rate[1]+' '+rate[2]+(coin==='TSC'?'N/s':'H/s')+' '+(clean.match(/accepted=\d+ rejected=\d+ stale=\d+/)?.[0]||''),coin):null;
}
async function ensureBundledKernel(baseDir,kernel){
  if(!kernel?.id)return;
  const targetDir=path.join(baseDir,'miners',kernel.id);
  const exeName=kernel.exe||'krig-miner.exe';
  const targetExe=path.join(targetDir,exeName);
  try{await fs.access(targetExe);return;}catch{}
  const bundledDir=path.join(__dirname,'../bundled-miners',kernel.id);
  try{await fs.access(bundledDir);await fs.mkdir(targetDir,{recursive:true});await fs.cp(bundledDir,targetDir,{recursive:true});}catch{}
}
async function sha(file){const handle=await fs.open(file,'r');try{const h=crypto.createHash('sha256');for await(const chunk of handle.createReadStream())h.update(chunk);return h.digest('hex')}finally{await handle.close().catch(()=>{})}}
class Miner extends EventEmitter{
 constructor(dir,request,log){super();this.baseDir=dir;this.dir=path.join(dir,'miners','krig-'+KRIG.version);this.exe=path.join(this.dir,'krig-miner.exe');this.request=request;this.log=log;this.jobs=new Map();this.status='idle';this.installing=false;this.installation={stage:'idle',received:0,total:null,error:null,version:KRIG.version};this.timer=null;this.endTimer=null;this.session=null;this.benchmark=null;this.guard=path.join(__dirname,'../vendor/ProcessGuard.exe');this.lastHardware=null}
 snapshot(){return{connection:this.seine?.connection||this.bnt?.pool?.snapshot()||null,hashAverage:this.hashWindows?.snapshot()||null,status:this.status,installing:this.installing,installation:{...this.installation},session:this.session,benchmark:this.benchmark,jobs:[...this.jobs.values()].map(j=>({id:j.id,name:j.name,pid:j.pid,duty:j.duty??this.session?.duty,status:j.status,shares:j.shares||null,telemetry:j.telemetry,samples:j.samples.length,lastMessage:j.lastMessage}))}}
 changed(){this.emit('update',this.snapshot())}
 configure(config){const kernel=resolveKernel(config);if(this.currentKernel?.id!==kernel.id&&!this.installing)this.installation={stage:'idle',received:0,total:null,error:null,version:kernel.version};this.currentKernel=kernel;this.dir=path.join(this.baseDir,'miners',kernel.id);this.exe=path.join(this.dir,kernel.exe||'krig-miner.exe');ensureBundledKernel(this.baseDir,kernel).catch(()=>{});return kernel}
 async installed(config){const kernel=config?resolveKernel(config):this.currentKernel||{id:'krig-'+KRIG.version,...KRIG};if(kernel.isVps||kernel.id?.endsWith('-vps'))return true;await ensureBundledKernel(this.baseDir,kernel).catch(()=>{});if(kernel.installed)return true;try{const dir=path.join(this.baseDir,'miners',kernel.id);const exeName=kernel.exe||'krig-miner.exe';if(await fs.access(path.join(dir,exeName)).then(()=>true,()=>false)){if(!kernel.files&&!kernel.exeSha256)return true}for(const [name,expected] of Object.entries(kernel.files||{[exeName]:kernel.exeSha256}))if(await sha(path.join(dir,name))!==expected)return false;return true}catch{return false}}
 async install(config){if(this.installing)throw Error('Kernel is installing, please wait');if(this.status!=='idle')throw Error('Stop active task before installing kernel');const kernel=config?this.configure(config):this.currentKernel||KRIG;await ensureBundledKernel(this.baseDir,kernel).catch(()=>{});if(kernel.installed||kernel.isVps||kernel.id?.endsWith('-vps')||(await fs.access(this.exe).then(()=>true,()=>false))){this.installation={stage:'ready',received:0,total:null,error:null,version:kernel.version};this.changed();return true;}this.installing=true;this.changed();try{return await installKernel({dir:this.dir,exe:this.exe,metadata:kernel,request:this.request,log:this.log,update:value=>{this.installation=value;this.changed()}})}catch(e){this.installation={...this.installation,stage:'error',error:e.message};throw e}finally{this.installing=false;this.changed()}}
 async start(config,hardware,benchmark=false){if(this.status!=='idle'||this.installing)throw Error('Miner busy; stop current task first');const c=validate(config),kernel=resolveKernel(c);if(c.coin==='BNT')return require(kernel.adapter==='bnt-seine'?'./bnt-seine-runtime.cjs':'./bnt-runtime.cjs').start(this,c,hardware,benchmark);const isCpuTask=['ZCD','BNT','NRB','JTM'].includes(c.coin)||(c.coin==='RGR'&&c.workbenchMode==='cpu');const selected=miningDevices(c,hardware);if(!selected.length)throw Error(isCpuTask?'No supported CPU detected':'Please select a GPU first');if(!isCpuTask&&selected.length!==c.selected.length)throw Error('Selected devices changed, please reselect');if(!hardware.scannedAt||(Date.now()-hardware.scannedAt>3600000&&Date.now()-(hardware.metrics?.at||0)>10000))throw Error('Please rescan devices');if(c.coin==='ZCD'){require('./zcd.cjs').address(c.wallets.ZCD);require('./zcd.cjs').poolConfig(c,hardware);if(!Number.isFinite(hardware.metrics?.freeMemory)||Date.now()-(hardware.metrics?.at||0)>10000||hardware.metrics.freeMemory<require('./zcd.cjs').MIN_MEMORY)throw Error('ZCD requires at least 4 GiB free RAM');}else for(const g of selected)argsFor(c,g,'test.log');const generation=this.generation=(this.generation||0)+1;const connectionAbort=this.connectionAbort=new AbortController();this.status='starting';this.changed();try{this.configure(c);await ensureBundledKernel(this.baseDir,kernel).catch(()=>{});if(!await this.installed(c))throw Error('Please install and verify selected kernel first');await fs.access(this.guard);await fs.access(this.exe);if(this.generation!==generation)throw Error('Start cancelled');let runConfig=c;if(c.coin==='NOID'&&!kernel.bundled){const route=await require('./noid-connection.cjs').prepare(c,{request:this.request,log:this.log,signal:connectionAbort.signal});runConfig=route.config;}if(this.generation!==generation)throw Error('Start cancelled');this.session={kernelId:kernel.id,kernelSelection:kernel.selection,coin:c.coin,startedAt:Date.now(),benchmark,temperature:c.temperature,selected:selected.map(g=>g.id),devices:selected.map(g=>({id:g.id,name:g.name})),performance:c.performance,duty:Math.min(90,Math.max(50,Math.round(c.performance*.9))),cpuThreads:isCpuTask?cpuThreads(c,hardware):null,duration:benchmark?60000:null};this.hashWindows=new HashWindows(selected.map(g=>g.id),c.hashWindowMinutes,this.session.startedAt);this.benchmark=null;await fs.mkdir(path.join(this.dir,'logs'),{recursive:true});if(this.generation!==generation)throw Error('Start cancelled');this.jobs.clear();for(const gpu of selected){const logFile=path.join(this.dir,'logs',gpu.id+'.log');await fs.writeFile(logFile,'');if(c.coin==='YSR')await fs.unlink(logFile+'.stop').catch(()=>{});if(this.generation!==generation)throw Error('Start cancelled');const freshGpu=isCpuTask?gpu:this.lastHardware?.gpus.find(g=>g.id===gpu.id)||gpu;if(kernel.captureOutput&&freshGpu.sensors?.temp>=c.temperature)throw Error('GPU reached thermal protection threshold');if(c.coin==='ZCD')await fs.writeFile(logFile+'.json',JSON.stringify(require('./zcd.cjs').poolConfig(runConfig,hardware,path.relative(this.dir,logFile)),null,2));if(this.generation!==generation)throw Error('Start cancelled');const args=argsFor(runConfig,freshGpu,logFile);const child=spawn(this.guard,[String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});const j={id:gpu.id,name:gpu.name,child,pid:null,status:'starting',consoleLog:c.coin==='ZCD'?{logFile:logFile+'.console.log',offset:0,fragment:''}:null,logFile,offset:0,fragment:'',telemetry:null,samples:[],powers:[],lastMessage:'Waiting for miner output',hadSensor:!!gpu.sensors?.at};this.jobs.set(gpu.id,j);child.stdin.on('error',()=>{});let guardFragment='';child.stdout.on('data',data=>{const messages=(guardFragment+String(data)).split('\n');guardFragment=messages.pop();for(const line of messages){try{const p=JSON.parse(line);if(p.pid){j.pid=p.pid;j.status='running'}if(p.duty)j.duty=p.duty;if(p.exitCode!==undefined)j.lastMessage='Kernel exit '+p.exitCode}catch{}}this.changed()});child.stderr.on('data',data=>{j.lastMessage=String(data).slice(0,300);this.log('Kernel',j.lastMessage)});child.on('error',e=>{j.status='error';j.lastMessage=e.message;this.log('Error','Process guard launch failed');this.changed()});child.on('exit',()=>{this.readLogs().finally(()=>{for(const source of [j,j.consoleLog].filter(Boolean))if(source.fragment){this.ingestLine(j,source.fragment);source.fragment=''}if(this.jobs.get(j.id)!==j){j.status='stopped';return}this.hashWindows?.unavailable(j.id);j.status='stopped';j.telemetry=null;if(this.status==='running'&&[...this.jobs.values()].every(x=>['stopped','error'].includes(x.status))){this.stop('All miners exited').catch(()=>{})}this.changed()}).catch(()=>{});});child.stdin.write(JSON.stringify({exe:this.exe,cwd:this.dir,args,duty:Math.min(90,Math.max(50,Math.round(c.performance*.9))),...(kernel.captureOutput?{capturePath:j.consoleLog?.logFile||logFile,...(isCpuTask?{cpuOnly:true,gracefulConsole:true}:{cudaUuid:gpu.sensors.uuid})}:{})})+'\n')}
 this.status='running';this.log('Pool',poolUrls(runConfig).join(' → '));this.log('Kernel',(kernel.selection==='auto'?'Default recommended':'Custom manual')+' · '+(kernel.name||'KRig')+' '+kernel.version);this.log('Run',c.coin+' startup initiated with '+selected.length+(isCpuTask?' CPU thread task':' GPU device(s)'));this.changed();this.timer=setInterval(()=>this.readLogs().catch(()=>{}),1500);if(benchmark)this.endTimer=setTimeout(()=>c.coin==='ZCD'?this.stop('ZCD connection timed out during benchmark').catch(()=>{}):this.finishBenchmark().catch(e=>this.log('Error',e.message)),c.coin==='ZCD'?900000:60000);return this.snapshot()}catch(e){if(this.generation===generation)await this.stop('Start failed: '+e.message);throw e}}
 setPerformance(value){if(this.session?.coin==='BNT'&&this.status!=='idle')throw Error('CPU mining active: change threads after stopping');if(this.hashWindows&&this.status==='running'){const minutes=this.hashWindows.ms/60000;this.hashWindows=new HashWindows(this.session.selected,minutes);this.log('Stats','Performance profile updated, resetting hash average')}this.benchmark=null;for(const j of this.jobs.values()){j.samples=[];j.powers=[];j.duty=Math.min(90,Math.max(50,Math.round(value*.9)))}if(!Number.isInteger(value)||value<50||value>100)throw Error('Performance budget must be 50-100');if(this.session){this.session.performance=value;this.session.duty=Math.min(90,Math.max(50,Math.round(value*.9)))}for(const j of this.jobs.values())if(j.child&&!j.child.killed&&!j.child.stdin.destroyed)j.child.stdin.write('duty:'+Math.min(90,Math.max(50,Math.round(value*.9)))+'\n');this.changed()}
 async readLogs(){if(this.reading)return this.reading;this.reading=this.readLogsOnce();try{await this.reading}finally{this.reading=null}}
 ingestLine(j,line){if(!line.trim())return;if(this.seine)return require('./bnt-seine-runtime.cjs').ingest(this,j,line);if(this.session?.coin==='ZCD'){const shares=require('./zcd.cjs').parseShares(line);if(shares)j.shares=shares;}const t=this.session?.coin==='ZCD'?require('./zcd.cjs').parseTelemetry(line):this.currentKernel?.captureOutput?parseExternalTelemetry(line,this.session?.coin):parseTelemetry(line,this.session?.coin);if(this.session?.coin==='ZCD'&&this.session.benchmark&&!this.session.measurementAt&&t?.hash>0){this.session.measurementAt=Date.now();clearTimeout(this.endTimer);this.endTimer=setTimeout(()=>this.finishBenchmark().catch(e=>this.log('Error',e.message)),60000);this.log('Test','ZCD hashrate sampling started, auto-stopping in 60s');}if(t){this.hashWindows?.sample(j.id,t);j.telemetry=t;j.samples.push(t);if(j.samples.length>300)j.samples.shift()}j.lastMessage=line.replace(/\x1b\[[0-9;]*m/g,'').slice(0,250);this.log('Miner',j.name+' · '+j.lastMessage)}
 async readLogsOnce(){
  for(const j of this.jobs.values())for(const source of [j,j.consoleLog].filter(Boolean)){
   try{
    const st=await fs.stat(source.logFile);
    if(st.size>32*1024*1024){await this.stop('Miner log exceeded 32MB limit; please restart');return}
    if(st.size<source.offset){source.offset=0;source.fragment=''}
    const len=Math.min(st.size-source.offset,128*1024);if(len<=0)continue;
    const h=await fs.open(source.logFile,'r'),buf=Buffer.alloc(len);let bytesRead;
    try{({bytesRead}=await h.read(buf,0,len,source.offset))}finally{await h.close()}
    source.offset+=bytesRead;source.readError=null;
    const lines=(source.fragment+buf.toString('utf8',0,bytesRead)).split(/\r\n|\r|\n/);
    source.fragment=lines.pop().slice(-4096);for(const line of lines)this.ingestLine(j,line);
   }catch(e){
    if(e.code!=='ENOENT'&&source.readError!==e.code){source.readError=e.code||'UNKNOWN';this.log('Error',j.name+' · Unable to read kernel log ('+source.readError+')')}
   }
  }
  this.changed();
 }

 checkHardware(hw){
  this.lastHardware=hw;if(this.status!=='running')return;if(['ZCD','BNT','NRB','JTM'].includes(this.session.coin)||(this.session.coin==='RGR'&&this.session.devices[0]?.kind==='CPU')){const devices=miningDevices({coin:this.session.coin},hw);if(!devices.length||devices[0].id!==this.session.selected[0]||Date.now()-(hw.metrics?.at||0)>15000||hw.metrics.freeMemory<512*1024**2)this.stop('CPU device offline or insufficient RAM').catch(()=>{});return;}
  for(const j of this.jobs.values()){
   if(j.status==='stopped'||j.status==='error')continue;
   const g=hw.gpus.find(g=>g.id===j.id),s=g?.sensors;
   if(!g){this.stop('Selected GPU went offline').catch(()=>{});return}
   if(s&&Date.now()-s.at<10000){
    if(this.currentKernel?.captureOutput&&!Number.isFinite(s.temp)){this.stop('GPU thermal sensor unavailable, safety halt').catch(()=>{});return}
    if(!['NOID','YSR'].includes(this.session.coin)&&Number.isFinite(s.load)&&j.child?.stdin&&!j.child.stdin.destroyed){
     const target=Math.round((this.session.performance||75)*.9),current=j.duty??target;
     const next=s.load>target+4?Math.max(5,current-5):s.load<target-8?Math.min(target,current+2):current;
     if(next!==current){j.duty=next;j.child.stdin.write('duty:'+next+'\n')}
    }
    if(s.power!==null){j.powers.push(s.power);if(j.powers.length>120)j.powers.shift()}
    if(s.temp!==null&&s.temp>=this.session.temperature){this.stop('Temperature reached '+this.session.temperature+'°C; thermal shutdown triggered').catch(()=>{});return}
   }else if(j.hadSensor){this.stop('GPU sensor unresponsive for 10s; safety shutdown triggered').catch(()=>{});return}
  }
 }
 async finishBenchmark(){if(!this.session?.benchmark||this.status!=='running')return;const result={coin:this.session.coin,at:Date.now(),devices:[...this.jobs.values()].map(j=>{const samples=j.samples.filter(x=>x.at>(this.session.measurementAt||this.session.startedAt)+15000);return{id:j.id,name:j.name,hash:samples.length>=3?samples.reduce((a,b)=>a+b.hash,0)/samples.length:null,watts:j.powers.length?j.powers.reduce((a,b)=>a+b,0)/j.powers.length:null,samples:samples.length}})};this.benchmark=result;await this.stop('60s benchmark complete; warmup excluded from average');this.changed()}
 async stop(reason='User stopped'){if(this.seine)return require('./bnt-seine-runtime.cjs').stop(this,reason);if(this.bnt)return require('./bnt-runtime.cjs').stop(this,reason);this.connectionAbort?.abort(Error('Connection check cancelled'));this.generation=(this.generation||0)+1;clearInterval(this.timer);clearTimeout(this.endTimer);if(this.status==='idle')return this.snapshot();this.hashWindows?.stop();this.status='stopping';this.changed();await Promise.all([...this.jobs.values()].map(j=>new Promise(resolve=>{if(j.child.exitCode!==null||j.child.signalCode)return resolve();if(this.session?.coin==='YSR'){fs.writeFile(j.logFile+'.stop','stop').catch(()=>{});const graceful=setTimeout(()=>{if(!j.child.stdin.destroyed)j.child.stdin.end('stop\n')},12000);j.child.once('exit',()=>clearTimeout(graceful));}const timeout=setTimeout(()=>{j.child.kill();resolve()},this.session?.coin==='YSR'?15000:this.session?.coin==='ZCD'?11000:2000);j.child.once('exit',()=>{clearTimeout(timeout);resolve()});if(this.session?.coin!=='YSR')j.child.stdin.end('stop\n')})));this.status='idle';this.log('Stop',reason);this.changed();return this.snapshot()}
}
module.exports={KRIG,COINS,Miner,argsFor,parseTelemetry,parseExternalTelemetry,sha};
