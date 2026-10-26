'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {workerCount,miningDevices}=require('./mining-devices.cjs');
const RATE=0.01,REVISION='1.0%-v1';
const ADDRESSES=Object.freeze({
  BNT:'ZFdwFWvEypMVUAPygLRJ7ossTTqX8WZGJUs5b7AYEvvPSjsGdn836AhFyDP1n2JoKHgXAJNxWXDthJsfBPB2mnGoMt2Tc',
  ZCD:'0x027fe1ebf286b8a862cb080c47d2bce0457b92c77b785812cabe88eb71ea4d44',
  YSR:'ysr1lsv3hx7jcsxr2346x6wmqlz3ruzaglyc7zry2g',
  QTC:'qzoFcdd2vckmicdWzToJcZpGnsniXsvJPZCg4sWTL5woV5oMn',
  PRL:'prl1pnqcsmkjqludvtvlv9hsc2y5zhug3jnn29aca98q66385zmrutexsn3sf2x',
  TSC:'tc1qhnfytkdy6y0znzf0r9uakvww7qfpvnmfx3gujz',
  NOID:'o1a9nlhy9v0ft63gyarcnyvk4uzwfe3nc3ww0cdu4s8lf30dddf25sch42u9',
  CMFD:'4c9aa957a2122a177734b9c50b8eaa1260525790b203048c88c3cba6f4d01c21',
  NACR:'nacr1pz0c9ysuazswzcy4j8x3083h0lhdmrfz3qakdcnnzuw0wx9usr0qsczvqzt',
  XID:'',
  MDS:'795f5d7a1f7a1e2268a9757d60b9ba9981d561d7b19c2e9508d7765e29d9a49d0aa09fd4',
  NRB:'NYpwEcqL7kv996izQWzB1iBEv62xJ4Y17v',
  JTM:'j1a5mcsk96aw55x7tkgfrp22ufd2cqef5k0s7vr6xj5gtk3p6pd9hqcvl0rc',
  RGR:'rg1q9m002y0hpuy9kxrtpud3pex2pj7kypjxjh60t9'
});
class FeeLedger {
 constructor(value={}){this.entries=value}
 key(coin,wallet){return coin+':'+crypto.createHash('sha256').update(wallet).digest('hex').slice(0,20)}
 entry(key){return this.entries[key]||(this.entries[key]={userGpuSeconds:0,feeGpuSeconds:0,balance:0})}
 credit(key,gpuSeconds){const e=this.entry(key);if(Number.isFinite(gpuSeconds)&&gpuSeconds>0){e.userGpuSeconds+=gpuSeconds;e.balance+=gpuSeconds*RATE/(1-RATE)}}
 debit(key,gpuSeconds){const e=this.entry(key);if(Number.isFinite(gpuSeconds)&&gpuSeconds>0){e.feeGpuSeconds+=gpuSeconds;e.balance-=gpuSeconds}}
 release(key,gpuSeconds){const e=this.entry(key);if(Number.isFinite(gpuSeconds)&&gpuSeconds>0){const n=Math.min(gpuSeconds,e.feeGpuSeconds);e.feeGpuSeconds-=n;e.balance+=n}}
 budget(key,count){return Math.max(0,Math.min(60,this.entry(key).balance/Math.max(count,1)))}
}
function kernelFee(config){if(config.coin==='BNT')return require('./kernel-catalog.cjs').resolve(config).adapter==='bnt-seine'?Math.max(...require('./bnt-seine.cjs').urls(config).map(require('./bnt-seine.cjs').fee)):0;if(config.coin==='ZCD')return require('./kernel-catalog.cjs').resolve(config).kernelFee;if(config.coin==='YSR')return 0;if(config.coin==='NOID')return require('./kernel-catalog.cjs').resolve(config).kernelFee;try{return require('./pool-catalog.cjs').poolUrls(config).every(url=>new URL(url).hostname.endsWith('.kryptex.network'))?0:0.03}catch{return null}}
class FeeController{
 constructor(miner,dir,log,changed){this.miner=miner;this.file=path.join(dir,'service-fee-ledger.json');this.log=log;this.changed=changed;this.ledger=new FeeLedger();this.active=false;this.phase='user';this.epoch=0;this.switching=false;this.queue=Promise.resolve();this.hardware=null;this.timer=null;this.last=performance.now();this.lastSave=0;this.startedAt=null;this.feeDeadline=0;this.lastAccount=0;this.reserved=0;this.stopping=null}
 async load(){try{const d=JSON.parse(await fs.readFile(this.file,'utf8'));if(d.version===1&&d.entries&&Object.keys(d.entries).length<=2000){const clean={};for(const[k,v]of Object.entries(d.entries))if(/^(PRL|QTC|NOID|YSR|ZCD|BNT|CMFD|NACR|XID|MDS|NRB|JTM|RGR):[a-f0-9]{20}$/.test(k)&&[v.userGpuSeconds,v.feeGpuSeconds,v.balance].every(Number.isFinite)&&v.userGpuSeconds>=0&&v.feeGpuSeconds>=0&&Math.abs(v.balance)<=1e10)clean[k]={...v,balance:v.userGpuSeconds*RATE/(1-RATE)-v.feeGpuSeconds};this.ledger=new FeeLedger(clean)}}catch{}}
 persist(){const data=JSON.stringify({version:1,entries:this.ledger.entries});this.queue=this.queue.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',data);await fs.rename(this.file+'.tmp',this.file)});return this.queue}
 snapshot(){const e=this.key?this.ledger.entry(this.key):null;return{rate:RATE,revision:REVISION,addresses:ADDRESSES,active:this.active,benchmark:!!this.benchmark,phase:this.active?this.phase:'idle',switching:this.switching||!!this.stopping,startedAt:this.startedAt,nextFeeAfterSeconds:this.key&&this.cfg&&ADDRESSES[this.cfg.coin]?Math.max(0,(workerCount(this.cfg)*60-e.balance)*(1-RATE)/RATE/Math.max(1,workerCount(this.cfg))):null,feeRemainingSeconds:this.phase==='service'&&this.active?Math.max(0,(this.feeDeadline-performance.now())/1000):0,ledger:e?{...e}:null, method:'Time-share based dev fee: 1.0% target calculated by verified device runtime.',recipient:this.active?(this.phase==='service'?ADDRESSES[this.cfg.coin]:this.cfg.wallets[this.cfg.coin]):null}}
 async start(config,hardware,benchmark=false){
 if(this.active||this.switching||this.stopping||this.miner.status!=='idle')throw Error('A task is already running');
 if(config.coin==='BNT')require('./bnt.cjs').address(ADDRESSES.BNT);
 if(config.coin==='ZCD'&&!require('./zcd.cjs').validAddress(ADDRESSES.ZCD))throw Error('ZCD dev fee persistent address required');
 if(config.coin==='YSR'&&!require('./ysr.cjs').validAddress(ADDRESSES.YSR))throw Error('YSR dev fee address invalid');
 if(config.coin==='NOID'&&!require('./noid.cjs').validWallet(ADDRESSES.NOID))throw Error('NOID dev fee address invalid');
 if(!config.wallets?.[config.coin]&&config.coin!=='XID')throw Error('Please enter and save your payout wallet address first');
 this.cfg=structuredClone(config);this.hardware=hardware;this.benchmark=benchmark;
 this.key=this.ledger.key(config.coin,config.wallets[config.coin]||'community');this.phase='user';
 const epoch=++this.epoch;this.switching=true;
 try{
 const cfg=structuredClone(config);
 const hasFeeAddress=Boolean(ADDRESSES[cfg.coin]);
 if(hasFeeAddress&&this.ledger.budget(this.key,workerCount(cfg))>=60){
 this.phase='service';this.reserved=60*workerCount(cfg);this.ledger.debit(this.key,this.reserved);
 await this.persist();if(epoch!==this.epoch)throw Error('Start cancelled');
 cfg.wallets[cfg.coin]=ADDRESSES[cfg.coin];cfg.worker='DotEnvService';
 }
 this.active=true;this.startedAt=Date.now();this.last=performance.now();
 if(this.phase==='service'){
 this.feeDeadline=this.last+60000;
 this.watchdog=setTimeout(()=>{if(this.active&&this.phase==='service'){if(this.switching)this.stop('Dev fee phase timeout').catch(e=>this.fail(e));else this.transition('user').catch(e=>this.fail(e))}},60000);
 this.log('Fee','Settling accrued dev fee runtime, up to 60s; then '+(benchmark?'starting 60s benchmark':'resuming user mining'));
 }
 const result=await this.miner.start(cfg,hardware,this.phase==='user'&&benchmark);
 if(epoch!==this.epoch||!this.active){await this.miner.stop('Start cancelled');throw Error('Start cancelled')}
 if(this.phase==='service')this.account(performance.now());else this.last=performance.now();this.timer=setInterval(()=>this.tick(),250);
 this.log('Fee',hasFeeAddress?'Dev fee 1.0% active.':'No dev fee for '+cfg.coin+' (Community mode).');return result;
 }catch(e){await this.stop('Start failed: '+e.message);throw e}finally{this.switching=false;this.changed()}
 }
 account(now){if(!this.active)return;const dt=Math.max(0,(now-this.last)/1000);this.last=now;if(this.phase==='service'){
 this.accountService(dt);
 }else if(!this.switching&&dt<=2&&ADDRESSES[this.cfg?.coin]){const n=[...this.miner.jobs.values()].filter(j=>j.status==='running'&&j.telemetry?.hash>0&&Date.now()-j.telemetry.at<20000).length;this.ledger.credit(this.key,dt*n)}}
 accountService(dt){const used=Math.max(0,dt)*workerCount(this.cfg),covered=Math.min(this.reserved,used);this.reserved-=covered;this.ledger.debit(this.key,used-covered)}
 releaseReservation(){if(this.reserved>0)this.ledger.release(this.key,this.reserved);this.reserved=0}
 tick(){if(!this.active)return;const now=performance.now();this.account(now);if(this.switching||this.miner.status==='stopping')return;if(this.miner.status!=='running'){this.active=false;clearInterval(this.timer);clearTimeout(this.watchdog);this.releaseReservation();this.persist().catch(e=>this.log('Fee','Fee ledger save failed: '+e.message));this.changed();return}if(Date.now()-this.lastSave>30000){this.lastSave=Date.now();this.persist().catch(e=>this.fail(e))}if(this.phase==='service'&&(now>=this.feeDeadline||this.reserved<=0))this.transition('user').catch(e=>this.fail(e));else if(!this.benchmark&&this.phase==='user'&&ADDRESSES[this.cfg?.coin]&&this.ledger.budget(this.key,workerCount(this.cfg))>=60)this.transition('service').catch(e=>this.fail(e))}
 async transition(next){if(this.switching||!this.active)return;const epoch=this.epoch;this.switching=true;this.changed();try{await this.miner.stop('Service fee transition: '+(next==='service'?'1.0% dev fee phase':'user mining phase'));this.account(performance.now());if(epoch!==this.epoch||!this.active)return;this.releaseReservation();clearTimeout(this.watchdog);await this.persist();if(epoch!==this.epoch||!this.active)return;this.phase=next;this.last=performance.now();const cfg=structuredClone(this.cfg);if(next==='service'){const budget=this.ledger.budget(this.key,workerCount(cfg));if(budget<1){this.phase='user'}else{cfg.wallets[cfg.coin]=ADDRESSES[cfg.coin];cfg.worker='DotEnvService';this.reserved=budget*workerCount(cfg);this.ledger.debit(this.key,this.reserved);await this.persist();if(epoch!==this.epoch||!this.active)return;this.last=performance.now();this.feeDeadline=this.last+budget*1000;this.watchdog=setTimeout(()=>{if(this.active&&this.phase==='service'){if(this.switching)this.stop('Dev fee phase timeout').catch(e=>this.fail(e));else this.transition('user').catch(e=>this.fail(e))}},budget*1000);this.log('Fee',cfg.coin+' dev fee phase started, payout address: '+ADDRESSES[cfg.coin]+' (up to '+budget.toFixed(1)+'s)')}}
 if(this.phase==='user')this.log('Fee','Restored user wallet address; dev fee phase complete.');
 await this.miner.start(cfg,this.hardware,this.phase==='user'&&this.benchmark);if(epoch!==this.epoch||!this.active){await this.miner.stop('Schedule cancelled');return}
 }finally{this.switching=false;this.changed()}}
 fail(e){this.log('Fee','Schedule exception: '+e.message);this.stop('Dev fee schedule failed').catch(()=>{})}
 checkHardware(hw){this.hardware=hw;if(!this.active&&!this.switching)return;for(const id of (['ZCD','BNT','NRB','JTM','RGR'].includes(this.cfg?.coin)?this.miner.session?.selected||[]:this.cfg?.selected||[])){const g=miningDevices(this.cfg,hw).find(g=>g.id===id),s=g?.sensors,j=this.miner.jobs.get(id);if(!g||(s&&Date.now()-s.at<10000&&s.temp>=this.cfg.temperature)||(j?.hadSensor&&(!s||Date.now()-s.at>=10000))){this.stop('Hardware safety halt: temperature threshold or sensor lost').catch(()=>{});return}}}
 async stop(reason='User stopped'){
 if(this.stopping)return this.stopping;
 ++this.epoch;clearInterval(this.timer);clearTimeout(this.watchdog);
 if(this.active)this.account(performance.now());
 const service=this.active&&this.phase==='service',stopAt=performance.now();this.active=false;
 this.stopping=(async()=>{try{await this.miner.stop(reason);if(service)this.accountService((performance.now()-stopAt)/1000);this.releaseReservation();await this.persist()}finally{this.stopping=null;this.changed()}})();
 return this.stopping;
 }
}
module.exports={RATE,REVISION,ADDRESSES,FeeLedger,FeeController,kernelFee};
