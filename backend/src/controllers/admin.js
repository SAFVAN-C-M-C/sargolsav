export function getAdminMe(request, response) {
  const { uid, email, emailVerified, admin } = request.auth;
  response.json({ uid, email, emailVerified, admin });
}
