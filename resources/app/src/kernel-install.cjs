'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const EXTRACTOR=path.join(__dirname,'../vendor/ExtractKernel.exe');
const ERRORS={INVALID_ARGUMENTS:'Invalid extraction arguments',UNSAFE_PATH:'Unsafe archive or target path',INVALID_ARCHIVE:'Archive corrupted or invalid',MISSING_KERNEL:'Missing kernel executable in archive',HASH_MISMATCH:'Kernel SHA256 checksum mismatch',ACCESS_DENIED:'Permission denied writing to kernel directory',IO_ERROR:'Cannot write kernel file (disk full or locked)',EXTRACT_FAILED:'Extraction failed, please retry'};
function extractionError(e){
 if(e.code==='ENOENT')return Error('Extraction component missing, please reinstall the application');
 if(e.code==='EACCES'||e.code==='EPERM')return Error('System blocked extraction component, check file permissions');
 if(e.killed)return Error('Extraction timed out, please check disk performance');
 try{const result=JSON.parse(String(e.stdout).trim());if(Object.hasOwn(ERRORS,result.code))return Error(ERRORS[result.code])}catch{}
 return Error('Extraction tool failed, please reinstall the application');
}
async function extract(zip,dir,expectedHash,metadata){try{const bundle=metadata?.files;const {stdout}=await promisify(execFile)(bundle?path.join(__dirname,'../vendor/ExtractBundle.exe'):EXTRACTOR,bundle?[zip,dir,JSON.stringify({root:metadata.archiveRoot,files:bundle})]:[zip,dir,expectedHash],{windowsHide:true,timeout:60000,maxBuffer:65536,encoding:'utf8'});if(JSON.parse(stdout.trim()).ok!==true)throw Error('Invalid result')}catch(e){throw extractionError(e)}}
async function installKernel({dir,exe,metadata,request,update,log,extractArchive=extract}){
 const zip=path.join(dir,'download.zip');let received=0,total=null,lastBucket=-1,lastLog=0;
 const stage=(name,message,error=null)=>{update({stage:name,received,total,error,version:metadata.version});log('Kernel',message)};
 try{
  await fs.mkdir(dir,{recursive:true});stage('connecting',metadata.bundled?'Verifying bundled kernel files':'Connecting to '+(metadata.name||'KRig')+' '+metadata.version+' download source');
  if(metadata.installed||!metadata.url){
    try{await fs.access(exe);stage('ready','Engine ready: '+(metadata.name||'Engine')+' '+(metadata.version||'1.0.0')+'; Mining not started');return true;}catch{}
   }
   if(metadata.bundled){
   if(!['ysr','bnt'].includes(metadata.bundleDirectory)||!metadata.files)throw Error('Bundled kernel metadata invalid');
   stage('verifying','Verifying bundled engine '+metadata.name);const source=path.join(__dirname,'../native',metadata.bundleDirectory);
   const files=[];for(const [name,expected] of Object.entries(metadata.files)){if(path.basename(name)!==name)throw Error('Invalid kernel file name');const body=await fs.readFile(path.join(source,name));if(hash(body)!==expected)throw Error('Bundled kernel checksum failed: '+name);files.push([name,body])}
   stage('extracting','Installing bundled engine');for(const [name,body] of files){const tmp=path.join(dir,name+'.tmp');await fs.writeFile(tmp,body);await fs.rename(tmp,path.join(dir,name))}
   stage('ready','Engine ready: '+metadata.name+' '+metadata.version+'; Mining not started');return true;
  }
  let body;for(let attempt=0;attempt<3;attempt++){
  received=0;total=null;lastBucket=-1;
  if(attempt)stage('connecting','Retry '+(attempt+1)+'/3 · Connecting to kernel download source');
  try{body=await request(metadata.url,{direct:attempt===1,maxBytes:256*1024*1024,timeout:300000,connectTimeout:15000,stallTimeout:25000,onProgress:p=>{
   received=p.received;total=p.total;update({stage:'downloading',received,total,error:null,version:metadata.version});
   const bucket=total?Math.floor(received/total*10):0;
   if(bucket!==lastBucket||Date.now()-lastLog>=5000){lastBucket=bucket;lastLog=Date.now();log('Kernel','Downloading '+(received/1048576).toFixed(1)+' MB'+(total?' / '+(total/1048576).toFixed(1)+' MB · '+Math.min(100,Math.floor(received/total*100))+'%':''))}
  }});break}catch(e){if(attempt===2)throw Error('Download failed: '+e.message);log('Kernel','Download connection failed, retrying: '+e.message)}
  }
  received=body.length;stage('verifying','Download complete, verifying archive SHA256');
  if(hash(body)!==metadata.sha256)throw Error('Kernel download SHA256 mismatch, installation aborted');
  await fs.writeFile(zip,body);stage('extracting','Integrity passed; extracting with bundled component');await extractArchive(zip,dir,metadata.exeSha256,metadata);
  stage('checking','Extraction complete, verifying executable SHA256');
  if(hash(await fs.readFile(exe))!==metadata.exeSha256)throw Error('Kernel executable verification failed');
  if(metadata.files)for(const [name,expected] of Object.entries(metadata.files))if(hash(await fs.readFile(path.join(dir,name)))!==expected)throw Error('Kernel dependency verification failed: '+name);
  stage('ready','Engine ready: '+(metadata.name||'KRig')+' '+metadata.version+'; Mining not started');return true;
 }catch(e){stage('error','Installation failed: '+e.message,e.message);throw e}
 finally{await fs.unlink(zip).catch(()=>{})}
}
module.exports={installKernel,extract,extractionError};
