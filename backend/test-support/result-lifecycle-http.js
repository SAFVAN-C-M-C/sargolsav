import { once } from 'node:events';
import express from 'express';
import { createResultDraftRouter } from '../src/routes/resultDrafts.js';
import { createResultLifecycleRouter, createPublicResultRouter } from '../src/routes/resultLifecycle.js';
import errorHandler from '../src/middleware/errorHandler.js';
import notFound from '../src/middleware/notFound.js';

export async function serveResultLifecycle(services, work) {
  const verify = async (token) => {
    if (['invalid','expired','revoked'].includes(token)) throw Object.assign(new Error('private token'), { code: 'auth/id-token-revoked' });
    if (token === 'unavailable') throw new Error('private credentials');
    return { uid: `verified-${token}`, admin: ['admin','reviewer','publisher'].includes(token) ? true : token === 'string-admin' ? 'true' : false };
  };
  const app = express();
  app.use(express.json());
  const base = '/api/admin/competitions/:competitionId';
  app.use(base, createResultDraftRouter(verify, services.drafts));
  app.use(base, createResultLifecycleRouter(verify, services.lifecycle));
  app.use('/api/competitions/:competitionId', createPublicResultRouter(services.publicResults));
  app.use(notFound); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(async (path, method = 'GET', body, token = 'admin') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    });
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
