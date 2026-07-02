import type { AuthContext } from "./auth-context";

export interface AuthContextProvider {
  resolve(headers: Headers): Promise<AuthContext | null>;
}
