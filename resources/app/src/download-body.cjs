'use strict';
async function readBody(response,maxBytes,onProgress){
 const length=Number(response.headers.get('content-length'));
 if(length>maxBytes)throw Error('Response body too large');
 const encoding=response.headers.get('content-encoding');
 const total=Number.isFinite(length)&&length>0&&(!encoding||encoding==='identity')?length:null;
 const parts=[];let received=0,last=0;
 onProgress?.({received,total});
 for await(const part of response.body){
  received+=part.length;if(received>maxBytes)throw Error('Response exceeded maximum size limit');parts.push(Buffer.from(part));
  if(Date.now()-last>=200){last=Date.now();onProgress?.({received,total})}
 }
 if(total!==null&&received!==total)throw Error('Incomplete download, please retry');
 onProgress?.({received,total});return Buffer.concat(parts);
}
module.exports={readBody};
