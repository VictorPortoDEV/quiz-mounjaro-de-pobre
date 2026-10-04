import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import worker, { isOriginAllowed, rangeStart, validatePayload } from '../src/index.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}
  bind(...values){this.values=values;return this}
  async run(){
    if(this.sql.startsWith('INSERT INTO sessions')){
      const v=this.values,previous=this.db.sessions.get(v[0]);
      this.db.sessions.set(v[0],{session_id:v[0],started_at:previous?.started_at??v[1],last_seen_at:v[2],current_page:v[3],current_step:v[4]??previous?.current_step,quiz_total_steps:v[5]??previous?.quiz_total_steps,vsl_progress:v[6]??previous?.vsl_progress});
    }else if(this.sql.startsWith('INSERT OR IGNORE INTO events')&&!this.db.events.has(this.values[0]))this.db.events.set(this.values[0],{id:this.values[0],session_id:this.values[1],event_name:this.values[2]});
    return {success:true};
  }
}
class FakeD1 {
  constructor(){this.sessions=new Map();this.events=new Map()}
  prepare(sql){return new Statement(this,sql)}
  async batch(statements){for(const statement of statements)await statement.run();return statements.map(()=>({success:true}))}
}

const env=()=>({ANALYTICS_DB:new FakeD1(),ANALYTICS_ADMIN_TOKEN:'secret-token',ALLOWED_ORIGINS:'https://quiz.example',ALLOW_LOCAL_DEV:'true',ASSETS:{fetch:()=>new Response('asset')}});
const payload={session_id:'12345678-1234-4234-9234-123456789012',current_page:'quiz',current_step:1,quiz_total_steps:20,page_path:'/quiz'};
const post=(path,body,origin='https://quiz.example')=>new Request(`https://analytics.example${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('valida e limita dados de sessão',()=>{
  const parsed=validatePayload({...payload,utm_campaign:'x'.repeat(300),vsl_progress:120});
  assert.equal(parsed.utm_campaign.length,200);
  assert.equal(parsed.vsl_progress,100);
  assert.throws(()=>validatePayload({...payload,current_page:'checkout'}));
});

test('heartbeat faz upsert sem criar spam de eventos',async()=>{
  const testEnv=env();
  assert.equal((await worker.fetch(post('/api/analytics/heartbeat',payload),testEnv)).status,200);
  assert.equal((await worker.fetch(post('/api/analytics/heartbeat',{...payload,current_step:2}),testEnv)).status,200);
  assert.equal(testEnv.ANALYTICS_DB.sessions.size,1);
  assert.equal(testEnv.ANALYTICS_DB.sessions.get(payload.session_id).current_step,2);
  assert.equal(testEnv.ANALYTICS_DB.events.size,0);
});

test('sessão bloqueada não grava heartbeat nem eventos e mantém CORS',async()=>{
  const testEnv=env();
  testEnv.BLOCKED_SESSION_IDS='e3ec8887-c4a7-4642-8929-26ad7a4c1784';
  const blocked={...payload,session_id:testEnv.BLOCKED_SESSION_IDS.toUpperCase(),event_name:'quiz_step'};
  for(const path of ['/api/analytics/heartbeat','/api/analytics/event']){
    const response=await worker.fetch(post(path,blocked),testEnv);
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,'session_blocked');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://quiz.example');
  }
  assert.equal(testEnv.ANALYTICS_DB.sessions.size,0);
  assert.equal(testEnv.ANALYTICS_DB.events.size,0);
  assert.equal((await worker.fetch(post('/api/analytics/heartbeat',payload),testEnv)).status,200);
});

async function analyticsClient(sessionId,response=new Response('{}'),search=''){
  const sent=[],listeners={},intervals=[],storageWrites=[];
  const app={innerHTML:''};
  const blockedId='e3ec8887-c4a7-4642-8929-26ad7a4c1784';
  const window={FUNNEL_DATA:{steps:[{}]},QuizUI:{dispose(){}},addEventListener(name,fn){listeners[name]=fn},dispatchEvent(event){listeners[event.type]?.()}};
  const context={window,URL,URLSearchParams,Event,crypto,Promise,location:{search,protocol:'https:',pathname:'/'},navigator:{userAgent:'Chrome/'},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>sessionId,setItem:(key,value)=>storageWrites.push(value)},sessionStorage:{getItem:()=>null,setItem(){}},document:{currentScript:{dataset:{page:'quiz',blockedSessions:blockedId}},referrer:'',visibilityState:'visible',addEventListener(){},querySelector:()=>app},fetch:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return response.clone()},setInterval:fn=>{intervals.push(fn);return intervals.length},clearInterval(){}};
  runInNewContext(await readFile(new URL('../../analytics.js',import.meta.url),'utf8'),context);
  return {context,app,sent,intervals,storageWrites};
}

test('sid na URL não substitui o identificador já bloqueado no navegador',async()=>{
  const client=await analyticsClient('e3ec8887-c4a7-4642-8929-26ad7a4c1784',new Response('{}'),`?sid=${payload.session_id}`);
  assert.equal(client.context.window.FunnelAnalytics.blocked,true);
  assert.equal(client.storageWrites.length,0);
  assert.equal(client.sent.length,0);
});

test('quiz bloqueado mostra aviso sem enviar métricas nem iniciar timers',async()=>{
  const client=await analyticsClient('e3ec8887-c4a7-4642-8929-26ad7a4c1784');
  assert.equal(client.context.window.FunnelAnalytics.blocked,true);
  runInNewContext(await readFile(new URL('../../app.js',import.meta.url),'utf8'),client.context);
  assert.match(client.app.innerHTML,/Esta sessão foi bloqueada/);
  assert.equal(client.sent.length,0);
  assert.equal(client.intervals.length,0);
});

test('outras sessões continuam enviando métricas normalmente',async()=>{
  const client=await analyticsClient(payload.session_id);
  assert.equal(client.context.window.FunnelAnalytics.blocked,false);
  assert.equal(client.sent.length,2);
  assert.equal(client.intervals.length,1);
});

test('bloqueio confirmado pelo servidor interrompe novos eventos no cliente',async()=>{
  const client=await analyticsClient(payload.session_id,new Response(JSON.stringify({code:'session_blocked'}),{status:403}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(client.context.window.FunnelAnalytics.blocked,true);
  const count=client.sent.length;
  await client.context.window.FunnelAnalytics.event('cta_clicked');
  assert.equal(client.sent.length,count);
});

test('evento permitido é deduplicado por event_id',async()=>{
  const testEnv=env(),event={...payload,event_id:'aaaaaaaa-1234-4234-9234-123456789012',event_name:'quiz_step',event_data:{step:2}};
  await worker.fetch(post('/api/analytics/event',event),testEnv);
  await worker.fetch(post('/api/analytics/event',event),testEnv);
  assert.equal(testEnv.ANALYTICS_DB.sessions.size,1);
  assert.equal(testEnv.ANALYTICS_DB.events.size,1);
  assert.equal((await worker.fetch(post('/api/analytics/event',{...event,event_name:'arbitrary'}),testEnv)).status,400);
});

test('CORS bloqueia origem desconhecida e aceita localhost somente em dev',async()=>{
  const testEnv=env();
  assert.equal(isOriginAllowed('http://localhost:8080',testEnv),true);
  assert.equal((await worker.fetch(post('/api/analytics/heartbeat',payload,'https://evil.example'),testEnv)).status,403);
  const options=new Request('https://analytics.example/api/analytics/heartbeat',{method:'OPTIONS',headers:{Origin:'https://quiz.example'}});
  const response=await worker.fetch(options,testEnv);
  assert.equal(response.status,204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://quiz.example');
});

test('leitura administrativa exige bearer token',async()=>{
  const response=await worker.fetch(new Request('https://analytics.example/api/analytics/overview'),env());
  assert.equal(response.status,401);
});

test('janela online é independente dos filtros de período',()=>{
  assert.equal(rangeStart('15m',10_000),9_100);
  assert.equal(rangeStart('1h',10_000),6_400);
  assert.equal(rangeStart('now',10_000),9_700);
});

test('quiz mantém eventos de análise e demais chamadas do Meta',async()=>{
  const quiz=await readFile(new URL('../../app.js',import.meta.url),'utf8');
  const page=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(quiz,/quiz_started/);assert.match(quiz,/quiz_completed/);assert.match(quiz,/cta_clicked/);
  assert.match(quiz,/trackMeta\('ViewContent'/);
  assert.match(page,/fbq\('track', 'PageView'/);
});

test('dashboard usa login explícito por clique e submit',async()=>{
  const html=await readFile(new URL('../public/analytics/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../public/analytics/app.js',import.meta.url),'utf8');
  assert.match(html,/app\.js\?v=2/);
  assert.match(app,/login-form button.*addEventListener\('click'/);
  assert.match(app,/login-form.*addEventListener\('submit'/);
});
