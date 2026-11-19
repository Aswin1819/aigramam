/** Settings → Remote bridge: how to show sessions from another computer. */
import { trpc } from "@/lib/trpc";
import { CopyLine } from "./parts";

export default function BridgeTab() {
  const { data: key } = trpc.agents.bridgeApiKey.useQuery();
  const { data: status } = trpc.agents.connectionStatus.useQuery();
  const origin = window.location.origin;
  return (
    <div className="space-y-3 text-[13px] text-cream/85">
      <p>Only needed to show Claude Code sessions from <b className="text-cream">another computer</b>. Sessions on this computer appear automatically.</p>
      <div className="text-xs text-cream/60">1. Download the bridge script</div>
      <CopyLine label="download command" text={`curl -O ${origin}/bridge/ai-gramam-bridge.mjs`} />
      <div className="text-xs text-cream/60">2. Run it on that computer (Node.js 18+)</div>
      <CopyLine label="run command" text={key?.apiKey ? `AI_GRAMAM_SERVER=${origin} AI_GRAMAM_API_KEY=${key.apiKey} node ai-gramam-bridge.mjs` : "Loading…"} />
      {status && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-cream/70">
          Watching <code>{status.projectsDir}</code> · {status.trackedProjects} projects · {status.totalSessions} transcripts
        </div>
      )}
    </div>
  );
}
