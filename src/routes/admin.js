import express from 'express';
import {
  createRateLimiter, endSession, hashPassword, requireAdmin, startSession, verifyCsrf, verifyPassword,
} from '../auth.js';
import {
  CATEGORY_I18N_FIELDS, EXTRA_LANGS, LANG_META, PRODUCT_I18N_FIELDS, SETTING_I18N_KEYS, parseTranslations,
} from '../i18n.js';
import { LEAD_STATUSES, SETTING_DEFAULTS } from '../store.js';
import {
  createUploader, MAX_FILE_MB, MAX_GALLERY, storeUploads, uploadErrorMessage,
} from '../uploads.js';
import {
  normalizeLines, normalizeTags, parsePrice, safeUrl, slugify, str, toInt,
} from '../util.js';

const FLASH = {
  saved: 'Сохранено.',
  created: 'Разработка создана.',
  published: 'Опубликовано — уже видно в каталоге.',
  unpublished: 'Снято с публикации и перенесено в черновики.',
  duplicated: 'Создана копия — она сохранена как черновик.',
  deleted: 'Удалено.',
  demo_deleted: 'Демо-разработки удалены. Каталог готов к вашим продуктам.',
  password: 'Пароль изменён. Остальные сессии завершены.',
  user_added: 'Пользователь добавлен.',
};

const BASE_SETTING_FIELDS = [
  { key: 'site_name', label: 'Название сайта', max: 60 },
  { key: 'site_full_name', label: 'Полное название', max: 120 },
  { key: 'hero_title', label: 'Заголовок на главной', max: 140 },
  { key: 'hero_subtitle', label: 'Подзаголовок на главной', max: 400, textarea: true },
  { key: 'about_text', label: 'Блок «О нас» (поддерживает Markdown)', max: 4000, textarea: true, tall: true },
  { key: 'meta_description', label: 'Описание для поисковиков', max: 300, textarea: true },
  { key: 'contact_email', label: 'E-mail', max: 120 },
  { key: 'contact_phone', label: 'Телефон', max: 60 },
  { key: 'contact_telegram', label: 'Telegram (username без @ или ссылка)', max: 120 },
  { key: 'contact_address', label: 'Адрес / город', max: 200 },
  { key: 'currency', label: 'Валюта (символ после цены)', max: 8 },
  { key: 'timezone', label: 'Часовой пояс для дат в админке (например, Asia/Almaty)', max: 60 },
];

// переводы текстов главной: hero_title.kk, hero_title.en, … — с теми же ограничениями, что у русских
const SETTING_FIELDS = [
  ...BASE_SETTING_FIELDS,
  ...EXTRA_LANGS.flatMap((lang) => SETTING_I18N_KEYS.map((key) => {
    const base = BASE_SETTING_FIELDS.find((f) => f.key === key);
    return { ...base, key: `${key}.${lang}`, label: base.label, lang };
  })),
];

function asArray(v) {
  if (v === undefined || v === null || v === '') return [];
  return Array.isArray(v) ? v : [v];
}

// Максимальная длина переводимых полей — как у русских
const I18N_LIMITS = {
  title: 200, tagline: 300, description: 20000, audience: 120, duration: 120, format: 120, price_note: 120,
  name: 80,
};
const I18N_LINE_FIELDS = new Set(['features', 'modules']);

/** Поля i18n_kk_title, i18n_en_title, … → JSON {"kk": {"title": …}, "en": {…}} без пустых значений */
function translationsFromForm(body, fields, limits = I18N_LIMITS) {
  const out = {};
  for (const lang of EXTRA_LANGS) {
    const tr = {};
    for (const f of fields) {
      const raw = body[`i18n_${lang}_${f}`];
      const value = I18N_LINE_FIELDS.has(f) ? normalizeLines(raw) : str(raw, limits[f] ?? 300);
      if (value) tr[f] = value;
    }
    if (Object.keys(tr).length) out[lang] = tr;
  }
  return JSON.stringify(out);
}

