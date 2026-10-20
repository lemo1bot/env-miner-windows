(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.GozerZcdAddress=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function validAddress(value){return typeof value==='string'&&/^(?:0x)?02[a-f0-9]{62}$/i.test(value.trim())}
 function inspect(value){
  const input=typeof value==='string'?value.trim():'';
  if(!input)return {valid:false,code:'empty',message:'Please enter ZCD 02 persistent payout address'};
  if(/^(?:0x)?01/i.test(input))return {valid:false,code:'one-shot',message:'⚠️ 0x01 is a one-time payment address. Mining pools require a Persistent Address (0x02...). Copy a Persistent Address from zycord-wallet or your wallet.'};
  if(!/^(?:0x)?02/i.test(input))return {valid:false,code:'prefix',message:'Mining pools require 0x02 persistent address'};
  if(!validAddress(input))return {valid:false,code:'format',message:'Invalid format: Must be 66 characters (0x02 followed by 62 hex characters / 32 bytes)'};
  return {valid:true,code:'valid',message:'02 persistent address format valid',normalized:'0x'+input.replace(/^0x/i,'').toLowerCase()};
 }
 return Object.freeze({validAddress,inspect});
});
