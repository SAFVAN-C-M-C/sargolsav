export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function adminErrorMessage(error: unknown): string {
  return error instanceof AdminApiError ? error.message :
    'Could not complete the request. Check your connection and current data before trying again.';
}
