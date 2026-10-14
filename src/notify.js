import { LANG_META } from './i18n.js';

/** Отправляет уведомление о новой заявке в Telegram, если заданы токен и чат. */
export async function notifyNewLead(config, lead, { adminUrl = '' } = {}) {
  if (!config.telegramToken || !config.telegramChatId) return;
  const text = [
    '🆕 Новая заявка CC Lab',
    lead.product_title ? `Разработка: ${lead.product_title}` : null,
    lead.lang && lead.lang !== 'ru' ? `Язык сайта: ${LANG_META[lead.lang]?.name ?? lead.lang}` : null,
    `Имя: ${lead.name}`,
    lead.organization ? `Организация: ${lead.organization}` : null,
    `Контакт: ${lead.contact}`,
    lead.message ? `\n${lead.message}` : null,
    adminUrl ? `\n${adminUrl}` : null,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.warn(`[telegram] не удалось отправить уведомление: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[telegram] не удалось отправить уведомление: ${err.message}`);
  }
}
