"use client";

import {
  Baby,
  Laptop,
  Wind,
  LineChart,
  Accessibility,
  Home,
  Building2,
  HelpCircle,
} from "lucide-react";
import {
  LIFE_PROFILE_LABELS,
  PROPERTY_TYPE_LABELS,
  type LifeProfileTag,
  type PropertyType,
} from "@/types";

const TAG_ICONS: Record<LifeProfileTag, React.ComponentType<{ className?: string }>> = {
  famille_enfants: Baby,
  teletravail: Laptop,
  sensibilite_air: Wind,
  investissement_locatif: LineChart,
  senior_mobilite: Accessibility,
};

const PROPERTY_ICONS: Record<PropertyType, React.ComponentType<{ className?: string }>> = {
  maison: Home,
  appartement: Building2,
  inconnu: HelpCircle,
};

interface ProfilePickerProps {
  tags: LifeProfileTag[];
  propertyType: PropertyType;
  onToggleTag: (tag: LifeProfileTag) => void;
  onPropertyTypeChange: (type: PropertyType) => void;
}

export function ProfilePicker({
  tags,
  propertyType,
  onToggleTag,
  onPropertyTypeChange,
}: ProfilePickerProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">
          What matters to you (multiple choices possible)
        </h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LIFE_PROFILE_LABELS) as LifeProfileTag[]).map((tag) => {
            const Icon = TAG_ICONS[tag];
            const isSelected = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleTag(tag)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition active:scale-95 ${
                  isSelected
                    ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                    : "border-primary-200 bg-surface text-ink hover:border-primary-400"
                }`}
                title={LIFE_PROFILE_LABELS[tag].description}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {LIFE_PROFILE_LABELS[tag].label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">Property type</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((type) => {
            const Icon = PROPERTY_ICONS[type];
            const isSelected = propertyType === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onPropertyTypeChange(type)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition active:scale-95 ${
                  isSelected
                    ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                    : "border-primary-200 bg-surface text-ink hover:border-primary-400"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {PROPERTY_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
