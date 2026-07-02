// TODO: Remove this file once the better-auth CLI supports tsconfig path aliases
// and Prisma v7 custom output paths. The CLI uses jiti to load the config at runtime,
// which cannot resolve @/ aliases or the generated Prisma client at prisma/generated/.
// This file duplicates the plugin list from src/infrastructure/auth/better-auth/auth.ts
// so that `pnpm run auth:generate` can generate the Prisma schema.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(null as never, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  // TODO(starter): Keep in sync with src/infrastructure/auth/better-auth/auth.ts plugins
  plugins: [organization()],
});
