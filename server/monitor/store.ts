/**
 * In-memory live state for Claude Code sessions.
 *
 * Inputs: transcript events (parser.ts), hook payloads (hooks.ts) and the
 * session registry (registry.ts). Output: a Snapshot for the browser.
 * Status is derived from the facts we hold plus the current time, so
 * time-based transitions (e.g. "your turn" → idle) need no extra timers.
 */
import type {
  Action,
  ActivityEntry,
  HooksInfo,
  ProjectView,
  SessionSource,
  SessionStatus,
  SessionView,
  Snapshot,
  SubagentView,
  TitleSource,
  WaitingReason,
} from "@shared/model";
import { describeTool, stateAction } from "./actions";
import type { MonitorEvent } from "./parser";
import type { RegistryEntry } from "./registry";
import { resolveProject } from "./projectRoot";

export const TIMING = {
  /** A finished turn counts as "your turn" for this long, then becomes idle. */
  turnEndWaitMs: 10 * 60_000,
  /** No transcript or hook activity for this long → idle. */
  idleAfterMs: 2 * 60_000,
  /** A pending tool older than this, with no new activity, is treated as abandoned. */
  stalePendingMs: 30 * 60_000,
  /** Without hooks, a tool pending this long may be waiting for approval. */
  maybeApprovalMs: 8_000,
  /** Sessions not in the live registry are considered ended after this much silence. */
  silentEndMs: 15 * 60_000,
  /** Finished sessions stay on screen this long. */
  finishedLingerMs: 2 * 60_000,
  /** Subagents with no activity for this long are considered finished. */
  subagentSilentMs: 3 * 60_000,
  /** Finished subagents stay this long (time to walk away). */
  subagentLingerMs: 20_000,
  recentMax: 50,
};

const NO_APPROVAL_MODES = new Set(["bypassPermissions", "auto", "dontAsk"]);

interface PendingTool {
  id: string;
  action: Action;
  startedAt: number;
}

interface SubState {
  id: string;
  sessionId: string;
  agentType: string;
  description: string;
  toolUseId?: string;
  startedAt: number;
  lastActivityAt: number;
  pending: Map<string, PendingTool>;
  lastAction?: Action;
  finishedAt?: number;
}

interface SessState {
  id: string;
  cwd?: string;
  gitBranch?: string;
  titles: Partial<Record<"custom" | "agent" | "ai" | "registryUser" | "registryDerived", string>>;
  startedAt: number;
  lastActivityAt: number;
  pending: Map<string, PendingTool>;
  /** Tool calls that already finished; stops a late duplicate start (hook + transcript) from re-adding them. */
  ended: Set<string>;
  lastAction?: Action;
  turnEndedAt?: number;
  pendingBackground: number;
  interruptedAt?: number;
  hookWaiting?: { reason: "permission" | "question"; at: number; detail?: string };
  hookIdleAt?: number;
  errorAt?: number;
  finishedAt?: number;
  permissionMode?: string;
  hooksActive: boolean;
  registrySeen: boolean;
  registryAlive: boolean;
  source: SessionSource;
  prUrl?: string;
  recent: ActivityEntry[];
  subagents: Map<string, SubState>;
  statusKey?: string;
  statusSince: number;
}

export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  agent_id?: string;
  agent_type?: string;
  notification_type?: string;
  message?: string;
  session_title?: string;
  permission_mode?: string;
  reason?: string;
  [k: string]: unknown;
}

export class SessionStore {
  private sessions = new Map<string, SessState>();
  private lastHookAt?: number;
  hooksInstalled = false;
  /** Bumped on every change, so the monitor knows when to send a snapshot. */
  version = 0;

  has(id: string) {
    return this.sessions.has(id);
  }

  ids() {
    return [...this.sessions.keys()];
  }

  ensure(id: string, source: SessionSource = "transcript", at = Date.now()): SessState {
    let s = this.sessions.get(id);
    if (!s) {
      s = {
        id,
        titles: {},
        // Real times come from the first timestamped event; see touch().
        startedAt: Number.MAX_SAFE_INTEGER,
        lastActivityAt: 0,
        pending: new Map(),
        ended: new Set(),
        pendingBackground: 0,
        hooksActive: false,
        registrySeen: false,
        registryAlive: false,
        source,
        recent: [],
        subagents: new Map(),
        statusSince: at,
      };
      this.sessions.set(id, s);
      this.version++;
    }
    return s;
  }

  remove(id: string) {
    if (this.sessions.delete(id)) this.version++;
  }

  // ── Transcript events ──────────────────────────────────────────────────────

