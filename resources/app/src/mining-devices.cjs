'use strict';
const crypto=require('node:crypto');
const {cpuThreadBudget}=require('../renderer/performance.js');
function cpuDevice(hw){
 const rows=(hw?.cpu||[]).filter(c=>c.Name&&Number(c.NumberOfLogicalProcessors)>0);
 if(!rows.length)return null;
 const logical=rows.reduce((n,c)=>n+Number(c.NumberOfLogicalProcessors),0);
 const name=rows.map(c=>String(c.Name).trim()).join(' + ');
 return {id:crypto.createHash('sha256').update('CPU:'+name+':'+logical).digest('hex').slice(0,20),name,kind:'CPU',vendor:/AMD/i.test(name)?'AMD':/Intel/i.test(name)?'Intel':'CPU',logical,cores:rows.reduce((n,c)=>n+Number(c.NumberOfCores||0),0),maxThreads:logical,sensors:null};
}
function miningDevices(config,hw){const isCpuTask=['ZCD','BNT','NRB','JTM'].includes(config?.coin)||(config?.coin==='RGR'&&config?.workbenchMode==='cpu');if(isCpuTask)return [cpuDevice(hw)].filter(Boolean);const sel=Array.isArray(config?.selected)?config.selected:(hw?.gpus||[]).map(g=>g.id);return (hw?.gpus||[]).filter(g=>sel.includes(g.id));}
function workerCount(config){const isCpuTask=['ZCD','BNT','NRB','JTM'].includes(config?.coin)||(config?.coin==='RGR'&&config?.workbenchMode==='cpu');if(isCpuTask)return 1;return Array.isArray(config?.selected)?config.selected.length:1;}
function cpuThreads(config,hw){if(config.coin==='BNT')return require('./bnt.cjs').threads(config,hw);const cpu=cpuDevice(hw);if(!cpu)throw Error('No supported CPU detected');const n=config.cpuThreads||cpuThreadBudget(cpu,config.performance);if(!Number.isInteger(n)||n<1||n>cpu.maxThreads)throw Error('CPU thread count exceeds available limit, please adjust settings');return n}
module.exports={cpuDevice,miningDevices,workerCount,cpuThreads};
