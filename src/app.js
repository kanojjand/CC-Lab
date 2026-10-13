import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { loadConfig } from './config.js';
import { openDatabase, withLock } from './db.js';
import { createStore, LEAD_STATUSES } from './store.js';
import { seedDatabase } from './seed.js';
import { hashPassword, loadSession, randomToken } from './auth.js';
import { renderMarkdown } from './markdown.js';
import { coverArt, heroRings, starPath } from './art.js';
import {
  formatDate, formatPrice, lines, modules, plural, productCode, truncate,
} from './util.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function telegramLink(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return { url: v, label: v.replace(/^https?:\/\//i, '') };
  const name = v.replace(/^@/, '').replace(/^t\.me\//i, '');
  return { url: `https://t.me/${encodeURIComponent(name)}`, label: `@${name}` };
}

async function ensureAdmin(store, config) {
  if ((await store.countUsers()) > 0) return;
  const password = config.adminPassword || randomToken(12);
  await store.createUser({ email: config.adminEmail, name: 'Администратор', password_hash: hashPassword(password) });
  if (!config.quiet) {
    const line = '─'.repeat(60);
    console.log(`\n${line}\n  Создан администратор CC Lab\n  Вход:   /admin\n  E-mail: ${config.adminEmail}`);
    console.log(config.adminPassword
      ? '  Пароль: из переменной ADMIN_PASSWORD'
      : `  Пароль: ${password}\n  Сохраните его и смените в разделе «Команда».`);
    console.log(`${line}\n`);
  }
}

export async function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const db = await openDatabase(config);
  const store = createStore(db);
  // первичное наполнение — под блокировкой, чтобы параллельные запуски не задвоили данные
  await withLock(db, 742002, async (tx) => {
    const txStore = createStore(tx);
    await seedDatabase(txStore, { demo: config.seedDemo });
    await ensureAdmin(txStore, config);
  });

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));
  if (config.production) app.set('view cache', true);

  const assetVersion = crypto.randomBytes(4).toString('hex');
  Object.assign(app.locals, {
    md: renderMarkdown,
    coverArt,
    heroRings,
    starPath,
    lines,
    modules,
    plural,
    truncate,
    productCode,
    leadStatuses: LEAD_STATUSES,
    asset: (p) => `${p}?v=${assetVersion}`,
  });

  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "script-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
      ].join('; '),
    });
    next();
  });

  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.production ? '7d' : 0 }));

  // загруженные картинки лежат в базе; имена уникальны, поэтому кэшируем навсегда
  app.get('/uploads/:name', async (req, res) => {
    const file = /^[\w.-]+$/.test(req.params.name) ? await store.getFile(req.params.name) : null;
    if (!file) return res.status(404).type('text').send('Not found');
    res.set({
      'Content-Type': file.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
    });
    return res.send(Buffer.from(file.data));
  });

  app.use(async (req, res, next) => {
    const settings = await store.getSettings();
    res.locals.settings = settings;
    res.locals.fmtPrice = (price) => formatPrice(price, settings.currency);
    res.locals.fmtDate = (value) => formatDate(value, settings.timezone);
    res.locals.siteUrl = config.siteUrl || `${req.protocol}://${req.get('host')}`;
    res.locals.telegram = telegramLink(settings.contact_telegram);
    next();
  });

  app.use(loadSession(store));
  app.use('/admin', adminRoutes({ store, config }));
  app.use(publicRoutes({ store, config }));

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Страница не найдена',
      message: 'Такой страницы нет — возможно, разработку сняли с публикации или ссылка устарела.',
      code: 404,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status === 404 || err.statusCode === 404) {
      return res.status(404).type('text').send('Not found');
    }
    console.error(err);
    if (res.headersSent) return undefined;
    return res.status(500).render('error', {
      title: 'Что-то пошло не так',
      message: 'Мы уже разбираемся. Попробуйте обновить страницу чуть позже.',
      code: 500,
    });
  });

  return { app, store, config, db };
}
