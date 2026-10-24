import { getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, onIdTokenChanged, setPersistence,
  signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import type { AuthClient } from '../types/auth';

let auth: Auth | undefined;

function getFirebaseAuth(): Auth {
  if (auth) return auth;

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Frontend Firebase configuration is incomplete');
  }

  const app = getApps().find((entry) => entry.name === '[DEFAULT]') ?? initializeApp(config);
  if (app.options.projectId !== config.projectId) {
    throw new Error('Frontend Firebase project configuration mismatch');
  }
  auth = getAuth(app);
  return auth;
}

export const firebaseAuthClient: AuthClient = {
  subscribe(listener) {
    return onIdTokenChanged(getFirebaseAuth(), listener);
  },
  async signIn(email, password) {
    const instance = getFirebaseAuth();
    await setPersistence(instance, browserLocalPersistence);
    await signInWithEmailAndPassword(instance, email, password);
  },
  async signOut() {
    await signOut(getFirebaseAuth());
  },
};
