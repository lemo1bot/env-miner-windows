'use strict';
function validWallet(s){
 if(typeof s!=='string'||s.length!==60||!s.startsWith('o1')||s!==s.toLowerCase())return false;
 const chars='qpzry9x8gf2tvdw0s3jn54khce6mua7l',values=[3,0,15],gen=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
 for(const c of s.slice(2)){const n=chars.indexOf(c);if(n<0)return false;values.push(n)}
 let chk=1;for(const value of values){const top=chk>>>25;chk=(((chk&0x1ffffff)<<5)^value)>>>0;for(let i=0;i<5;i++)if((top>>>i)&1)chk=(chk^gen[i])>>>0}
 return chk===0x2bc830a3&&(chars.indexOf(s[53])&15)===0;
}
function compatibility(hardware,selected,kernel=require('./noid-kernels.json')['suprminer-noid-1.9.27']){
 const gpus=(hardware?.gpus||[]).filter(g=>selected.includes(g.id));
 return {cpu:'Windows x64 CPU; GPU mode, CPU used for scheduling',gpu:'NVIDIA Compute Capability >= 8.0; RTX 30 / 40 / 50 series',memory:'Recommended RAM >= 8 GB; pool mining does not require a full node',driver:kernel.minimumDriver?'NVIDIA driver >= 610 (Suprminer NOID requirement)':'Requires NVIDIA driver supporting CUDA 13',mode:'NOID · Poseidon2b · Standalone PoW',devices:gpus.map(g=>({id:g.id,name:g.name,status:g.vendor!=='NVIDIA'?'Unsupported: current kernel only supports NVIDIA':g.architecture&&['Kepler','Maxwell','Pascal','Volta','Turing'].includes(g.architecture)?'Unsupported: Ampere or newer architecture required':'Verifies CUDA compatibility at launch'})),blocked:gpus.some(g=>g.vendor!=='NVIDIA'||['Kepler','Maxwell','Pascal','Volta','Turing'].includes(g.architecture))};
}
function network(raw,now=Date.now()){
 const p=raw?.pool,n=p?.networkStats;
 if(p?.id!=='noid'||p.coin?.symbol!=='NOID'||p.coin?.algorithm!=='Poseidon2b'||![n?.networkHashrate,n?.networkDifficulty,p.blockTime,p.blockReward].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))throw Error('NOID pool network data invalid');
 return {coin:'NOID',name:'Parano1d',algorithm:'Poseidon2b',unit:'H/s',height:n.blockHeight,networkHash:n.networkHashrate,difficulty:n.networkDifficulty,networkUnit:'H/s',networkAt:now,networkStale:false,networkSource:'Suprnova NOID / Live query',price:null,priceAt:null,priceStale:true,priceSource:null,coinsPerUnitDay:86400/p.blockTime*p.blockReward/n.networkHashrate,referenceAt:now,referenceStale:false,reward:p.blockReward,blockSeconds:p.blockTime,models:[],basis:'Estimated from Suprnova network hashrate and block reward; PPLNS variance applies',sourceUrl:'https://noid.suprnova.cc/',fetchedAt:now,error:null};
}
function account(kind,data){
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 if(kind==='balance'){const confirmed=number(data?.pendingBalance),pending=number(data?.unconfirmedBalance);if(confirmed===null||pending===null)throw Error('NOID balance field invalid');return{confirmed,pending,threshold:number(data.payoutLimit)}}
 if(kind==='stats'){const paid=number(data?.totalPaid);if(paid===null)throw Error('NOID stats field invalid');return{paid,week:null,month:null}}
 if(!Array.isArray(data))throw Error('NOID payout history invalid');const rows=data.filter(r=>r.type==='Debit'&&r.status==='paid');
 return{count:rows.length,rows:rows.slice(0,10).map(r=>({at:Number.isFinite(Date.parse(r.created))?Date.parse(r.created):null,amount:number(r.amount),txid:typeof r.transactionConfirmationData==='string'&&/^[a-f0-9]{64}$/i.test(r.transactionConfirmationData)?r.transactionConfirmationData:null,status:'Paid'}))};
}
module.exports={validWallet,compatibility,network,account};
