(() => {
  const script = document.currentScript;
  const endpoint = (script?.dataset.endpoint || 'https://analytics.mounjarodpobre.com.br').replace(/\/$/, '');
  const page = script?.dataset.page || 'quiz';
  const joinedHosts = (script?.dataset.joinHosts || 'mounjarodpobre.com.br,www.mounjarodpobre.com.br,quiz.mounjarodepobreon.com,aceleradormetabolico.mounjarodpobre.com.br,desparasitese.mounjarodpobre.com.br').split(',').map(value => value.trim());
  const params = new URLSearchParams(location.search);
  const incomingId = params.get('sid');
  const storageKey = 'mdp_analytics_session';
  const createId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const readStored = () => {
    try { return localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey); } catch { return null; }
  };
  const storedId = readStored();
  const sessionId = (/^[a-f0-9-]{20,64}$/i.test(incomingId || '') && incomingId) || storedId || createId();
  const blockedSessions = (script?.dataset.blockedSessions || '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
  let blocked = [sessionId, storedId].some(id => id && blockedSessions.includes(id.toLowerCase()));
  let heartbeatTimer;
  const blockSession = () => {
    if (blocked) return;
    blocked = true;
    clearInterval(heartbeatTimer);
    window.dispatchEvent(new Event('funnel:session-blocked'));
  };
  if (!blocked) try { localStorage.setItem(storageKey, sessionId); sessionStorage.setItem(storageKey, sessionId); } catch {}

  const browser = (() => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Outro';
  })();
  const campaign = Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid'].map(key => [key, (params.get(key) || '').slice(0, 200)]));
  const cleanReferrer = (() => { try { const url = new URL(document.referrer); return `${url.origin}${url.pathname}`.slice(0, 500); } catch { return ''; } })();
  const base = {
    session_id: sessionId,
    current_page: page,
    page_path: location.pathname.slice(0, 500),
    referrer: cleanReferrer,
    device_type: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
    browser,
    ...campaign
  };
  const state = { current_step: null, quiz_total_steps: null, vsl_progress: null };

  const send = (path, body) => {
    if (blocked || !endpoint || location.protocol === 'file:') return Promise.resolve();
    return fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, ...state, ...body }),
      keepalive: true,
      mode: 'cors',
      credentials: 'omit'
    }).then(async response => {
      if (response.status === 403) {
        const result = await response.json();
        if (result.code === 'session_blocked') blockSession();
      }
      return response;
    }).catch(() => {});
  };
  const heartbeat = () => document.visibilityState === 'visible' && send('/api/analytics/heartbeat');
  const api = {
    sessionId,
    get blocked() { return blocked; },
    setState(next) { Object.assign(state, next); },
    heartbeat,
    event(eventName, eventData = {}) {
      return send('/api/analytics/event', { event_id: createId(), event_name: eventName, event_data: eventData });
    }
  };
  window.FunnelAnalytics = api;
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href, location.href);
      if (url.protocol === 'https:' && joinedHosts.includes(url.hostname) && url.hostname !== location.hostname) {
        url.searchParams.set('sid', sessionId);
        link.href = url.toString();
      }
    } catch {}
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') heartbeat(); });
  api.event('page_view');
  heartbeat();
  if (!blocked) heartbeatTimer = setInterval(heartbeat, 10000);
})();
