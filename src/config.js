import path from 'node:path';

const flag = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export function loadConfig(overrides = {}) {
  const env = process.env;
  const onVercel = Boolean(env.VERCEL);
  const dataDir = path.resolve(overrides.dataDir ?? env.DATA_DIR ?? './data');
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
  return {
    port: Number(overrides.port ?? env.PORT ?? 3000),
    siteUrl: (overrides.siteUrl ?? (env.SITE_URL || vercelUrl)).replace(/\/+$/, ''),
    // Postgres (Supabase и т.п.). Если не задан — встроенный PGlite в папке DATA_DIR.
    databaseUrl: overrides.databaseUrl ?? env.DATABASE_URL ?? '',
    databaseSsl: overrides.databaseSsl ?? env.DATABASE_SSL ?? 'require',
    pgliteDir: overrides.memoryDb ? null : path.join(dataDir, 'pgdata'),
    adminEmail: overrides.adminEmail ?? env.ADMIN_EMAIL ?? 'admin@cclab.local',
    adminPassword: overrides.adminPassword ?? env.ADMIN_PASSWORD ?? '',
    seedDemo: overrides.seedDemo ?? flag(env.SEED_DEMO, true),
    trustProxy: overrides.trustProxy ?? flag(env.TRUST_PROXY, onVercel),
    telegramToken: overrides.telegramToken ?? env.TELEGRAM_BOT_TOKEN ?? '',
    telegramChatId: overrides.telegramChatId ?? env.TELEGRAM_CHAT_ID ?? '',
    production: overrides.production ?? (env.NODE_ENV === 'production' || onVercel),
    quiet: overrides.quiet ?? false,
  };
}
