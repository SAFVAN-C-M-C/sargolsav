import '../config/env.js';

export function databaseConfig(env = process.env) {
  const integer = (name, fallback, max = 2147483647) => {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
      throw new Error(`${name} must be an integer between 1 and ${max}`);
    }
    return Number(value);
  };
  const sslMode = env.PGSSLMODE || 'disable';
  if (!['disable', 'verify-full'].includes(sslMode)) {
    throw new Error('PGSSLMODE must be disable or verify-full');
  }
  if (env.DATABASE_URL) {
    let url;
    try {
      url = new URL(env.DATABASE_URL);
      for (const value of [url.username, url.password, url.pathname]) decodeURIComponent(value);
      if (!url.hostname) throw new Error();
    } catch { throw new Error('Invalid DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid DATABASE_URL');
    if ([...url.searchParams.keys()].some((key) => key.startsWith('ssl'))) {
      throw new Error('Configure TLS with PGSSLMODE, not DATABASE_URL parameters');
    }
  }
  return {
    ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {
      host: env.PGHOST || 'localhost', port: integer('PGPORT', 5432, 65535),
      database: env.PGDATABASE || 'sargolsav', user: env.PGUSER || 'postgres',
      password: env.PGPASSWORD || '',
    }),
    ssl: sslMode === 'verify-full' ? { rejectUnauthorized: true } : false,
    max: integer('PGPOOL_MAX', 5, 100),
    connectionTimeoutMillis: integer('PGCONNECT_TIMEOUT_MS', 5000),
    idleTimeoutMillis: integer('PGIDLE_TIMEOUT_MS', 30000),
    statement_timeout: integer('PGSTATEMENT_TIMEOUT_MS', 10000),
    query_timeout: integer('PGQUERY_TIMEOUT_MS', 15000),
    idle_in_transaction_session_timeout: integer('PGTRANSACTION_IDLE_TIMEOUT_MS', 15000),
  };
}
