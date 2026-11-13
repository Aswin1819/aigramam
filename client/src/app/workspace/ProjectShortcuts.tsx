import { Code2, FolderOpen, MousePointer2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const APPS = [
  { id: "vscode", label: "VS Code", Icon: Code2 },
  { id: "cursor", label: "Cursor", Icon: MousePointer2 },
  { id: "explorer", label: "File Explorer", Icon: FolderOpen },
] as const;

/** Open a project's folder in an editor or File Explorer (on this computer, from a click). */
export default function ProjectShortcuts({ projectId, demo }: { projectId: string; demo?: boolean }) {
  const apps = trpc.projects.apps.useQuery(undefined, { staleTime: 60_000, enabled: !demo });
  const open = trpc.projects.open.useMutation({
    onSuccess: (r, v) => {
      const label = APPS.find((a) => a.id === v.app)?.label ?? v.app;
      if (r.ok) toast.success(`Opened in ${label}`);
      else toast.error(r.error);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Open folder in</div>
      <div className="flex flex-wrap gap-1.5">
        {APPS.map(({ id, label, Icon }) => {
          const missing = apps.data ? !apps.data[id] : false;
          const disabled = demo || missing || open.isPending;
          const why = demo ? "Switch to Live to open real folders" : missing ? `${label} isn't installed on this computer` : `Open this project's folder in ${label}`;
          return (
            <button
              key={id}
              onClick={() => open.mutate({ projectId, app: id })}
              disabled={disabled}
              title={why}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1 text-[12px] text-cream/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon size={13} /> {label}
              {missing && <span className="text-[10.5px] text-cream/45">(not installed)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
