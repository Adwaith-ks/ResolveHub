import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import bcrypt from 'bcryptjs';
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true' ? {rejectUnauthorized:true}:undefined});
export const query=(sql,params=[])=>pool.query(sql,params);
export async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const val=await fn(c);await c.query('COMMIT');return val;}catch(err){await c.query('ROLLBACK');throw err;}finally{c.release();}}
export async function initialize(){
 const sql=await readFile(join(dirname(fileURLToPath(import.meta.url)),'schema.sql'),'utf8');await query(sql);
 const email=process.env.SEED_AGENT_EMAIL?.trim().toLowerCase();const password=process.env.SEED_AGENT_PASSWORD;
 if(email && password){if(password.length<12)throw new Error('SEED_AGENT_PASSWORD must have at least 12 characters');const hash=await bcrypt.hash(password,12);await query('INSERT INTO agents(email,name,password_hash) VALUES($1,$2,$3) ON CONFLICT (email) DO NOTHING',[email,email.split('@')[0],hash]);}
}
export async function close(){await pool.end();}
