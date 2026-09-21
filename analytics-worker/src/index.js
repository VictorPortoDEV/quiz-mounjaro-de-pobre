const EVENT_NAMES = new Set(['page_view','quiz_started','quiz_step','quiz_completed','cta_clicked','vsl_started','vsl_25','vsl_50','vsl_75','vsl_90','vsl_100','vsl_cta_clicked']);
const TEXT_LIMITS = { page_path:500, referrer:500, utm_source:200, utm_medium:200, utm_campaign:200, utm_content:200, utm_term:200, fbclid:200, browser:50, device_type:20 };

const json = (body, status=200, headers={}) => new Response(JSON.stringify(body), { status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers} });
const text = (value, max) => typeof value === 'string' ? value.slice(0,max) : '';
const integer = (value, min, max) => Number.isInteger(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : null;
const nowSeconds = () => Math.floor(Date.now()/1000);

export function isOriginAllowed(origin, env) {
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value=>value.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  if (env.ALLOW_LOCAL_DEV === 'true') {
    try { return ['localhost','127.0.0.1'].includes(new URL(origin).hostname); } catch {}
  }
  return false;
}

function corsHeaders(origin, env) {
  return origin && isOriginAllowed(origin,env) ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'} : {};
}

export function validatePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Payload inválido');
  if (!/^[a-f0-9-]{20,64}$/i.test(raw.session_id || '')) throw new Error('session_id inválido');
  if (!['quiz','vsl'].includes(raw.current_page)) throw new Error('current_page inválido');
  const payload={session_id:raw.session_id,current_page:raw.current_page};
  for (const [field,max] of Object.entries(TEXT_LIMITS)) payload[field]=text(raw[field],max);
  payload.current_step=integer(raw.current_step,1,500);
  payload.quiz_total_steps=integer(raw.quiz_total_steps,1,500);
  payload.vsl_progress=integer(raw.vsl_progress,0,100);
  return payload;
}

function sessionStatement(db, payload, now) {
  return db.prepare(`INSERT INTO sessions (session_id,started_at,last_seen_at,current_page,current_step,quiz_total_steps,vsl_progress,page_path,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,device_type,browser,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,current_page=excluded.current_page,current_step=COALESCE(excluded.current_step,sessions.current_step),quiz_total_steps=COALESCE(excluded.quiz_total_steps,sessions.quiz_total_steps),vsl_progress=COALESCE(excluded.vsl_progress,sessions.vsl_progress),page_path=excluded.page_path,referrer=CASE WHEN sessions.referrer='' THEN excluded.referrer ELSE sessions.referrer END,utm_source=CASE WHEN sessions.utm_source='' THEN excluded.utm_source ELSE sessions.utm_source END,utm_medium=CASE WHEN sessions.utm_medium='' THEN excluded.utm_medium ELSE sessions.utm_medium END,utm_campaign=CASE WHEN sessions.utm_campaign='' THEN excluded.utm_campaign ELSE sessions.utm_campaign END,utm_content=CASE WHEN sessions.utm_content='' THEN excluded.utm_content ELSE sessions.utm_content END,utm_term=CASE WHEN sessions.utm_term='' THEN excluded.utm_term ELSE sessions.utm_term END,fbclid=CASE WHEN sessions.fbclid='' THEN excluded.fbclid ELSE sessions.fbclid END,device_type=excluded.device_type,browser=excluded.browser,updated_at=excluded.updated_at`)
    .bind(payload.session_id,now,now,payload.current_page,payload.current_step,payload.quiz_total_steps,payload.vsl_progress,payload.page_path,payload.referrer,payload.utm_source,payload.utm_medium,payload.utm_campaign,payload.utm_content,payload.utm_term,payload.fbclid,payload.device_type,payload.browser,now,now);
}

async function parseBody(request) {
  const declared=Number(request.headers.get('content-length') || 0);
  if (declared > 8192) throw new Error('Payload muito grande');
  const source=await request.text();
  if (source.length > 8192) throw new Error('Payload muito grande');
  try { return JSON.parse(source); } catch { throw new Error('JSON inválido'); }
}

async function ingest(request, env, isEvent) {
  const origin=request.headers.get('Origin');
  if (!isOriginAllowed(origin,env)) return json({error:'Origem não permitida'},403);
  try {
    const raw=await parseBody(request);
    const payload=validatePayload(raw);
    const now=nowSeconds();
    const upsert=sessionStatement(env.ANALYTICS_DB,payload,now);
    if (!isEvent) { await upsert.run(); return json({ok:true},200,corsHeaders(origin,env)); }
    if (!EVENT_NAMES.has(raw.event_name)) return json({error:'Evento não permitido'},400,corsHeaders(origin,env));
    const id=/^[a-f0-9-]{20,64}$/i.test(raw.event_id || '') ? raw.event_id : crypto.randomUUID();
    const sourceData=raw.event_data && typeof raw.event_data==='object' && !Array.isArray(raw.event_data) ? raw.event_data : {};
    const eventData={page:payload.current_page};
    for (const [key,value] of Object.entries(sourceData).slice(0,20)) {
      if (/^[a-z0-9_]{1,40}$/i.test(key) && ['string','number','boolean'].includes(typeof value)) eventData[key]=typeof value==='string'?value.slice(0,200):value;
    }
    const serialized=JSON.stringify(eventData);
    const insert=env.ANALYTICS_DB.prepare('INSERT OR IGNORE INTO events (id,session_id,event_name,event_data,created_at) VALUES (?,?,?,?,?)').bind(id,payload.session_id,raw.event_name,serialized,now);
    await env.ANALYTICS_DB.batch([upsert,insert]);
    return json({ok:true},200,corsHeaders(origin,env));
  } catch (error) { return json({error:error.message},400,corsHeaders(origin,env)); }
}