  applyEvent(sessionId: string, ev: MonitorEvent, agentId?: string) {
    const s = this.ensure(sessionId);
    this.version++;
    if (agentId) return this.applySubEvent(s, agentId, ev);

    switch (ev.t) {
      case "meta":
        if (ev.cwd) s.cwd = ev.cwd;
        if (ev.gitBranch) s.gitBranch = ev.gitBranch;
        if (ev.at < s.startedAt) s.startedAt = ev.at;
        return;
      case "title":
        s.titles[ev.source] = ev.title;
        return;
      case "permission_mode":
        s.permissionMode = ev.mode;
        return;
      case "pr":
        s.prUrl = ev.url;
        return;
      case "prompt":
        this.touch(s, ev.at);
        s.turnEndedAt = undefined;
        s.interruptedAt = undefined;
        s.hookWaiting = undefined;
        s.hookIdleAt = undefined;
        s.errorAt = undefined;
        s.finishedAt = undefined;
        this.log(s, ev.at, "💬", "You sent a prompt");
        return;
      case "assistant":
        this.touch(s, ev.at);
        s.turnEndedAt = undefined;
        s.hookIdleAt = undefined;
        return;
      case "tool_start": {
        this.touch(s, ev.at);
        s.turnEndedAt = undefined;
        s.hookIdleAt = undefined;
        if (s.pending.has(ev.id) || s.ended.has(ev.id)) return;
        const action = describeTool(ev.name, ev.input, ev.at);
        s.pending.set(ev.id, { id: ev.id, action, startedAt: ev.at });
        s.lastAction = action;
        this.log(s, ev.at, action.emoji, action.label);
        return;
      }
      case "tool_end": {
        this.touch(s, ev.at);
        const p = s.pending.get(ev.id);
        s.pending.delete(ev.id);
        s.ended.add(ev.id);
        if (s.ended.size > 500) s.ended.delete(s.ended.values().next().value as string);
        if (s.hookWaiting) s.hookWaiting = undefined;
        if (ev.isError && p) this.log(s, ev.at, "⚠️", `${p.action.label} failed`, "warn");
        // A finished Agent call means its subagent is done (unless it was launched in the background).
        if (!ev.async) {
          for (const sub of s.subagents.values()) {
            if (sub.toolUseId === ev.id && !sub.finishedAt) this.finishSub(s, sub, ev.at);
          }
          if (ev.agentId) {
            const sub = s.subagents.get(ev.agentId);
            if (sub && !sub.finishedAt) this.finishSub(s, sub, ev.at);
          }
        }
        return;
      }
      case "interrupted":
        this.touch(s, ev.at);
        s.pending.clear();
        s.hookWaiting = undefined;
        s.interruptedAt = ev.at;
        this.log(s, ev.at, "✋", "Interrupted by you", "warn");
        return;
      case "turn_end":
        this.touch(s, ev.at);
        s.pending.clear();
        s.hookWaiting = undefined;
        s.turnEndedAt = ev.at;
        s.pendingBackground = ev.pendingBackground;
        this.log(s, ev.at, "🔔", "Reply finished: your turn");
        return;
      case "api_error":
        this.touch(s, ev.at);
        s.errorAt = ev.at;
        this.log(s, ev.at, "⚠️", "API error", "error");
        return;
    }
  }

  private applySubEvent(s: SessState, agentId: string, ev: MonitorEvent) {
    const sub = this.ensureSub(s, agentId, "at" in ev ? ev.at : Date.now());
    if (!("at" in ev)) return;
    if (ev.at > sub.lastActivityAt) sub.lastActivityAt = ev.at;
    if (ev.at > s.lastActivityAt) s.lastActivityAt = ev.at;
    if (ev.t === "tool_start" && !sub.pending.has(ev.id)) {
      const action = describeTool(ev.name, ev.input, ev.at);
      sub.pending.set(ev.id, { id: ev.id, action, startedAt: ev.at });
      sub.lastAction = action;
      this.log(s, ev.at, action.emoji, action.label, "info", sub.agentType);
    } else if (ev.t === "tool_end") {
      sub.pending.delete(ev.id);
    }
  }

  ensureSub(s: SessState, agentId: string, at: number): SubState {
    let sub = s.subagents.get(agentId);
    if (!sub) {
      sub = { id: agentId, sessionId: s.id, agentType: "agent", description: "", startedAt: at, lastActivityAt: at, pending: new Map() };
      s.subagents.set(agentId, sub);
      this.version++;
    }
    return sub;
  }

