import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAttachment} from './attachments.js';

test('accepts a size-bounded PDF with matching signature',()=>{
 const input={name:'support.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4\nExample').toString('base64')};
 const file=parseAttachment(input);
 assert.equal(file.filename,'support.pdf');
 assert.equal(file.mime,'application/pdf');
 assert.equal(file.content.toString('utf8'),'%PDF-1.4\nExample');
});
test('rejects MIME type spoofing and unsafe files',()=>{
 const bad={name:'script.pdf',type:'application/pdf',data:Buffer.from('<script>bad</script>').toString('base64')};
 assert.throws(()=>parseAttachment(bad),/does not match/);
 assert.throws(()=>parseAttachment({...bad,type:'text/html'}),/Unsupported/);
 assert.throws(()=>parseAttachment({...bad,data:Buffer.alloc(2097153).toString('base64')}),/file size|2 MB/);
});
test('allows no attachment and sanitizes filenames',()=>{
 assert.equal(parseAttachment(null),null);
 const f=parseAttachment({name:'../report.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4').toString('base64')});
 assert.ok(!f.filename.includes('/'));
});
