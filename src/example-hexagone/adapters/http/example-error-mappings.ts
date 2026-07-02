import type { ErrorHttpMapping } from "@/infrastructure/http/api-handler";

// TODO(starter): Map your domain error codes to HTTP status codes
export const exampleErrorMappings: ErrorHttpMapping = {
  EXAMPLE_NOT_FOUND: 404,
  EXAMPLE_INVALID: 422,
  EXAMPLE_INVALID_STATE_TRANSITION: 409,
};
