/**
 * A small, safe Markdown renderer for chat messages: builds React elements
 * (never raw HTML), so nothing in a message can run in the page.
 * Supports fenced code, headings, lists, quotes, paragraphs, and inline
 * code, bold, italic and https/http links.
 */
import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // `code`, **bold**, *italic* / _italic_, [label](url)
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k} className="rounded bg-black/40 px-1 py-px font-mono text-[0.92em] text-amber-100">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold text-cream">{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4] && m[5]) {
      const label = m[4].slice(1, m[4].indexOf("]("));
      out.push(<a key={k} href={m[5]} target="_blank" rel="noreferrer noopener" className="text-sky-300 underline underline-offset-2">{label}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key++} className="my-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/45 p-2.5 font-mono text-[11.5px] leading-relaxed text-cream/90">
          {fence[1] && <div className="mb-1 text-[10px] uppercase tracking-wider text-cream/35">{fence[1]}</div>}
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<div key={key++} className="mt-2 mb-1 font-display text-[13.5px] font-bold text-cream">{inline(heading[2]!, `h${key}`)}</div>);
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key++} className={`my-1 space-y-0.5 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-cream/40`}>
          {items.map((it, n) => <li key={n}>{inline(it, `l${key}-${n}`)}</li>)}
        </List>,
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key++} className="my-1 border-l-2 border-brass/50 pl-2.5 text-cream/75">{inline(quote.join(" "), `q${key}`)}</blockquote>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|#{1,4}\s|([-*+]|\d+[.)])\s+|>)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={key++} className="my-1 whitespace-pre-wrap break-words">
        {para.map((p, n) => <Fragment key={n}>{n > 0 && <br />}{inline(p, `p${key}-${n}`)}</Fragment>)}
      </p>,
    );
  }
  return <>{blocks}</>;
}
