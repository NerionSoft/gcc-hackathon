import { Suspense } from "react";
import { ReportView } from "@/components/screens/report-view";

function ReportSkeleton() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <div className="h-8 w-1/2 animate-pulse rounded bg-primary-100" />
      <div className="h-40 animate-pulse rounded-2xl bg-primary-50" />
    </main>
  );
}

export default function RapportPage() {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportView />
    </Suspense>
  );
}
