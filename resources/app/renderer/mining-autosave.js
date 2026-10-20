'use strict';
(()=>{
 const edits=new Set();let saved=false;
 const status=node('span','mining-save-state','Settings save automatically');status.id='mining-save-state';status.setAttribute('role','status');$('#start').before(status);
 const queue=new GozerAutosave.Queue(async values=>{
  if(Object.hasOwn(values,'performance'))await enqueueConfig(async()=>{state.config=await api.performance(values.performance);render()});
  const cfg=state.config,coin=cfg.coin,patch={};
  for(const[key,value]of Object.entries(values)){
   if(key==='performance')continue;
   if(key==='wallet')patch.wallets={...cfg.wallets,[coin]:value};
   else if(key==='pool')patch.pools={...cfg.pools,[coin]:value};
   else if(key==='backups')patch.poolBackups={...cfg.poolBackups,[coin]:value};
   else patch[key]=value;
  }
  if(Object.keys(patch).length)await save(patch);saved=true;
 },q=>{
  text(status,q.error?'Settings not saved, check input':q.busy?'Saving...':q.dirty||edits.size?'Autosaves on change':saved?'Settings saved':'Settings save automatically');
  status.classList.toggle('save-error',!!q.error);
  if(q.error)toast('Settings not saved: '+q.error.message);else if(!q.dirty&&!edits.size&&saved)toast('Settings saved');
 });
 const watch=(selector,key,read)=>{const n=$(selector);n.addEventListener('input',()=>{edits.add(n);text(status,'Autosaves on change')});n.addEventListener('change',()=>{edits.delete(n);queue.set(key,read())})};
 watch('#performance','performance',()=>+$('#performance').value);
 watch('#wallet','wallet',()=>$('#wallet').value.trim());watch('#pool','pool',()=>$('#pool').value.trim());watch('#worker','worker',()=>$('#worker').value.trim());watch('#cpu-threads','cpuThreads',()=>+$('#cpu-threads').value);watch('#zcd-password','zcdPassword',()=>$('#zcd-password').value);
 watch('#hash-window','hashWindowMinutes',()=>+$('#hash-window').value);
 const backups=()=>[1,2].map(i=>$('#pool-backup-'+i).value.trim()).filter(Boolean);
 for(const i of [1,2]){
  watch('#pool-backup-'+i,'backups',backups);
  const preset=$('#pool-backup-preset-'+i),previous=preset.onchange;
  preset.onchange=()=>{previous?.();queue.set('backups',backups())};
 }
 const preset=$('#pool-preset'),previousPreset=preset.onchange;
 preset.onchange=()=>{previousPreset?.();if(preset.value!=='custom'){queue.set('pool',$('#pool').value.trim());queue.set('backups',backups())}};
 text('#pool-backups-save','Done');$('#pool-backups-save').onclick=()=>action(async()=>{await window.flushMiningSettings();$('#pool-dialog').close()});
 window.flushMiningSettings=async()=>{if(state?.config.workbenchMode==='dual')return;for(const n of [...edits])n.dispatchEvent(new Event('change'));await queue.flush()};
 const start=$('#start');start.onclick=()=>action(async()=>{await window.flushMiningSettings();await saveMining();await api.start(false)},start);
 // Existing selectors persist their own settings. Flush the budget before them
 // so a response from an earlier edit cannot overwrite a later selection.
 for(const selector of ['#kernel-select','#noid-connection','#pool-connection-check','#bnt-connection-check']){
  const n=$(selector),event=selector.endsWith('check')?'onclick':'onchange',previous=n[event];
  n[event]=()=>action(async()=>{await window.flushMiningSettings();return previous?.()});
 }
})();
