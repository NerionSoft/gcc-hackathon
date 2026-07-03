"use client";

import { useCallback, useEffect, useState } from "react";
import {
  auditPageResponseSchema,
  type AuditPageResponse,
} from "@/presentation/features/audit-log/contracts";

/** Empty facet set — shown until the first response lands. */
const EMPTY_FACETS = { actions: [], entityTypes: [], actors: [] };

export interface AuditFilters {
  actor: string;
  action: string;
  entityType: string;
  after: string;
  before: string;
}

export const EMPTY_FILTERS: AuditFilters = {
  actor: "",
  action: "",
  entityType: "",
  after: "",
  before: "",
};

const PAGE_SIZE = 25;

/** A local date-time input value ("2026-07-03T14:30") → ISO 8601 with offset. */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function buildQuery(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  const after = toIso(filters.after);
  const before = toIso(filters.before);
  if (after) params.set("after", after);
  if (before) params.set("before", before);
  return params.toString();
}

export interface AuditLogState {
  data: AuditPageResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  filters: AuditFilters;
  setPage: (page: number) => void;
  setFilters: (filters: AuditFilters) => void;
  resetFilters: () => void;
  refresh: () => void;
}

/**
 * Drives the audit ledger: filter + pagination state, and a Zod-validated
 * fetch against `/api/audit`. Facets from the latest response feed the filter
 * bar. Changing a filter always returns to page 1.
 */
export function useAuditLog(): AuditLogState {
  const [data, setData] = useState<AuditPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [filters, setFiltersState] = useState<AuditFilters>(EMPTY_FILTERS);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/audit?${buildQuery(filters, page)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Audit ledger responded ${res.status}`);
        return auditPageResponseSchema.parse(await res.json());
      })
      .then((parsed) => {
        setData(parsed);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load the audit ledger");
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, nonce]);

  const setPage = useCallback((next: number) => {
    setLoading(true);
    setPageState(Math.max(1, next));
  }, []);
  const setFilters = useCallback((next: AuditFilters) => {
    setLoading(true);
    setFiltersState(next);
    setPageState(1);
  }, []);
  const resetFilters = useCallback(() => {
    setLoading(true);
    setFiltersState(EMPTY_FILTERS);
    setPageState(1);
  }, []);
  const refresh = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return {
    data,
    loading,
    error,
    page,
    filters,
    setPage,
    setFilters,
    resetFilters,
    refresh,
  };
}

export { EMPTY_FACETS, PAGE_SIZE };
