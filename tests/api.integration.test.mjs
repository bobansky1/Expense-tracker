import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

// Requires a dedicated disposable local MariaDB/MySQL instance on port 33316.
// Never points at the production database; every run creates its own schema.
test('PHP + MySQL: account, CSRF, isolation, revision checks and atomic imports', { timeout: 60000 }, async t => {
  const database = 'traty_test_' + Date.now()
  const privateDir = execFileSync('php',['tests/db-fixture.php',database],{encoding:'utf8'}).trim()
  const base = 'http://127.0.0.1:18081'
  let server
  let logs = ''
  async function start() {
    server=spawn('php',['-S','127.0.0.1:18081','-t','public'],{env:{...process.env,TRATY_PRIVATE_DIR:privateDir},windowsHide:true})
    server.stderr.on('data', chunk => { logs += chunk })
    server.on('error', e => { logs += e.message })
    for(let i=0;i<60;i++) {
      try { const r=await fetch(base+'/api/index.php'); if(r.ok) return } catch {}
      await delay(100)
    }
    throw Error('PHP test server failed: '+logs)
  }
  async function stop() { const exited=once(server,'exit'); server.kill(); await exited }
  await start()
  t.after(async()=>{ if(server.exitCode===null) await stop() })
  function client() {
    let cookie='',csrf=''
    return async function call(action,body,extra={}) {
      const response=await fetch(base+'/api/index.php?action='+action,{
        method:body?'POST':'GET',
        headers:{Cookie:cookie,...(body?{'Content-Type':'application/json',Origin:base,'X-CSRF-Token':csrf}:{}),...extra},
        body:body?JSON.stringify(body):undefined
      })
      const setCookie=response.headers.get('set-cookie')
      if(setCookie) cookie=setCookie.split(';')[0]
      const data=await response.json()
      if(data.csrf) csrf=data.csrf
      return {status:response.status,data,cookie,headers:response.headers}
    }
  }
  const a=client()
  let r=await a('session')
  assert.equal(r.data.setupRequired,true)
  assert.match(r.headers.get('set-cookie'),/HttpOnly/i)
  assert.match(r.headers.get('set-cookie'),/SameSite=Strict/i)
  const oldCookie=r.cookie
  assert.equal((await a('expenses')).status,401)
  const owner={email:'owner@example.test',password:'owner-test-password',token:'test-only-'.repeat(8)}
  assert.equal((await a('setup',{...owner,token:'wrong'})).status,403)
  r=await a('setup',owner)
  assert.equal(r.status,200); assert.notEqual(r.cookie,oldCookie)
  assert.equal((await a('setup',owner)).status,403)
  assert.equal((await a('mutate',{type:'delete',id:'a',revision:0},{Origin:'https://evil.example'})).status,403)
  assert.equal((await a('mutate',{type:'delete',id:'a',revision:0},{'X-CSRF-Token':'wrong'})).status,403)
  const expense={id:'a',amount:29,category:'food',date:'2024-02-29',note:"Хлеб 🥑 ' OR 1=1 --"}
  r=await a('mutate',{type:'upsert',expense,revision:0})
  assert.equal(r.status,200); assert.deepEqual(r.data.expenses,[expense]); assert.equal(r.data.revision,1)
  assert.equal((await a('mutate',{type:'delete',id:'a',revision:0})).status,409)
  for(const changes of [{date:'2025-02-29'},{amount:0.5},{amount:10000000000},{category:'fake'},{id:'bad/id'},{note:'x'.repeat(201)}]) {
    assert.equal((await a('mutate',{type:'upsert',expense:{...expense,...changes},revision:1})).status,422)
  }
  r=await a('mutate',{type:'upsert',expense:{...expense,amount:9999999999},revision:1})
  assert.equal(r.data.expenses[0].amount,9999999999)
  const current={...expense,amount:9999999999}
  assert.equal((await a('mutate',{type:'replace',expenses:[expense,expense],revision:2})).status,422)
  // The first merge insert happens before a conflicting ID; the transaction must roll back.
  assert.equal((await a('mutate',{type:'merge',expenses:[{...expense,id:'new'},expense],revision:2})).status,409)
  r=await a('expenses')
  assert.equal(r.data.revision,2); assert.deepEqual(r.data.expenses,[current])
  r=await a('mutate',{type:'merge',expenses:[current],revision:2})
  assert.equal(r.data.expenses.length,1); assert.equal(r.data.revision,3)
  execFileSync('php',['tests/db-fixture.php',database,'second-user'])
  const b=client()
  await b('session')
  assert.equal((await b('login',{email:'second@example.test',password:'second-test-password'})).status,200)
  assert.deepEqual((await b('expenses')).data.expenses,[])
  r=await b('mutate',{type:'upsert',expense:{...expense,note:'Second owner'},revision:0})
  assert.equal(r.status,200)
  assert.deepEqual((await a('expenses')).data.expenses,[current])
  await b('mutate',{type:'delete',id:'a',revision:1})
  assert.deepEqual((await a('expenses')).data.expenses,[current])
  await stop(); await start()
  assert.deepEqual((await a('expenses')).data.expenses,[current])
  r=await a('mutate',{type:'replace',expenses:[{...expense,id:'restored'}],revision:3})
  assert.equal(r.data.expenses[0].id,'restored')
  r=await a('mutate',{type:'delete',id:'restored',revision:4})
  assert.deepEqual(r.data.expenses,[])
  assert.equal((await a('logout',{logout:true})).status,200)
  assert.equal((await a('expenses')).status,401)
  assert.equal((await a('login',{email:owner.email,password:owner.password})).status,200)
  assert.deepEqual((await a('expenses')).data.expenses,[])
  const custom={id:'custom-study',name:'Образование',color:'#7297b6',icon:'📚'}
  const before=(await a('expenses')).data.revision
  r=await a('mutate',{type:'category',category:custom,revision:before})
  assert.equal(r.status,200); assert.deepEqual(r.data.categories,[custom])
  assert.deepEqual((await b('expenses')).data.categories,[])
  assert.equal((await a('mutate',{type:'category',category:{...custom,id:'custom-duplicate'},revision:before+1})).status,422)
  const customExpense={...expense,id:'custom-expense',category:custom.id}
  assert.equal((await b('mutate',{type:'upsert',expense:customExpense,revision:2})).status,422)
  r=await a('mutate',{type:'upsert',expense:customExpense,revision:before+1})
  assert.equal(r.status,200); assert.deepEqual(r.data.expenses,[customExpense])
  r=await b('mutate',{type:'replace',expenses:[customExpense],categories:[custom],revision:2})
  assert.equal(r.status,200); assert.deepEqual(r.data.categories,[custom]); assert.deepEqual(r.data.expenses,[customExpense])
  const rollback={...custom,id:'custom-rollback',name:'Отпуск'}
  assert.equal((await a('mutate',{type:'replace',expenses:[{...customExpense,category:'missing'}],categories:[rollback],revision:before+2})).status,422)
  assert.deepEqual((await a('expenses')).data.categories,[custom])
  await stop(); await start()
  assert.deepEqual((await a('expenses')).data.categories,[custom])
  const c=client(); await c('session')
  for(let i=0;i<10;i++) assert.equal((await c('login',{email:'missing@example.test',password:'invalid-password'})).status,401)
  assert.equal((await c('login',{email:'missing@example.test',password:'invalid-password'})).status,429)
  t.diagnostic('Verified against real MySQL-compatible database; test schema retained at '+database)
})
