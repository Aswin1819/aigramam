/** Settings → Session link: the Ai Gramam mod, setup checks and the commands to install or update it. */
import { trpc } from "@/lib/trpc";
import SetupChecks from "../SetupChecks";
import { MARKETPLACE_SOURCE, UPDATE_COMMANDS } from "../checkList";
import { CopyLine } from "./parts";

export default function LinkTab({ connected }: { connected: boolean }) {
  const folder = trpc.worlds.folders.useQuery().data?.app ?? "<the aigramam folder>";
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-cream/85">
      <p>
        The <b className="text-cream">Ai Gramam mod</b> runs inside each Claude Code session and links it to this village. A linked session can be{" "}
        <b className="text-cream">messaged</b>, <b className="text-cream">stopped</b> and have its <b className="text-cream">permission requests approved</b> from here, and it reports exactly what it's doing.
      </p>
      <SetupChecks connected={connected} />
      <div className="text-xs text-cream/60">Install it once (it then loads in every new Claude Code session). In a terminal, or inside Claude Code as <code>/plugin …</code>:</div>
      <CopyLine label="add marketplace" text={`claude plugin marketplace add ${MARKETPLACE_SOURCE}`} />
      <CopyLine label="install" text="claude plugin install ai-gramam@aigramam" />
      <div className="text-xs text-cream/60">Or, to install the mod from this copy of Ai Gramam (for example with your own changes), add the marketplace from its folder instead:</div>
      <CopyLine label="add marketplace from this folder" text={`claude plugin marketplace add ${folder}`} />
      <div className="text-xs text-cream/60">To update it later (then restart your sessions):</div>
      {UPDATE_COMMANDS.map((c) => <CopyLine key={c} label={c} text={c} />)}
      <p className="text-xs text-cream/60">Installing the mod doesn't install or start this app: keep Ai Gramam running for sessions to link.</p>
      <ul className="space-y-1 text-[12px] text-cream/70">
        <li>• Messages are sent as your own words and run when the session is free. Stop works like Esc.</li>
        <li>• Permission requests come here first only when they would have asked <i>you</i>; with no answer in 45 s the normal prompt appears in the terminal.</li>
        <li>• Questions Claude asks you are answered in the session's chat (choices or your own words); "Answer in terminal", or no answer in 45 s, and the question appears there instead.</li>
        <li>• Plan approvals stay in the terminal. If another plugin answers permission requests first, those stay in the terminal too.</li>
        <li>• Only small details (file paths, commands) are sent, only to 127.0.0.1, with your local key. Uninstall: <code>claude plugin uninstall ai-gramam</code>.</li>
      </ul>
    </div>
  );
}
