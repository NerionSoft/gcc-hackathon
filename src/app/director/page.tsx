import type { Metadata } from "next";
import { DirectorConsole } from "@/presentation/features/director/director-console";

/**
 * F7 — the /director demo control room. Deliberately NOT linked in the nav
 * (spec F7); it is the filming console for the demo video.
 */
export const metadata: Metadata = {
  title: "Director · Civic Property Intelligence",
  robots: { index: false, follow: false },
};

export default function DirectorPage() {
  return <DirectorConsole />;
}
