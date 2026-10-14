import express from 'express';
import { createRateLimiter } from '../auth.js';
import {
  LANG_META, LANGS, localePath, localizeCategory, localizeProduct,
} from '../i18n.js';
import { notifyNewLead } from '../notify.js';
import { str, toInt } from '../util.js';

const SORTS = ['recommended', 'new', 'price_asc', 'price_desc'];

export function publicRoutes({ store, config }) {
  const router = express.Router();
  const leadLimiter = createRateLimiter({ max: 6, windowMs: 10 * 60 * 1000 });

  const publishedOnly = (product) => (product?.status === 'published' ? product : null);
  // контент из базы — на языке страницы (пустые переводы → русский текст)
  const lp = (req, p) => localizeProduct(p, req.lang);
  const lps = (req, list) => list.map((p) => localizeProduct(p, req.lang));
  const lcs = (req, list) => list.map((c) => localizeCategory(c, req.lang));

  router.get('/', async (req, res) => {
    const [featured, categories] = await Promise.all([store.listFeatured(6), store.listCategories()]);
    res.render('home', {
      featured: lps(req, featured),
      categories: lcs(req, categories),
      totalPublished: categories.reduce((sum, c) => sum + c.count, 0) || (await store.countProducts()).published,
    });
  });

  router.get('/catalog', async (req, res) => {
    const filters = {
      category: str(req.query.category, 80),
      q: str(req.query.q, 100),
      tag: str(req.query.tag, 40),
      sort: SORTS.includes(req.query.sort) ? req.query.sort : 'recommended',
    };
    const categories = lcs(req, await store.listCategories());
    const activeCategory = categories.find((c) => c.slug === filters.category) || null;
    if (filters.category && !activeCategory) filters.category = '';
    const [products, tags] = await Promise.all([store.listPublished(filters), store.allTags()]);
    res.render('catalog', {
      products: lps(req, products),
      categories,
      activeCategory,
      filters,
      sortLabels: Object.fromEntries(SORTS.map((k) => [k, res.locals.t(`sort.${k}`)])),
      tags: tags.slice(0, 12),
      totalPublished: categories.reduce((sum, c) => sum + c.count, 0),
    });
  });

  router.get('/catalog/:slug', async (req, res, next) => {
    const product = await store.getProductBySlug(req.params.slug);
    if (!product || (product.status !== 'published' && !req.user)) return next();
    return res.render('product', {
      product: lp(req, product),
      related: lps(req, await store.listRelated(product, 3)),
      values: {},
      errors: {},
    });
  });

  router.get('/request', async (req, res) => {
    const product = req.query.product ? await store.getProductBySlug(str(req.query.product, 100)) : null;
    res.render('request', { product: lp(req, publishedOnly(product)), values: {}, errors: {} });
  });

  router.post('/request', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
    const { t, L } = res.locals;
    const body = req.body || {};
    // Скрытое поле-ловушка для ботов: люди его не видят и не заполняют
    if (str(body.website)) return res.redirect(303, L('/thanks'));

    const values = {
      name: str(body.name, 120),
      organization: str(body.organization, 160),
      contact: str(body.contact, 160),
      message: str(body.message, 3000),
    };
    const productId = toInt(body.product_id);
    const product = publishedOnly(productId ? await store.getProduct(productId) : null);

    const errors = {};
    if (values.name.length < 2) errors.name = t('form.err.name');
    if (values.contact.length < 5) errors.contact = t('form.err.contact');

    if (!Object.keys(errors).length && !leadLimiter.hit(req.ip)) {
      errors.form = t('form.err.rate');
    }
    if (Object.keys(errors).length) {
      return res.status(422).render('request', { product: lp(req, product), values, errors });
    }

    // в админку и Telegram название уходит по-русски, а язык заявки сохраняем отдельно
    const lead = { ...values, product_id: product?.id ?? null, product_title: product?.title ?? '', lang: req.lang };
    const id = await store.createLead(lead);
    // ждём отправку уведомления: на бессерверном хостинге фоновые задачи обрываются после ответа
    await notifyNewLead(config, lead, { adminUrl: `${res.locals.siteUrl}/admin/leads#lead-${id}` });
    return res.redirect(303, L(`/thanks${product ? `?product=${encodeURIComponent(product.slug)}` : ''}`));
  });

  router.get('/thanks', async (req, res) => {
    const product = req.query.product ? await store.getProductBySlug(str(req.query.product, 100)) : null;
    res.render('thanks', { product: lp(req, publishedOnly(product)) });
  });

  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\n\nSitemap: ${res.locals.siteUrl}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', async (req, res) => {
    const base = res.locals.siteUrl;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const pages = [
      { path: '/' },
      { path: '/catalog' },
      ...(await store.listPublished()).map((p) => ({
        path: `/catalog/${p.slug}`,
        lastmod: new Date(p.updated_at).toISOString().slice(0, 10),
      })),
    ];
    // каждая страница — на всех языках, со ссылками на версии друг друга
    const urls = pages.flatMap(({ path, lastmod }) => {
      const alternates = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${LANG_META[l].hreflang}" href="${esc(base + localePath(l, path))}"/>`)
        .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${esc(base + path)}"/>`)
        .join('');
      return LANGS.map((l) => `  <url><loc>${esc(base + localePath(l, path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${alternates}</url>`);
    });
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
      + `${urls.join('\n')}\n</urlset>\n`,
    );
  });

  return router;
}
