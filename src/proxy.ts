import type { NextRequest } from "next/server";
import { authProxy } from "@/infrastructure/http/proxy/auth-proxy";

export async function proxy(req: NextRequest) {
  const authResponse = await authProxy(req);
  if (authResponse) return authResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
