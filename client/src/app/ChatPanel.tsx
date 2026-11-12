import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ChevronRight } from "lucide-react";
import type { ChatItem, SessionView } from "@shared/model";
import type { CharacterInfo } from "@shared/character";
import Avatar from "@/components/Avatar";
import MiniMarkdown from "@/lib/miniMarkdown";
import { clockTime } from "@/lib/status";

interface Props {
  session: SessionView;
  character: CharacterInfo | null;
  items: ChatItem[] | null;
  /** An open request from the session (approval or question), shown at the end of the thread. */
  request?: { id: string; node: React.ReactNode } | null;
  /** The message box and stop button, pinned under the thread. */
  footer: React.ReactNode;
}

type Row = { kind: "msg"; item: ChatItem } | { kind: "tools"; items: ChatItem[]; id: string };

/** Consecutive tool lines become one group, so the conversation stays readable. */
function toRows(items: ChatItem[]): Row[] {
  const rows: Row[] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (it.kind === "tool") {
      if (last?.kind === "tools") last.items.push(it);
      else rows.push({ kind: "tools", items: [it], id: it.id });
    } else rows.push({ kind: "msg", item: it });
  }
  return rows;
}

function ToolGroup({ items }: { items: ChatItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open || items.length <= 3 ? items : items.slice(-2);
  return (
    <div className="my-1 ml-9 space-y-0.5 border-l border-white/10 pl-3">
      {!open && items.length > 3 && (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] text-cream/45 hover:text-cream/75">
          <ChevronRight size={12} /> {items.length - 2} earlier steps
        </button>
      )}
      {shown.map((t) => (
        <div key={t.id} className="truncate text-[11.5px] text-cream/55" title={`${t.text} · ${clockTime(t.at)}`}>
          <span aria-hidden className="mr-1">{t.emoji ?? "🧰"}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function ChatPanel({ session: s, character, items, request, footer }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const rows = toRows(items ?? []);
  const count = items?.length ?? 0;

  // Stay pinned to the newest message unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [count, atBottom, s.status, request?.id]);
  // A new request always scrolls into view: it's what the session is waiting for.
  useEffect(() => {
    if (request) setAtBottom(true);
  }, [request?.id]);
  useEffect(() => setAtBottom(true), [s.id]);

  const working = s.status === "working";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
        aria-label={`Conversation with ${s.title}`}
        aria-live="polite"
      >
        {items === null && <p className="py-6 text-center text-[12px] text-cream/45">Loading the conversation…</p>}
        {items !== null && items.length === 0 && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-cream/45">
            No messages seen yet.
            <br />
            New messages show up here as they happen.
          </p>
        )}
        {items !== null && items.length > 0 && (
          <p className="mb-2 text-center text-[10.5px] text-cream/30">Showing the latest {count} messages and steps from this session</p>
        )}
        <AnimatePresence initial={false}>
          {rows.map((row) =>
            row.kind === "tools" ? (
              <motion.div key={row.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ToolGroup items={row.items} />
              </motion.div>
            ) : row.item.kind === "note" ? (
              <motion.div key={row.item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-3 flex items-center gap-2 text-[10.5px] text-cream/40" title={clockTime(row.item.at)}>
                <span className="h-px flex-1 bg-white/10" />
                {row.item.text}
                <span className="h-px flex-1 bg-white/10" />
              </motion.div>
            ) : row.item.kind === "user" ? (
              <motion.div key={row.item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-2 flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brass/90 px-3 py-2 text-[13px] leading-relaxed text-ink shadow" title={clockTime(row.item.at)}>
                  <div className="whitespace-pre-wrap break-words">{row.item.text}</div>
                </div>
              </motion.div>
            ) : (
              <motion.div key={row.item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-2 flex items-end gap-2">
                <div className="grid h-9 w-7 shrink-0 place-items-end overflow-hidden rounded-lg bg-white/5">
                  <Avatar character={character} size={32} />
                </div>
                <div className="min-w-0 max-w-[88%] rounded-2xl rounded-bl-md border border-white/10 bg-[#0f1f1b]/90 px-3 py-2 text-[13px] leading-relaxed text-cream/90" title={clockTime(row.item.at)}>
                  <MiniMarkdown text={row.item.text} />
                </div>
              </motion.div>
            ),
          )}
        </AnimatePresence>
        <AnimatePresence>{request && <motion.div key={request.id}>{request.node}</motion.div>}</AnimatePresence>
        <AnimatePresence>
          {working && (
            <motion.div key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="my-2 ml-9 flex items-center gap-2 text-[12px] text-work">
              <span className="flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-work" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.18 }} />
                ))}
              </span>
              <span className="truncate">{s.action ? s.action.label : "Working"}…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {!atBottom && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={() => setAtBottom(true)}
            className="mx-auto -mt-10 mb-2 flex items-center gap-1 rounded-full border border-white/15 bg-[#13221e]/95 px-3 py-1 text-[11.5px] text-cream shadow-lg"
          >
            <ArrowDown size={13} /> Jump to latest
          </motion.button>
        )}
      </AnimatePresence>
      <div className="border-t border-white/8 p-3">{footer}</div>
    </div>
  );
}
