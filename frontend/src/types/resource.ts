import type { createPublicResource } from '../utils/publicResource';

export type ResourceSnapshot<T> = { status: 'loading' } | { status: 'ready'; data: T; refreshError?: unknown; stopped?: boolean } |
  { status: 'error'; error: unknown };

export type PublicResource<T> = ReturnType<typeof createPublicResource<T>>;
