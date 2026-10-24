export function requestedDestination(value: unknown): string {
  if (typeof value !== 'string' || !/^\/admin(?:\/|\?|#|$)/.test(value) ||
      /^\/admin\/login(?:\/|\?|#|$)/.test(value)) return '/admin';
  return value;
}
