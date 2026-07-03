import { cx } from "@/presentation/ui/cx";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  aside,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 border-b border-line px-4 py-2.5",
        className,
      )}
    >
      <h2 className="text-[13px] font-semibold tracking-wide text-primary uppercase">{title}</h2>
      {aside}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx("px-4 py-3", className)}>{children}</div>;
}
