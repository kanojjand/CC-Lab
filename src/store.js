import { parseTranslations } from './i18n.js';
import { parseJsonArray, productCode, slugify, tagList } from './util.js';

export const SETTING_DEFAULTS = {
  site_name: 'CC Lab',
  site_full_name: 'Code Collective Laboratory',
  hero_title: 'Лаборатория EdTech-разработок',
  hero_subtitle:
    'Готовые курсы, сайты для школ и образовательные программы под ключ. Выбирайте в каталоге — внедрим, обучим педагогов и останемся на связи.',
  about_text:
    'Мы — **Code Collective**: разработчики и педагоги, которые делают цифровые продукты для образования.\n\n' +
    'В лаборатории собираем курсы, сайты и программы, которые можно запустить в школе без долгой подготовки: с методичками, поурочными планами и поддержкой.',
  contact_email: '',
  contact_phone: '',
  contact_telegram: '',
  contact_address: '',
  currency: '₸',
  timezone: 'Asia/Almaty',
  meta_description:
    'CC Lab — каталог EdTech-разработок: курсы, сайты для школ и образовательные программы под ключ.',

  // переводы текстов главной (редактируются в «Настройках»; пустое поле → русский текст)
  'hero_title.kk': 'EdTech әзірлемелерінің зертханасы',
  'hero_title.en': 'EdTech Development Lab',
  'hero_subtitle.kk':
    'Мектептерге арналған дайын курстар, сайттар және білім беру бағдарламалары — толық дайын күйінде. Каталогтан таңдаңыз — біз енгізіп, педагогтарды оқытамыз және байланыста қаламыз.',
  'hero_subtitle.en':
    'Ready-made courses, school websites and educational programs, delivered turnkey. Pick one from the catalog — we will implement it, train your teachers and stay in touch.',
  'about_text.kk':
    'Біз — **Code Collective**: білім беру саласына цифрлық өнімдер жасайтын бағдарламашылар мен педагогтар.\n\n' +
    'Зертханада мектепте ұзақ дайындықсыз іске қосуға болатын курстарды, сайттарды және бағдарламаларды жинаймыз: әдістемелік нұсқаулықтарымен, сабақ жоспарларымен және қолдауымен.',
  'about_text.en':
    'We are **Code Collective**: developers and teachers building digital products for education.\n\n' +
    'In the lab we create courses, websites and programs that a school can launch without lengthy preparation — complete with teacher guides, lesson plans and support.',
  'meta_description.kk':
    'CC Lab — EdTech әзірлемелерінің каталогы: курстар, мектеп сайттары және білім беру бағдарламалары толық дайын күйінде.',
  'meta_description.en':
    'CC Lab — a catalog of EdTech products: courses, school websites and educational programs, delivered turnkey.',
};

export const LEAD_STATUSES = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Закрыта',
  rejected: 'Отказ',
};

const PRODUCT_FIELDS = [
  'slug', 'title', 'category_id', 'tagline', 'description', 'audience', 'duration', 'format', 'tags',
  'features', 'modules', 'price', 'price_note', 'demo_url', 'cover', 'gallery', 'status', 'featured',
  'sort_order', 'is_demo', 'translations',
];
const BOOL_FIELDS = new Set(['featured', 'is_demo']);

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.translations AS category_translations
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const SORTS = {
  recommended: 'p.featured DESC, p.sort_order ASC, p.published_at DESC NULLS LAST, p.id DESC',
  new: 'p.published_at DESC NULLS LAST, p.id DESC',
  price_asc: 'p.price ASC NULLS LAST, p.id DESC',
  price_desc: 'p.price DESC NULLS LAST, p.id DESC',
};

const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Собирает параметры запроса: add(value) → "$n" */
function params() {
  const values = [];
  return { values, add: (v) => { values.push(v); return `$${values.length}`; } };
}

