import { BetterAuthContextAdapter } from "./better-auth/auth-context.adapter";

export { auth } from "./better-auth/auth";
export { authClient } from "./better-auth/auth-client";

export const authContextProvider = new BetterAuthContextAdapter();
