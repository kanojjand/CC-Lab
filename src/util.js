const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // казахский алфавит
  ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

export function slugify(input) {
  const base = String(input ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base;
}

export function str(value, max = 500) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function toInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** "150 000 ₸" → 150000; пусто → null */
export function parsePrice(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits.slice(0, 12));
  return Number.isSafeInteger(n) ? n : null;
}

export function formatPrice(price, currency = '₸', { locale = 'ru-RU', onRequest = 'По запросу' } = {}) {
  if (price === null || price === undefined || price === '') return onRequest;
  const num = new Intl.NumberFormat(locale).format(Number(price));
  return currency ? `${num} ${currency}` : num;
}

/** Текст «по строке на пункт» → массив непустых строк */
export function lines(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** «Название — описание» → { title, text } */
export function modules(text) {
  return lines(text).map((line) => {
    const m = line.match(/^(.*?)\s+[—–-]\s+(.*)$/) || line.match(/^(.*?):\s+(.*)$/);
    return m ? { title: m[1].trim(), text: m[2].trim() } : { title: line, text: '' };
  });
}

export function normalizeLines(text, maxLines = 60, maxLen = 400) {
  return lines(text).slice(0, maxLines).map((l) => l.slice(0, maxLen)).join('\n');
}

export function normalizeTags(text) {
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[,;\n]/)) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12).join(',');
}

export function tagList(tags) {
  return String(tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
}

export function safeUrl(value) {
  const v = str(value, 500);
  if (!v) return '';
  try {
    const url = new URL(v.includes('://') ? v : `https://${v}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function productCode(id) {
  return `CC-${String(id).padStart(3, '0')}`;
}

export function parseJsonArray(value) {
  try {
    const arr = JSON.parse(value || '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

export function formatDate(value, timeZone) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  if (!timeZone) return DATE_FMT.format(d);
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
    }).format(d);
  } catch {
    return DATE_FMT.format(d);
  }
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function truncate(text, max = 160) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
