export class DomainError<T extends object = object> extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: T,
    public readonly group?: string,
    public readonly action?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
