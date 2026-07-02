import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/infrastructure/db/prisma-client";
import { env } from "@/infrastructure/config/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.baseUrl,
  trustedOrigins: [...env.baseUrls],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // TODO(starter): Plug your email provider (Resend, SendGrid, etc.)
    // sendResetPassword: async ({ user, url }) => { ... },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: env.isProduction,
    },
  },
  // TODO(starter): Add plugins here (OAuth2 providers, twoFactor, etc.)
  plugins: [
    organization({
      allowUserToCreateOrganization: async ({ user }) => {
        return user.admin === true;
      },
    }),
    nextCookies(),
  ],
});
