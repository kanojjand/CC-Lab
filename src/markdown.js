import { Marked } from 'marked';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Сырой HTML в описаниях не выполняется — показывается как текст
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href || '')) return text;
      const external = /^https?:/i.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(href)}"${t}${rel}>${text}</a>`;
    },
    image({ href, title, text }) {
      if (!SAFE_HREF.test(href || '')) return escapeHtml(text);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t} loading="lazy">`;
    },
  },
});

export function renderMarkdown(src) {
  return marked.parse(String(src ?? ''));
}

export { escapeHtml };
