import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { firebaseAppOptions, getFirebaseAuth } from '../src/auth/firebase.js';

test('service-account variables select cert and normalize escaped newlines', () => {
  const calls = [];
  const credential = {};
  const options = firebaseAppOptions({
    FIREBASE_PROJECT_ID: ' test-project ',
    FIREBASE_CLIENT_EMAIL: ' service@test-project.iam.gserviceaccount.com ',
    FIREBASE_PRIVATE_KEY: 'first\\nsecond\\n',
  }, {
    cert(value) { calls.push(value); return credential; },
    applicationDefault() { assert.fail('ADC must not be selected'); },
  });
  assert.deepEqual(options, { credential, projectId: 'test-project' });
  assert.deepEqual(calls, [{
    projectId: 'test-project', clientEmail: 'service@test-project.iam.gserviceaccount.com',
    privateKey: 'first\nsecond\n',
  }]);
});

test('service-account options initialize the real SDK without a network call', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const options = firebaseAppOptions({
    FIREBASE_PROJECT_ID: 'test-project',
    FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
  });
  const app = initializeApp(options, 'service-account-test');
  try {
    assert.equal(app.options.projectId, 'test-project');
    assert.strictEqual(getAuth(app).app, app);
  } finally {
    await deleteApp(app);
  }
});

test('ADC is selected only when both service-account variables are absent', () => {
  const credential = {};
  let calls = 0;
  const options = firebaseAppOptions({ FIREBASE_PROJECT_ID: 'test-project' }, {
    cert() { assert.fail('cert must not be selected'); },
    applicationDefault() { calls += 1; return credential; },
  });
  assert.deepEqual(options, { credential, projectId: 'test-project' });
  assert.equal(calls, 1);
});

test('missing project and partial or empty service-account fields fail without leaking values', () => {
  const secret = 'do-not-expose-private-key';
  const cases = [
    {},
    { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@example.test' },
    { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_PRIVATE_KEY: secret },
    { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: secret },
    { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@example.test', FIREBASE_PRIVATE_KEY: '' },
    { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '' },
  ];
  for (const env of cases) {
    assert.throws(() => firebaseAppOptions(env), (error) =>
      !error.message.includes(secret) && !error.message.includes('service@example.test'));
  }
});

test('default Firebase Admin app and Auth instance are reused', async () => {
  const keys = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let app;
  try {
    process.env.FIREBASE_PROJECT_ID = 'singleton-test-project';
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    const first = getFirebaseAuth();
    app = first.app;
    assert.equal(app.options.projectId, 'singleton-test-project');
    assert.strictEqual(getFirebaseAuth(), first);
    assert.equal(getApps().filter((entry) => entry.name === '[DEFAULT]').length, 1);
  } finally {
    if (app) await deleteApp(app);
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
