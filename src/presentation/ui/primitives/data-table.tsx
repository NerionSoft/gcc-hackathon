import { cx } from "@/presentation/ui/cx";

/**
 * Dense-but-breathing table shell (SPEC §6). Purely presentational — callers
 * provide typed rows; later phases (audit log, war room) reuse this shell.
 */
export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  render: (row: Row) => React.ReactNode;
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No records.",
  className,
}: {
  columns: ReadonlyArray<DataTableColumn<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "overflow-x-auto rounded-(--radius-card) border border-line bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-background">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cx(
                  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-secondary",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-secondary">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-line last:border-b-0 hover:bg-background"
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx("px-3 py-2 align-top", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
