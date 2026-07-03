"use client";

import { cx } from "@/presentation/ui/cx";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-primary text-white border border-primary hover:bg-[#24365c] disabled:bg-[#8b95a9] disabled:border-[#8b95a9]",
  secondary:
    "bg-surface text-primary border border-line hover:border-primary/50 disabled:text-ink-secondary",
  ghost: "bg-transparent text-primary border border-transparent hover:bg-primary/5",
};

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-(--radius-badge) px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
