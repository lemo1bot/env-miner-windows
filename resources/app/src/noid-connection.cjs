'use strict';
const net = require('node:net');
const tls = require('node:tls');
const {poolUrls} = require('./pool-catalog.cjs');
const OFFICIAL = new Set(['noid.suprnova.cc', 'stratum-apac.suprnova.cc', 'stratum-us.suprnova.cc']);

function publicIPv4(ip) {
 if (net.isIP(ip) !== 4) return false;
 const [a,b] = ip.split('.').map(Number);
 return a > 0 && a < 224 && a !== 10 && a !== 127 &&
  !(a===100 && b>=64 && b<=127) && !(a===169 && b===254) &&
  !(a===172 && b>=16 && b<=31) && !(a===192 && [0,168].includes(b)) &&
  !(a===198 && [18,19,51].includes(b)) && !(a===203 && b===0);
}

function dnsAnswers(data, host) {
 if (data.Status !== 0 || data.TC || !Array.isArray(data.Question) ||
     !data.Question.some(q=>q.type===1 && q.name.replace(/\.$/,'').toLowerCase()===host)) throw Error('Invalid DNS response');
 // Follow only the returned CNAME chain, never unrelated additional records.
 const allowed = new Set([host]);
 const rows = Array.isArray(data.Answer) ? data.Answer : [];
 const name = value => typeof value==='string' ? value.toLowerCase().replace(/\.$/,'') : '';
 for(let i=0;i<8;i++) for(const r of rows) if(r.type===5 && allowed.has(name(r.name))) allowed.add(name(r.data));
 const ips=[...new Set(rows.filter(r=>r.type===1 && allowed.has(name(r.name)) && publicIPv4(r.data)).map(r=>r.data))].slice(0,2);
 if(!ips.length) throw Error('DNS did not return valid public IPv4');
 return ips;
}

async function resolveOfficial(host, request, signal) {
 if(!OFFICIAL.has(host)) throw Error('Compatible connection only supports official Suprnova NOID nodes');
 const raw=await request('https://dns.google/resolve?name='+encodeURIComponent(host)+'&type=A', {maxBytes:32768,timeout:4000,signal});
 signal?.throwIfAborted();
 return dnsAnswers(JSON.parse(Buffer.isBuffer(raw)?raw.toString('utf8'):raw),host);
}

// A successful TCP handshake alone is insufficient: require the NOID subscribe reply.
// No wallet, authorization, GPU work or share submission is performed here.
function probe(url, {signal, timeout=5000}={}) {
 return new Promise((resolve,reject)=>{
  if(signal?.aborted) return reject(signal.reason);
  const u=new URL(url), secure=u.protocol==='stratum+ssl:';
  let done=false, buffer='', bytes=0, socket;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);socket?.destroy();error?reject(error):resolve(value)};
  const abort=()=>finish(signal.reason||Error('Connection check cancelled'));
  const timer=setTimeout(()=>finish(Error('Connection / protocol timeout')),timeout);
  signal?.addEventListener('abort',abort,{once:true});
  try {
   const options={host:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port)};
   socket=secure?tls.connect({...options,rejectUnauthorized:true,...(!net.isIP(options.host)?{servername:options.host}:{})}):net.connect(options);
   socket.once(secure?'secureConnect':'connect',()=>socket.write(JSON.stringify({id:1,method:'mining.subscribe',params:['DotEnv-connection-check']})+'\n'));
   socket.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>32768)return finish(Error('Pool response too large'));
    buffer+=chunk.toString('utf8');
    let index;
    while((index=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;
     let reply;try{reply=JSON.parse(line)}catch{return finish(Error('Pool response is not JSON'))}
     if(reply.id!==1)continue;
     if(reply.error || reply.result?.protocol!=='parano1d-stratum-v1')return finish(Error('NOID protocol validation failed'));
     return finish(null,{url,protocol:reply.result.protocol});
    }
   });
   socket.once('error',e=>finish(Error(e.code||e.message)));
   socket.once('close',()=>finish(Error('Pool closed connection prematurely')));
  }catch(e){finish(e)}
 });
}

async function prepare(config, {request,log=()=>{},signal,resolve=resolveOfficial,check=probe}={}) {
 const bounded=AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])]);
 const mode=config.noidConnection||'auto',configured=poolUrls(config);
 const eligible=value=>{const u=new URL(value);return OFFICIAL.has(u.hostname)&&['3337','3341'].includes(u.port)};
 if(mode==='compatible'&&configured.some(value=>!eligible(value)))throw Error('Compatible mode only supports official Suprnova NOID nodes (ports 3337/3341); for custom pools select Auto or Native');
 const phases=mode==='auto'?[false,true]:[mode==='compatible'];
 const failures=[];
 for(const compatible of phases){
  const candidates=compatible?configured.filter(eligible):configured;
  if(!candidates.length)continue;
  bounded.throwIfAborted();
  log('Connection',compatible?(mode==='auto'?'Native connection failed, trying compatible TCP (unencrypted)':'Checking compatible TCP connection (unencrypted)'):'Checking native pool connection');
  for(const original of candidates){
   bounded.throwIfAborted();const host=new URL(original).hostname;
   try{
    const urls=compatible?(await resolve(host,request,bounded)).map(ip=>'stratum+tcp://'+ip+':3337'):[original];
    for(const url of urls){
     bounded.throwIfAborted();
     try{
      await check(url,{signal:bounded});bounded.throwIfAborted();
      const result=structuredClone(config);result.pools.NOID=url;result.poolBackups.NOID=[];
      log('Connection',host+' → '+url+' · NOID protocol handshake passed');
      return {config:result,original,url,protocol:'parano1d-stratum-v1',compatible};
     }catch(e){bounded.throwIfAborted();failures.push(host+': '+e.message);log('Connection',host+' · '+e.message)}
    }
   }catch(e){bounded.throwIfAborted();failures.push(host+': '+e.message);log('Connection',host+' · '+e.message)}
  }
 }
 throw Error('Pool connection check failed: '+failures.join('; ')+(mode==='native'?'. Try Auto or Compatible TCP mode.':'. Please check network or select a different pool.'));
}
module.exports={prepare,probe,resolveOfficial,dnsAnswers,publicIPv4,OFFICIAL};
