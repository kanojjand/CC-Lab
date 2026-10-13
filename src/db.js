import fs from 'node:fs';

// Схема в диалекте PostgreSQL. Работает и с настоящим Postgres (Supabase),
// и со встроенным PGlite для локального запуска.
// Каждая миграция выполняется один раз; новые изменения добавляйте в конец массива.
const MIGRATIONS = [
  `
  CREATE TABLE categories (
    id serial PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0
  );

  CREATE TABLE products (
    id serial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    category_id integer REFERENCES categories(id) ON DELETE SET NULL,
    tagline text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    audience text NOT NULL DEFAULT '',
    duration text NOT NULL DEFAULT '',
    format text NOT NULL DEFAULT '',
    tags text NOT NULL DEFAULT '',
    features text NOT NULL DEFAULT '',
    modules text NOT NULL DEFAULT '',
    price bigint,
    price_note text NOT NULL DEFAULT '',
    demo_url text NOT NULL DEFAULT '',
    cover text NOT NULL DEFAULT '',
    gallery text NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    featured boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    is_demo boolean NOT NULL DEFAULT false,
    search_text text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
  );
  CREATE INDEX products_status ON products (status, featured DESC, sort_order);
  CREATE INDEX products_category ON products (category_id);

  CREATE TABLE leads (
    id serial PRIMARY KEY,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    product_title text NOT NULL DEFAULT '',
    name text NOT NULL,
    organization text NOT NULL DEFAULT '',
    contact text NOT NULL,
    message text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'rejected')),
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX leads_status ON leads (status, created_at DESC);

  CREATE TABLE settings (
    key text PRIMARY KEY,
    value text NOT NULL
  );

  CREATE TABLE users (
    id serial PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL DEFAULT '',
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

  CREATE TABLE sessions (
    id text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf text NOT NULL,
    expires_at timestamptz NOT NULL
  );

  -- картинки храним в базе: так сайт работает и на бессерверных хостингах
  CREATE TABLE files (
    name text PRIMARY KEY,
    mime text NOT NULL,
    size integer NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  `,
];

const MIGRATION_LOCK = 742001;

/** Единый интерфейс поверх pg и PGlite: query → rows, one → первая строка, transaction(fn) */
function wrap(runner, { exec, transaction, close }) {
  const api = {
    async query(sql, params = []) {
      const res = await runner(sql, params);
      return res.rows;
    },
    async one(sql, params = []) {
      const rows = await api.query(sql, params);
      return rows[0] ?? null;
    },
    exec,
    transaction,
    close,
  };
  return api;
}

async function openPostgres(config) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // bigint → number
  const url = new URL(config.databaseUrl);
  url.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: local || config.databaseSsl === 'disable' ? undefined : { rejectUnauthorized: false },
  });
  pool.on('error', (err) => console.error('[db] ошибка соединения:', err.message));

  const db = wrap((sql, params) => pool.query(sql, params), {
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = wrap((sql, params) => client.query(sql, params), {
          exec: (sql) => client.query(sql),
          transaction: (inner) => inner(tx),
          close: async () => {},
        });
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
  return db;
}

async function openPglite(config) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (config.pgliteDir) fs.mkdirSync(config.pgliteDir, { recursive: true });
  const pglite = config.pgliteDir ? new PGlite(config.pgliteDir) : new PGlite();
  await pglite.waitReady;
  return wrap((sql, params) => pglite.query(sql, params), {
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((t) => {
      const tx = wrap((sql, params) => t.query(sql, params), {
        exec: (sql) => t.exec(sql),
        transaction: (inner) => inner(tx),
        close: async () => {},
      });
      return fn(tx);
    }),
    close: () => pglite.close(),
  });
}

export async function openDatabase(config) {
  const db = config.databaseUrl ? await openPostgres(config) : await openPglite(config);
  await db.transaction(async (tx) => {
    // несколько копий сайта могут стартовать одновременно — миграции идут по очереди
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await tx.query('SELECT version FROM schema_migrations')).map((r) => r.version));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if (done.has(i + 1)) continue;
      await tx.exec(MIGRATIONS[i]);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [i + 1]);
    }
  });
  return db;
}

/** Выполнить fn под общей блокировкой (например, первичное наполнение базы) */
export function withLock(db, key, fn) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [key]);
    return fn(tx);
  });
}
