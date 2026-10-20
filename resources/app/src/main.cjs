'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,net,session,Tray,Menu,nativeImage}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const {Hardware}=require('./hardware.cjs'),{ConfigStore}=require('./config.cjs'),{Income}=require('./income.cjs'),{Miner,KRIG,COINS}=require('./miner.cjs');
const {Network}=require('./network.cjs'),{Intelligence}=require('./intelligence.cjs'),{FeeController}=require('./service-fee.cjs'),{Floating,compactState}=require('./floating.cjs');
const {readBody}=require('./download-body.cjs');
const {PoolAccount}=require('./pool-account.cjs');
const {Rentals,externalLink:rentalLink}=require('./rentals.cjs');
const rentals=new Rentals(request);
const {validate}=require('./config.cjs');
const {reconcileSelection}=require('./device-selection.cjs');
const {poolChoices}=require('./pool-catalog.cjs');
const {choices:kernelChoices,resolve:resolveKernel}=require('./kernel-catalog.cjs');
const {Records}=require('./records.cjs'),{Updates}=require('./updates.cjs');
const {displayVersion}=require('../package.json');
const {t}=require('../renderer/i18n.js');
const MINING_COINS=COINS.filter(c=>c.supported).map(c=>c.symbol);
const PAGE=path.join(__dirname,'../renderer/index.html'),PAGE_URL=require('node:url').pathToFileURL(PAGE).href;
const LINKS={
  twitter:'https://x.com/bank_of_eth',
  youtube:'https://www.youtube.com/@envlemon',
  telegram:'https://t.me/env_120',
  site:'https://x.com/bank_of_eth',
  bntOfficialDownload:'https://github.com/blocknetprivacy/core/releases/download/v0.20.0/blocknet-core-amd64-windows-0.20.0.zip',
  bntOfficialRelease:'https://github.com/blocknetprivacy/core/releases/tag/v0.20.0',
  bntSeineSource:'https://github.com/zpalmtree/seine/releases/tag/v0.2.15',
  PRL:'https://compute.pearlresearch.ai/wallet',
  QTC:'https://www.quantus.com/',
  TSC:'https://tensorcash.org/',
  NOID:'https://parano1d.org/',
  YSR:'https://www.yskar.app/',
  ZCD:'https://zycord.com/',
  BNT:'https://bntpool.com/',
  CMFD:'https://pool.ariabrain.com/cmfd.html',
  NACR:'https://nacre.network/',
  XID:'https://pool.ariabrain.com/xid.html',
  MDS:'https://midstate.cash/',
  NRB:'https://nerbus.com/',
  JTM:'https://jetsamchain.com/',
  kernel:KRIG.source
};
const SMOKE=!app.isPackaged&&process.env.GOZER_UI_TEST==='1';
let largePages,accountTarget=null;
let bntTuneController,bntTuning={running:false,message:'',result:null};
let installers,directDownloadSession,dual,cpuMiner,cpuFee,poolAccount,records,updates,recordTimer,updateTimer,win,tray,hw,config,income,miner,network,intelligence,fee,floating,quitting=false,installed=false,logs=[],logSequence=0,ready=false,starting=false;
app.setName('.env');app.setAppUserModelId('io.dotenv.miner');app.setPath('userData',path.join(app.getPath('appData'),'dotenv-miner'));
const profileArg=process.argv.find(a=>a.startsWith('--profile-dir='));if(profileArg){const profile=profileArg.slice(14);if(!path.isAbsolute(profile))throw Error('Profile directory must be an absolute path');app.setPath('userData',profile)}
const testData=process.env.GOZER_TEST_DATA;
if(!app.isPackaged&&testData&&path.isAbsolute(testData))app.setPath('userData',testData);
if(!app.requestSingleInstanceLock()){app.quit()}else{
 app.on('second-instance',(_event,argv)=>{if(argv.includes('--quit'))shutdown();else if(win)restoreMain()});
 (process.argv.includes('--quit')?Promise.resolve().then(()=>{quitting=true;app.quit()}):app.whenReady().then(boot)).catch(e=>{dialog.showErrorBox('.env Miner Startup Error',e.message);app.quit()});
}
async function request(url,{maxBytes=16*1024*1024,timeout=20000,method='GET',body,onProgress,signal,direct=false,connectTimeout,stallTimeout}={}){
 const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('Only HTTP/HTTPS protocols are supported');
 if(direct&&u.origin!=='https://github.com')throw Error('Direct download only for official GitHub sources');
 if(direct&&!directDownloadSession){directDownloadSession=session.fromPartition('dotenv-direct-download');await directDownloadSession.setProxy({mode:'direct'})}
 const controller=new AbortController();let watch;
 const arm=ms=>{clearTimeout(watch);if(ms)watch=setTimeout(()=>controller.abort(Error('Download connection timed out or stalled')),ms)};
 arm(connectTimeout);
 try{const response=await (direct?directDownloadSession:net).fetch(url,{credentials:'omit',method,body,headers:{'User-Agent':'DotEnvMiner/'+app.getVersion(),...(body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.any([AbortSignal.timeout(timeout),controller.signal,...(signal?[signal]:[])])});
 if(!response.ok)throw Error('Source HTTP '+response.status);arm(stallTimeout);
 return await readBody(response,maxBytes,p=>{arm(stallTimeout);onProgress?.(p)})}finally{clearTimeout(watch)}
}
function redact(s){let text=String(s).replace(/[\u0000-\u0008\u000b-\u001f]/g,'').slice(0,1500);for(const wallet of [config?.value,...Object.values(config?.value?.taskProfiles||{})].flatMap(c=>Object.values(c?.wallets||{})))if(wallet)text=text.split(wallet).join('[Wallet hidden]');for(const c of [config?.value,...Object.values(config?.value?.taskProfiles||{})])if(c?.zcdPassword&&c.zcdPassword!=='x')text=text.split(c.zcdPassword).join('[Password hidden]');return require('./log-privacy.cjs').hideNetworkAddresses(text.replace(/tscp_[a-zA-Z0-9_-]+/g,'[Token hidden]'))}
function log(type,text,task=null,coin=null){logs.push({id:++logSequence,at:Date.now(),type,task,coin,text:redact(text)});if(logs.length>300)logs.shift();push()}
function measurement(){if(miner?.status==='running'&&fee?.phase!=='service'){const jobs=[...miner.jobs.values()];return{coin:miner.session.coin,at:Date.now(),devices:jobs.map(j=>({id:j.id,hash:j.telemetry&&Date.now()-j.telemetry.at<20000?j.telemetry.hash:null,unit:'H/s',watts:(hw.last||hw.inventory).gpus.find(g=>g.id===j.id)?.sensors?.power??null}))}}return miner?.benchmark}
function incomeResult(){const result=income?.result(hw?.last||hw?.inventory,config.value,measurement(),network?.snapshot()||[]);return result?{...result,coins:result.coins.filter(c=>MINING_COINS.includes(c.coin))}:result}
function selectedKernel(){try{return resolveKernel(config?.value||{coin:'PRL'})}catch{return KRIG}}
function library(){return COINS.filter(c=>c.supported).map(c=>({...c,kernels:kernelChoices(c.symbol).filter(k=>!k.disabled&&k.id!=='auto').map(k=>installers.snapshot({...config.value,coin:c.symbol,kernels:{...config.value.kernels,[c.symbol]:k.id}}))}))}
function state(){const bntMemory=[miner,cpuMiner].find(m=>(m?.bnt||m?.seine)&&m.session?.coin==='BNT')?.session?.bntBudget||require('./bnt.cjs').memoryBudget(hw?.last||hw?.inventory);return{largePages:largePages?.snapshot(),bntTuning,kernelLibrary:installers?library():[],bntMemory,bntThreadLimit:bntMemory.maxThreads,dual:dual?{...dual.snapshot(),tasks:Object.fromEntries(Object.entries(dual.snapshot().tasks).map(([id,t])=>{const k=installers?.snapshot(t.config);return[id,k?{...t,kernel:{...t.kernel,installed:k.installed},miner:{...t.miner,installing:k.installing,installation:k.installation}}:t]}))}:null,ready:ready&&!starting,version:app.getVersion(),displayVersion,hardware:hw?.last||hw?.inventory,config:config?.value,miner:miner?{...miner.snapshot(),...(installers?{installing:installers.snapshot(config.value).installing,installation:installers.snapshot(config.value).installation}:{})}:null,kernel:{...selectedKernel(),installed:installers?installers.snapshot(config.value).installed:installed,options:kernelChoices(config?.value?.coin)},cpuDevice:require('./mining-devices.cjs').cpuDevice(hw?.last||hw?.inventory),noidRequirements:config?.value?.coin==='NOID'?require('./noid.cjs').compatibility(hw?.last||hw?.inventory,config.value.selected,selectedKernel()):null,coins:COINS.filter(c=>c.supported),poolOptions:poolChoices(config?.value?.coin),poolAccount:poolAccount?.snapshot(),logs,income:incomeResult(),network:network?.snapshot()||[],information:intelligence?.snapshot(),records:records?.snapshot(),updates:updates?.snapshot(),serviceFee:fee?.snapshot()}}
function updateLanguage(){if(!config)return;if(win&&!win.isDestroyed())win.setTitle('.env');if(floating?.win&&!floating.win.isDestroyed())floating.win.setTitle('.env · Mini Monitor');if(!tray)return;tray.setToolTip('.env · Workstation');const menu=Menu.buildFromTemplate([{label:'Open .env',click:restoreMain},{label:'Stop Mining',click:()=>stopAll('Tray stop')},{type:'separator'},{label:'Exit',click:()=>shutdown()}]);tray.setContextMenu(menu);return menu}
function stopAll(reason){bntTuneController?.abort();return dual?dual.stopAll(reason):fee?.stop(reason)}
function anyBusy(){return starting||dual?.anyBusy()}
function primaryLog(type,text){const id=config?.value.workbenchMode==='dual'?'gpu':['ZCD','BNT','NRB','JTM'].includes(config?.value.coin)?'cpu':'gpu';log(type,text,id,config?.value.workbenchMode==='dual'?dual?.config('gpu').coin:config?.value.coin)}
function restoreMain(){floating?.hide();if(win.isMinimized())win.restore();win.show();win.focus()}
let pushTimer;function push(){if(!win||win.isDestroyed())return;clearTimeout(pushTimer);pushTimer=setTimeout(()=>{if(!win.isDestroyed()){const s=state();win.webContents.send('state',s);floating?.send(compactState(s))}},40)}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{try{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==PAGE_URL)throw Error('Rejected non-local UI request');return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:redact(e.message||e)}}})}
async function reconcileDevices(){const result=reconcileSelection(config.value,hw.last||hw.inventory);if(result.changed){await config.save(result.config);if(result.migrated)log('Hardware','Merged legacy device IDs, currently selected '+config.value.selected.length+' GPU(s)');}return result}
async function boot(){
  try {
    const dir=app.getPath('userData');
    largePages=new (require('./large-pages.cjs').LargePages)(dir);
    await largePages.refresh();
    config=new ConfigStore(dir);
    await config.load();
    poolAccount=new PoolAccount(request,push);
    poolAccount.configure(config.value);
    poolAccount.start();
    income=new Income(dir,request);
    await income.load();
    hw=new Hardware(data=>{fee?.checkHardware(data);miner?.checkHardware(data);cpuFee?.checkHardware(data);cpuMiner?.checkHardware(data);push()});
    hw.interval=config.value.interval;
    miner=new Miner(dir,request,primaryLog);
    miner.on('update',push);
    installed=await miner.installed(config.value);
    fee=new FeeController(miner,dir,primaryLog,push);
    await fee.load();
    const cpuLog=(type,text)=>log(type,text,'cpu',dual?.config('cpu').coin||'ZCD');
    cpuMiner=new Miner(dir,request,cpuLog);
    cpuMiner.on('update',push);
    cpuFee=new FeeController(cpuMiner,dir,cpuLog,push);
    dual=new (require('./dual-tasks.cjs').DualTasks)({store:config,gpu:miner,cpu:cpuMiner,gpuFee:fee,cpuFee,hardware:()=>hw.last||hw.inventory,ready:()=>ready&&!starting&&!hw.pendingScan,changed:push});
    await dual.refresh();
    installers=new (require('./install-manager.cjs').InstallManager)(dir,request,log,push,()=>[miner,cpuMiner].filter((m,i)=>m.status!=='idle'||(bntTuning.running&&m.currentKernel?.id?.startsWith('gozero-bnt-'))||[fee,cpuFee][i]?.active||[fee,cpuFee][i]?.switching).map(m=>m.currentKernel?.id||m.session?.kernelId));
    for(const c of COINS.filter(c=>c.supported))for(const k of kernelChoices(c.symbol).filter(k=>!k.disabled))await installers.inspect({...config.value,coin:c.symbol,kernels:{...config.value.kernels,[c.symbol]:k.id}});
    intelligence=new Intelligence(dir,request,push);
    await intelligence.load();
    network=new Network(dir,request,rows=>{intelligence.observeNetwork(rows);intelligence.observeProfits(incomeResult());push()});
    await network.load();
    records=new Records(dir,request,push);
    await records.load();
    records.enabled=config.value.shareBenchmarks;
    updates=new Updates(dir,request,app.getVersion(),push);
    await updates.load();
    floating=new Floating(require('electron'),dir,restoreMain,()=>stopAll(),SMOKE);
    win=new BrowserWindow({width:792,height:594,minWidth:792,minHeight:594,useContentSize:true,frame:false,thickFrame:false,show:false,backgroundColor:'#0c0d12',icon:path.join(__dirname,'../assets/icon.ico'),title:'.env Miner',webPreferences:{offscreen:SMOKE,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,u)=>{if(u!==PAGE_URL)e.preventDefault()});win.webContents.on('will-attach-webview',e=>e.preventDefault());
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,cb)=>{const id=details.webContentsId;cb({cancel:Number.isInteger(id)&&id>0&&(id===win.webContents.id||id===floating?.win?.webContents?.id)})});
 handle('bootstrap',()=>state());handle('language',async language=>{if(!['zh-CN','en','ja','ru'].includes(language))throw Error('Unsupported language');await config.update(value=>({...value,language}));updateLanguage();push();return config.value});handle('scan',async()=>{if(anyBusy())throw Error('Cannot rescan devices while a task is running');if(!ready)throw Error('Scanning devices, please wait');ready=false;log('Hardware','Reading local hardware sensors');try{await hw.scan();await reconcileDevices();log('Hardware','Detected '+hw.inventory.gpus.length+' physical GPU(s)')}finally{ready=true;push()}return state()});
 handle('save',async value=>{if(bntTuning.running)throw Error('Please cancel tuning first');if(config.value.workbenchMode==='dual'){
 const globals=['theme','interval','electricity','poolFee','manualWatts','temperature','shareBenchmarks'];const current=config.value;
 for(const key of Object.keys({...current,...value}))if(!globals.includes(key)&&JSON.stringify(value?.[key])!==JSON.stringify(current[key]))throw Error('Please configure mining in task card');
 if(anyBusy()&&value.temperature!==current.temperature)throw Error('Stop all tasks before changing thermal protection');
 await config.update(c=>({...c,...Object.fromEntries(globals.map(k=>[k,value[k]]))}));hw.interval=config.value.interval;records.enabled=config.value.shareBenchmarks;push();return config.value;
 }if(value?.workbenchMode==='dual'||JSON.stringify(value?.taskProfiles)!==JSON.stringify(config.value.taskProfiles))throw Error('Change dual mining mode via buttons');if(miner.installing)throw Error('Kernel is installing, please wait');if(value?.coin&&!MINING_COINS.includes(value.coin))throw Error('Mining for this coin is not yet enabled on Windows');if(starting||miner.status!=='idle'||fee.active||fee.switching||fee.stopping){const a={...value,theme:config.value.theme,interval:config.value.interval},b={...config.value};if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Stop active task before changing devices or config')}await config.save(ready?reconcileSelection(validate(value),hw.last||hw.inventory).config:value);miner.configure(config.value);installed=await miner.installed(config.value);poolAccount.configure(config.value);records.enabled=config.value.shareBenchmarks;hw.interval=config.value.interval;intelligence.resetProfits();push();return config.value});
 handle('income',async()=>{await Promise.all([income.refresh(),...MINING_COINS.map(c=>network.refresh(c))]);log('Income',income.error?'Using cache: '+income.error:'Updated reference income for matching GPU models');push();return incomeResult()});
 handle('install',async()=>{await installers.install(config.value);installed=true;await dual.refresh();push();return true});
 handle('libraryInstall',async(coin,id)=>{if(!MINING_COINS.includes(coin))throw Error('Invalid coin');const cfg={...config.value,coin,kernels:{...config.value.kernels,[coin]:id}};await installers.install(cfg);await dual.refresh();push();return true});handle('start',async benchmark=>{if(config.value.workbenchMode==='dual')throw Error('Please use dual mining task start button');if(benchmark!==true&&benchmark!==false)throw Error('Invalid request');if(!ready||starting||hw.pendingScan)throw Error('Devices scanning or task starting, please wait');if(miner.status!=='idle'||fee.active||fee.switching||fee.stopping)throw Error('A mining task is already running; stop first or switch to dual mode');if(installers.snapshot(config.value).installing)throw Error('Selected kernel is installing, please wait');starting=true;push();try{const result=await reconcileDevices();if(!['ZCD','BNT','NRB','JTM'].includes(config.value.coin)&&result.missing.length)throw Error(result.missing.length+' selected device(s) offline; please rescan');intelligence.resetProfits();return await fee.start(config.value,hw.last||hw.inventory,benchmark)}finally{starting=false;push()}});handle('stop',()=>stopAll());
 handle('taskSave',(id,patch)=>{if(bntTuning.running)throw Error('Please cancel tuning first');const value=dual.save(id,patch);return value.then(result=>{if(accountTarget===id)poolAccount.configure(dual.config(id));return result})});handle('taskStart',(id,test)=>{if(installers.snapshot(dual.config(id)).installing)throw Error('Selected kernel is installing, please wait');return dual.start(id,test)});handle('taskStop',id=>dual.stop(id));handle('taskInstall',async id=>{await installers.install(dual.config(id));await dual.refresh()});handle('tasksStart',()=>{if(['gpu','cpu'].some(id=>installers.snapshot(dual.config(id)).installing))throw Error('Selected kernel is installing, please wait');return dual.startAll()});handle('tasksStop',()=>stopAll());
 handle('workbenchMode',mode=>dual.enqueue(async()=>{
  if(!['gpu','cpu','dual'].includes(mode))throw Error('Invalid workbench mode');if(anyBusy())throw Error('Stop all tasks before switching mode');starting=true;push();
  try{const old=config.value,{PROFILE_KEYS,taskConfig}=require('./dual-tasks.cjs');let profiles={...old.taskProfiles};
   if(old.workbenchMode!=='dual'){const id=['ZCD','BNT','NRB','JTM'].includes(old.coin)?'cpu':'gpu';profiles[id]=Object.fromEntries(PROFILE_KEYS.map(k=>[k,old[k]]));}
   const normalized=validate({...old,taskProfiles:profiles,workbenchMode:mode});
   const next=mode==='dual'?normalized:{...normalized,...taskConfig(normalized,mode),taskProfiles:normalized.taskProfiles,workbenchMode:mode};
   await config.save(next);await dual.refresh();miner.configure(config.value);installed=await miner.installed(config.value);accountTarget=null;poolAccount.configure(config.value);return state();
  }finally{starting=false;push()}
 }));
 handle('poolConnectionCheck',async()=>{if(config.value.workbenchMode==='dual')throw Error('Dual NOID checks connection on launch');if(miner.installing||starting||miner.status!=='idle'||fee.active||fee.switching||fee.stopping)throw Error('Stop active task first');if(config.value.coin!=='NOID')throw Error('Only NOID connection test supported');starting=true;push();const controller=new AbortController();miner.connectionAbort=controller;try{const r=await require('./noid-connection.cjs').prepare(config.value,{request,log,signal:controller.signal});return{url:r.url,original:r.original,compatible:r.compatible,protocol:r.protocol}}finally{starting=false;push()}});
 handle('largePagesStatus',async()=>{if(largePages.busy)return largePages.snapshot();const r=await largePages.refresh();push();return r});
 handle('largePagesEnable',async()=>{
  if(anyBusy()||largePages.busy)throw Error('Stop all tasks before enabling large pages');
  starting=true;push();
  try{
   const tr=x=>t(x,config.value.language),choice=await dialog.showMessageBox(win,{type:'question',title:tr('Enable Large Pages'),message:tr('Grant Lock Pages in Memory privilege to current user?'),detail:tr('Administrator prompt will appear. Requires sign out or reboot.'),buttons:[tr('Continue'),tr('Cancel')],defaultId:1,cancelId:1,noLink:true});
   if(choice.response!==0)return largePages.snapshot();
   const result=await largePages.enable();log('Memory',result.phase==='pending'?'Large pages privilege granted; please sign out or restart':'Large pages privilege granted');return result;
  }finally{starting=false;push()}
 });
 handle('bntTuneCancel',()=>{bntTuneController?.abort();return true});
 handle('bntTune',async id=>{
  if(anyBusy())throw Error('Stop all tasks before tuning');if(id!==undefined&&id!=='cpu')throw Error('Invalid task');
  if(id==='cpu'&&config.value.workbenchMode!=='dual'||id===undefined&&config.value.workbenchMode==='dual')throw Error('Please tune in the corresponding workbench');
  const cfg=id==='cpu'?dual.config(id):config.value,controller=id==='cpu'?cpuMiner:miner;if(cfg.coin!=='BNT')throw Error('Please select BNT first');if(resolveKernel(cfg).adapter==='bnt-seine')throw Error('Auto-tuning only available for Blocknet engine');
  starting=true;bntTuneController=new AbortController();bntTuning={running:true,message:'Preparing tuning',result:null};push();
  const timeout=setTimeout(()=>bntTuneController?.abort(),20*60*1000);
  try{
   if(!await controller.installed(cfg))throw Error('Please install BNT kernel first');controller.configure(cfg);
   const result=await require('./bnt-tuning.cjs').tune(controller.exe,controller.baseDir,cfg,hw.sample(),{...(SMOKE&&process.env.GOZER_BNT_OPT_TEST==='1'?{durationMs:1000,confirmMs:1500,maxThreads:1}:{}),signal:bntTuneController.signal,progress:message=>{bntTuning.message=message;log('Tuning',message)}});
   if(bntTuneController.signal.aborted)throw Error('BNT tuning cancelled');
   if(id==='cpu')await config.update(value=>({...value,taskProfiles:{...value.taskProfiles,cpu:{...value.taskProfiles.cpu,cpuThreads:result.selected.threads}}}));
   else await config.update(value=>({...value,cpuThreads:result.selected.threads}));
   bntTuning.result={engine:result.selected.engine,threads:result.selected.threads,hashrate:result.hashrate,changePercent:result.changePercent};
   bntTuning.message='Applied tuning config · '+result.selected.engine+' / '+result.selected.threads+' T · '+result.hashrate.toFixed(3)+' H/s';log('Tuning',bntTuning.message);return bntTuning.result;
  }catch(e){if(bntTuneController?.signal.aborted)e=Error('BNT tuning cancelled');bntTuning.message=e.message;throw e}finally{clearTimeout(timeout);bntTuning.running=false;bntTuneController=null;starting=false;push()}
 });
 handle('bntConnectionCheck',async()=>{if(anyBusy())throw Error('Stop active task before testing connection');if(config.value.coin!=='BNT')throw Error('Please select BNT first');starting=true;push();const controller=new AbortController();miner.connectionAbort=controller;try{return await require('./bnt-pool.cjs').probe(config.value,{signal:controller.signal,log:message=>log('Connection',message)})}finally{starting=false;push()}});
 handle('poolAccountPage',page=>poolAccount.setPage(page));handle('poolAccountRefresh',id=>{if(id!==undefined){if(!['cpu','gpu'].includes(id)||config.value.workbenchMode!=='dual')throw Error('Invalid task');accountTarget=id;poolAccount.configure(dual.config(id))}return poolAccount.refresh()});handle('poolAccountOpen',()=>shell.openExternal(poolAccount.url()));
 handle('rentals',input=>rentals.get(input));handle('rentalOpen',id=>shell.openExternal(rentalLink(id)));
 handle('checkUpdate',()=>updates.check());handle('downloadUpdate',()=>shell.openExternal(updates.downloadUrl()));handle('shareRecords',async enabled=>{if(typeof enabled!=='boolean')throw Error('Invalid benchmark share setting');await config.update(value=>({...value,shareBenchmarks:enabled}));records.enabled=enabled;if(enabled)records.flush();push();return config.value});handle('exportRecords',async()=>{const choice=await dialog.showSaveDialog(win,{defaultPath:'DotEnv-device-records.json',filters:[{name:'JSON',extensions:['json']}]});if(choice.canceled)return false;await fs.writeFile(choice.filePath,JSON.stringify(records.export(),null,2));return true});handle('nativeCheck',async()=>{if(anyBusy())throw Error('Stop mining first');const gpu=(hw.last||hw.inventory).gpus.find(g=>g.vendor==='NVIDIA'&&config.value.selected.includes(g.id));if(!gpu)throw Error('Select an NVIDIA GPU first');const{stdout}=await require('node:util').promisify(require('node:child_process').execFile)(path.join(__dirname,'../native/GozerQtcCore.exe'),['--self-test','--pci',gpu.pci],{windowsHide:true,timeout:20000,maxBuffer:100000});const d=JSON.parse(stdout);log('Kernel','QTC CUDA passed '+d.referenceChecks+' offline checks; pool not connected');return d});
 handle('performance',async value=>{if(config.value.workbenchMode==='dual')throw Error('Please adjust performance in each task card');if(fee.switching||fee.stopping||fee.phase==='service'&&fee.active)throw Error('Adjustable after dev fee period finishes');const candidate=validate({...config.value,performance:value});if(['ZCD','BNT'].includes(candidate.coin)){if(miner.status!=='idle'||fee.active||starting)throw Error('CPU mining active: stop to adjust thread budget');hw.sample();const cpu=require('./mining-devices.cjs').cpuDevice(hw.last||hw.inventory);if(!cpu)throw Error('No supported CPU detected');candidate.cpuThreads=candidate.coin==='BNT'?require('./bnt.cjs').threads({...candidate,cpuThreads:0},hw.last||hw.inventory):require('../renderer/performance.js').cpuThreadBudget(cpu,value)}const next=await config.save(candidate);miner.setPerformance(next.performance);if(fee.cfg)fee.cfg.performance=next.performance;intelligence.resetProfits();push();return next});
 handle('network',async()=>{await Promise.all(MINING_COINS.map(c=>network.refresh(c)));return network.snapshot()});handle('information',async()=>{await intelligence.refresh();return intelligence.snapshot()});handle('infoSource',id=>{const row=intelligence.events.find(e=>e.id===id);if(!row)throw Error('Information entry not found');const u=new URL(row.source);if(!['https://gozero.trade','https://pro.gozero.trade'].includes(u.origin))throw Error('Unsupported source');return shell.openExternal(u.href)});
 const checkMini=e=>floating.win&&e.sender===floating.win.webContents&&e.senderFrame===floating.win.webContents.mainFrame&&e.senderFrame.url===floating.url;ipcMain.handle('mini:get',e=>{if(!checkMini(e))throw Error('Invalid window');return compactState(state())});ipcMain.handle('mini:hide',e=>{if(!checkMini(e))throw Error('Invalid window');floating.hide();win.hide();return true});ipcMain.handle('mini:restore',e=>{if(!checkMini(e))throw Error('Invalid window');restoreMain();return true});ipcMain.handle('mini:quit',async e=>{if(!checkMini(e))throw Error('Invalid window');await shutdown();return true});ipcMain.handle('mini:stop',async e=>{if(!checkMini(e))throw Error('Invalid window');await stopAll('Mini overlay stop');return true});
 handle('open',id=>{if(!Object.hasOwn(LINKS,id))throw Error('Link not found');return shell.openExternal(id==='kernel'?selectedKernel().source:LINKS[id])});
 handle('window',async action=>{if(action==='minimize')win.minimize();else if(action==='maximize'){win.isMaximized()?win.unmaximize():win.maximize()}else if(action==='close'){win.close()}else if(action==='quit'){await shutdown()}else throw Error('Invalid window action')});
 const {VpsMiner} = require('./vps-miner.cjs');
const vpsRunner = new VpsMiner();
vpsRunner.on('log', msg => {
  if (win && !win.isDestroyed()) win.webContents.send('vps-log', msg);
  log('VPS', msg);
});
handle('vpsStart', data => vpsRunner.start(data));
handle('vpsStop', () => vpsRunner.stop());
const { generateWallet, WALLET_INFO } = require('./wallet-generator.cjs');
handle('walletGenerate', coin => generateWallet(coin));
handle('walletInfo', () => WALLET_INFO);
handle('exportLogs',async()=>{const choice=await dialog.showSaveDialog(win,{defaultPath:'env-miner-log.txt',filters:[{name:'Text',extensions:['txt']}]});if(choice.canceled)return false;await fs.writeFile(choice.filePath,logs.map(x=>new Date(x.at).toISOString()+' ['+(x.task?x.task.toUpperCase()+'·'+x.coin+' / ':'')+x.type+'] '+x.text).join('\r\n'),'utf8');return true});
 win.on('minimize',()=>{if(!quitting){win.hide();floating.show().catch(e=>log('Window',e.message))}});win.on('restore',()=>floating.hide());
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();floating.show().catch(e=>{restoreMain();log('Window',e.message)})}});
    await win.loadFile(PAGE);
    if(!SMOKE) win.show();
    const icon=nativeImage.createFromPath(path.join(__dirname,"../assets/tray.png"));
    tray=new Tray(icon);
    const trayMenu=updateLanguage();
    tray.on("double-click",restoreMain);
    log("System",".env Miner "+displayVersion+" · "+app.getVersion()+" started; manual start required");
    if(config.warning)log("Config",config.warning);if(config.notice)log("Config",config.notice);
    try{await hw.scan();await reconcileDevices();ready=true;log("Hardware","Hardware monitor initialized")}catch(e){ready=true;log("Hardware","Hardware scan failed: "+e.message)}
    hw.start();network.start(MINING_COINS);intelligence.start();
    try{
      const { TelemetryReporter } = require('./telemetry-reporter.cjs');
      const telemetry = new TelemetryReporter();
      telemetry.start(() => state());
    }catch(err){}
    recordTimer=setInterval(()=>{records.capture(miner,hw.last||hw.inventory,fee,app.getVersion());records.capture(cpuMiner,hw.last||hw.inventory,cpuFee,app.getVersion());records.flush()},15000);
    updateTimer=setInterval(()=>updates.check(),6*3600000);
    setTimeout(()=>{if(!shuttingDown)updates.check()},12000);push();
  } catch(e) {
    dialog.showErrorBox(".env Miner Startup Error", e.stack || e.message);
    throw e;
  }
}
let shuttingDown=false;async function shutdown(){if(shuttingDown)return;shuttingDown=true;bntTuneController?.abort();clearInterval(recordTimer);clearInterval(updateTimer);records?.capture(miner,hw.last||hw.inventory,fee,app.getVersion());if(cpuMiner)records?.capture(cpuMiner,hw.last||hw.inventory,cpuFee,app.getVersion());poolAccount?.stop();hw?.stop();network?.stop();await intelligence?.stop();try{if(fee)await stopAll('App exit');else await miner?.stop('App exit')}finally{quitting=true;floating?.destroy();tray?.destroy();app.quit()}}
app.on('before-quit',e=>{if(!quitting){e.preventDefault();shutdown()}});
