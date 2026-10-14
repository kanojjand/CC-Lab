import crypto from 'node:crypto';

const COOKIE = 'cclab_sid';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge,
  };
}

export async function startSession(store, req, res, userId) {
  const token = randomToken();
  await store.createSession({
    id: sha256(token),
    user_id: userId,
    csrf: randomToken(24),
    expires_at: Date.now() + SESSION_TTL_MS,
  });
  res.cookie(COOKIE, token, cookieOptions(req, SESSION_TTL_MS));
}

export async function endSession(store, req, res) {
  if (req.session) await store.deleteSession(req.session.id);
  res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
}

/** Подтягивает текущего админа (если есть) в req.user / res.locals.user */
export function loadSession(store) {
  let lastPurge = 0;
  return async (req, res, next) => {
    req.user = null;
    req.session = null;
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const session = await store.getSession(sha256(token));
      if (session) {
        req.session = session;
        req.user = { id: session.user_id, email: session.email, name: session.name };
      }
    }
    res.locals.user = req.user;
    res.locals.csrf = req.session?.csrf ?? '';
    if (Date.now() - lastPurge > 60 * 60 * 1000) {
      lastPurge = Date.now();
      store.purgeExpiredSessions().catch((err) => console.error('[auth] очистка сессий:', err.message));
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.user) return next();
  const nextUrl = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(`/admin/login${nextUrl}`);
}

/**
 * Проверка CSRF-токена для всех POST в админке.
 * Обычные формы передают его полем _csrf, формы с файлами — в query (?_csrf=…),
 * чтобы проверка шла до сохранения загруженных файлов.
 */
export function verifyCsrf(req, res, next) {
  if (req.method !== 'POST') return next();
  const sent = String((req.is('multipart/form-data') ? req.query._csrf : req.body?._csrf) || '');
  const expected = String(req.session?.csrf || '');
  const ok = expected && sent.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    return res.status(403).render('error', {
      title: 'Сессия устарела',
      message: 'Форма устарела или была отправлена с другого сайта. Обновите страницу и попробуйте ещё раз.',
    });
  }
  return next();
}

/** Простой лимитер в памяти: не больше `max` событий за `windowMs` на ключ */
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        entry = { count: 0, reset: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      }
      return entry.count <= max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
