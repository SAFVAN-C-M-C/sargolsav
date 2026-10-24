import '../config/env.js';
import { getFirebaseAuth } from './firebase.js';
import { updateAdminClaim } from './adminClaims.js';

const usage = 'Usage: npm run admin:claim --workspace backend -- <grant|revoke> --uid <existing Firebase UID> --project <FIREBASE_PROJECT_ID>';
const [action, uidFlag, uid, projectFlag, projectId] = process.argv.slice(2);

if (!['grant', 'revoke'].includes(action) || uidFlag !== '--uid' ||
    !/^[^\s]{1,128}$/.test(uid || '') || projectFlag !== '--project' ||
    !projectId || process.argv.length !== 7 || projectId !== process.env.FIREBASE_PROJECT_ID) {
  process.stderr.write(`${usage}\nThe --project value must match FIREBASE_PROJECT_ID.\n`);
  process.exitCode = 1;
} else {
  try {
    await updateAdminClaim(getFirebaseAuth(), uid, action);
    process.stdout.write(`Admin claim ${action === 'grant' ? 'assigned' : 'revoked'} in ${projectId}.\n`);
  } catch {
    process.stderr.write('Admin claim provisioning failed. Check the UID, Firebase credentials, project, and permissions.\n');
    process.exitCode = 1;
  }
}
