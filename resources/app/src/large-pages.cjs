'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const exec=require('node:util').promisify(require('node:child_process').execFile);
let currentToken=false;
async function preference(dir){try{const r=JSON.parse(await fs.readFile(path.join(dir,'large-pages.json'),'utf8'));return r.enabled===true&&Number.isFinite(Date.parse(r.enabledAt))?r:null}catch{return null}}
function status(r,pref){
 if(!r||!r.ok)throw Error('Failed to read large page status');
 return {...r,preferred:!!pref,phase:r.tokenAvailable?(r.allocationAvailable?'available':'allocation-failed'):(r.assigned===true||r.assigned==null&&pref?'pending':'disabled')};
}
class LargePages {
 constructor(dir,{run=exec}={}){this.dir=dir;this.run=run;this.value={phase:'checking'};this.busy=false;}
 snapshot(){return {...this.value,busy:this.busy}}
 async invoke(mode){let output;try{output=await this.run(path.join(__dirname,'../vendor/LargePages.exe'),[mode],{windowsHide:true,timeout:mode==='--request'?180000:10000,maxBuffer:65536})}catch(e){if(!e.stdout)throw Error('Large pages tool interrupted; please refresh status');output=e}let r;try{r=JSON.parse(output.stdout.trim())}catch{throw Error('Large pages tool returned invalid output')}if(!r.ok)throw Error(r.cancelled?'Administrator authorization cancelled':'Large pages configuration failed · Windows '+(r.errorCode||r.error||'unknown'));return r;}
 async refresh(){try{this.value=status(await this.invoke('--status'),await preference(this.dir));currentToken=!!this.value.tokenAvailable;return this.snapshot()}catch(e){this.value={phase:'error',error:e.message};return this.snapshot()}}
 async enable(){if(this.busy)throw Error('Large pages setup in progress');this.busy=true;try{const r=await this.invoke('--request');if(r.granted!==true)throw Error('Large pages privilege not granted');const pref={enabled:true,enabledAt:new Date().toISOString()};await fs.mkdir(this.dir,{recursive:true});await fs.writeFile(path.join(this.dir,'large-pages.json'),JSON.stringify(pref));this.value=status(r,pref);return this.snapshot()}finally{this.busy=false}}
}
module.exports={LargePages,preference,status,tokenAvailable:()=>currentToken};
