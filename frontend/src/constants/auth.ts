export const ADMIN_REFRESH_INTERVAL = 5 * 60 * 1000;

export const INVALID_SESSION_CODES = new Set([
  'auth/invalid-user-token',
  'auth/user-token-expired',
  'auth/user-disabled',
  'auth/user-not-found',
]);
