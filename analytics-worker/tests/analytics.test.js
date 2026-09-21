import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('quiz e VSL estão instrumentados sem alterar chamadas do Meta',async()=>{
  const quiz=await readFile(new URL('../../Conteudos/Quiz Mounjaro de Pobre/app.js',import.meta.url),'utf8');
  const vsl=await readFile(new URL('../../VSLs/aceleradormetabolico/index.html',import.meta.url),'utf8');
  assert.match(quiz,/quiz_started/);assert.match(quiz,/quiz_completed/);assert.match(quiz,/cta_clicked/);
  for(const mark of [25,50,75,90,100])assert.match(vsl,new RegExp(`vsl_\\$\\{mark\\}`));
  assert.match(vsl,/fbq\('track', 'InitiateCheckout'/);
  assert.match(vsl,/fbq\('track', 'ViewContent'/);
});
