// Keep parser errors consistent with API responses without exposing internals.
export default function errorHandler(error, _request, response, next) {
  if (response.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status : 500;
  const message = status === 413 ? 'Request body too large'
    : status < 500 ? 'Invalid request body' : 'Internal server error';
  if (status === 500) console.error(error);
  response.status(status).json({ error: message });
}
