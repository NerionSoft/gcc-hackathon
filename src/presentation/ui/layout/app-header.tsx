import Link from "next/link";
import { Landmark } from "lucide-react";
import { NavLinks } from "@/presentation/ui/layout/nav-links";
import { ImpactBannerSlot } from "@/presentation/ui/layout/impact-banner-slot";
import { SearchBox } from "@/presentation/features/lookup/search-box";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <ImpactBannerSlot />
      <div className="mx-auto flex h-14 max-w-450 items-center gap-6 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-(--radius-badge) bg-primary">
            <Landmark aria-hidden className="h-4 w-4 text-white" strokeWidth={1.5} />
          </span>
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-tight text-primary">
              Civic Property Intelligence
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-widest text-ink-secondary">
              Open-registry due diligence
            </span>
          </span>
        </Link>
        <SearchBox className="min-w-0 flex-1 max-w-xl" />
        <div className="ml-auto flex items-center gap-4">
          <NavLinks />
          <span
            className="hidden items-center gap-1.5 border-l border-line pl-4 font-mono text-[11px] text-ink-secondary md:flex"
            title="Mock reviewer — no multi-user auth by design"
          >
            Reviewer: <span className="text-ink">nadia</span>
          </span>
        </div>
      </div>
    </header>
  );
}
