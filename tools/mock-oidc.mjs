#!/usr/bin/env node
/* TEST-ONLY mock of Google's OpenID Connect provider (authorization code + PKCE).
   Lets the e2e tests (and local development without Google credentials) exercise the real sign-in code path.
   The server only accepts it via OIDC_TEST_ISSUER, which it refuses when NODE_ENV=production.
   Env: MOCK_OIDC_PORT (9090), MOCK_OIDC_ISSUER (URL the *server* uses; also the token issuer),
        MOCK_OIDC_PUBLIC_URL (URL the *browser* uses for the sign-in page), MOCK_OIDC_CLIENT_ID / MOCK_OIDC_CLIENT_SECRET. */
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_OIDC_PORT || 9090);
const ISSUER = (process.env.MOCK_OIDC_ISSUER || `http://localhost:${PORT}`).replace(/\/$/, '');
const PUBLIC = (process.env.MOCK_OIDC_PUBLIC_URL || ISSUER).replace(/\/$/, '');
const CLIENT_ID = process.env.MOCK_OIDC_CLIENT_ID || 'mock-client-id';
const CLIENT_SECRET = process.env.MOCK_OIDC_CLIENT_SECRET || 'mock-client-secret';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'mock-1', use: 'sig', alg: 'RS256' };
const codes = new Map();
let lastAvatar = null;   // last profile-picture request (size suffix) – lets tests check the server asked for a big image
/* Google-style profile pictures: <issuer>/avatar/<id>=s96-c. Rendered on the fly as a PNG (radial blob on a
   colour derived from the id), size taken from the =sNN suffix. E-mails containing "nopic" get no picture. */
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function avatarPng(id, size) {
  const h = crypto.createHash('sha256').update(id).digest(), hue = h[0] / 255 * 360;
  const rgb = (hh, l) => { const a = 0.75 * Math.min(l, 1 - l), f = n => { const k = (n + hh / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
  const bg = rgb(hue, 0.55), fg = rgb((hue + 160) % 360, 0.7), raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; for (let x = 0; x < size; x++) {
    const dx = x / size - 0.5, dy = y / size - 0.38, head = dx * dx + dy * dy < 0.035, body = (x / size - 0.5) ** 2 / 0.09 + (y / size - 1.02) ** 2 / 0.16 < 1;
    const c = head || body ? fg : bg, o = y * (size * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = payload => { const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'mock-1' }), p = b64(payload); return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => r(new URLSearchParams(d))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC);
  if (url.pathname === '/.well-known/openid-configuration') return json(res, 200, {
    issuer: ISSUER, authorization_endpoint: `${PUBLIC}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'], token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'], claims_supported: ['sub', 'email', 'email_verified', 'name', 'picture']
  });
  if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/__avatar_last') return json(res, 200, { last: lastAvatar });
  const av = /^\/avatar\/([a-f0-9]{8,40})(?:=s(\d{2,4})(-c)?)?$/.exec(url.pathname);
  if (av && req.method === 'GET') {
    const size = Math.min(1024, Math.max(16, Number(av[2] || 96)));
    lastAvatar = { id: av[1], size, at: Date.now() };
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }); return res.end(avatarPng(av[1], size));
  }
  if (url.pathname === '/authorize' && req.method === 'GET') {
    const q = url.searchParams;
    if (q.get('client_id') !== CLIENT_ID) return json(res, 400, { error: 'unauthorized_client' });
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('state') || !q.get('nonce')) return json(res, 400, { error: 'invalid_request', error_description: 'PKCE S256, state and nonce are required' });
    const hidden = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'scope'].map(k => `<input type="hidden" name="${k}" value="${esc(q.get(k))}">`).join('');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Mock Google sign-in</title>
<body style="font-family:system-ui;max-width:380px;margin:40px auto;padding:0 16px">
<h2>🧪 Mock Google sign-in</h2><p style="color:#666">Test-only identity provider. No real Google account is involved.</p>
<form method="post" action="/authorize">${hidden}
<label>E-mail<br><input name="email" id="email" value="${esc(q.get('login_hint') || 'student@example.com')}" style="width:100%;padding:8px"></label><br><br>
<label>Name<br><input name="name" id="name" value="Test Student" style="width:100%;padding:8px"></label><br><br>
<button id="signin" style="padding:10px 18px">Sign in</button> <button name="deny" value="1" id="deny">Cancel</button></form></body>`);
  }
  if (url.pathname === '/authorize' && req.method === 'POST') {
    const f = await body(req), redirect = new URL(f.get('redirect_uri'));
    if (f.get('deny')) { redirect.searchParams.set('error', 'access_denied'); redirect.searchParams.set('state', f.get('state')); res.writeHead(302, { location: redirect.href }); return res.end(); }
    const code = crypto.randomBytes(16).toString('base64url'), email = (f.get('email') || '').trim().toLowerCase();
    codes.set(code, { redirect_uri: f.get('redirect_uri'), challenge: f.get('code_challenge'), nonce: f.get('nonce'), email, name: f.get('name') || '', sub: 'mock-' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 20), exp: Date.now() + 60e3 });
    redirect.searchParams.set('code', code); redirect.searchParams.set('state', f.get('state'));
    res.writeHead(302, { location: redirect.href }); return res.end();
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const f = await body(req);
    let id = f.get('client_id'), secret = f.get('client_secret');
    const basic = (req.headers.authorization || '').match(/^Basic (.+)$/);
    if (basic) [id, secret] = Buffer.from(basic[1], 'base64').toString().split(':').map(decodeURIComponent);
    if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return json(res, 401, { error: 'invalid_client' });
    const c = codes.get(f.get('code')); codes.delete(f.get('code'));
    if (!c || c.exp < Date.now() || f.get('grant_type') !== 'authorization_code' || f.get('redirect_uri') !== c.redirect_uri) return json(res, 400, { error: 'invalid_grant' });
    const check = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
    if (check !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
    const now = Math.floor(Date.now() / 1000);
    return json(res, 200, { access_token: crypto.randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile',
      id_token: sign({ iss: ISSUER, aud: CLIENT_ID, sub: c.sub, iat: now, exp: now + 3600, nonce: c.nonce, email: c.email, email_verified: true, name: c.name, ...(c.email.includes('nopic') ? {} : { picture: `${ISSUER}/avatar/${c.sub.slice(5)}=s96-c` }) }) });
  }
  json(res, 404, { error: 'not_found' });
}).listen(PORT, () => console.log(`mock OIDC provider on :${PORT} (issuer ${ISSUER}, browser ${PUBLIC})`));
