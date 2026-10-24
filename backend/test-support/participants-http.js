import { once } from 'node:events';
import express from 'express';
import { createParticipantRouter } from '../src/routes/participants.js';
import errorHandler from '../src/middleware/errorHandler.js';
import notFound from '../src/middleware/notFound.js';

export async function serveParticipants(service, work) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/competitions/:competitionId/units', createParticipantRouter(async (token) => {
    if (['invalid', 'expired', 'revoked'].includes(token)) {
      throw Object.assign(new Error('private token details'), { code: {
        invalid: 'auth/invalid-id-token', expired: 'auth/id-token-expired', revoked: 'auth/id-token-revoked',
      }[token] });
    }
    if (token === 'unavailable') throw new Error('private Firebase credential');
    return { uid: 'trusted-participant-admin', admin: token === 'admin' ? true : token === 'string-admin' ? 'true' : false };
  }, service));
  app.use(notFound);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(async (path, method = 'GET', body, token = 'admin') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
