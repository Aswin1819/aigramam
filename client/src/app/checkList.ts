/**
 * Setup checks shown in Settings → Session link (and on the Overview when
 * something needs attention). Pure: each line says what was checked and what
 * it found, so "the mod isn't installed", "nothing is linked", "no sessions"
 * and "the server can't be reached" never look the same.
 */
import { compareVersions, type SetupStatus } from "@shared/setup";

export type CheckLevel = "ok" | "info" | "warn" | "bad";

export interface SetupCheck {
  id: "server" | "claude" | "mod" | "link";
  level: CheckLevel;
  title: string;
  detail: string;
}

/** Where the mod's marketplace lives (this repository on GitHub). */
export const MARKETPLACE_SOURCE = "Aswin1819/aigramam";
export const UPDATE_COMMANDS =["claude plugin marketplace update aigramam", "claude plugin update ai-gramam@aigramam"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function setupChecks(connected: boolean, status: SetupStatus | undefined): SetupCheck[] {
  if (!connected) {
    return [
      {
        id: "server",
        level: "bad",
        title: "Ai Gramam server: not reachable",
        detail: "This page lost its connection to the Ai Gramam server and is trying again. If you stopped it, start it again in the aigramam folder (npx pnpm@10.4.1 dev). Sessions, the mod and links can't be checked until then.",
      },
    ];
  }
  const checks: SetupCheck[] = [{ id: "server", level: "ok", title: "Ai Gramam server: running", detail: "Connected to the server on this computer." }];
  if (!status) return checks;

  // Claude Code and its sessions.
  if (!status.claudeFolderFound) {
    checks.push({ id: "claude", level: "bad", title: "Claude Code: not found", detail: "There's no .claude folder in your home folder, so Claude Code hasn't run here as this user yet." });
  } else if (status.liveSessions === 0) {
    checks.push({ id: "claude", level: "info", title: "Claude Code: no sessions running", detail: "Nothing to show or link right now. Start Claude Code in any folder and it appears within seconds." });
  } else {
    checks.push({ id: "claude", level: "ok", title: `Claude Code: ${plural(status.liveSessions, "session")} running`, detail: "Found from Claude Code's own session list and transcripts." });
  }

  // The mod.
  const shipped = status.shippedVersion;
  const seenRunning = status.link.linkedNow > 0 || status.link.lastContactAt !== null;
  const installed = status.mod.installs;
  const older = (v: string) => !!shipped && v !== "?" && compareVersions(v, shipped) < 0;
  if (status.mod.state === "installed") {
    const where = installed.map((i) => `v${i.version} (${i.scope}${i.projectPath ? `: ${i.projectPath}` : ""})`).join(", ");
    const outdated = installed.some((i) => older(i.version));
    checks.push(
      outdated
        ? { id: "mod", level: "warn", title: "Ai Gramam mod: update available", detail: `Installed ${where}; this app ships v${shipped}. Update it (commands below), then restart your sessions.` }
        : { id: "mod", level: "ok", title: "Ai Gramam mod: installed", detail: `Installed ${where}. It loads in every new Claude Code session.` },
    );
  } else if (seenRunning) {
    checks.push({
      id: "mod",
      level: "ok",
      title: "Ai Gramam mod: running, not installed",
      detail: `A session ran the mod${status.link.lastVersion ? ` (v${status.link.lastVersion})` : ""} without it being installed, for example from a folder with --plugin-dir. Install it to have it in every session.`,
    });
  } else if (status.mod.state === "not_installed") {
    checks.push({ id: "mod", level: "warn", title: "Ai Gramam mod: not installed", detail: "You can still watch sessions. Messaging, stopping, approving and answering from the browser need the mod: install it with the two commands below." });
  } else {
    checks.push({ id: "mod", level: "info", title: "Ai Gramam mod: couldn't check", detail: "Claude Code's plugin list couldn't be read, and no session has linked since the app started. If you installed the mod, start a new session to link it." });
  }
  const oldLinked = status.link.versions.filter(older);
  if (oldLinked.length && !checks.some((c) => c.id === "mod" && c.level === "warn")) {
    checks.push({ id: "mod", level: "warn", title: "Some sessions run an older mod", detail: `Linked sessions run v${oldLinked.join(", v")}; this app ships v${shipped}. Restart them after updating.` });
  }

  // Linking.
  const live = status.liveSessions;
  const linked = status.link.linkedNow;
  if (live > 0) {
    if (linked >= live) {
      checks.push({ id: "link", level: "ok", title: `Linked: all ${plural(live, "session")}`, detail: "Each can be messaged, stopped and answered from here." });
    } else if (status.mod.state === "not_installed" && !seenRunning) {
      checks.push({ id: "link", level: "info", title: `Linked: 0 of ${live}`, detail: "None are linked because the mod isn't installed. Their status still shows from transcripts." });
    } else {
      checks.push({
        id: "link",
        level: "warn",
        title: `Linked: ${linked} of ${live}`,
        detail: "Sessions started before the mod was installed link after a restart. A session whose mod can't reach this app says so in its status line (\"Ai Gramam ○ …\").",
      });
    }
  }
  return checks;
}

/** The most serious level among the checks. */
export function worstLevel(checks: SetupCheck[]): CheckLevel {
  const order: CheckLevel[] = ["ok", "info", "warn", "bad"];
  return checks.reduce<CheckLevel>((w, c) => (order.indexOf(c.level) > order.indexOf(w) ? c.level : w), "ok");
}
