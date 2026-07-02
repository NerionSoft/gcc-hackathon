import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedError } from "./errors/unauthorized.error";
import { ForbiddenError } from "./errors/forbidden.error";

export interface AuthContext {
  userId: string;
  email: string;
  isAdmin: boolean;
  organizationId?: string;
  role?: string;
}

const authStorage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(ctx: AuthContext, fn: () => T): T {
  return authStorage.run(ctx, fn);
}

export function getAuthContext(): AuthContext | undefined {
  return authStorage.getStore();
}

export function requireAuth(): AuthContext {
  const ctx = getAuthContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export function requireAdmin(): AuthContext {
  const ctx = requireAuth();
  if (!ctx.isAdmin) throw new ForbiddenError("Admin access required");
  return ctx;
}

export function requireOrganization(): AuthContext & { organizationId: string } {
  const ctx = requireAuth();
  if (!ctx.organizationId) {
    throw new ForbiddenError("No organization selected");
  }
  return ctx as AuthContext & { organizationId: string };
}
