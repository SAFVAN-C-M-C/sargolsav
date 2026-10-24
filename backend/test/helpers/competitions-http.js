import { once } from 'node:events';
import express from 'express';
import { createCompetitionRouter } from '../../src/routes/competitions.js';
import errorHandler from '../../src/middleware/errorHandler.js';
import notFound from '../../src/middleware/notFound.js';

export async function serveCompetitions(service, work) {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/admin/competitions', createCompetitionRouter(async (token) => {
    if (token === 'invalid') throw Object.assign(new Error('token secret'), { code: 'auth/invalid-id-token' });
    if (token === 'unavailable') throw new Error('Firebase credential secret');
    return { uid: 'verified-admin', admin: token === 'admin' ? true : token === 'string-admin' ? 'true' : false };
  }, service));
  testApp.use(notFound);
  testApp.use(errorHandler);
  const server = testApp.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(async (path = '', method = 'GET', body, token = 'admin') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), headers: response.headers };
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
