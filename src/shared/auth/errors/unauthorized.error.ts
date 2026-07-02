export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
