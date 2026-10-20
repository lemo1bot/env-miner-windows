'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {validChoice}=require('./kernel-catalog.cjs');
const {poolChoices,recommendedBackups}=require('./pool-catalog.cjs');
const COIN_LIST=['PRL','QTC','TSC','NOID','YSR','ZCD','BNT','CMFD','NACR','XID','MDS','NRB','JTM'];
const DEFAULT={
  version:1,
  cpuThreads:0,
  zcdPassword:'x',
  noidConnection:'auto',
  noidConnectionVersion:2,
  poolRoutingVersion:1,
  ysrPoolVersion:1,
  zcdPoolVersion:1,
  bntPoolVersion:2,
  hashWindowMinutes:5,
  poolBackups:{
    BNT:[],
    ZCD:[],
    YSR:[],
    NOID:recommendedBackups('NOID',poolChoices('NOID')[0].url),
    PRL:recommendedBackups('PRL',poolChoices('PRL')[0].url),
    QTC:recommendedBackups('QTC',poolChoices('QTC')[0].url),
    TSC:[],
    CMFD:[],
    NACR:recommendedBackups('NACR',poolChoices('NACR')[0].url),
    XID:[],
    MDS:[],
    NRB:[],
    JTM:[]
  },
  kernels:{BNT:'auto',ZCD:'auto',YSR:'auto',NOID:'auto',PRL:'auto',QTC:'auto',TSC:'auto',CMFD:'auto',NACR:'auto',XID:'auto',MDS:'auto',NRB:'auto',JTM:'auto'},
  performance:75,
  shareBenchmarks:false,
  theme:'dark',
  language:'en',
  interval:2000,
  electricity:0.08,
  poolFee:0,
  temperature:90,
  selected:[],
  coin:'PRL',
  wallets:{
    BNT:'',
    ZCD:'0x027fe1ebf286b8a862cb080c47d2bce0457b92c77b785812cabe88eb71ea4d44',
    YSR:'',
    NOID:'',
    PRL:'prl1pnqcsmkjqludvtvlv9hsc2y5zhug3jnn29aca98q66385zmrutexsn3sf2x',
    QTC:'qzpGmeurcTtH7ao4HqxghzPdbFpCeky8F2iU2FcRdyL33Sgn1',
    TSC:'tc1qhnfytkdy6y0znzf0r9uakvww7qfpvnmfx3gujz',
    CMFD:'4c9aa957a2122a177734b9c50b8eaa1260525790b203048c88c3cba6f4d01c21',
    NACR:'nacr1pz0c9ysuazswzcy4j8x3083h0lhdmrfz3qakdcnnzuw0wx9usr0qsczvqzt',
    XID:'',
    MDS:'795f5d7a1f7a1e2268a9757d60b9ba9981d561d7b19c2e9508d7765e29d9a49d0aa09fd4',
    NRB:'NYpwEcqL7kv996izQWzB1iBEv62xJ4Y17v',
    JTM:'j1a5mcsk96aw55x7tkgfrp22ufd2cqef5k0s7vr6xj5gtk3p6pd9hqcvl0rc'
  },
  worker:'DotEnv',
  pools:{
    BNT:poolChoices('BNT')[0].url,
    ZCD:poolChoices('ZCD')[0].url,
    YSR:poolChoices('YSR')[0].url,
    TSC:poolChoices('TSC')[0].url,
    NOID:'stratum+ssl://stratum-apac.suprnova.cc:3341',
    PRL:poolChoices('PRL')[0].url,
    QTC:poolChoices('QTC')[0].url,
    CMFD:poolChoices('CMFD')[0].url,
    NACR:poolChoices('NACR')[0].url,
    XID:poolChoices('XID')[0].url,
    MDS:poolChoices('MDS')[0].url,
    NRB:poolChoices('NRB')[0].url,
    JTM:poolChoices('JTM')[0].url
  },
  manualWatts:null,
  manualInputs:{BNT:{},ZCD:{},YSR:{},NOID:{},PRL:{},QTC:{},TSC:{},CMFD:{},NACR:{},XID:{},MDS:{},NRB:{},JTM:{}}
};

