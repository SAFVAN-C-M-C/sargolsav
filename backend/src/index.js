import app from './config/app.js';

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
