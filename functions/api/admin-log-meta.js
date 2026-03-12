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

function maskIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return 'IP indisponible';

  // IPv4 masking: 123.45.67.xxx
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    const parts = value.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }

  // IPv6 masking: keep first 4 blocks then hide the rest.
  if (value.includes(':')) {
    const blocks = value.split(':').filter(Boolean);
    const head = blocks.slice(0, 4).join(':');
    return `${head}:****`;
  }

  return 'IP masquee';
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
  const { request } = context;

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const accessToken = String(body?.accessToken || '');
  const email = await getUserEmailFromToken(accessToken);

  if (email !== ADMIN_EMAIL) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ipRaw = String(forwarded || '').split(',')[0].trim();

  return jsonResponse({
    ok: true,
    email,
    ip: maskIp(ipRaw)
  }, 200);
}
