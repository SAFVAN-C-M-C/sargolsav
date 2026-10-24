export async function updateAdminClaim(auth, uid, action) {
  if (!['grant', 'revoke'].includes(action)) throw new Error('Invalid action');
  if (typeof uid !== 'string' || !uid.trim()) throw new Error('Invalid UID');

  const user = await auth.getUser(uid);
  const claims = { ...user.customClaims };
  if (action === 'grant') claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(uid, claims);

  // Existing ID tokens are rejected by verifyIdToken(token, true) after revoke.
  if (action === 'revoke') await auth.revokeRefreshTokens(uid);
}
