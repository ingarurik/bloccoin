const SUPABASE_URL = 'https://cimyrkybpnssyeyobyrh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_XAfHoy6vcPskEW1vNJaAkA_92iGeE-v';
const ADMIN_EMAIL = 'ingaruriksonic@gmail.com';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let result = 0;
  for (let i = 0; i < x.length; i += 1) {
    result |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return result === 0;
}

async function getUserEmailFromToken(accessToken) {
  if (!accessToken) return '';

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) return '';
    const user = await response.json();
    return (user?.email || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const expectedHash = String(env.ADMIN_PANEL_PASSWORD_HASH || '').trim().toLowerCase();
  const salt = String(env.ADMIN_PANEL_PASSWORD_SALT || 'bloccoin-admin-salt-v1');

  if (!expectedHash) {
    return jsonResponse({ ok: false, error: 'missing_admin_hash' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const password = String(body?.password || '');
  const accessToken = String(body?.accessToken || '');

  if (!password || !accessToken) {
    return jsonResponse({ ok: false, error: 'missing_fields' }, 400);
  }

  const email = await getUserEmailFromToken(accessToken);
  if (email !== ADMIN_EMAIL) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  const candidateHash = await sha256Hex(`${salt}:${password}`);
  if (!constantTimeEqual(candidateHash, expectedHash)) {
    return jsonResponse({ ok: false, error: 'invalid_password' }, 401);
  }

  return jsonResponse({ ok: true }, 200);
}
