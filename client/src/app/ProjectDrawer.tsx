import { motion } from "motion/react";
import { LayoutDashboard, X } from "lucide-react";
import ProjectDetail from "./workspace/ProjectDetail";
import type { ProjectSummary } from "./workspace/attention";

interface Props {
  summary: ProjectSummary | null;
  now: number;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onOpenInWorkspace: () => void;
  /** Start a terminal in this project's folder (opens Workspace → Terminals). */
  onOpenTerminal?: (projectId: string) => void;
  terminalBlockedReason?: string | null;
  onClose: () => void;
}

/** A building's project, opened from the village: the same details as Workspace → Projects. */
export default function ProjectDrawer({ summary, now, selectedSessionId, onSelectSession, onOpenInWorkspace, onOpenTerminal, terminalBlockedReason, onClose }: Props) {
  return (
    <motion.aside
      initial={{ x: 480, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 480, opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      className="glass-strong pointer-events-auto absolute bottom-3 right-3 top-[76px] z-20 flex w-[440px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl"
      aria-label="Project details"
    >
      <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Project</span>
        <button onClick={onOpenInWorkspace} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-cream/70 hover:bg-white/10 hover:text-cream" title="Open in Workspace → Projects">
          <LayoutDashboard size={14} /> Open in Workspace
        </button>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-cream/60 hover:bg-white/10 hover:text-cream" aria-label="Close project details"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {summary ? (
          <ProjectDetail
            summary={summary}
            now={now}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            onOpenTerminal={onOpenTerminal}
            terminalBlockedReason={terminalBlockedReason}
          />
        ) : (
          <p className="text-[13px] text-cream/55">This place has no open session right now.</p>
        )}
      </div>
    </motion.aside>
  );
}