  subagentMeta(sessionId: string, agentId: string, meta: { agentType?: string; description?: string; toolUseId?: string; finished?: boolean }, at: number) {
    const s = this.ensure(sessionId);
    const isNew = !s.subagents.has(agentId);
    const sub = this.ensureSub(s, agentId, at);
    if (meta.agentType) sub.agentType = meta.agentType;
    if (meta.description) sub.description = meta.description;
    if (meta.toolUseId) sub.toolUseId = meta.toolUseId;
    if (meta.finished && !sub.finishedAt) this.finishSub(s, sub, at);
    if (isNew) this.log(s, at, "🧑‍🤝‍🧑", `Subagent ${sub.agentType} joined${sub.description ? `: ${sub.description}` : ""}`);
    this.version++;
  }

  private finishSub(s: SessState, sub: SubState, at: number) {
    sub.finishedAt = at;
    sub.pending.clear();
    this.log(s, at, "👋", `Subagent ${sub.agentType} finished`);
  }

  // ── Hooks ──────────────────────────────────────────────────────────────────

  applyHook(p: HookPayload, now = Date.now()) {
    const sessionId = typeof p.session_id === "string" ? p.session_id : "";
    if (!sessionId) return;
    const s = this.ensure(sessionId, "hooks", now);
    s.hooksActive = true;
    this.lastHookAt = now;
    this.version++;
    if (typeof p.cwd === "string" && p.cwd && !p.agent_id) s.cwd = p.cwd;
    if (typeof p.permission_mode === "string") s.permissionMode = p.permission_mode;
    if (typeof p.session_title === "string" && p.session_title.trim()) s.titles.custom = p.session_title.trim();

    const agentId = typeof p.agent_id === "string" && p.agent_id ? p.agent_id : undefined;
    const toolId = typeof p.tool_use_id === "string" ? p.tool_use_id : `hook-${now}`;
    const toolName = typeof p.tool_name === "string" ? p.tool_name : "tool";

    switch (p.hook_event_name) {
      case "SessionStart":
        this.touch(s, now);
        if (s.startedAt > now) s.startedAt = now;
        s.finishedAt = undefined;
        return;
      case "UserPromptSubmit":
        return this.applyEvent(sessionId, { t: "prompt", at: now });
      case "PreToolUse":
        return this.applyEvent(sessionId, { t: "tool_start", at: now, id: toolId, name: toolName, input: p.tool_input }, agentId);
      case "PostToolUse":
      case "PostToolUseFailure":
        return this.applyEvent(
          sessionId,
          { t: "tool_end", at: now, id: toolId, isError: p.hook_event_name === "PostToolUseFailure", interrupted: p.is_interrupt === true, async: false },
          agentId,
        );
      case "PermissionRequest":
        this.touch(s, now);
        s.hookWaiting = { reason: "permission", at: now, detail: describeTool(toolName, p.tool_input, now).label };
        this.log(s, now, "🔔", `Needs approval: ${s.hookWaiting.detail}`, "warn");
        return;
      case "Notification": {
        const kind = p.notification_type;
        if (kind === "permission_prompt") {
          if (!s.hookWaiting) {
            s.hookWaiting = { reason: "permission", at: now };
            this.log(s, now, "🔔", "Needs your approval", "warn");
          }
        } else if (kind === "elicitation_dialog" || kind === "agent_needs_input") {
          s.hookWaiting = { reason: "question", at: now };
          this.log(s, now, "❓", "Asking you a question", "warn");
        } else if (kind === "idle_prompt") {
          s.hookIdleAt = now;
        }
        return;
      }
      case "Stop":
        return this.applyEvent(sessionId, { t: "turn_end", at: now, pendingBackground: 0 });
      case "StopFailure":
        s.errorAt = now;
        s.pending.clear();
        this.log(s, now, "⚠️", "Stopped with an error", "error");
        return;
      case "SubagentStart":
        if (agentId) {
          const isNew = !s.subagents.has(agentId);
          const sub = this.ensureSub(s, agentId, now);
          if (typeof p.agent_type === "string" && p.agent_type) sub.agentType = p.agent_type;
          if (isNew) this.log(s, now, "🧑‍🤝‍🧑", `Subagent ${sub.agentType} joined`);
        }
        return;
      case "SubagentStop":
        if (agentId) {
          const sub = s.subagents.get(agentId);
          if (sub && !sub.finishedAt) this.finishSub(s, sub, now);
        }
        return;
      case "SessionEnd":
        s.finishedAt = now;
        s.pending.clear();
        s.hookWaiting = undefined;
        this.log(s, now, "✅", "Session ended");
        return;
    }
  }

  // ── Registry ───────────────────────────────────────────────────────────────

