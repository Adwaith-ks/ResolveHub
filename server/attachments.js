const MAX_BYTES=2*1024*1024;
const TYPES=new Set(['image/png','image/jpeg','application/pdf']);
const BAD_NAME=/[\x00-\x1f\x7f/\\]/g;

export function parseAttachment(file) {
  if(file===undefined || file===null)return null;
  if(!file || typeof file!=='object' || Array.isArray(file))throw new Error('Invalid attachment');
  const {name,type,data}=file;
  if(typeof name!=='string'||name.length<1||name.length>120||typeof type!=='string'||!TYPES.has(type))throw new Error('Unsupported attachment name or type');
  if(typeof data!=='string'||data.length>Math.ceil(MAX_BYTES/3)*4+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4!==0)throw new Error('Invalid attachment content or file size');
  const content=Buffer.from(data,'base64');
  if(!content.length||content.length>MAX_BYTES||content.toString('base64')!==data)throw new Error('Attachment must be 2 MB or smaller');
  const valid=type==='image/png'
    ? content.length>=8 && content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type==='image/jpeg'
    ? content.length>=4 && content[0]===255 && content[1]===216 && content[content.length-2]===255 && content[content.length-1]===217
    : content.length>=5 && content.subarray(0,5).toString('ascii')==='%PDF-';
  if(!valid)throw new Error('Attachment content does not match the declared file type');
  return {filename:name.replace(BAD_NAME,'_').trim(),mime:type,content,size:content.length};
}
export function attachmentDownload(res,file){
  res.set('Content-Type',file.mime_type);
  res.set('Cache-Control','private, no-store');
  res.set('Content-Disposition',"attachment; filename=\""+file.filename.replace(/[^A-Za-z0-9_.-]/g,'_')+"\"");
  res.send(file.content);
}
