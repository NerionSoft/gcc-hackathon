import { Fragment, type ReactNode } from "react";
import { cx } from "@/presentation/ui/cx";

/**
 * Minimal, dependency-free Markdown renderer for the agent-composed assessment
 * and plain-language disclosure. Builds React nodes (never dangerouslySetInnerHTML)
 * and supports only what the composer emits: `##`/`###` headings, `-` bullet
 * lists, blank-line paragraphs, and inline `**bold**`. Everything else renders
 * as plain text — safe by construction.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key} className="text-[13px] leading-relaxed text-ink">
        {inline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `b${index}`;
    if (line.startsWith("### ")) {
      flushParagraph(key);
      flushList(key);
      blocks.push(
        <h4
          key={key}
          className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary"
        >
          {inline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      flushParagraph(key);
      flushList(key);
      blocks.push(
        <h3 key={key} className="text-[13px] font-semibold tracking-tight text-primary">
          {inline(line.slice(3))}
        </h3>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      flushParagraph(key);
      list.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushParagraph(key);
      flushList(key);
    } else {
      flushList(key);
      paragraph.push(line);
    }
  });
  flushParagraph("last-p");
  flushList("last-l");

  return <div className={cx("space-y-2.5", className)}>{blocks}</div>;
}

/** Inline **bold** → <strong>; the rest is plain text. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
