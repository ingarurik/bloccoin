const ADMIN_CORE = {
  SUPABASE_URL: 'https://cimyrkybpnssyeyobyrh.supabase.co',
  SUPABASE_ANON: 'sb_publishable_XAfHoy6vcPskEW1vNJaAkA_92iGeE-v',
  ADMIN_EMAIL: 'ingaruriksonic@gmail.com',
  UNLOCK_KEY: 'bloccoin_adminpanel_unlock_v1',
  LOG_KEY: 'bloccoin_admin_logs_v1',
  LOG_META_ENDPOINT: '/api/admin-log-meta'
};

let logMetaCache = null;
let logMetaCacheUntil = 0;

function createAdminClient() {
  return supabase.createClient(ADMIN_CORE.SUPABASE_URL, ADMIN_CORE.SUPABASE_ANON, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      multiTab: false,
      storageKey: 'sb-cimyrkybpnssyeyobyrh-auth-token'
    }
  });
}

function readAdminUnlock() {
  try {
    const raw = sessionStorage.getItem(ADMIN_CORE.UNLOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email || !parsed.until) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function isAdminEmail(email) {
  return (email || '').trim().toLowerCase() === ADMIN_CORE.ADMIN_EMAIL;
}

function isAdminUnlocked(email) {
  const state = readAdminUnlock();
  if (!state) return false;
  if ((state.email || '').toLowerCase() !== (email || '').toLowerCase()) return false;
  return Number(state.until) > Date.now();
}

async function fetchLogMeta() {
  if (Date.now() < logMetaCacheUntil && logMetaCache) {
    return logMetaCache;
  }

  try {
    const client = createAdminClient();
    const { data: { session } } = await client.auth.getSession();
    const fallbackEmail = (session?.user?.email || '').trim().toLowerCase();

    if (!session?.access_token) {
      const fallback = { email: fallbackEmail || 'inconnu', ip: 'IP indisponible' };
      logMetaCache = fallback;
      logMetaCacheUntil = Date.now() + 20 * 1000;
      return fallback;
    }

    const response = await fetch(ADMIN_CORE.LOG_META_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ accessToken: session.access_token })
    });

    const data = await response.json().catch(() => ({}));
    const meta = {
      email: String(data?.email || fallbackEmail || 'inconnu'),
      ip: String(data?.ip || 'IP indisponible')
    };

    logMetaCache = meta;
    logMetaCacheUntil = Date.now() + 5 * 60 * 1000;
    return meta;
  } catch (_) {
    return { email: 'inconnu', ip: 'IP indisponible' };
  }
}

async function addAdminLog(action, details) {
  try {
    const meta = await fetchLogMeta();
    const item = {
      ts: new Date().toISOString(),
      action: String(action || 'action'),
      details: String(details || ''),
      actorEmail: String(meta?.email || 'inconnu'),
      actorIp: String(meta?.ip || 'IP indisponible')
    };
    const raw = localStorage.getItem(ADMIN_CORE.LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(item);
    localStorage.setItem(ADMIN_CORE.LOG_KEY, JSON.stringify(list.slice(0, 250)));
  } catch (_) {
    // Ignore logging failures.
  }
}

function readAdminLogs() {
  try {
    const raw = localStorage.getItem(ADMIN_CORE.LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

async function requireAdminUnlocked(client) {
  try {
    const { data: { session } } = await client.auth.getSession();
    const email = session?.user?.email || '';

    if (!session?.user || !isAdminEmail(email) || !isAdminUnlocked(email)) {
      return { ok: false, session: null, email: '' };
    }

    return { ok: true, session, email };
  } catch (_) {
    return { ok: false, session: null, email: '' };
  }
}

window.ADMIN_CORE = ADMIN_CORE;
window.createAdminClient = createAdminClient;
window.readAdminUnlock = readAdminUnlock;
window.addAdminLog = addAdminLog;
window.readAdminLogs = readAdminLogs;
window.requireAdminUnlocked = requireAdminUnlocked;
