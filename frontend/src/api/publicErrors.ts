export class PublicApiError extends Error {
  constructor(public readonly status: number) { super('Public data unavailable'); }
}
export class PublicPayloadError extends Error {
  constructor() { super('Invalid public response'); }
}
