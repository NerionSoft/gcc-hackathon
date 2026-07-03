import { registerErrorMappings } from "@/infrastructure/http/api-handler";

// Error-code → HTTP-status mappings for the engine's typed errors.
export function register() {
  registerErrorMappings({
    LLM_UNAVAILABLE: 503,
    NO_ACTIVE_CAMPAIGN: 409,
    CAMPAIGN_NOT_AT_GATE: 409,
    UNRESOLVABLE_ADDRESS: 404,
    PROPERTY_NOT_FOUND: 404,
    CLUSTER_NOT_FOUND: 404,
    VALIDATION_ERROR: 400,
  });
}
