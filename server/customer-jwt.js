import {createHmac, timingSafeEqual, randomBytes} from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = value => createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('base64url');

// Stateless JWT signature plus a revocable database session, kept in an HttpOnly cookie.
export function issueCustomerJwt(id, lifetimeMs) {
  const jti = randomBytes(32).toString('hex');
  const body = encode({sub:String(id),role:'customer',jti,iat:Math.floor(Date.now()/1000),exp:Math.floor((Date.now()+lifetimeMs)/1000)});
  const input = encode({alg:'HS256',typ:'JWT'})+'.'+body;
  return {token:input+'.'+sign(input),jti};
}
export function verifyCustomerJwt(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = parts[0], payload = parts[1], signature = parts[2];
  const expected = Buffer.from(sign(header+'.'+payload),'base64url');
  let provided;
  try {provided = Buffer.from(signature,'base64url');} catch {return null;}
  if (expected.length !== provided.length || !timingSafeEqual(expected,provided)) return null;
  try {
    const h = JSON.parse(Buffer.from(header,'base64url'));
    const p = JSON.parse(Buffer.from(payload,'base64url'));
    if (h.alg !== 'HS256' || p.role !== 'customer' || !/^\d+$/.test(p.sub) || typeof p.jti !== 'string' || !Number.isSafeInteger(p.exp) || p.exp <= Date.now()/1000) return null;
    return p;
  } catch { return null; }
}

export function issueStaffJwt(id, role, lifetimeMs) {
  if(!['agent','admin'].includes(role)) throw new Error('Invalid staff role');
  const jti=randomBytes(32).toString('hex');
  const body=encode({sub:String(id),role,jti,iat:Math.floor(Date.now()/1000),exp:Math.floor((Date.now()+lifetimeMs)/1000)});
  const input=encode({alg:'HS256',typ:'JWT'})+'.'+body;
  return {token:input+'.'+sign(input),jti};
}
export function verifyStaffJwt(token){
  const claims=verifyCustomerJwtTokenParts(token);
  return claims && ['agent','admin'].includes(claims.role) ? claims : null;
}
function verifyCustomerJwtTokenParts(token){
  if(typeof token!=='string'||token.length>4096)return null;
  const parts=token.split('.');
  if(parts.length!==3)return null;
  const expected=Buffer.from(sign(parts[0]+'.'+parts[1]),'base64url');
  let supplied;
  try{supplied=Buffer.from(parts[2],'base64url');}catch{return null;}
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return null;
  try{
    const header=JSON.parse(Buffer.from(parts[0],'base64url'));
    const payload=JSON.parse(Buffer.from(parts[1],'base64url'));
    if(header.alg!=='HS256'||!/^\d+$/.test(payload.sub)||typeof payload.jti!=='string'||!Number.isSafeInteger(payload.exp)||payload.exp<=Date.now()/1000)return null;
    return payload;
  }catch{return null;}
}
