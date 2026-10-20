'use strict';
const {poolUrls}=require('./pool-catalog.cjs');
const UUID=/^GPU-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function device(config,gpu,kernel){
 if(!require('./noid.cjs').validWallet(config.wallets.NOID))throw Error('Please enter a valid NOID mainnet payout address');
 if(gpu.vendor!=='NVIDIA'||!gpu.pci||!/^\w{2,}:\w{2}\.[0-7]$/.test(gpu.pci))throw Error('NOID requires NVIDIA GPU with valid PCI address');
 if(['Kepler','Maxwell','Pascal','Volta','Turing'].includes(gpu.architecture))throw Error('NOID requires Ampere or newer architecture');
 if(!UUID.test(gpu.sensors?.uuid||''))throw Error('Kernel requires NVIDIA GPU UUID, please rescan devices');
 if(!Number.isFinite(gpu.sensors?.temp)||!Number.isFinite(gpu.sensors?.at)||Date.now()-gpu.sensors.at>10000)throw Error('Kernel requires active GPU temperature reading');
 if(kernel.minimumDriver&&(!/^\d{3,}\.\d+/.test(gpu.driver||'')||Number(gpu.driver.split('.')[0])<kernel.minimumDriver))throw Error(kernel.name+' NOID requires NVIDIA '+kernel.minimumDriver+' or newer driver');
}
function args(config,gpu,logFile,kernel){
 device(config,gpu,kernel);const pools=poolUrls(config);
 // Each guarded child sees only its selected physical UUID, so CUDA index 0
 // stays correct even for mixed cards or reordered Windows adapters.
 const user=config.wallets.NOID+'.'+config.worker;
 if(kernel.name==='Suprminer')return['-a','noid','-o',pools[0],'-u',user,'-p','x','--no-cpu','-d','0'];
 if(kernel.name==='Fl4shMiner')return['-a','noid',...pools.flatMap(url=>['--pool',url]),'-w',user,'-pass','x','-d','0','--ui','off','--no-color','--ascii','--noid-keep-warm=false','--pool-auto-region=false'];
 throw Error('Unsupported NOID kernel');
}
module.exports={args,device,UUID};