function validatePool(value){
  if(typeof value!=='string'||value.length>280)throw Error('Invalid pool URL');
  const u=new URL(value);
  if(!['stratum+ssl:','stratum+tcp:','cmfd+tls:'].includes(u.protocol))throw Error('Pool URL requires stratum+ssl://, stratum+tcp://, or cmfd+tls://');
  if(!u.hostname)throw Error('Pool host required');
  if(u.protocol!=='cmfd+tls:'&&(u.username||u.password||u.search||u.hash||(u.pathname&&u.pathname!=='/')))throw Error('Pool parameters invalid');
  if(!u.port||+u.port<1||+u.port>65535)throw Error('Invalid pool port');
  return value;
}

function validate(c){
  if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Invalid configuration format');
  const out=structuredClone(DEFAULT);
  if(c.language!==undefined){if(!['zh-CN','en','ja','ru'].includes(c.language))throw Error('Unsupported language');out.language=c.language}
  if(c.theme!==undefined){if(!['dark','light'].includes(c.theme))throw Error('Invalid theme');out.theme=c.theme}
  for(const[k,min,max]of[['electricity',0,10],['poolFee',0,20],['temperature',50,95]])if(c[k]!==undefined){if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<min||c[k]>max)throw Error(k+' out of range');out[k]=c[k]}
  if(c.interval!==undefined){if(![1000,2000,3000,5000].includes(c.interval))throw Error('Invalid interval');out.interval=c.interval}
  if(c.manualWatts!==undefined){if(c.manualWatts!==null&&(!Number.isFinite(c.manualWatts)||c.manualWatts<1||c.manualWatts>20000))throw Error('Invalid power input');out.manualWatts=c.manualWatts}
  if(c.coin!==undefined){if(!COIN_LIST.includes(c.coin))throw Error('Invalid coin: '+c.coin);out.coin=c.coin}
  if(c.selected!==undefined){if(!Array.isArray(c.selected)||c.selected.length>32||c.selected.some(x=>typeof x!=='string'||!/^[a-f0-9]{20}$/.test(x)))throw Error('Invalid device selection');out.selected=[...new Set(c.selected)]}
  if(c.worker!==undefined){if(typeof c.worker!=='string'||!/^[A-Za-z0-9_.-]{1,32}$/.test(c.worker))throw Error('Worker name allows alphanumeric, dots, underscores, hyphens');out.worker=c.worker}
  for(const coin of COIN_LIST)if(c.wallets?.[coin]!==undefined){const w=c.wallets[coin];if(typeof w!=='string'||w.length>140||(w&&!/^[A-Za-z0-9]+$/.test(w)))throw Error('Wallet address format error');out.wallets[coin]=w}
  for(const coin of COIN_LIST)if(c.pools?.[coin]!==undefined)out.pools[coin]=coin==='ZCD'&&c.pools[coin]===''?'':coin==='YSR'?require('./ysr-protocol.cjs').validateApi(c.pools[coin]):validatePool(c.pools[coin]);

  if(c.noidConnection!==undefined){if(!['auto','native','compatible'].includes(c.noidConnection))throw Error('Invalid NOID connection mode');out.noidConnection=c.noidConnection}
  if(c.hashWindowMinutes!==undefined){if(![5,10].includes(c.hashWindowMinutes))throw Error('Hashrate window supports 5 or 10 min');out.hashWindowMinutes=c.hashWindowMinutes}
  if(c.poolBackups!==undefined&&(!c.poolBackups||typeof c.poolBackups!=='object'||Array.isArray(c.poolBackups)))throw Error('Invalid backup pool format');
  for(const coin of COIN_LIST){
    const backups=c.poolBackups?.[coin]??recommendedBackups(coin,out.pools[coin]);
    if(!Array.isArray(backups)||backups.length>2)throw Error('Max 2 backup pools per coin');
    out.poolBackups[coin]=[...new Set(backups.map(coin==='YSR'?require('./ysr-protocol.cjs').validateApi:validatePool))].filter(url=>url!==out.pools[coin]);
    for(const url of [out.pools[coin],...out.poolBackups[coin]].filter(Boolean)){const host=new URL(url).hostname;if(/^(prl|qtc)(?:-[a-z]+)?\.kryptex\.network$/.test(host)&&!host.startsWith(coin.toLowerCase()))throw Error('Pool URL does not match coin')}
  }
  if(c.kernels!==undefined){
    if(!c.kernels||typeof c.kernels!=='object'||Array.isArray(c.kernels))throw Error('Invalid kernel selection');
    for(const coin of COIN_LIST)if(c.kernels[coin]!==undefined){
      if(coin==='BNT'&&['gozero-bnt-0.1.0','gozero-bnt-0.2.0'].includes(c.kernels[coin])){out.kernels.BNT='auto';continue}
      if(coin==='NOID'&&c.kernels[coin]==='gozero-noid-0.2.0'){out.kernels.NOID='auto';continue}
      if(coin==='YSR'&&['gozero-ysr-0.1.0','gozero-ysr-0.1.1','gozero-ysr-0.1.2'].includes(c.kernels[coin])){out.kernels.YSR='auto';continue}
      if(!validChoice(coin,c.kernels[coin]))throw Error(coin+' unsupported kernel');
      out.kernels[coin]=c.kernels[coin];
    }
  }
  if(c.manualInputs!==undefined){
    for(const coin of COIN_LIST){
      const rows=c.manualInputs?.[coin]||{};
      if(typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>32)throw Error('Invalid manual inputs');
      for(const[id,r]of Object.entries(rows)){
        if(!/^[a-f0-9]{20}$/.test(id)||!r||!Number.isFinite(r.hash)||r.hash<0||r.hash>1e22||r.unit!==(coin==='TSC'?'N/s':'H/s')||(r.watts!==null&&(!Number.isFinite(r.watts)||r.watts<=0||r.watts>10000)))throw Error('Invalid manual inputs');
        out.manualInputs[coin][id]={hash:r.hash,unit:r.unit,watts:r.watts};
      }
    }
  }
  if(c.zcdPassword!==undefined){if(typeof c.zcdPassword!=='string'||c.zcdPassword.length>100||!/^[-a-zA-Z0-9_.,=:@/ ]*$/.test(c.zcdPassword))throw Error('Invalid ZCD password');out.zcdPassword=c.zcdPassword}
  if(c.cpuThreads!==undefined){if(!Number.isInteger(c.cpuThreads)||c.cpuThreads<0||c.cpuThreads>1024)throw Error('Invalid CPU threads');out.cpuThreads=c.cpuThreads}
  if(out.wallets.BNT)require('./bnt.cjs').address(out.wallets.BNT);
  if(out.wallets.ZCD&&!require('./zcd.cjs').validAddress(out.wallets.ZCD))out.wallets.ZCD=DEFAULT.wallets.ZCD;
  if(out.wallets.YSR&&!require('./ysr-protocol.cjs').validAddress(out.wallets.YSR))throw Error('YSR address must be valid ysr1 mainnet address');
  if(out.wallets.NOID&&!require('./noid.cjs').validWallet(out.wallets.NOID))throw Error('NOID address must be valid o1 mainnet bech32m address');
  if(out.wallets.PRL&&!out.wallets.PRL.startsWith('prl1'))throw Error('PRL address must start with prl1');
  if(out.wallets.NACR&&!out.wallets.NACR.startsWith('nacr1p'))throw Error('NACR address must start with nacr1p');
  if(out.wallets.XID&&!out.wallets.XID.startsWith('xpa1r'))throw Error('XID address must start with xpa1r');
  if(out.wallets.CMFD&&!/^[0-9a-fA-F]{64}$/.test(out.wallets.CMFD))throw Error('CMFD requires 64-character hexadecimal address');
  if(out.wallets.MDS&&!/^[0-9a-fA-F]{64,72}$/.test(out.wallets.MDS))throw Error('MDS requires valid hexadecimal address');
  if(out.wallets.NRB&&!out.wallets.NRB.startsWith('N'))throw Error('NRB address must start with N');
  if(out.wallets.JTM&&!out.wallets.JTM.startsWith('j1'))throw Error('JTM address must start with j1');
  if(out.coin==='NOID'&&out.worker.includes('.'))throw Error('NOID worker name does not support dots');
  if(c.performance!==undefined){if(!Number.isInteger(c.performance)||c.performance<50||c.performance>100)throw Error('Performance budget must be 50-100');out.performance=c.performance}
  if(c.shareBenchmarks!==undefined){if(typeof c.shareBenchmarks!=='boolean')throw Error('Invalid share setting');out.shareBenchmarks=c.shareBenchmarks}
  if(c.workbenchMode!==undefined&&!['gpu','cpu','dual'].includes(c.workbenchMode))throw Error('Invalid workbench mode');
  out.workbenchMode=c.workbenchMode||(['ZCD','BNT','NRB','JTM'].includes(out.coin)?'cpu':'gpu');
  if(c.taskProfiles!==undefined)out.taskProfiles=require('./dual-tasks.cjs').normalizeProfiles(out,c.taskProfiles,validate);
  return out;
}

