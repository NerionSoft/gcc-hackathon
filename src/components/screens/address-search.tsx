"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { Address, ToolResult } from "@/types";

interface AddressSearchProps {
  selected: Address | null;
  onSelect: (address: Address) => void;
}

export function AddressSearch({ selected, onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState(selected?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  const listboxId = useId();

  const { data, isFetching } = useQuery({
    queryKey: ["geocode", debouncedQuery],
    queryFn: async (): Promise<ToolResult<Address[]>> => {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.trim().length >= 2 && isOpen,
    staleTime: 60_000,
  });

  const suggestions = data?.data ?? [];

  return (
    <div className="relative">
      <label htmlFor="address-input" className="mb-2 block text-sm font-medium text-ink">
        Property address
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          id="address-input"
          type="text"
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={listboxId}
          autoComplete="off"
          placeholder="12 rue de la République, Lyon…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="w-full rounded-xl border border-primary-200 bg-surface py-3 pl-10 pr-10 text-base text-ink shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
        />
        {isFetching && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-400"
            aria-hidden
          />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-primary-100 bg-surface shadow-lg"
        >
          {suggestions.map((address) => (
            <li
              key={`${address.citycode}-${address.label}`}
              role="option"
              aria-selected={selected?.label === address.label}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(address);
                  setQuery(address.label);
                  setIsOpen(false);
                }}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm hover:bg-primary-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden />
                <span>
                  <span className="block text-ink">{address.label}</span>
                  <span className="block text-xs text-ink-muted">
                    {address.postcode} {address.city}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && debouncedQuery.length >= 2 && !isFetching && suggestions.length === 0 && (
        <div className="absolute z-10 mt-2 w-full rounded-xl border border-primary-100 bg-surface p-4 text-sm text-ink-muted shadow-lg">
          No address found. Check the spelling or narrow down the commune.
        </div>
      )}
    </div>
  );
}
