import "./config/env.js";
import app from './config/app.js';
import { pool } from './db/pool.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = app.listen(port, host, () => {
  console.log(`sargolsav API listening at http://${host}:${port}`);
});
server.on('error', (error) => {
  console.error('Unable to start sargolsav API:', error.message);
  process.exitCode = 1;
});

// Stop accepting requests before draining the shared pool.
function shutdown() {
  server.close(async () => {
    await pool.end();
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