function authorized(request, env) {
  const expected=String(env.ANALYTICS_ADMIN_TOKEN || '');
  const supplied=request.headers.get('Authorization') || '';
  const actual=supplied.startsWith('Bearer ') ? supplied.slice(7) : '';
  if (!expected || actual.length !== expected.length) return false;
  let diff=0; for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^actual.charCodeAt(i);
  return diff===0;
}

export function rangeStart(range, now=nowSeconds()) {
  if (range==='15m') return now-900;
  if (range==='1h') return now-3600;
  if (range==='today') { const date=new Date(now*1000); return Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/1000); }
  return now-300;
}

function filters(url, since, prefix='') {
  const clauses=[`${prefix}last_seen_at >= ?`]; const values=[since];
  for (const [param,column] of [['source','utm_source'],['campaign','utm_campaign'],['page','current_page']]) {
    const value=text(url.searchParams.get(param),200);
    if (value && (param!=='page' || ['quiz','vsl'].includes(value))) { clauses.push(`${prefix}${column} = ?`); values.push(value); }
  }
  return {where:clauses.join(' AND '),values};
}

async function overview(url, env) {
  const now=nowSeconds(),since=rangeStart(url.searchParams.get('range'),now),filter=filters(url,since);
  const summary=await env.ANALYTICS_DB.prepare(`SELECT COUNT(*) visitors,SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) online,SUM(CASE WHEN current_page='quiz' AND last_seen_at >= ? THEN 1 ELSE 0 END) quiz_online,SUM(CASE WHEN current_page='vsl' AND last_seen_at >= ? THEN 1 ELSE 0 END) vsl_online FROM sessions WHERE ${filter.where}`).bind(now-30,now-30,now-30,...filter.values).first();
  const funnelFilter=filters(url,since,'s.');
  const funnel=await env.ANALYTICS_DB.prepare(`SELECT e.event_name,COUNT(DISTINCT e.session_id) total FROM events e JOIN sessions s ON s.session_id=e.session_id WHERE e.created_at >= ? AND ${funnelFilter.where} AND e.event_name IN ('quiz_started','quiz_completed','vsl_started','cta_clicked','vsl_cta_clicked') GROUP BY e.event_name`).bind(since,...funnelFilter.values).all();
  const counts=Object.fromEntries((funnel.results||[]).map(row=>[row.event_name,row.total]));
  return json({now,window_start:since,summary:{visitors:Number(summary?.visitors||0),online:Number(summary?.online||0),quiz_online:Number(summary?.quiz_online||0),vsl_online:Number(summary?.vsl_online||0),cta:Number(counts.cta_clicked||0)+Number(counts.vsl_cta_clicked||0)},funnel:{entries:Number(summary?.visitors||0),quiz_started:Number(counts.quiz_started||0),quiz_completed:Number(counts.quiz_completed||0),vsl_started:Number(counts.vsl_started||0),cta:Number(counts.cta_clicked||0)+Number(counts.vsl_cta_clicked||0)}});
}

async function sessions(url, env) {
  const now=nowSeconds(),since=rangeStart(url.searchParams.get('range'),now),filter=filters(url,since);
  const limit=integer(url.searchParams.get('limit')||100,1,200);
  const result=await env.ANALYTICS_DB.prepare(`SELECT session_id,started_at,last_seen_at,current_page,current_step,quiz_total_steps,vsl_progress,page_path,utm_source,utm_campaign,utm_content,device_type,browser FROM sessions WHERE ${filter.where} ORDER BY CASE WHEN last_seen_at >= ? THEN 0 ELSE 1 END,last_seen_at DESC LIMIT ?`).bind(...filter.values,now-30,limit).all();
  return json({now,sessions:result.results||[]});
}

async function sessionDetail(id, env) {
  if (!/^[a-f0-9-]{20,64}$/i.test(id)) return json({error:'Sessão inválida'},400);
  const session=await env.ANALYTICS_DB.prepare('SELECT * FROM sessions WHERE session_id=?').bind(id).first();
  if (!session) return json({error:'Sessão não encontrada'},404);
  const events=await env.ANALYTICS_DB.prepare('SELECT id,event_name,event_data,created_at FROM events WHERE session_id=? ORDER BY created_at ASC LIMIT 500').bind(id).all();
  return json({session,events:(events.results||[]).map(event=>({...event,event_data:JSON.parse(event.event_data||'{}')}))});
}

async function handle(request, env) {
  const url=new URL(request.url),path=url.pathname;
  if (request.method==='OPTIONS' && path.startsWith('/api/analytics/')) {
    const origin=request.headers.get('Origin');
    if (!isOriginAllowed(origin,env)) return new Response(null,{status:403});
    return new Response(null,{status:204,headers:corsHeaders(origin,env)});
  }
  if (request.method==='POST' && path==='/api/analytics/heartbeat') return ingest(request,env,false);
  if (request.method==='POST' && path==='/api/analytics/event') return ingest(request,env,true);
  if (request.method==='GET' && path.startsWith('/api/analytics/')) {
    if (!authorized(request,env)) return json({error:'Não autorizado'},401,{'WWW-Authenticate':'Bearer'});
    if (path==='/api/analytics/overview') return overview(url,env);
    if (path==='/api/analytics/sessions') return sessions(url,env);
    const match=path.match(/^\/api\/analytics\/session\/([^/]+)$/);
    if (match) return sessionDetail(match[1],env);
  }
  if (path==='/health') return json({ok:true});
  return env.ASSETS.fetch(request);
}

export default { fetch: handle };
