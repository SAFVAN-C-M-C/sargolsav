# Database utilities

pool.js owns the single lazy PostgreSQL pool. index.js exports runQuery(sql,
values) and transaction(async query => ...). Always use $1-style placeholders for
values. Within a transaction use only the supplied query function and await every
operation; do not call runQuery or perform parallel client operations there.
Query failures propagate to callers; HTTP boundaries must return sanitized errors.
Call pool.end() when shutting down standalone scripts.
