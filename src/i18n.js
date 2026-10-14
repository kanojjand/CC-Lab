// Языки сайта: русский — основной (адреса без префикса), казахский — /kk/…, английский — /en/….
// Тексты интерфейса лежат в src/locales; переводы контента (разработки, категории, тексты главной)
// хранятся в базе и редактируются в админке. Пустой перевод → показываем русский текст.
import ru from './locales/ru.js';
import kk from './locales/kk.js';
import en from './locales/en.js';

export const DEFAULT_LANG = 'ru';
export const LANGS = ['ru', 'kk', 'en'];
/** Языки, для которых в админке есть поля перевода */
export const EXTRA_LANGS = LANGS.filter((l) => l !== DEFAULT_LANG);

export const LANG_META = {
  ru: { short: 'РУС', name: 'Русский', locale: 'ru-RU', hreflang: 'ru' },
  kk: { short: 'ҚАЗ', name: 'Қазақша', locale: 'kk-KZ', hreflang: 'kk' },
  en: { short: 'ENG', name: 'English', locale: 'en-US', hreflang: 'en' },
};

const MESSAGES = { ru, kk, en };

// Переводимые поля контента
export const PRODUCT_I18N_FIELDS = [
  'title', 'tagline', 'description', 'audience', 'duration', 'format', 'features', 'modules', 'price_note',
];
export const CATEGORY_I18N_FIELDS = ['name', 'description'];
export const SETTING_I18N_KEYS = ['hero_title', 'hero_subtitle', 'about_text', 'meta_description'];

const pluralRules = Object.fromEntries(LANGS.map((l) => [l, new Intl.PluralRules(LANG_META[l].locale)]));

const interpolate = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

export function isLang(value) {
  return LANGS.includes(value);
}

/** t('nav.catalog'), t('thanks.for', { title }) — с откатом на русский */
export function translate(lang, key, vars) {
  const msg = MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANG][key];
  if (msg === undefined) return key;
  return interpolate(typeof msg === 'string' ? msg : msg.other, vars);
}

/** Число со словом в нужной форме: tp(5, 'unit.product') → «5 разработок» */
export function translatePlural(lang, n, key, vars) {
  const msg = MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANG][key];
  if (msg === undefined) return key;
  const forms = typeof msg === 'string' ? { other: msg } : msg;
  const form = forms[pluralRules[lang].select(n)] ?? forms.other ?? forms.many;
  return interpolate(form, { n, ...vars });
}

/** Ссылка на ту же страницу на нужном языке: localePath('kk', '/catalog?x=1') → '/kk/catalog?x=1' */
export function localePath(lang, path = '/') {
  if (lang === DEFAULT_LANG || !isLang(lang)) return path;
  if (path === '/' || path === '') return `/${lang}`;
  if (/^\/[?#]/.test(path)) return `/${lang}${path.slice(1)}`;
  return `/${lang}${path}`;
}

/** Разбирает префикс языка в адресе: '/kk/catalog?x' → { lang: 'kk', rest: '/catalog?x' } */
export function splitLang(url) {
  const m = /^\/(ru|kk|en)(?=[/?#]|$)/.exec(url);
  if (!m) return { lang: DEFAULT_LANG, rest: url, explicit: false };
  let rest = url.slice(m[0].length) || '/';
  if (!rest.startsWith('/')) rest = `/${rest}`;
  return { lang: m[1], rest, explicit: true };
}

export function parseTranslations(value) {
  if (value && typeof value === 'object') return value;
  try {
    const obj = JSON.parse(value || '{}');
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/** Значения полей на языке lang поверх русских; пустые переводы пропускаем */
export function localize(row, lang, fields, translations = row?.translations) {
  if (!row || lang === DEFAULT_LANG) return row;
  const tr = parseTranslations(translations)[lang] || {};
  const out = { ...row };
  for (const f of fields) {
    if (typeof tr[f] === 'string' && tr[f].trim()) out[f] = tr[f];
  }
  return out;
}

export function localizeProduct(p, lang) {
  if (!p || lang === DEFAULT_LANG) return p;
  const out = localize(p, lang, PRODUCT_I18N_FIELDS, p.i18n ?? p.translations);
  if (p.category_name) {
    out.category_name = localize({ name: p.category_name }, lang, ['name'], p.category_translations).name;
  }
  return out;
}

export function localizeCategory(c, lang) {
  return localize(c, lang, CATEGORY_I18N_FIELDS);
}

/** Тексты главной: hero_title.kk поверх hero_title */
export function localizeSettings(settings, lang) {
  if (lang === DEFAULT_LANG) return settings;
  const out = { ...settings };
  for (const key of SETTING_I18N_KEYS) {
    const v = settings[`${key}.${lang}`];
    if (typeof v === 'string' && v.trim()) out[key] = v;
  }
  return out;
}
