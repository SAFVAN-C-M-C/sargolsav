import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let auth;

export function firebaseAppOptions(env = process.env, providers = { cert, applicationDefault }) {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');

  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  const hasServiceAccountFields = clientEmail !== undefined || privateKey !== undefined;
  if (hasServiceAccountFields && (!clientEmail?.trim() || !privateKey?.trim())) {
    throw new Error('Firebase service-account credentials are incomplete');
  }
  const credential = hasServiceAccountFields
    ? providers.cert({ projectId, clientEmail: clientEmail.trim(), privateKey: privateKey.replace(/\\n/g, '\n') })
    : providers.applicationDefault();

  return { credential, projectId };
}

export function getFirebaseAuth() {
  if (auth) return auth;

  const options = firebaseAppOptions();

  const app = getApps().find((existing) => existing.name === '[DEFAULT]') || initializeApp(options);
  if (app.options.projectId !== options.projectId) {
    throw new Error('Firebase project configuration mismatch');
  }
  auth = getAuth(app);
  return auth;
}

export function verifyFirebaseIdToken(token) {
  // Revocation checks make a claim revocation effective for existing ID tokens.
  return getFirebaseAuth().verifyIdToken(token, true);
}
