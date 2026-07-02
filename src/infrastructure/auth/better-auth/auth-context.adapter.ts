import type { AuthContextProvider } from "@/shared/auth/auth-context.port";
import type { AuthContext } from "@/shared/auth/auth-context";
import { auth } from "./auth";
import { prisma } from "@/infrastructure/db/prisma-client";

export class BetterAuthContextAdapter implements AuthContextProvider {
  async resolve(headers: Headers): Promise<AuthContext | null> {
    const session = await auth.api.getSession({ headers });
    if (!session) return null;

    const { user, session: sessionData } = session;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { admin: true },
    });
    const isAdmin = dbUser?.admin ?? false;

    let organizationId: string | undefined;
    let role: string | undefined;
    const activeOrgId = sessionData.activeOrganizationId ?? undefined;

    if (activeOrgId) {
      const member = await auth.api.getActiveMember({ headers });
      if (member) {
        organizationId = activeOrgId;
        role = member.role;
      }
    }

    return {
      userId: user.id,
      email: user.email,
      isAdmin,
      organizationId,
      role,
    };
  }
}
