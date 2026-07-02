import { registerErrorMappings } from "@/infrastructure/http/api-handler";
import { exampleErrorMappings } from "@/example-hexagone/adapters/http/example-error-mappings";

// TODO(starter): Register error mappings for each hexagone here
export function register() {
  registerErrorMappings(exampleErrorMappings);
}