export function decorateProduct(p) {
  if (!p) return p;
  return {
    ...p,
    code: productCode(p.id),
    tagList: tagList(p.tags),
    galleryList: parseJsonArray(p.gallery),
    i18n: parseTranslations(p.translations),
    featured: Boolean(p.featured),
    is_demo: Boolean(p.is_demo),
  };
}

// ищем по русским текстам и по переводам — запрос на любом языке находит разработку
const SEARCH_FIELDS = ['title', 'tagline', 'audience', 'format', 'description'];

function searchText(p) {
  const parts = [p.tags, ...SEARCH_FIELDS.map((f) => p[f])];
  for (const tr of Object.values(parseTranslations(p.translations))) {
    if (tr && typeof tr === 'object') parts.push(...SEARCH_FIELDS.map((f) => tr[f]));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function columnValue(field, value) {
  if (BOOL_FIELDS.has(field)) return Boolean(value) && value !== '0';
  return value ?? null;
}

export function createStore(db) {
  const store = {
    db,

    // ---------- настройки ----------
    async getSettings() {
      const rows = await db.query('SELECT key, value FROM settings');
      const settings = { ...SETTING_DEFAULTS };
      for (const { key, value } of rows) if (key in SETTING_DEFAULTS) settings[key] = value;
      return settings;
    },

    async saveSettings(values) {
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(values)) {
          if (!(key in SETTING_DEFAULTS)) continue;
          await tx.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
            [key, String(value ?? '')],
          );
        }
      });
    },

    async getMeta(key) {
      return (await db.one('SELECT value FROM settings WHERE key = $1', [`_${key}`]))?.value ?? null;
    },

    async setMeta(key, value) {
      await db.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [`_${key}`, String(value)],
      );
    },

    // ---------- категории ----------
    async listCategories({ publishedCounts = true } = {}) {
      const cond = publishedCounts ? "AND p.status = 'published'" : '';
      return db.query(`
        SELECT c.*, COUNT(p.id)::int AS count
        FROM categories c LEFT JOIN products p ON p.category_id = c.id ${cond}
        GROUP BY c.id ORDER BY c.sort_order, c.name`);
    },

    getCategory(id) {
      return db.one('SELECT * FROM categories WHERE id = $1', [id]);
    },

    async uniqueCategorySlug(base, excludeId = 0) {
      const root = slugify(base) || 'category';
      let slug = root;
      for (let i = 2; await db.one('SELECT 1 FROM categories WHERE slug = $1 AND id <> $2', [slug, excludeId]); i++) {
        slug = `${root}-${i}`;
      }
      return slug;
    },

    async createCategory({ name, slug, description = '', sort_order = 0, translations = '{}' }) {
      const s = await store.uniqueCategorySlug(slug || name);
      const row = await db.one(
        'INSERT INTO categories (name, slug, description, sort_order, translations) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, s, description, sort_order, translations],
      );
      return row.id;
    },

    async updateCategory(id, { name, slug, description = '', sort_order = 0, translations = '{}' }) {
      const s = await store.uniqueCategorySlug(slug || name, id);
      await db.query(
        'UPDATE categories SET name = $1, slug = $2, description = $3, sort_order = $4, translations = $5 WHERE id = $6',
        [name, s, description, sort_order, translations, id],
      );
    },

    async setCategoryTranslations(id, translations) {
      await db.query('UPDATE categories SET translations = $1 WHERE id = $2', [translations, id]);
    },

    async deleteCategory(id) {
      await db.query('DELETE FROM categories WHERE id = $1', [id]);
    },

    // ---------- разработки ----------
    async listPublished({ category = '', q = '', tag = '', sort = 'recommended', limit = 500 } = {}) {
      const p = params();
      const where = ["p.status = 'published'"];
      if (category) where.push(`c.slug = ${p.add(category)}`);
      if (q) {
        for (const word of q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
          where.push(`p.search_text LIKE ${p.add(`%${likeEscape(word)}%`)}`);
        }
      }
      if (tag) where.push(`(',' || p.tags || ',') LIKE ${p.add(`%,${likeEscape(tag.toLowerCase())},%`)}`);
      const order = SORTS[sort] || SORTS.recommended;
      const rows = await db.query(
        `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${p.add(limit)}`,
        p.values,
      );
      return rows.map(decorateProduct);
    },

    async listFeatured(limit = 6) {
      const rows = await db.query(`${PRODUCT_SELECT}
        WHERE p.status = 'published' ORDER BY ${SORTS.recommended} LIMIT $1`, [limit]);
      return rows.map(decorateProduct);
    },

    async listRelated(product, limit = 3) {
      const rows = await db.query(`${PRODUCT_SELECT}
        WHERE p.status = 'published' AND p.id <> $1
        ORDER BY (p.category_id IS NOT DISTINCT FROM $2::int) DESC, ${SORTS.recommended} LIMIT $3`,
      [product.id, product.category_id, limit]);
      return rows.map(decorateProduct);
    },

    async listAllProducts({ status = '', q = '', category = 0 } = {}) {
      const p = params();
      const where = ['true'];
      if (status) where.push(`p.status = ${p.add(status)}`);
      if (category) where.push(`p.category_id = ${p.add(category)}`);
      if (q) where.push(`p.search_text LIKE ${p.add(`%${likeEscape(q.toLowerCase())}%`)}`);
      const rows = await db.query(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY (p.status = 'draft') DESC, p.updated_at DESC, p.id DESC`, p.values);
      return rows.map(decorateProduct);
    },

    countProducts() {
      return db.one(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'published')::int AS published,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
          COUNT(*) FILTER (WHERE is_demo)::int AS demo
        FROM products`);
    },

    async getProduct(id) {
      if (!Number.isInteger(id)) return null;
      return decorateProduct(await db.one(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]));
    },

    async getProductBySlug(slug) {
      return decorateProduct(await db.one(`${PRODUCT_SELECT} WHERE p.slug = $1`, [slug]));
    },

    async uniqueProductSlug(base, excludeId = 0) {
      const root = slugify(base) || 'product';
      let slug = root;
      for (let i = 2; await db.one('SELECT 1 FROM products WHERE slug = $1 AND id <> $2', [slug, excludeId]); i++) {
        slug = `${root}-${i}`;
      }
      return slug;
    },

    async createProduct(data) {
      const row = { gallery: '[]', is_demo: false, ...data };
      row.slug = await store.uniqueProductSlug(row.slug || row.title);
      const cols = PRODUCT_FIELDS.filter((f) => f in row);
      const p = params();
      const values = cols.map((c) => p.add(columnValue(c, row[c])));
      const published = row.status === 'published' ? 'now()' : 'NULL';
      const created = await db.one(`
        INSERT INTO products (${cols.join(', ')}, search_text, published_at)
        VALUES (${values.join(', ')}, ${p.add(searchText(row))}, ${published}) RETURNING id`, p.values);
      return created.id;
    },

    async updateProduct(id, data) {
      const current = await db.one('SELECT * FROM products WHERE id = $1', [id]);
      if (!current) return false;
      const row = { ...current, ...data };
      row.slug = await store.uniqueProductSlug(row.slug || row.title, id);
      const cols = PRODUCT_FIELDS.filter((f) => f in data || f === 'slug');
      const p = params();
      const sets = cols.map((c) => `${c} = ${p.add(columnValue(c, row[c]))}`);
      const status = p.add(row.status);
      await db.query(`
        UPDATE products SET ${sets.join(', ')},
          search_text = ${p.add(searchText(row))},
          updated_at = now(),
          published_at = CASE WHEN ${status} = 'published' AND published_at IS NULL THEN now() ELSE published_at END
        WHERE id = ${p.add(id)}`, p.values);
      return true;
    },

    async duplicateProduct(id) {
      const p = await db.one('SELECT * FROM products WHERE id = $1', [id]);
      if (!p) return null;
      const copy = Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, p[f]]));
      return store.createProduct({
        ...copy,
        title: `${p.title} (копия)`,
        slug: `${p.slug}-copy`,
        status: 'draft',
        featured: false,
        is_demo: false,
        cover: '',
        gallery: '[]',
      });
    },

    async deleteProduct(id) {
      await db.query('DELETE FROM products WHERE id = $1', [id]);
    },

    async listDemoProducts() {
      return (await db.query('SELECT * FROM products WHERE is_demo')).map(decorateProduct);
    },

    async deleteDemoProducts() {
      await db.query('DELETE FROM products WHERE is_demo');
    },

    async allTags() {
      const counts = new Map();
      for (const { tags } of await db.query("SELECT tags FROM products WHERE status = 'published'")) {
        for (const t of tagList(tags)) counts.set(t, (counts.get(t) || 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    },

    // ---------- картинки ----------
    async saveFile({ name, mime, data }) {
      await db.query('INSERT INTO files (name, mime, size, data) VALUES ($1, $2, $3, $4)', [name, mime, data.length, data]);
    },

    getFile(name) {
      return db.one('SELECT mime, size, data FROM files WHERE name = $1', [name]);
    },

    async deleteFiles(names) {
      const list = names.filter(Boolean);
      if (list.length) await db.query('DELETE FROM files WHERE name = ANY($1::text[])', [list]);
    },

    // ---------- заявки ----------
    async createLead({ product_id = null, product_title = '', name, organization = '', contact, message = '', lang = 'ru' }) {
      const row = await db.one(`
        INSERT INTO leads (product_id, product_title, name, organization, contact, message, lang)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [product_id, product_title, name, organization, contact, message, lang]);
      return row.id;
    },

    listLeads({ status = '', limit = 1000 } = {}) {
      const p = params();
      const where = status ? `WHERE l.status = ${p.add(status)}` : '';
      return db.query(`
        SELECT l.*, pr.slug AS product_slug, pr.title AS current_product_title
        FROM leads l LEFT JOIN products pr ON pr.id = l.product_id
        ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ${p.add(limit)}`, p.values);
    },

    async countLeads() {
      const rows = await db.query('SELECT status, COUNT(*)::int AS n FROM leads GROUP BY status');
      const out = { total: 0, new: 0, in_progress: 0, done: 0, rejected: 0 };
      for (const { status, n } of rows) {
        out[status] = n;
        out.total += n;
      }
      return out;
    },

    async updateLead(id, { status, note }) {
      if (status !== undefined && status in LEAD_STATUSES) {
        await db.query('UPDATE leads SET status = $1 WHERE id = $2', [status, id]);
      }
      if (note !== undefined) await db.query('UPDATE leads SET note = $1 WHERE id = $2', [note, id]);
    },

    async deleteLead(id) {
      await db.query('DELETE FROM leads WHERE id = $1', [id]);
    },

    // ---------- пользователи и сессии ----------
    async countUsers() {
      return (await db.one('SELECT COUNT(*)::int AS n FROM users')).n;
    },

    listUsers() {
      return db.query('SELECT id, email, name, created_at FROM users ORDER BY id');
    },

    getUser(id) {
      return db.one('SELECT * FROM users WHERE id = $1', [id]);
    },

    getUserByEmail(email) {
      return db.one('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email).trim()]);
    },

    async createUser({ email, name = '', password_hash }) {
      const row = await db.one('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [String(email).trim(), name, password_hash]);
      return row.id;
    },

    async updateUserPassword(id, password_hash) {
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, id]);
    },

    async deleteUser(id) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    },

    async createSession({ id, user_id, csrf, expires_at }) {
      await db.query('INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES ($1, $2, $3, $4)',
        [id, user_id, csrf, new Date(expires_at)]);
    },

    getSession(id) {
      return db.one(`
        SELECT s.id, s.csrf, s.expires_at, u.id AS user_id, u.email, u.name
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`, [id]);
    },

    async deleteSession(id) {
      await db.query('DELETE FROM sessions WHERE id = $1', [id]);
    },

    async deleteUserSessions(userId, exceptId = '') {
      await db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, exceptId]);
    },

    async purgeExpiredSessions() {
      await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    },
  };

  return store;
}
