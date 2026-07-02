import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  correlationId: string;
  locale: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  const fullContext: RequestContext = {
    correlationId: context.correlationId || crypto.randomUUID(),
    locale: context.locale || "en",
    startTime: context.startTime || Date.now(),
  };
  return asyncLocalStorage.run(fullContext, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getCorrelationId(): string {
  return getRequestContext()?.correlationId || "no-context";
}

export function getLocale(): string {
  return getRequestContext()?.locale || "en";
}

export function getElapsedTime(): number {
  const ctx = getRequestContext();
  return ctx ? Date.now() - ctx.startTime : 0;
}
