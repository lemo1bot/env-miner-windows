'use strict';
function poolChoices(coin){
 if(coin==='BNT')return[{label:'bntpool.com · TCP',url:'stratum+tcp://bntpool.com:3333'}];
 if(coin==='ZCD')return[
  {label:'ZCD Pool · TCP 9425 (Live)',url:'stratum+tcp://pool.zcd.lol:9425'},
  {label:'VeinPool · TCP 3300',url:'stratum+tcp://veinpool.fr:3300'}
 ];
 if(coin==='YSR')return[{label:'YSR Community · HTTPS',url:require('./ysr-protocol.cjs').PUBLIC_API}];
 if(coin==='TSC')return[{label:'Suprnova · TCP 3310',url:'stratum+tcp://tsc.suprnova.cc:3310'}];
 if(coin==='NOID')return[['stratum-apac.suprnova.cc','APAC'],['noid.suprnova.cc','Europe'],['stratum-us.suprnova.cc','North America']].map(([host,label])=>({label:'Suprnova · '+label,url:'stratum+ssl://'+host+':3341'}));
 if(coin==='PRL')return[
  {label:'HeroMiners · Europe (TCP 1200)',url:'stratum+tcp://de.pearl.herominers.com:1200'},
  {label:'HeroMiners · North America (TCP 1200)',url:'stratum+tcp://us.pearl.herominers.com:1200'},
  {label:'PearlHash · Global (TCP 9000)',url:'stratum+tcp://pool.pearlhash.xyz:9000'}
 ];
 if(coin==='QTC')return[
  {label:'Qelvpool · Stratum TCP 4444 (Live)',url:'stratum+tcp://quantus.qelvhash.com:4444'},
  {label:'Qelvpool · Stratum TLS 4443',url:'stratum+ssl://quantus.qelvhash.com:4443'}
 ];
 if(coin==='CMFD')return[
  {label:'AriaPool · TLS (Mainnet)',url:'cmfd+tls://159.69.194.46:29445?pin=9dfb51083f287726117f689f87bc7a878792efcca58ca8b6f6e7c05ac5d152e9'},
  {label:'AriaPool · Global',url:'stratum+tcp://pool.ariabrain.com:29445'}
 ];
 if(coin==='NACR')return[
  {label:'NacrePool · Stratum 5566 (Live)',url:'stratum+tcp://stratum.nacrepool.com:5566'},
  {label:'Nacre Reference · Stratum 3333',url:'stratum+tcp://pool.nacre.network:3333'}
 ];
 if(coin==='XID')return[
  {label:'AriaPool · Stratum 3344',url:'stratum+tcp://xid.ariabrain.com:3344'}
 ];
 if(coin==='MDS')return[
  {label:'Midstate Pool · Stratum TCP 3333',url:'stratum+tcp://pool.midstate.cash:3333'},
  {label:'Midstate Global · Stratum 3334',url:'stratum+tcp://stratum.midstate.cash:3334'}
 ];
 if(coin==='NRB')return[
  {label:'Official Nerbus Pool · TCP 39480',url:'stratum+tcp://pool.nerbus.com:39480'}
 ];
 if(coin==='JTM')return[
  {label:'Jetsam Network Pool · TCP 8666',url:'stratum+tcp://pool.jetsamchain.com:8666'},
  {label:'Jetsam Local Relay · TCP 8666',url:'stratum+tcp://127.0.0.1:8666'}
 ];
 return [];
}
function recommendedBackups(coin,primary){const rows=poolChoices(coin);return rows.some(r=>r.url===primary)?rows.slice(0,3).filter(r=>r.url!==primary).slice(0,2).map(r=>r.url):[]}
function poolUrls(config){return [...new Set([config.pools[config.coin],...(config.poolBackups?.[config.coin]||[])].filter(Boolean))]}
module.exports={poolChoices,recommendedBackups,poolUrls};
