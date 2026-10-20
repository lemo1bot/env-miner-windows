'use strict';
const p=require('./ysr-protocol.cjs');
function args(config,gpu,logFile){
 if(!p.validAddress(config.wallets.YSR))throw Error('YSR requires a valid ysr1 mainnet address');
 if(gpu.vendor!=='NVIDIA'||!/^GPU-[a-f0-9-]{36}$/i.test(gpu.sensors?.uuid||''))throw Error('YSR kernel requires NVIDIA RTX 30 series or newer with valid UUID');
 const urls=require('./pool-catalog.cjs').poolUrls(config).map(p.validateApi);
 if(!urls.length)throw Error('Please select YSR HTTPS pool');
 return ['--mine','--wallet',config.wallets.YSR,'--worker',config.worker,'--device','0','--api',urls[0],...urls.slice(1).flatMap(u=>['--backup',u]),'--stop-file',logFile+'.stop'];
}
function network(raw,now=Date.now()){
 if(raw?.token?.token_symbol!=='YSR'||raw.token.decimals!==8||!Number.isSafeInteger(raw.height)||raw.height<0)throw Error('YSR network data identity or height invalid');
 const difficulty=Number(raw.difficultyWert??raw.difficulty),reward=Number(raw.nextReward)/1e8,networkHash=Number(raw.hashrate);
 if(!Number.isFinite(difficulty)||difficulty<=0||!Number.isFinite(reward)||reward<0||!Number.isFinite(networkHash)||networkHash<0)throw Error('YSR network data invalid');
 return {coin:'YSR',name:'YSKAR',algorithm:'SHA-256d / 136-byte header',unit:'H/s',height:raw.height,difficulty,difficultyText:String(raw.difficultyWert??raw.difficulty),networkHash,networkUnit:'H/s',networkAt:now,networkStale:false,networkSource:'.env YSR',price:null,priceAt:null,priceSource:null,priceStale:true,coinsPerUnitDay:reward*86400/(difficulty*65536),referenceAt:now,referenceStale:false,basis:'Estimated from current difficulty; actual payout subject to block variance',reward,blockSeconds:Number(raw.targetBlockTime)||600,models:[],fetchedAt:now,sourceUrl:p.PUBLIC_API,error:null};
}
function amount(v){if(typeof v!=='string'||!/^\d{1,30}$/.test(v))return null;const n=Number(v)/1e8;return Number.isFinite(n)?n:null}
function account(raw,wallet){
 if(raw?.address!==wallet||amount(raw.balance)===null||!Array.isArray(raw.history))throw Error('YSR address ledger format invalid');
 const rewards=raw.history.filter(r=>['pool','mining','solo','coinbase'].includes(r.kind));
 const rows=rewards.slice(0,10).map(r=>({at:/^\d{1,12}$/.test(String(r.timestamp))?Number(r.timestamp)*1000:null,amount:amount(r.amount),txid:/^[a-f0-9]{64}$/i.test(r.txid||'')?r.txid:null,status:'Direct block reward'}));
 return {balance:{confirmed:amount(raw.balance),pending:null,threshold:null},stats:{paid:rewards.length&&rewards.every(r=>amount(r.amount)!==null)?rewards.reduce((sum,r)=>sum+amount(r.amount),0):rewards.length?null:0,week:null,month:null},payouts:{count:rewards.length,rows}};
}
module.exports={...p,args,network,account};
