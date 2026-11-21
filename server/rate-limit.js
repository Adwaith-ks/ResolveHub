// In-process abuse protection. For horizontally scaled deployments use a shared Redis store.
export function createRateLimiter({limit,windowMs,maxKeys=10000,now=()=>Date.now()}){
 if(!Number.isInteger(limit)||limit<1||!Number.isFinite(windowMs)||windowMs<=0)throw new Error('Invalid rate limit');
 const attempts=new Map();let calls=0;
 return function rateLimit(req,res,next){
  const current=now();if(++calls%250===0){for(const [key,v] of attempts)if(v.resetAt<=current)attempts.delete(key);}
  const key=String(req.ip||req.socket?.remoteAddress||'unknown');
  let bucket=attempts.get(key);
  if(!bucket||bucket.resetAt<=current){if(!bucket&&attempts.size>=maxKeys){res.status(503).json({error:'Request capacity reached; retry later'});return;}bucket={count:0,resetAt:current+windowMs};attempts.set(key,bucket);}
  const remaining=Math.max(0,limit-bucket.count-1);
  res.setHeader('RateLimit-Limit',String(limit));res.setHeader('RateLimit-Remaining',String(remaining));
  if(bucket.count>=limit){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((bucket.resetAt-current)/1000))));res.status(429).json({error:'Too many requests; retry later'});return;}
  bucket.count++;next();
 };
}
