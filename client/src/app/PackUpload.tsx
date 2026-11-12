import { useRef, useState } from "react";
import { Check, FileArchive, RefreshCw, Upload } from "lucide-react";

/**
 * Drop a world or character pack (.zip) here to install it into your folder.
 * The server checks everything before writing; the new pack then arrives
 * through the normal hot reload, so there's nothing else to refresh here.
 */

const MAX_ZIP_BYTES = 25 * 1024 * 1024; // same as the server's limit

type Status =
  | { s: "idle" }
  | { s: "uploading"; pct: number }
  | { s: "installing" }
  | { s: "done"; name: string; replaced: boolean }
  | { s: "error"; error: string; exists?: boolean };

interface Reply {
  ok: boolean;
  id?: string;
  name?: string;
  error?: string;
  exists?: boolean;
}

/** XHR rather than fetch: it reports upload progress. */
function send(kind: "world" | "character", file: File, replace: boolean, onPct: (n: number) => void): Promise<Reply> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/packs/upload?kind=${kind}&replace=${replace ? 1 : 0}`);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as Reply);
      } catch {
        resolve({ ok: false, error: `The server answered ${xhr.status} without details` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Couldn't reach Ai Gramam. Is it still running?" });
    xhr.send(file);
  });
}

export default function PackUpload({ kind }: { kind: "world" | "character" }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ s: "idle" });
  const [over, setOver] = useState(false);
  const busy = status.s === "uploading" || status.s === "installing";
  const noun = kind === "world" ? "world" : "character";

  async function start(f: File, replace = false) {
    setFile(f);
    if (!/\.zip$/i.test(f.name)) return setStatus({ s: "error", error: `"${f.name}" isn't a .zip file` });
    if (f.size > MAX_ZIP_BYTES) return setStatus({ s: "error", error: `"${f.name}" is too big (max 25 MB)` });
    setStatus({ s: "uploading", pct: 0 });
    const r = await send(kind, f, replace, (pct) => setStatus(pct >= 100 ? { s: "installing" } : { s: "uploading", pct }));
    setStatus(r.ok ? { s: "done", name: r.name ?? r.id ?? f.name, replaced: replace } : { s: "error", error: r.error ?? "Upload failed", exists: r.exists });
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) start(f);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-3 transition-colors ${over ? "border-brass bg-brass/15" : "border-brass/40 bg-black/15"}`}
      >
        <FileArchive size={20} className="shrink-0 text-brass" aria-hidden />
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-semibold text-cream">Install a {noun} pack</div>
          <div className="text-cream/60">Drop a .zip here, or choose one. It's checked before anything is saved (max 25 MB).</div>
        </div>
        <button
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex items-center gap-1.5 rounded-xl bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass/90 disabled:opacity-40"
        >
          <Upload size={13} aria-hidden /> Choose .zip
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // allow picking the same file again
            if (f) start(f);
          }}
        />
      </div>

      <div aria-live="polite" className="text-xs">
        {status.s === "uploading" && (
          <div className="space-y-1">
            <div className="text-cream/70">Uploading {file?.name}… {status.pct}%</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brass transition-[width]" style={{ width: `${status.pct}%` }} />
            </div>
          </div>
        )}
        {status.s === "installing" && <div className="text-cream/70">Checking and installing {file?.name}…</div>}
        {status.s === "done" && (
          <div className="flex items-center gap-1.5 text-work">
            <Check size={14} aria-hidden /> {status.replaced ? "Replaced" : "Installed"} <b>{status.name}</b>. It appears in the list in a moment.
          </div>
        )}
        {status.s === "error" && (
          <div className="rounded-xl border border-urgent/30 bg-urgent/10 p-2.5">
            <div className="font-semibold text-urgent">{status.exists ? "Already installed" : "Couldn't install this pack"}</div>
            <div className="mt-0.5 break-words text-red-100/90">{status.error}</div>
            {status.exists && file && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => start(file, true)} className="flex items-center gap-1.5 rounded-xl bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass/90">
                  <RefreshCw size={13} aria-hidden /> Replace (old one is backed up)
                </button>
                <button onClick={() => setStatus({ s: "idle" })} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-cream hover:bg-white/10">Keep the old one</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