  applyRegistry(entries: RegistryEntry[], now = Date.now()) {
    const byId = new Map(entries.map((e) => [e.sessionId, e]));
    for (const e of entries) {
      if (!e.alive) continue;
      const s = this.sessions.get(e.sessionId);
      if (!s) continue;
      if (!s.registrySeen || !s.registryAlive) this.version++;
      s.registrySeen = true;
      s.registryAlive = true;
      if (!s.cwd && e.cwd) s.cwd = e.cwd;
      if (e.name) {
        const key = e.nameSource === "user" ? "registryUser" : "registryDerived";
        if (s.titles[key] !== e.name) {
          s.titles[key] = e.name;
          this.version++;
        }
      }
    }
    // A session that was in the registry and has gone (or whose process died) has ended.
    for (const s of this.sessions.values()) {
      if (!s.registrySeen || s.finishedAt || s.source === "demo" || s.source === "bridge") continue;
      const e = byId.get(s.id);
      if (!e || !e.alive) {
        s.registryAlive = false;
        s.finishedAt = now;
        s.pending.clear();
        this.log(s, now, "✅", "Session closed");
        this.version++;
      }
    }
  }

  // ── Derivation ─────────────────────────────────────────────────────────────

  /** Wall-clock fallback for a session whose events had no timestamps yet. */
  private times(s: SessState, now: number) {
    const startedAt = s.startedAt === Number.MAX_SAFE_INTEGER ? Math.min(now, s.lastActivityAt || now) : s.startedAt;
    return { startedAt, lastActivityAt: s.lastActivityAt || startedAt };
  }

  private touch(s: SessState, at: number) {
    if (at > s.lastActivityAt) s.lastActivityAt = at;
    if (at < s.startedAt) s.startedAt = at;
  }

  private log(s: SessState, at: number, emoji: string, text: string, level: ActivityEntry["level"] = "info", agent?: string) {
    s.recent.push({ at, emoji, text, level, agent });
    if (s.recent.length > TIMING.recentMax) s.recent.splice(0, s.recent.length - TIMING.recentMax);
  }

  private title(s: SessState): { title: string; source: TitleSource } {
    const t = s.titles;
    if (t.custom) return { title: t.custom, source: "custom" };
    if (t.agent) return { title: t.agent, source: "agent" };
    if (t.registryUser) return { title: t.registryUser, source: "registry" };
    if (t.ai) return { title: t.ai, source: "ai" };
    if (t.registryDerived) return { title: t.registryDerived, source: "registry" };
    return { title: `Session ${s.id.slice(0, 8)}`, source: "id" };
  }

