import { DomainError } from "@/shared/errors/domain-error";
import { ExampleStatus } from "../value-objects/example-status.enum";

// TODO(starter): Replace error classes with your entity's domain errors
export interface ExampleNotFoundCtx {
  exampleId: string;
}

export class ExampleNotFoundError extends DomainError<ExampleNotFoundCtx> {
  constructor(ctx: ExampleNotFoundCtx) {
    super("EXAMPLE_NOT_FOUND", "Example not found", ctx, "example", "fetch");
  }
}

export interface ExampleInvalidCtx {
  issues: string[];
}

export class ExampleInvalidError extends DomainError<ExampleInvalidCtx> {
  constructor(ctx: ExampleInvalidCtx) {
    super("EXAMPLE_INVALID", "Example is invalid", ctx, "example", "validate");
  }
}

export interface ExampleInvalidStateTransitionCtx {
  exampleId: string;
  currentStatus: ExampleStatus;
  targetStatus: ExampleStatus;
}

export class ExampleInvalidStateTransitionError extends DomainError<ExampleInvalidStateTransitionCtx> {
  constructor(ctx: ExampleInvalidStateTransitionCtx) {
    super(
      "EXAMPLE_INVALID_STATE_TRANSITION",
      `Cannot transition from ${ctx.currentStatus} to ${ctx.targetStatus}`,
      ctx,
      "example",
      "transition",
    );
  }
}
