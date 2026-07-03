import { Scale } from "lucide-react";
import { PhaseStub } from "@/presentation/ui/layout/phase-stub";

export default function AdjudicationPage() {
  return (
    <PhaseStub
      icon={Scale}
      title="Adjudication war room"
      description="Real-time adjudication board: composite verdicts, incoming evidence, and the escalation queue where every red case waits for the analyst's decision. It activates once the verdict-adjudicator engine and the evidence-feed simulator are wired in."
      items={[
        "Status columns with green / amber / red verdict badges",
        "Evidence-arrival feed with sourced updates",
        "Escalated-to-analyst queue — red cases never auto-resolve",
        "Expert actions: confirm risk, request more evidence, mark resolved",
      ]}
    />
  );
}
