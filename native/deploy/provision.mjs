// Run on the VPS from the existing app directory, after backup and source build.
// Reads existing configuration but never writes it or prints credentials.
import {readFile,writeFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const require=createRequire('/opt/mrright-portfolio/package.json')
const {Pool}=require('pg')
const env=Object.fromEntries((await readFile('/etc/mrright-portfolio.env','utf8')).split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{let i=l.indexOf('=');let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
assert.ok(env.DATABASE_URL&&env.ADMIN_TOKEN,'Required environment keys missing')
console.log('DATABASE_URL [set]; ADMIN_TOKEN [set]')
assert.equal(new URL(env.DATABASE_URL).pathname,'/mrright_portfolio','Unexpected production database')
const dbadmin=sql=>execFileSync('sudo',['-u','postgres','psql','-X','-v','ON_ERROR_STOP=1','-At','-d','mrright_portfolio'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
let createdRole=false
try{
 const exists=dbadmin("SELECT 1 FROM pg_roles WHERE rolname='mrright_native';")==="1"
 let nativeEnv=''
 try{nativeEnv=await readFile('/etc/mrright-native.env','utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 assert.equal(exists,!!nativeEnv,'Role/config state mismatch; refusing to alter an existing password')
 let url
 if(!exists){
  const password=randomBytes(32).toString('hex')
  dbadmin("CREATE ROLE mrright_native LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 8 PASSWORD '"+password+"';");createdRole=true
  url=new URL(env.DATABASE_URL);url.username='mrright_native';url.password=password
 }else{
  const line=nativeEnv.split('\n').find(l=>l.startsWith('NATIVE_DATABASE_URL='));assert.ok(line,'Native DSN missing');url=new URL(line.slice('NATIVE_DATABASE_URL='.length))
 }
 dbadmin(await readFile(new URL('../sql/public_views.sql',import.meta.url),'utf8'))
 dbadmin('GRANT USAGE ON SCHEMA public TO mrright_native; GRANT SELECT ON native_public_works_v1,native_public_assets_v1 TO mrright_native; ALTER ROLE mrright_native SET default_transaction_read_only=on; ALTER ROLE mrright_native SET statement_timeout=5000')
 const role=new Pool({connectionString:url.href})
 try{
  await role.query('SELECT payload FROM native_public_works_v1 LIMIT 1')
  for(const sql of ['SELECT * FROM visitor_users','SELECT * FROM work_assets','SELECT * FROM works']){let denied=false;try{await role.query(sql)}catch(e){denied=e.code==='42501'}assert.ok(denied,'Native role must not access base tables')}
 }finally{await role.end()}
 if(createdRole)await writeFile('/etc/mrright-native.env','NATIVE_DATABASE_URL='+url.href+'\nNATIVE_PORT=4286\n',{mode:0o600,flag:'wx'})
 console.log(JSON.stringify({publicViewsReady:true,readOnlyRoleVerified:true,legacyEnvUnchanged:true}))
}catch(e){console.error('Native database provisioning failed; credentials suppressed');process.exitCode=1}

