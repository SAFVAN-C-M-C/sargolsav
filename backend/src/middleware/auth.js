import { verifyFirebaseIdToken } from '../auth/firebase.js';

const rejectedTokenCodes = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

export function createRequireFirebaseAuth(verifyIdToken = verifyFirebaseIdToken) {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s,]+)$/i.exec(request.get('authorization') || '');
    if (!match) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

    let decoded;
    try {
      decoded = await verifyIdToken(match[1]);
    } catch (error) {
      if (rejectedTokenCodes.has(error?.code)) {
        response.status(401).json({ error: 'Invalid or expired token' });
      } else {
        response.status(503).json({ error: 'Authentication unavailable' });
      }
      return;
    }

    if (typeof decoded?.uid !== 'string' || !decoded.uid.trim()) {
      response.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Downstream audit writers must use this verified UID, never a body field.
    request.auth = Object.freeze({
      uid: decoded.uid,
      admin: decoded.admin === true,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
    });
    next();
  };
}

export function requireAdmin(request, response, next) {
  response.set('Cache-Control', 'no-store');
  if (!request.auth) {
    response.status(401).json({ error: 'Authentication required' });
  } else if (request.auth.admin !== true) {
    response.status(403).json({ error: 'Admin access required' });
  } else {
    next();
  }
}
