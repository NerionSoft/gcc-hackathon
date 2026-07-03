import Link from "next/link";
import { SearchX } from "lucide-react";
import { getDossier } from "@/app/api/_lib/read-models";
import { DossierView } from "@/presentation/features/dossier/dossier-view";
import { Card, CardBody } from "@/presentation/ui/primitives/card";

export const dynamic = "force-dynamic";

/** F0 — single-property lookup target: the full sourced dossier. */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = getDossier(decodeURIComponent(id));

  if (!dossier) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <CardBody className="flex items-start gap-3">
          <SearchX
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-[13px] font-medium text-ink">No property with this identifier.</p>
            <p className="mt-1 text-[12px] text-ink-secondary">
              Use the lookup field above, or go back to the{" "}
              <Link href="/" className="text-primary underline underline-offset-2">
                portfolio wall
              </Link>
              .
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return <DossierView dossier={dossier} />;
}
