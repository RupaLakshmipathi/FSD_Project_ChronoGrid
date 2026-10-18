import jwt from 'jsonwebtoken';
export function requireAuth(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({error:'Invalid or expired token'})}}
export function requireRole(...roles){return(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'You do not have permission to perform this action'});next()}}
