/**
 * Single mocked user for the whole app (spec §9: no multi-user auth).
 * "Nadia" is the due-diligence expert persona; every human action in the
 * audit trail is attributed to this actor id.
 */
export const CURRENT_USER = {
  id: "user:nadia",
  name: "Nadia",
  role: "Due diligence lead",
} as const;

export type CurrentUser = typeof CURRENT_USER;
