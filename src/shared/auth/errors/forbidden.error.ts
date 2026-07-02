export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;

  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}
