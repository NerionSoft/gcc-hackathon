import { ShieldAlert, LineChart, Wind, Users, Zap } from "lucide-react";
import { DOMAIN_TITLES, type DomainKey } from "@/types";

const DOMAIN_ICONS: Record<DomainKey, typeof ShieldAlert> = {
  risques: ShieldAlert,
  prix: LineChart,
  air: Wind,
  securite: Users,
  energie: Zap,
};

export const DOMAIN_META: Record<DomainKey, { title: string; icon: typeof ShieldAlert }> =
  Object.fromEntries(
    Object.entries(DOMAIN_TITLES).map(([key, title]) => [
      key,
      { title, icon: DOMAIN_ICONS[key as DomainKey] },
    ]),
  ) as Record<DomainKey, { title: string; icon: typeof ShieldAlert }>;
