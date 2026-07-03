import type { Metadata } from "next";
import { ibmPlexMono, ibmPlexSans } from "./fonts";
import { AppHeader } from "@/presentation/ui/layout/app-header";
import { ProvenanceFooter } from "@/presentation/ui/layout/provenance-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civic Property Intelligence",
  description:
    "Open-source intelligence on property assets: sourced, graded risk verdicts from public registers, before capital commits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-450 flex-1 px-4 py-4">{children}</main>
        <ProvenanceFooter />
      </body>
    </html>
  );
}
