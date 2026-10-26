'use strict';
const KRIG=Object.freeze({version:'1.5.4',url:'https://github.com/kryptex-miners-org/kryptex-miners/releases/download/krig-1-5-4/krig-miner-1.5.4-win-x64.zip',sha256:'648ad3f88d530d21efe08bf071000e2ec555b3bd26fb94541a37d4b4e2afe7a6',exeSha256:'954d688058a6ec650f2de5101cb8f3d5cef2ce88f9397ff1d21df3e6e4efc7f2',source:'https://miner.download/en/krig/description/'});
const ID='krig-1.5.4';
const NOID_KERNELS=require('./noid-kernels.json');
const YSR_KERNEL=require('./ysr-kernel.json');
function choices(coin){
 if(coin==='BNT'){const k=require('./bnt-kernel.json');return[{id:'auto',label:'Recommended · .env Blocknet CPU '+k.version,disabled:false},{id:k.id,label:'.env Blocknet CPU · AVX2 / AVX-512 / SSE2 · Kernel fee 0%',disabled:false},{id:require('./bnt-seine-kernel.json').id,label:'Seine 0.2.15 · CPU · Kernel fee 2.5% (bntpool 1%)',disabled:false}]}
 if(coin==='ZCD')return[{id:'auto',label:'Recommended · Official XMRig 6.26.0',disabled:false},{id:'xmrig-zcd-6.26.0',label:'Official XMRig 6.26.0 · Ready',disabled:false},{id:require('./zcd-local-kernel.json').id,label:'.env XMRig CPU 6.26.0-cpu.2 · Kernel fee 0%',disabled:false}];
 if(coin==='YSR')return[{id:'auto',label:'Recommended · .env YSR CUDA '+YSR_KERNEL.version,disabled:false},{id:YSR_KERNEL.id,label:'.env YSR CUDA '+YSR_KERNEL.version+' · Built-in',disabled:false}];
 if(coin==='NOID')return[{id:'auto',label:'Recommended · Suprminer 1.9.27',disabled:false},...Object.values(NOID_KERNELS).map(k=>({id:k.id,label:k.name+' '+k.version+' · Official Download',disabled:false}))];
 if(coin==='NACR'||coin==='PRL'||coin==='QTC')return[{id:'auto',label:'Recommended · KRig 1.5.4',disabled:false},{id:ID,label:'KRig 1.5.4 · GPU Miner',disabled:false}];
 if(coin==='CMFD')return[{id:'auto',label:'Recommended · Common Foundry GPU 1.0.0 (CUDA)',disabled:false},{id:'cmfd-gpu-1.0.0',label:'Common Foundry GPU 1.0.0 · ForgeMatrix',disabled:false}];
 if(coin==='XID')return[{id:'auto',label:'Recommended · xCoin MetalDAG GPU 1.0.0 (CUDA)',disabled:false},{id:'xid-gpu-1.0.0',label:'xCoin MetalDAG GPU 1.0.0 · MetalDAG',disabled:false}];
 if(coin==='TSC')return[{id:'auto',label:'Recommended · TensorCash GPU 1.0.0 (CUDA)',disabled:false},{id:'tsc-gpu-1.0.0',label:'TensorCash GPU 1.0.0 · Proof of Inference',disabled:false}];
 if(coin==='MDS')return[{id:'auto',label:'Recommended · Midstate BLAKE3 Miner 1.0.0',disabled:false},{id:'mds-miner-1.0.0',label:'Midstate BLAKE3 Miner 1.0.0 · Sequential BLAKE3',disabled:false}];
 if(coin==='NRB')return[{id:'auto',label:'Recommended · Nerbus VerusHash CPU Miner 1.0.0',disabled:false},{id:'nrb-cpu-1.0.0',label:'Nerbus CPU Miner 1.0.0 · VerusHash 2.2',disabled:false}];
 if(coin==='JTM')return[{id:'auto',label:'Recommended · Jetsam TowerMiner CPU 1.5.1',disabled:false},{id:'towerminer-1.5.1',label:'towerminer 1.5.1 · TowerWalk PoW',disabled:false}];
 if(coin==='RGR')return[{id:'auto',label:'Recommended · Rigor OpuHash GPU Miner 1.0.0 (CUDA)',disabled:false},{id:'rigor-gpu-1.0.0',label:'Rigor GPU Miner 1.0.0 · OpuHash SHA3-256 (CUDA)',disabled:false},{id:'rigor-miner-0.2.0',label:'Rigor Miner 0.2.0 · OpuHash PoW',disabled:false}];
 return [{id:'auto',label:'Recommended · Engine Ready',disabled:false}];
}
function validChoice(coin,id){return choices(coin).some(c=>!c.disabled&&c.id===id)}
function resolve(config){
 const selection=config.kernels?.[config.coin]??'auto';
 if(!validChoice(config.coin,selection))throw Error('Selected engine not supported for this coin');
 if(config.coin==='BNT')return{...(selection===require('./bnt-seine-kernel.json').id?require('./bnt-seine-kernel.json'):require('./bnt-kernel.json')),selection};
 if(config.coin==='ZCD')return{...(selection==='gozero-xmrig-cpu-6.26.0-2'?require('./zcd-local-kernel.json'):require('./zcd-kernel.json')),selection,installed:true};
 if(config.coin==='YSR')return{...require('./ysr-kernel.json'),selection};
 if(config.coin==='NOID')return{...(NOID_KERNELS[selection]||NOID_KERNELS['suprminer-noid-1.9.27']),selection};
 if(config.coin==='NACR')return{id:ID,selection,...KRIG,name:'KRig',version:'1.5.4',algorithm:'PearlHash AuxPoW',installed:true};
 if(config.coin==='CMFD')return{id:'cmfd-gpu-1.0.0',name:'Common Foundry GPU',version:'1.0.0',exe:'cmfd-miner.exe',selection,installed:true};
 if(config.coin==='XID')return{id:'xid-gpu-1.0.0',name:'xCoin MetalDAG GPU',version:'1.0.0',exe:'xid-miner.exe',selection,installed:true};
 if(config.coin==='TSC')return{id:'tsc-gpu-1.0.0',name:'TensorCash GPU',version:'1.0.0',exe:'tsc-miner.exe',selection,installed:true};
 if(config.coin==='MDS')return{id:'mds-miner-1.0.0',name:'Midstate BLAKE3 Miner',version:'1.0.0',exe:'mds-miner.exe',selection,installed:true};
 if(config.coin==='NRB')return{id:'nrb-cpu-1.0.0',name:'Nerbus VerusHash CPU Miner',version:'1.0.0',exe:'nrb-miner.exe',selection,installed:true};
 if(config.coin==='JTM')return{id:'towerminer-1.5.1',name:'towerminer',version:'1.5.1',exe:'towerminer.exe',selection,installed:true};
 if(config.coin==='RGR'){const isOfficial=(selection==='rigor-miner-0.2.0');return{id:'rigor-miner-0.2.0',name:isOfficial?'Rigor Chain Official Miner':'Rigor OpuHash GPU Miner',version:isOfficial?'0.2.0':'1.0.0',exe:isOfficial?'rigor-core.exe':'rigor-miner.exe',selection,installed:true};}
 return{id:ID,selection,...KRIG};
}
module.exports={KRIG,choices,validChoice,resolve};