function productFromForm(body) {
  return {
    translations: translationsFromForm(body, PRODUCT_I18N_FIELDS),
    title: str(body.title, 200),
    slug: slugify(str(body.slug, 100)),
    category_id: toInt(body.category_id),
    tagline: str(body.tagline, 300),
    description: str(body.description, 20000),
    audience: str(body.audience, 120),
    duration: str(body.duration, 120),
    format: str(body.format, 120),
    tags: normalizeTags(body.tags),
    features: normalizeLines(body.features),
    modules: normalizeLines(body.modules),
    price: parsePrice(body.price),
    price_note: str(body.price_note, 120),
    demo_url: safeUrl(body.demo_url),
    status: body.status === 'published' ? 'published' : 'draft',
    featured: body.featured ? 1 : 0,
    sort_order: toInt(body.sort_order, 0),
  };
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function adminRoutes({ store }) {
  const router = express.Router();
  const uploader = createUploader();
  const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

  const productUpload = (req, res, next) => {
    uploader.fields([{ name: 'cover', maxCount: 1 }, { name: 'gallery', maxCount: MAX_GALLERY }])(req, res, (err) => {
      req.uploadError = err || null;
      next();
    });
  };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.locals.flash = FLASH[req.query.ok] || '';
    res.locals.section = '';
    next();
  });
  router.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ---------- вход ----------
  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/admin');
    return res.render('admin/login', { error: '', email: '', next: str(req.query.next, 300) });
  });

  router.post('/login', async (req, res) => {
    const email = str(req.body.email, 200);
    const next = str(req.body.next, 300);
    const safeNext = next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
    if (!loginLimiter.hit(req.ip)) {
      return res.status(429).render('admin/login', {
        error: 'Слишком много попыток входа. Подождите 15 минут.', email, next,
      });
    }
    const user = await store.getUserByEmail(email);
    if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).render('admin/login', { error: 'Неверный e-mail или пароль.', email, next });
    }
    loginLimiter.reset(req.ip);
    await startSession(store, req, res, user.id);
    return res.redirect(303, safeNext);
  });

  // Всё ниже — только для авторизованных, все POST проверяются CSRF-токеном
  router.use(requireAdmin, verifyCsrf);
  router.use(async (req, res, next) => {
    res.locals.newLeads = (await store.countLeads()).new;
    next();
  });

  router.post('/logout', async (req, res) => {
    await endSession(store, req, res);
    res.redirect(303, '/admin/login');
  });

  // ---------- дашборд ----------
  router.get('/', async (req, res) => {
    const [productStats, leadStats, recentLeads, allProducts] = await Promise.all([
      store.countProducts(), store.countLeads(), store.listLeads({ limit: 6 }), store.listAllProducts(),
    ]);
    res.render('admin/dashboard', {
      section: 'dashboard',
      productStats,
      leadStats,
      recentLeads,
      recentProducts: allProducts.slice(0, 5),
    });
  });

  router.post('/demo/delete', async (req, res) => {
    const demo = await store.listDemoProducts();
    await store.deleteDemoProducts();
    await store.deleteFiles(demo.flatMap((p) => [p.cover, ...p.galleryList]));
    res.redirect(303, '/admin?ok=demo_deleted');
  });

  // ---------- разработки ----------
  router.get('/products', async (req, res) => {
    const filters = {
      status: ['draft', 'published'].includes(req.query.status) ? req.query.status : '',
      q: str(req.query.q, 100),
      category: toInt(req.query.category, 0),
    };
    res.render('admin/products', {
      section: 'products',
      products: await store.listAllProducts(filters),
      categories: await store.listCategories({ publishedCounts: false }),
      filters,
    });
  });

  const renderProductForm = async (res, { product, values, errors = {}, status = 200 }) => {
    res.status(status).render('admin/product-form', {
      section: 'products',
      product,
      values,
      errors,
      categories: await store.listCategories({ publishedCounts: false }),
      maxGallery: MAX_GALLERY,
      maxFileMb: MAX_FILE_MB,
    });
  };

  const validateProduct = async (data, rawBody, req) => {
    const errors = {};
    if (!data.title) errors.title = 'Укажите название.';
    if (data.category_id && !(await store.getCategory(data.category_id))) errors.category_id = 'Такой категории нет.';
    if (str(rawBody.demo_url) && !data.demo_url) errors.demo_url = 'Ссылка должна начинаться с http:// или https://';
    if (req.uploadError) errors.files = uploadErrorMessage(req.uploadError);
    return errors;
  };

  router.get('/products/new', (req, res) => renderProductForm(res, {
    product: null,
    values: { status: 'draft', category_id: toInt(req.query.category), sort_order: 0 },
  }));

  router.post('/products', productUpload, async (req, res) => {
    const body = req.body || {};
    const data = productFromForm(body);
    const errors = await validateProduct(data, body, req);
    if (Object.keys(errors).length) {
      return renderProductForm(res, {
        product: null, values: { ...body, ...data, i18n: parseTranslations(data.translations) }, errors, status: 422,
      });
    }
    const [cover = ''] = await storeUploads(store, req.files?.cover);
    const gallery = await storeUploads(store, req.files?.gallery);
    const id = await store.createProduct({ ...data, cover, gallery: JSON.stringify(gallery) });
    return res.redirect(303, `/admin/products/${id}/edit?ok=created`);
  });

  router.get('/products/:id/edit', async (req, res, next) => {
    const product = await store.getProduct(toInt(req.params.id));
    if (!product) return next();
    return renderProductForm(res, { product, values: product });
  });

  router.post('/products/:id', productUpload, async (req, res, next) => {
    const product = await store.getProduct(toInt(req.params.id));
    if (!product) return next();
    const body = req.body || {};
    const data = productFromForm(body);
    const errors = await validateProduct(data, body, req);
    if (Object.keys(errors).length) {
      return renderProductForm(res, {
        product,
        values: { ...product, ...body, ...data, i18n: parseTranslations(data.translations) },
        errors,
        status: 422,
      });
    }

    const toRemove = [];
    let { cover } = product;
    const [newCover] = await storeUploads(store, req.files?.cover);
    if (newCover || body.remove_cover) {
      if (cover) toRemove.push(cover);
      cover = newCover || '';
    }

    const removeSet = new Set(asArray(body.remove_gallery).map(String));
    let gallery = product.galleryList.filter((name) => {
      if (removeSet.has(name)) toRemove.push(name);
      return !removeSet.has(name);
    });
    gallery = gallery.concat(await storeUploads(store, req.files?.gallery));
    if (gallery.length > MAX_GALLERY) toRemove.push(...gallery.splice(MAX_GALLERY));

    await store.updateProduct(product.id, { ...data, cover, gallery: JSON.stringify(gallery), is_demo: false });
    await store.deleteFiles(toRemove);
    return res.redirect(303, `/admin/products/${product.id}/edit?ok=saved`);
  });

  router.post('/products/:id/status', async (req, res, next) => {
    const product = await store.getProduct(toInt(req.params.id));
    if (!product) return next();
    const status = req.body.status === 'published' ? 'published' : 'draft';
    await store.updateProduct(product.id, { status });
    const back = req.body.back === 'edit' ? `/admin/products/${product.id}/edit` : '/admin/products';
    return res.redirect(303, `${back}?ok=${status === 'published' ? 'published' : 'unpublished'}`);
  });

  router.post('/products/:id/duplicate', async (req, res, next) => {
    const id = await store.duplicateProduct(toInt(req.params.id));
    if (!id) return next();
    return res.redirect(303, `/admin/products/${id}/edit?ok=duplicated`);
  });

  router.post('/products/:id/delete', async (req, res, next) => {
    const product = await store.getProduct(toInt(req.params.id));
    if (!product) return next();
    await store.deleteProduct(product.id);
    await store.deleteFiles([product.cover, ...product.galleryList]);
    return res.redirect(303, '/admin/products?ok=deleted');
  });

  // ---------- категории ----------
  const renderCategories = async (res, { error = '', status = 200 } = {}) => {
    res.status(status).render('admin/categories', {
      section: 'categories',
      categories: await store.listCategories({ publishedCounts: false }),
      error,
    });
  };

  router.get('/categories', (req, res) => renderCategories(res));

  const categoryFromForm = (body) => ({
    name: str(body.name, 80),
    slug: slugify(str(body.slug, 80)),
    description: str(body.description, 300),
    sort_order: toInt(body.sort_order, 0),
    translations: translationsFromForm(body, CATEGORY_I18N_FIELDS),
  });

  router.post('/categories', async (req, res) => {
    const data = categoryFromForm(req.body);
    if (!data.name) return renderCategories(res, { error: 'Укажите название категории.', status: 422 });
    await store.createCategory(data);
    return res.redirect(303, '/admin/categories?ok=saved');
  });

  router.post('/categories/:id', async (req, res, next) => {
    const category = await store.getCategory(toInt(req.params.id));
    if (!category) return next();
    const data = categoryFromForm(req.body);
    await store.updateCategory(category.id, { ...data, name: data.name || category.name });
    return res.redirect(303, '/admin/categories?ok=saved');
  });

  router.post('/categories/:id/delete', async (req, res) => {
    const id = toInt(req.params.id);
    if (id) await store.deleteCategory(id);
    res.redirect(303, '/admin/categories?ok=deleted');
  });

  // ---------- заявки ----------
  router.get('/leads', async (req, res) => {
    const status = req.query.status in LEAD_STATUSES ? req.query.status : '';
    res.render('admin/leads', {
      section: 'leads',
      leads: await store.listLeads({ status }),
      stats: await store.countLeads(),
      status,
    });
  });

  router.get('/leads.csv', async (req, res) => {
    const header = ['№', 'Дата (UTC)', 'Статус', 'Имя', 'Организация', 'Контакт', 'Разработка', 'Сообщение', 'Заметка', 'Язык'];
    const rows = (await store.listLeads({ limit: 100000 })).map((l) => [
      l.id, new Date(l.created_at).toISOString().replace('T', ' ').slice(0, 16), LEAD_STATUSES[l.status],
      l.name, l.organization, l.contact, l.product_title, l.message, l.note, LANG_META[l.lang]?.name ?? l.lang,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    res.set('Content-Disposition', `attachment; filename="cclab-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type('text/csv; charset=utf-8').send(`﻿${csv}`);
  });

  router.post('/leads/:id', async (req, res) => {
    const id = toInt(req.params.id);
    if (id) {
      await store.updateLead(id, {
        status: req.body.status in LEAD_STATUSES ? req.body.status : undefined,
        note: req.body.note !== undefined ? str(req.body.note, 2000) : undefined,
      });
    }
    const back = req.body.filter in LEAD_STATUSES ? `?status=${req.body.filter}&ok=saved` : '?ok=saved';
    res.redirect(303, `/admin/leads${back}#lead-${id}`);
  });

  router.post('/leads/:id/delete', async (req, res) => {
    const id = toInt(req.params.id);
    if (id) await store.deleteLead(id);
    res.redirect(303, '/admin/leads?ok=deleted');
  });

  // ---------- настройки ----------
  router.get('/settings', async (req, res) => {
    res.render('admin/settings', { section: 'settings', fields: SETTING_FIELDS, values: res.locals.settings, errors: {} });
  });

  router.post('/settings', async (req, res) => {
    const values = {};
    for (const field of SETTING_FIELDS) values[field.key] = str(req.body[field.key], field.max);
    const errors = {};
    if (!values.site_name) values.site_name = SETTING_DEFAULTS.site_name;
    if (values.timezone) {
      try {
        new Intl.DateTimeFormat('ru-RU', { timeZone: values.timezone });
      } catch {
        errors.timezone = 'Неизвестный часовой пояс. Пример: Asia/Almaty, Asia/Tashkent, Europe/Moscow.';
      }
    }
    if (Object.keys(errors).length) {
      return res.status(422).render('admin/settings', { section: 'settings', fields: SETTING_FIELDS, values, errors });
    }
    await store.saveSettings(values);
    return res.redirect(303, '/admin/settings?ok=saved');
  });

  // ---------- команда ----------
  const renderTeam = async (res, { errors = {}, values = {}, status = 200 } = {}) => {
    res.status(status).render('admin/team', { section: 'team', users: await store.listUsers(), errors, values });
  };

  router.get('/team', (req, res) => renderTeam(res));

  router.post('/team', async (req, res) => {
    const values = { email: str(req.body.email, 200), name: str(req.body.name, 80) };
    const password = String(req.body.password || '');
    const errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Нужен корректный e-mail.';
    else if (await store.getUserByEmail(values.email)) errors.email = 'Такой пользователь уже есть.';
    if (password.length < 8) errors.password = 'Минимум 8 символов.';
    if (Object.keys(errors).length) return renderTeam(res, { errors, values, status: 422 });
    await store.createUser({ ...values, password_hash: hashPassword(password) });
    return res.redirect(303, '/admin/team?ok=user_added');
  });

  router.post('/team/password', async (req, res) => {
    const user = await store.getUser(req.user.id);
    const errors = {};
    const next = String(req.body.new_password || '');
    if (!verifyPassword(String(req.body.current_password || ''), user.password_hash)) {
      errors.current_password = 'Текущий пароль указан неверно.';
    }
    if (next.length < 8) errors.new_password = 'Минимум 8 символов.';
    else if (next !== String(req.body.confirm_password || '')) errors.confirm_password = 'Пароли не совпадают.';
    if (Object.keys(errors).length) return renderTeam(res, { errors, status: 422 });
    await store.updateUserPassword(user.id, hashPassword(next));
    await store.deleteUserSessions(user.id, req.session.id);
    return res.redirect(303, '/admin/team?ok=password');
  });

  router.post('/team/:id/delete', async (req, res) => {
    const id = toInt(req.params.id);
    if (!id || id === req.user.id || (await store.countUsers()) <= 1) {
      return renderTeam(res, { errors: { team: 'Нельзя удалить самого себя или последнего администратора.' }, status: 422 });
    }
    await store.deleteUser(id);
    return res.redirect(303, '/admin/team?ok=deleted');
  });

  return router;
}
