export class ResultDraftError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
