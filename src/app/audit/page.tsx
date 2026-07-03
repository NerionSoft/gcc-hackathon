import { ScrollText } from "lucide-react";
import { PhaseStub } from "@/presentation/ui/layout/phase-stub";

export default function AuditPage() {
  return (
    <PhaseStub
      icon={ScrollText}
      title="Audit log · provenance ledger"
      description="Chronological, filterable ledger of every agent and human action — actor, action, rationale, and the public-record source behind it. The append-only audit table is already seeded; this view lights up as the campaign workflow starts writing events."
      items={[
        "Every decision traceable to the exact public record",
        "Filter by actor, action and entity",
        "Immutable: no update or delete paths exist in the access layer",
        "Export (PDF) for casework files",
      ]}
    />
  );
}
