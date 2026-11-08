// Isolated PostgreSQL + actual C++ HTTP process. No production environment is read.
import {spawn} from 'node:child_process'
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {createServer,request} from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import pg from 'pg'
import {startDisposablePostgres} from '../../scripts/lib/disposable-postgres.mjs'
import {ensureSchema} from '../../server/postgres/schema.js'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const free=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const files=async(dir)=>{let list=[];try{for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);list.push(...(e.isDirectory()?await files(p):[p]))}}catch{}return list}
const original=new Set(await files(join(root,'public/uploads')))
const children=[];let pool,rolePool,cluster,gateway;let assertions=0
const check=(value,message)=>{assert.ok(value,message);assertions++}
const admin=randomBytes(24).toString('hex'),password='Native-'+randomBytes(12).toString('hex')
const email='native-fixture@example.invalid'
const binary=process.env.NATIVE_TEST_BINARY||join(root,'.deploy-tools/native-linux/mrright-catalogue')
const hold=process.argv.includes('--hold')
const report=join(root,'.deploy-tools/native-checks')
const start=(exe,args,env)=>{const p=spawn(exe,args,{cwd:root,env:{PATH:process.env.PATH,...env},stdio:'ignore'});children.push(p);return p}
try{
 cluster=await startDisposablePostgres({databaseName:'mrright_native_test',log:()=>{}})
 pool=new pg.Pool({connectionString:cluster.databaseUrl});await ensureSchema(pool)
 await pool.query(await readFile(join(root,'native/sql/public_views.sql'),'utf8'))
 await pool.query('CREATE ROLE native_test_read LOGIN;GRANT USAGE ON SCHEMA public TO native_test_read;GRANT SELECT ON native_public_works_v1,native_public_assets_v1 TO native_test_read')
 const readUrl=new URL(cluster.databaseUrl);readUrl.username='native_test_read'
 rolePool=new pg.Pool({connectionString:readUrl.href})
 for(const sql of ['SELECT * FROM visitor_users','SELECT * FROM work_assets',"INSERT INTO visitor_users(id,email,display_name,password_hash) VALUES('x','x','x','x')"]){let denied=false;try{await rolePool.query(sql)}catch(e){denied=e.code==='42501'}check(denied,'read-only role denies base table access')}
 const nodePort=await free(),cppPort=await free(),proxyPort=await free()
 start(process.execPath,['server/index.js'],{PORT:String(nodePort),DATABASE_URL:cluster.databaseUrl,ADMIN_TOKEN:admin,NODE_ENV:'test',EXPOSE_DEV_VERIFICATION_CODE:'true',VISITOR_ID_SECRET:randomBytes(32).toString('hex')})
 start(binary,[],{NATIVE_DATABASE_URL:readUrl.href,NATIVE_PORT:String(cppPort)})
 const api=async(method,path,body,token)=>{const r=await fetch('http://127.0.0.1:'+nodePort+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.ok(r.ok,'legacy fixture request '+path+' '+r.status);return j.data}
 for(let n=0;n<100;n++){try{const a=await fetch('http://127.0.0.1:'+nodePort+'/api/health');const b=await fetch('http://127.0.0.1:'+cppPort+'/api/native/v1/health');if(a.ok&&b.ok)break}catch{}await wait(100);if(n===99)throw Error('Fixture services unavailable')}
 const registered=await api('POST','/api/auth/register',{displayName:'Native creator',email,password})
 const verified=await api('POST','/api/auth/verify-email',{email,code:registered.verification.devCode})
 const token=verified.session.token,id=verified.user.id
 await api('PUT','/api/account/profile',{displayName:'Native creator',handle:'native-creator'},token)
 for(const type of ['model','image','video','audio','material','document','other']){
  await pool.query("INSERT INTO works(id,creator_id,slug,title,resource_type,status,image,model_url,asset_category,published_at) VALUES($1,$2,$1,$3,$4,'published',$5,$6,$7,now())",['native-'+type,id,'Native '+type+' 测试',type,'/assets/projects/fire-extinguisher.png',type==='model'?'/models/fire-extinguisher-4k.3fa834b2.glb':'',type==='model'?'next-gen-prop':''])
 }
 await pool.query("INSERT INTO works(id,creator_id,slug,title,status) VALUES('native-draft',$1,'native-draft','Hidden draft','draft')",[id])
 await pool.query("INSERT INTO work_assets(id,work_id,kind,file_name,file_type,file_size,file_url) VALUES('private-original','native-image','source','私人源文件.png','png',4,'/uploads/protected.png'),('alias-original','native-image','preview','alias.png','png',4,'/uploads/protected.png')")
 await pool.query("UPDATE works SET image='/uploads/protected.png',thumbnail='/uploads/protected.png',model_url='/uploads/protected.png' WHERE id='native-image'")
 await pool.query("UPDATE works SET curation_score=94,exhibition_recommended=true WHERE id='native-model'")
 const cpp=async(path,status=200)=>{const r=await fetch('http://127.0.0.1:'+cppPort+'/api/native/v1'+path);check(r.status===status,'C++ status '+path);check(r.headers.get('x-mr-runtime')==='cpp20','C++ runtime');return r.json()}
 let all=await cpp('/works');check(all.pagination.total===7,'published only');check(all.data.works.every(w=>!('email'in w.creator)&&!('passwordHash'in w.creator)),'no private account data')
 for(const type of ['model','image','video','audio','material','document','other']){const j=await cpp('/works?resourceType='+type);check(j.pagination.total===1&&j.data.works[0].resourceType===type,'type '+type)}
 const one=await cpp('/works?limit=1&page=2');check(one.data.works.length===1&&one.pagination.hasPrevious&&one.pagination.hasNext,'real pagination')
 check((await cpp('/works?q='+encodeURIComponent('测试'))).pagination.total===7,'Unicode search')
 check((await cpp('/works?q='+encodeURIComponent("' OR 1=1 --"))).pagination.total===0,'SQL injection is data')
 check((await cpp('/works?category=next-gen-prop')).pagination.total===1,'model category')
 check((await cpp('/works?exhibition=true')).pagination.total===1,'admin recommendation threshold')
 for(let n=0;n<10;n++){await pool.query("INSERT INTO visitor_users(id,email,display_name,password_hash,email_verified_at)VALUES($1,$1||'@invalid.test',$1,'x',now())",['voter-'+n]);await pool.query("INSERT INTO work_ratings(work_id,user_id,score,recommended,work_version)VALUES('native-video',$1,5,true,1)",['voter-'+n])}
 check((await cpp('/works?exhibition=true')).pagination.total===2,'community recommendations')
 await pool.query("UPDATE works SET rating_version=2 WHERE id='native-video'");check((await cpp('/works?exhibition=true')).pagination.total===1,'stale ratings excluded')
 const detail=(await cpp('/works/native-creator/native-image')).data.work
 check(!detail.image&&!detail.thumbnail&&!detail.modelUrl,'source aliases masked')
 check(detail.assets.length===2&&detail.assets.every(a=>a.fileUrl===null&&a.protected),'protected originals and aliases')
 await pool.query('UPDATE visitor_users SET profile_public=false WHERE id=$1',[id]);check((await cpp('/works/native-creator/native-model')).data.work.creator.profilePublic===false,'profile privacy flag');await pool.query('UPDATE visitor_users SET profile_public=true WHERE id=$1',[id])
 await cpp('/works/native-creator/native-draft',404)
 for(const path of ['/works?page=0','/works?limit=61','/works?resourceType=exe','/works?category=bad','/works?page=1evil','/works?exhibition=banana'])await cpp(path,400)
 // Validate real multipart Unicode names and reject traversal/extension spoofing.
 const draft=await api('POST','/api/account/works',{title:'Filename validation',resourceType:'document'},token)
 for(const [name,status]of [['设计说明.txt',201],['../escape.txt',400],['..\\escape.txt',400],['wrong.exe',400],['bad\r\n.txt',400]]){
  const f=new FormData();f.set('kind','source');f.set('displayName',name);f.set('file',new Blob(['native-test']),'resource.txt');const r=await fetch('http://127.0.0.1:'+nodePort+'/api/account/works/'+draft.work.id+'/assets?kind=source',{method:'POST',headers:{Authorization:'Bearer '+token},body:f});check(r.status===status,'filename validation '+status);const j=await r.json();if(status===201)check(j.data.asset.fileName===name,'Unicode filename preserved')
 }
 gateway=createServer((req,res)=>{const port=req.url.startsWith('/api/native/')?cppPort:nodePort;const out=request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});out.on('error',()=>{res.writeHead(502);res.end()});req.pipe(out)})
 await new Promise(r=>gateway.listen(proxyPort,'0.0.0.0',r))
 await writeFile(join(report,'api-integration.json'),JSON.stringify({ok:true,assertions},null,2))
 console.log(JSON.stringify({ok:true,assertions}))
 if(hold){await writeFile(join(report,'session.json'),JSON.stringify({server:'http://127.0.0.1:'+proxyPort,email,password,admin}));console.log('Windows fixture ready');for(let n=0;n<18000;n++){try{await readFile(join(report,'stop'));break}catch{}await wait(100)}await unlink(join(report,'session.json')).catch(()=>{});await unlink(join(report,'stop')).catch(()=>{})}
}catch(e){console.error(e.message);process.exitCode=1}
finally{if(gateway)gateway.close();for(const p of children)p.kill();await wait(300);if(rolePool)await rolePool.end();if(pool)await pool.end();if(cluster)cluster.teardown();for(const p of await files(join(root,'public/uploads')))if(!original.has(p))await unlink(p)}
