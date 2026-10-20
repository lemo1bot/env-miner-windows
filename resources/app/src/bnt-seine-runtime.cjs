'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const adapter=require('./bnt-seine.cjs'),bnt=require('./bnt.cjs');
const {HashWindows}=require('./hash-windows.cjs'),{cpuDevice}=require('./mining-devices.cjs');
function state(miner,r,j,stage,message){r.connection={stage,message};if(stage!=='work'){j.status='waiting';j.telemetry=null;miner.hashWindows?.unavailable(j.id)}else j.status='running';miner.changed()}
function ingest(miner,j,line){
 const r=miner.seine;if(!r||r.stopped)return;
 const event=adapter.parse(line);let sample=null;
 if(event){
  if(event.kind==='stats'){
   const rate=adapter.interval(r.previous,event);r.previous=event;
   j.shares.accepted=Math.max(j.shares.accepted,r.acceptedBase+event.accepted);
   if(rate!==null&&r.connection.stage==='work')sample={hash:rate,unit:'H/s',at:Date.now()};
  }else if(event.kind==='accepted')j.shares.accepted++;
  else if(event.kind==='rejected')j.shares.rejected++;
  else if(event.kind==='work'){r.offlineSince=null;r.authenticated=true;state(miner,r,j,'work','Pool job received')}
  else if(event.kind==='auth'){r.authenticated=true;state(miner,r,j,'login','Authorized, waiting for pool job')}
  else if(event.kind==='connected')state(miner,r,j,'login','Connected, authorizing with pool');
  else if(event.kind==='offline'){r.offlineSince??=Date.now();r.authenticated=false;r.previous=null;state(miner,r,j,'retry','Pool connection lost, reconnecting')}
 }
 if(sample){j.telemetry=sample;j.samples.push(sample);if(j.samples.length>300)j.samples.shift();miner.hashWindows?.sample(j.id,sample)}
 j.lastMessage=line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').slice(0,500);miner.log('Miner',j.name+' · '+j.lastMessage);
}
async function endChild(r){
 const child=r.child;if(!child)return;
 if(child.exitCode!==null||child.signalCode||r.closed)return;
 await new Promise(resolve=>{
  const timeout=setTimeout(()=>child.kill(),10000),hard=setTimeout(()=>{child.kill();finish()},13000);
  function finish(){clearTimeout(timeout);clearTimeout(hard);resolve()}
  child.once('close',finish);if(!child.stdin.destroyed)child.stdin.end('stop\n');
 });
}
async function launch(miner,r,j,c,hw){
 if(r.stopped)return;
 // Revalidate available memory after a failover releases the old process.
 bnt.threads({...c,cpuThreads:r.count},{...hw,metrics:{...hw.metrics,totalMemory:os.totalmem(),freeMemory:os.freemem()}});
 const pages=await require('./large-pages.cjs').preference(miner.baseDir);
 if(r.stopped)return;
 const logFile=path.join(miner.dir,'logs','seine-'+r.sequence+++'.log');
 const args=adapter.args(c,r.count,r.urls[r.index],path.join(miner.dir,'data'),pages);
 Object.assign(j,{logFile,offset:0,fragment:'',pid:null,telemetry:null});
 r.acceptedBase=j.shares.accepted;r.previous=null;r.offlineSince=Date.now();r.authenticated=false;r.closed=false;
 state(miner,r,j,'connect','Connecting to '+new URL(r.urls[r.index]).hostname);
 const child=r.child=spawn(miner.guard,[String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});j.child=child;
 child.stdin.on('error',()=>{});let fragment='';
 child.stdout.on('data',data=>{const lines=(fragment+String(data)).split('\n');fragment=lines.pop();for(const line of lines)try{const p=JSON.parse(line);if(p.pid)j.pid=p.pid;if(p.exitCode!==undefined)r.exitCode=p.exitCode}catch{}miner.changed()});
 child.stderr.on('data',data=>{const message=String(data).slice(0,500);r.fatal=/Cannot start captured process: 5\b/.test(message)?'Windows denied launching Seine (Error 5). Check antivirus permissions; task stopped.':message.trim();miner.log('Error',r.fatal)});
 child.on('error',error=>{r.fatal=error.message;r.closed=true});child.on('close',()=>{r.closed=true});
 child.stdin.write(JSON.stringify({exe:miner.exe,cwd:miner.dir,args,duty:c.performance,capturePath:logFile,cpuOnly:true,gracefulConsole:true})+'\n');
 miner.log('Kernel','Seine '+miner.currentKernel.version+' · CPU '+r.count+' T · Kernel fee '+adapter.fee(r.urls[r.index])*100+'% · App fee 0.5%');
}
async function tick(miner,r,j,c,hw){
 if(r.stopped||r.ticking)return;r.ticking=true;
 try{
  await miner.readLogs();if(r.stopped)return;
  if(r.fatal)throw Error(r.fatal);
  const disconnected=r.offlineSince!==null&&Date.now()-r.offlineSince>90000;
  if(r.closed){throw Error('Seine engine exited '+(r.exitCode??'unknown')+'; check miner logs')}
  if(disconnected&&r.urls.length>1){
   miner.log('Pool','Seine lost job for 90s, switching backup pool');await endChild(r);await miner.readLogs();if(r.stopped)return;
   r.index=(r.index+1)%r.urls.length;await launch(miner,r,j,c,hw);
  }
  if(j.telemetry&&Date.now()-j.telemetry.at>20000){j.telemetry=null;miner.hashWindows?.unavailable(j.id)}
  miner.changed();
 }catch(e){if(!r.stopped){miner.log('Error',e.message);void miner.stop('Seine failed').catch(()=>{})}}finally{r.ticking=false}
}
async function start(miner,c,hw,benchmark){
 bnt.address(c.wallets.BNT);const urls=adapter.urls(c);if(!urls.length)throw Error('Please enter a pool URL');
 if(!hw.metrics?.at||Date.now()-hw.metrics.at>15000)throw Error('Please refresh hardware monitor');
 hw={...hw,metrics:{...hw.metrics,totalMemory:os.totalmem(),freeMemory:os.freemem()}};
 const count=bnt.threads(c,hw),budget=bnt.memoryBudget(hw),device=cpuDevice(hw);if(!device)throw Error('No supported CPU detected');
 miner.configure(c);miner.status='starting';miner.changed();
 const r=miner.seine={stopped:false,count,urls,index:0,sequence:0,connection:null,child:null};
 try{
  if(!await miner.installed(c))throw Error('Please install Seine kernel first');await fs.access(miner.guard);if(r.stopped)throw Error('Start cancelled');
  await fs.mkdir(path.join(miner.dir,'logs'),{recursive:true});if(r.stopped)throw Error('Start cancelled');
  miner.session={coin:'BNT',kernelId:miner.currentKernel.id,kernelSelection:miner.currentKernel.selection,selected:[device.id],devices:[device],startedAt:Date.now(),performance:c.performance,duty:c.performance,cpuThreads:count,bntBudget:budget,temperature:c.temperature,benchmark};
  miner.hashWindows=new HashWindows([device.id],c.hashWindowMinutes,miner.session.startedAt);miner.jobs.clear();
  const j={id:device.id,name:device.name,status:'starting',telemetry:null,samples:[],powers:[],shares:{accepted:0,rejected:0},lastMessage:'Waiting for Seine output',pid:null};miner.jobs.set(j.id,j);
  await launch(miner,r,j,c,hw);if(r.stopped)throw Error('Start cancelled');
  miner.status='running';miner.changed();r.timer=setInterval(()=>tick(miner,r,j,c,hw),1000);
  if(benchmark)r.end=setTimeout(()=>miner.finishBenchmark().catch(()=>{}),60000);
  return miner.snapshot();
 }catch(e){await stop(miner,'Start failed: '+e.message);throw e}
}
async function stop(miner,reason){
 const r=miner.seine;if(!r)return miner.snapshot();if(r.stopping)return r.stopping;
 r.stopped=true;clearInterval(r.timer);clearTimeout(r.end);miner.status='stopping';miner.changed();
 r.stopping=(async()=>{await endChild(r);miner.hashWindows?.stop();for(const j of miner.jobs.values()){j.status='stopped';j.telemetry=null}miner.seine=null;miner.status='idle';miner.log('Stop',reason);miner.changed();return miner.snapshot()})();return r.stopping;
}
module.exports={start,stop,ingest};
