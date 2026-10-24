import express from 'express';
import { once } from 'node:events';
import { createPublicCatalogRouter } from '../src/routes/publicCatalog.js';
import errorHandler from '../src/middleware/errorHandler.js';

export async function servePublicCatalog(service, work) {
  const app = express();
  app.use('/api/competitions', createPublicCatalogRouter(service));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(async (path = '', method = 'GET') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/competitions${path}`, { method });
      return { status: response.status, headers: response.headers,
        body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
