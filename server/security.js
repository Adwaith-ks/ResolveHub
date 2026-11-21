import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export function newToken(){return randomBytes(32).toString('base64url');}
export function digest(value){return createHash('sha256').update(value).digest('hex');}
export function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function requireSecret(){if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('SESSION_SECRET must be at least 32 characters');}
