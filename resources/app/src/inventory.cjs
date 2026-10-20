'use strict';
const path=require('node:path');
const run=require('node:util').promisify(require('node:child_process').execFile);
const FILE=path.join(__dirname,'../vendor/Inventory.exe');
function scanError(error){
 if(error.code==='ENOENT')return Error('Hardware scanner missing, please reinstall the application');
 if(error.killed||error.code==='ETIMEDOUT')return Error('Hardware scan timed out, please retry; check Windows WMI service');
 if(error.code==='EACCES'||error.code==='EPERM')return Error('Windows blocked hardware scanner, please check antivirus permissions');
 if(String(error.stderr||'').includes('INVENTORY_UNAVAILABLE'))return Error('Windows hardware service unavailable, check WMI service');
 return Error('Hardware scanner failed to run, please retry');
}
async function readInventory(execute=run){
 let stdout;try{({stdout}=await execute(FILE,[],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8'}))}catch(error){throw scanError(error)}
 try{const raw=JSON.parse(stdout.replace(/^\uFEFF/,''));if(!raw||typeof raw!=='object'||!['gpus','cpu','memory','board','bios','os','cache','warnings'].every(k=>Array.isArray(raw[k])))throw Error();if(raw.gpus.some(g=>!g||typeof g.pnp!=='string'||typeof g.name!=='string'))throw Error();return raw}catch{throw Error('Hardware scan output invalid, please reinstall the application')}
}
module.exports={readInventory,scanError,FILE};
