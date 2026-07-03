import Link from "next/link";
import { MapPinned } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-primary-100 bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-primary-800">
          <MapPinned className="h-5 w-5" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">TerraVista</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-ink-muted">
          <Link href="/methodologie" className="hover:text-primary-700">
            Sources &amp; méthodologie
          </Link>
        </nav>
      </div>
    </header>
  );
}
