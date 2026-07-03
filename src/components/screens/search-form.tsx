"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { AddressSearch } from "./address-search";
import { ProfilePicker } from "./profile-picker";
import { DEMO_ADDRESSES } from "./demo-addresses";
import type { Address, LifeProfileTag, PropertyType } from "@/types";
import type { DemoScenarioId } from "@/lib/demo-fixtures";

export function SearchForm() {
  const router = useRouter();
  const [address, setAddress] = useState<Address | null>(null);
  const [tags, setTags] = useState<LifeProfileTag[]>([]);
  const [propertyType, setPropertyType] = useState<PropertyType>("inconnu");
  const [askingPrice, setAskingPrice] = useState("");
  const [askingSurface, setAskingSurface] = useState("");

  function toggleTag(tag: LifeProfileTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function navigateToReport(
    target: Address,
    targetTags: LifeProfileTag[],
    targetPropertyType: PropertyType,
    demoId?: DemoScenarioId,
  ) {
    const params = new URLSearchParams({
      label: target.label,
      lat: String(target.lat),
      lon: String(target.lon),
      citycode: target.citycode,
      postcode: target.postcode,
      city: target.city,
      score: String(target.score),
      type: target.type,
      propertyType: targetPropertyType,
    });
    if (target.street) params.set("street", target.street);
    if (target.housenumber) params.set("housenumber", target.housenumber);
    if (targetTags.length > 0) params.set("tags", targetTags.join(","));
    if (askingPrice) params.set("askingPrice", askingPrice);
    if (askingSurface) params.set("askingSurface", askingSurface);
    // Demo addresses replay a hand-authored fixture instead of hitting live
    // APIs — see src/lib/demo-fixtures.ts and the two report API routes.
    if (demoId) params.set("demo", demoId);
    router.push(`/report?${params.toString()}`);
  }

  function handleSubmit() {
    if (!address) return;
    navigateToReport(address, tags, propertyType);
  }

  return (
    <div className="space-y-8 rounded-2xl border border-primary-100 bg-surface p-6 shadow-sm sm:p-8">
      <AddressSearch selected={address} onSelect={setAddress} />
      <ProfilePicker
        tags={tags}
        propertyType={propertyType}
        onToggleTag={toggleTag}
        onPropertyTypeChange={setPropertyType}
      />

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">
          Asking price{" "}
          <span className="font-normal text-ink-muted">
            (optional — refines the price/energy analysis)
          </span>
        </h3>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-primary-200 px-3 py-2 text-sm">
            Price
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={askingPrice}
              onChange={(e) => setAskingPrice(e.target.value)}
              placeholder="320000"
              className="w-28 border-0 bg-transparent outline-none"
            />
            €
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-primary-200 px-3 py-2 text-sm">
            Surface
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={askingSurface}
              onChange={(e) => setAskingSurface(e.target.value)}
              placeholder="65"
              className="w-20 border-0 bg-transparent outline-none"
            />
            m²
          </label>
        </div>
      </div>

      <button
        type="button"
        disabled={!address}
        onClick={handleSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 py-3.5 text-base font-medium text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8"
      >
        Analyze this property
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>

      <div className="border-t border-primary-100 pt-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ink">
          <Sparkles className="h-4 w-4 text-primary-500" aria-hidden />
          Or try a demo address
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_ADDRESSES.map((demo) => (
            <button
              key={demo.label}
              type="button"
              onClick={() =>
                navigateToReport(demo.address, demo.tags, demo.propertyType, demo.demoId)
              }
              className="rounded-xl border border-primary-200 bg-surface p-3 text-left text-sm transition hover:border-primary-400 hover:bg-primary-50"
            >
              <span className="block font-medium text-ink">{demo.label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{demo.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
