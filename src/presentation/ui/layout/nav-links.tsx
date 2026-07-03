"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/presentation/ui/cx";

const LINKS = [
  { href: "/", label: "Portfolio" },
  { href: "/clusters", label: "Clusters" },
  { href: "/adjudication", label: "Adjudication" },
  { href: "/audit", label: "Audit log" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" || pathname.startsWith("/property") : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "rounded-(--radius-badge) px-2.5 py-1 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-white"
                : "text-primary hover:bg-primary/5",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
