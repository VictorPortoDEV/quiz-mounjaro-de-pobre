(() => {
  const script = document.currentScript;
  const endpoint = (script?.dataset.endpoint || 'https://analytics.mounjarodpobre.com.br').replace(/\/$/, '');
  const page = script?.dataset.page || 'quiz';
  const joinedHosts = (script?.dataset.joinHosts || 'mounjarodpobre.com.br,www.mounjarodpobre.com.br,quiz.mounjarodepobreon.com,aceleradormetabolico.mounjarodpobre.com.br,desparasitese.mounjarodpobre.com.br').split(',').map(value => value.trim());
  const params = new URLSearchParams(location.search);
  const incomingId = params.get('sid');
  const storageKey = 'mdp_analytics_session';
  const readStored = () => {
    try { return localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey); } catch { return null; }
  };
  const sessionId = (/^[a-f0-9-]{20,64}$/i.test(incomingId || '') && incomingId) || readStored() || crypto.randomUUID();
  try { localStorage.setItem(storageKey, sessionId); sessionStorage.setItem(storageKey, sessionId); } catch {}

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
    if (!endpoint || location.protocol === 'file:') return Promise.resolve();
    return fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, ...state, ...body }),
      keepalive: true,
      mode: 'cors',
      credentials: 'omit'
    }).catch(() => {});
  };
  const heartbeat = () => document.visibilityState === 'visible' && send('/api/analytics/heartbeat');
  const api = {
    sessionId,
    setState(next) { Object.assign(state, next); },
    heartbeat,
    event(eventName, eventData = {}) {
      return send('/api/analytics/event', { event_id: crypto.randomUUID(), event_name: eventName, event_data: eventData });
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
  setInterval(heartbeat, 10000);
})();