class ConfigStore{
  constructor(dir){
    this.file=path.join(dir,'settings.json');
    this.value=structuredClone(DEFAULT);
    this.queue=Promise.resolve();
  }
  async load(){
    try{
      const raw=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(raw.noidConnectionVersion!==2){raw.noidConnection='auto';}
      if(raw.kernels?.NOID==='gozero-noid-0.2.0'){raw.kernels.NOID='auto';}
      const sanitizeSection=p=>{
        if(!p||typeof p!=='object')return;
        if(!p.pools)p.pools={};
        if(!p.poolBackups)p.poolBackups={};
        for(const coin of COIN_LIST){
          const cur=p.pools[coin],def=poolChoices(coin)[0]?.url||'';
          if(!cur||cur.includes('gozero.trade')||(coin==='QTC'&&cur.includes('kryptex.network'))||(coin==='NACR'&&(cur.includes('4008')||cur.includes('herominers')))||(coin==='ZCD'&&(cur.includes('zcd.stratum.network')||cur.includes('gozero.trade')))){
            p.pools[coin]=def;
          }
          if(Array.isArray(p.poolBackups[coin])){
            p.poolBackups[coin]=p.poolBackups[coin].filter(u=>!u.includes('gozero.trade')&&!(coin==='QTC'&&u.includes('kryptex.network'))&&!(coin==='PRL'&&u.includes('kryptex.network'))&&!(coin==='NACR'&&(u.includes('4008')||u.includes('herominers'))&&!(coin==='ZCD'&&(u.includes('zcd.stratum.network')||u.includes('gozero.trade')))));
            if(coin==='NACR'&&!p.poolBackups.NACR.length)p.poolBackups.NACR=['stratum+tcp://pool.nacre.network:3333'];
            if(coin==='QTC'&&!p.poolBackups.QTC.length)p.poolBackups.QTC=['stratum+ssl://quantus.qelvhash.com:4443'];
          }
        }
        if(p.kernels){
          if(p.kernels.NACR==='nacr-vps'||p.kernels.NACR==='nacr-local-1.0.0')p.kernels.NACR='auto';
          if(p.kernels.CMFD==='cmfd-vps')p.kernels.CMFD='auto';
          if(p.kernels.XID==='xid-vps')p.kernels.XID='auto';
          if(p.kernels.TSC==='tsc-vps')p.kernels.TSC='auto';
        }
        if(p.wallets){
          if(p.wallets.QTC==='qzoLM98Mvc4Qufn62hy2KxydBUnyyTxokNftuhguUAcxTDLea')p.wallets.QTC=DEFAULT.wallets.QTC;
          if(!p.wallets.ZCD||!p.wallets.ZCD.startsWith('0x02')||p.wallets.ZCD.length!==66||p.wallets.ZCD.startsWith('0x01')||p.wallets.ZCD.includes('2eb033')||p.wallets.ZCD.includes('7637c5')||p.wallets.ZCD.includes('19b4eb'))p.wallets.ZCD=DEFAULT.wallets.ZCD;
          if(!p.wallets.TSC)p.wallets.TSC=DEFAULT.wallets.TSC;
          if(!p.wallets.CMFD)p.wallets.CMFD=DEFAULT.wallets.CMFD;
          if(!p.wallets.NACR)p.wallets.NACR=DEFAULT.wallets.NACR;
        }
      };
      sanitizeSection(raw);
      if(raw.taskProfiles)for(const prof of Object.values(raw.taskProfiles))sanitizeSection(prof);
      this.value=validate(raw);
    }catch(e){
      if(e.code!=='ENOENT')this.warning='Config corrupted or incompatible; using defaults.';
    }
    return this.value;
  }
  update(fn){
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      const next=validate(fn(this.value));
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const tmp=this.file+'.tmp';
      await fs.writeFile(tmp,JSON.stringify(next,null,2),'utf8');
      await fs.rename(tmp,this.file);
      this.value=next;
      return next;
    });
    return this.queue;
  }
  save(value){
    const next=validate(value);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const tmp=this.file+'.tmp';
      await fs.writeFile(tmp,JSON.stringify(next,null,2),'utf8');
      await fs.rename(tmp,this.file);
      this.value=next;
      return next;
    });
    return this.queue;
  }
}

module.exports={DEFAULT,validate,validatePool,ConfigStore,COIN_LIST};
