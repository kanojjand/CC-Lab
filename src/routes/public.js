import express from 'express';
import { createRateLimiter } from '../auth.js';
import { notifyNewLead } from '../notify.js';
import { str, toInt } from '../util.js';

const SORT_LABELS = {
  recommended: 'Рекомендуемые',
  new: 'Сначала новые',
  price_asc: 'Сначала дешевле',
  price_desc: 'Сначала дороже',
};

export function publicRoutes({ store, config }) {
  const router = express.Router();
  const leadLimiter = createRateLimiter({ max: 6, windowMs: 10 * 60 * 1000 });

  const publishedOnly = (product) => (product?.status === 'published' ? product : null);

  router.get('/', async (req, res) => {
    const [featured, categories] = await Promise.all([store.listFeatured(6), store.listCategories()]);
    res.render('home', {
      featured,
      categories,
      totalPublished: categories.reduce((sum, c) => sum + c.count, 0) || (await store.countProducts()).published,
    });
  });

  router.get('/catalog', async (req, res) => {
    const filters = {
      category: str(req.query.category, 80),
      q: str(req.query.q, 100),
      tag: str(req.query.tag, 40),
      sort: SORT_LABELS[req.query.sort] ? req.query.sort : 'recommended',
    };
    const categories = await store.listCategories();
    const activeCategory = categories.find((c) => c.slug === filters.category) || null;
    if (filters.category && !activeCategory) filters.category = '';
    const [products, tags] = await Promise.all([store.listPublished(filters), store.allTags()]);
    res.render('catalog', {
      products,
      categories,
      activeCategory,
      filters,
      sortLabels: SORT_LABELS,
      tags: tags.slice(0, 12),
      totalPublished: categories.reduce((sum, c) => sum + c.count, 0),
    });
  });

  router.get('/catalog/:slug', async (req, res, next) => {
    const product = await store.getProductBySlug(req.params.slug);
    if (!product || (product.status !== 'published' && !req.user)) return next();
    return res.render('product', {
      product,
      related: await store.listRelated(product, 3),
      values: {},
      errors: {},
    });
  });

  router.get('/request', async (req, res) => {
    const product = req.query.product ? await store.getProductBySlug(str(req.query.product, 100)) : null;
    res.render('request', { product: publishedOnly(product), values: {}, errors: {} });
  });

  router.post('/request', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
    const body = req.body || {};
    // Скрытое поле-ловушка для ботов: люди его не видят и не заполняют
    if (str(body.website)) return res.redirect(303, '/thanks');

    const values = {
      name: str(body.name, 120),
      organization: str(body.organization, 160),
      contact: str(body.contact, 160),
      message: str(body.message, 3000),
    };
    const productId = toInt(body.product_id);
    const product = publishedOnly(productId ? await store.getProduct(productId) : null);

    const errors = {};
    if (values.name.length < 2) errors.name = 'Как к вам обращаться?';
    if (values.contact.length < 5) errors.contact = 'Оставьте телефон, e-mail или Telegram — иначе мы не сможем ответить.';

    if (!Object.keys(errors).length && !leadLimiter.hit(req.ip)) {
      errors.form = 'Слишком много заявок подряд. Попробуйте через несколько минут или напишите нам напрямую.';
    }
    if (Object.keys(errors).length) {
      return res.status(422).render('request', { product, values, errors });
    }

    const lead = { ...values, product_id: product?.id ?? null, product_title: product?.title ?? '' };
    const id = await store.createLead(lead);
    // ждём отправку уведомления: на бессерверном хостинге фоновые задачи обрываются после ответа
    await notifyNewLead(config, lead, { adminUrl: `${res.locals.siteUrl}/admin/leads#lead-${id}` });
    return res.redirect(303, `/thanks${product ? `?product=${encodeURIComponent(product.slug)}` : ''}`);
  });

  router.get('/thanks', async (req, res) => {
    const product = req.query.product ? await store.getProductBySlug(str(req.query.product, 100)) : null;
    res.render('thanks', { product: publishedOnly(product) });
  });

  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\n\nSitemap: ${res.locals.siteUrl}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', async (req, res) => {
    const base = res.locals.siteUrl;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const urls = [
      { loc: `${base}/` },
      { loc: `${base}/catalog` },
      ...(await store.listPublished()).map((p) => ({
        loc: `${base}/catalog/${p.slug}`,
        lastmod: new Date(p.updated_at).toISOString().slice(0, 10),
      })),
    ];
    const body = urls
      .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
      .join('\n');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    );
  });

  return router;
}