  private deriveSession(s: SessState, now: number) {
    let status: SessionStatus;
    let waitingReason: WaitingReason | undefined;
    let action: Action | undefined;
    let maybeNeedsApproval = false;

    const pending = [...s.pending.values()];
    const { lastActivityAt } = this.times(s, now);
    const stale = now - lastActivityAt > TIMING.stalePendingMs;

    if (s.finishedAt) {
      status = "finished";
      action = stateAction("done", s.finishedAt);
    } else if (s.errorAt && s.errorAt >= lastActivityAt) {
      status = "error";
      action = stateAction("error", s.errorAt);
    } else if (s.hookWaiting) {
      status = "waiting";
      waitingReason = s.hookWaiting.reason;
      action = s.hookWaiting.reason === "permission"
        ? stateAction("permission", s.hookWaiting.at, s.hookWaiting.detail)
        : stateAction("question", s.hookWaiting.at);
    } else if (pending.length > 0 && !stale) {
      const question = pending.find((p) => p.action.kind === "question");
      if (question) {
        status = "waiting";
        waitingReason = "question";
        action = question.action;
      } else {
        status = "working";
        const newest = pending.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a));
        action = newest.action;
        const oldest = pending.reduce((a, b) => (b.startedAt <= a.startedAt ? b : a));
        maybeNeedsApproval =
          !s.hooksActive &&
          oldest.action.kind !== "delegate" &&
          oldest.action.kind !== "read" &&
          oldest.action.kind !== "search" &&
          !NO_APPROVAL_MODES.has(s.permissionMode || "") &&
          now - oldest.startedAt > TIMING.maybeApprovalMs &&
          now - lastActivityAt > TIMING.maybeApprovalMs;
      }
    } else if (s.interruptedAt && s.interruptedAt >= lastActivityAt) {
      status = "idle";
      action = { kind: "idle", emoji: "✋", label: "Interrupted by you", startedAt: s.interruptedAt };
    } else if (s.turnEndedAt) {
      if (s.pendingBackground > 0) {
        status = "working";
        action = { kind: "delegate", emoji: "⏳", label: `Waiting for ${s.pendingBackground} background agent${s.pendingBackground > 1 ? "s" : ""}`, startedAt: s.turnEndedAt };
      } else if (s.hookIdleAt || now - s.turnEndedAt > TIMING.turnEndWaitMs) {
        status = "idle";
        action = stateAction("idle", s.turnEndedAt);
      } else {
        status = "waiting";
        waitingReason = "turn_end";
        action = stateAction("turn_end", s.turnEndedAt);
      }
    } else if (now - lastActivityAt < TIMING.idleAfterMs) {
      status = "working";
      action = stateAction("think", lastActivityAt);
    } else {
      status = "idle";
      action = stateAction("idle", lastActivityAt);
    }

    const key = `${status}|${waitingReason ?? ""}`;
    if (key !== s.statusKey) {
      s.statusKey = key;
      s.statusSince = action?.startedAt && action.startedAt <= now ? action.startedAt : now;
    }
    return { status, waitingReason, action, maybeNeedsApproval };
  }

  private deriveSub(sub: SubState, now: number): SubagentView {
    let status: SessionStatus;
    let action: Action | undefined;
    if (sub.finishedAt) {
      status = "finished";
      action = stateAction("done", sub.finishedAt);
    } else if (sub.pending.size > 0) {
      status = "working";
      action = [...sub.pending.values()].reduce((a, b) => (b.startedAt >= a.startedAt ? b : a)).action;
    } else if (now - sub.lastActivityAt < 30_000) {
      status = "working";
      action = stateAction("think", sub.lastActivityAt);
    } else {
      status = "idle";
      action = stateAction("idle", sub.lastActivityAt);
    }
    return {
      id: sub.id,
      sessionId: sub.sessionId,
      agentType: sub.agentType,
      description: sub.description,
      status,
      action,
      startedAt: sub.startedAt,
      lastActivityAt: sub.lastActivityAt,
      finishedAt: sub.finishedAt,
    };
  }

  /** Expire silent sessions and drop finished ones after they've lingered. */
  prune(now = Date.now()) {
    for (const s of this.sessions.values()) {
      if (s.source === "demo") continue;
      for (const sub of s.subagents.values()) {
        if (!sub.finishedAt && sub.pending.size === 0 && now - sub.lastActivityAt > TIMING.subagentSilentMs) {
          this.finishSub(s, sub, now);
          this.version++;
        }
        if (sub.finishedAt && now - sub.finishedAt > TIMING.subagentLingerMs) {
          s.subagents.delete(sub.id);
          this.version++;
        }
      }
      if (!s.finishedAt && !s.registryAlive && s.source !== "bridge" && now - this.times(s, now).lastActivityAt > TIMING.silentEndMs) {
        s.finishedAt = now;
        s.pending.clear();
        this.version++;
      }
      if (s.finishedAt && now - s.finishedAt > TIMING.finishedLingerMs) {
        this.sessions.delete(s.id);
        this.version++;
      }
    }
  }

  hooksInfo(): HooksInfo {
    return { installed: this.hooksInstalled, lastEventAt: this.lastHookAt };
  }

  snapshot(now = Date.now(), filter?: (s: SessionView) => boolean): Snapshot {
    const projects = new Map<string, ProjectView>();
    const sessions: SessionView[] = [];
    for (const s of this.sessions.values()) {
      if (!s.cwd) continue; // not enough identity yet
      const proj = resolveProject(s.cwd);
      projects.set(proj.id, { id: proj.id, name: proj.name, root: proj.root });
      const d = this.deriveSession(s, now);
      const { title, source: titleSource } = this.title(s);
      const times = this.times(s, now);
      const view: SessionView = {
        id: s.id,
        shortId: s.id.slice(0, 8),
        projectId: proj.id,
        title,
        titleSource,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        status: d.status,
        waitingReason: d.waitingReason,
        maybeNeedsApproval: d.maybeNeedsApproval || undefined,
        action: d.action,
        startedAt: times.startedAt,
        lastActivityAt: times.lastActivityAt,
        statusSince: Math.min(s.statusSince, now),
        hooksActive: s.hooksActive,
        source: s.source,
        prUrl: s.prUrl,
        subagents: [...s.subagents.values()].map((sub) => this.deriveSub(sub, now)),
        recent: s.recent.slice(-TIMING.recentMax),
      };
      if (!filter || filter(view)) sessions.push(view);
    }
    const usedProjects = new Set(sessions.map((s) => s.projectId));
    return {
      projects: [...projects.values()].filter((p) => usedProjects.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)),
      sessions: sessions.sort((a, b) => a.startedAt - b.startedAt),
      hooks: this.hooksInfo(),
      serverTime: now,
      demo: false,
    };
  }
}
