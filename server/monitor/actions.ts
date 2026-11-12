import type { Action, ActionKind } from "@shared/model";

const MAX_TARGET = 48;

function clip(s: string, max = MAX_TARGET): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** Last path segment for both Windows and POSIX paths. */
export function baseName(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function str(input: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function make(kind: ActionKind, emoji: string, label: string, tool: string | undefined, at: number): Action {
  return { kind, emoji, label, tool, startedAt: at };
}

/**
 * Turn a tool call into a short, human-readable action.
 * Only well-known input fields are used, and every target is truncated.
 */
export function describeTool(name: string, rawInput: unknown, at = Date.now()): Action {
  const input = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>) : {};
  const n = name || "tool";

  switch (n) {
    case "Read":
    case "NotebookRead": {
      const f = str(input, "file_path", "notebook_path", "path");
      return make("read", "📖", f ? `Reading ${clip(baseName(f))}` : "Reading a file", n, at);
    }
    case "Grep": {
      const p = str(input, "pattern");
      return make("search", "🔍", p ? `Searching "${clip(p, 36)}"` : "Searching code", n, at);
    }
    case "Glob": {
      const p = str(input, "pattern");
      return make("search", "🔍", p ? `Finding ${clip(p, 36)}` : "Finding files", n, at);
    }
    case "Edit":
    case "MultiEdit": {
      const f = str(input, "file_path");
      return make("write", "✏️", f ? `Editing ${clip(baseName(f))}` : "Editing a file", n, at);
    }
    case "Write": {
      const f = str(input, "file_path");
      return make("write", "📝", f ? `Writing ${clip(baseName(f))}` : "Writing a file", n, at);
    }
    case "NotebookEdit": {
      const f = str(input, "notebook_path");
      return make("write", "📓", f ? `Editing ${clip(baseName(f))}` : "Editing a notebook", n, at);
    }
    case "Bash":
    case "PowerShell": {
      const d = str(input, "description");
      const c = str(input, "command");
      const what = d || c;
      return make("bash", "💻", what ? `Running ${clip(what)}` : "Running a command", n, at);
    }
    case "WebSearch": {
      const q = str(input, "query");
      return make("web", "🌐", q ? `Searching web "${clip(q, 36)}"` : "Searching the web", n, at);
    }
    case "WebFetch": {
      const u = str(input, "url");
      return make("web", "🌐", u ? `Fetching ${clip(hostOf(u), 40)}` : "Fetching a page", n, at);
    }
    case "Agent":
    case "Task": {
      const d = str(input, "description");
      const t = str(input, "subagent_type");
      const who = t ? ` ${t}` : "";
      return make("delegate", "🤝", d ? `Delegating to${who}: ${clip(d, 36)}` : `Starting${who || " a"} subagent`, n, at);
    }
    case "AskUserQuestion":
      return make("question", "❓", "Asking you a question", n, at);
    case "Skill": {
      const s = str(input, "skill", "name");
      return make("tool", "🧰", s ? `Using skill ${clip(s, 36)}` : "Using a skill", n, at);
    }
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return make("think", "🗒️", "Updating the task list", n, at);
    case "ExitPlanMode":
    case "EnterPlanMode":
      return make("think", "🧭", "Planning", n, at);
  }

  if (n.startsWith("mcp__")) {
    const [, server = "mcp", tool = "tool"] = n.split("__");
    return make("tool", "🧰", `Using ${clip(server, 20)}.${clip(tool, 24)}`, n, at);
  }
  return make("tool", "🧰", `Using ${clip(n, 32)}`, n, at);
}

export const STATE_ACTIONS: Record<"think" | "turn_end" | "permission" | "question" | "idle" | "done" | "error", Omit<Action, "startedAt">> = {
  think: { kind: "think", emoji: "💭", label: "Thinking" },
  turn_end: { kind: "waiting", emoji: "🔔", label: "Your turn: reply finished" },
  permission: { kind: "waiting", emoji: "🔔", label: "Needs your approval" },
  question: { kind: "question", emoji: "❓", label: "Asking you a question" },
  idle: { kind: "idle", emoji: "💤", label: "Idle" },
  done: { kind: "done", emoji: "✅", label: "Finished" },
  error: { kind: "error", emoji: "⚠️", label: "Stopped with an error" },
};

export function stateAction(key: keyof typeof STATE_ACTIONS, at: number, suffix?: string): Action {
  const a = STATE_ACTIONS[key];
  return { ...a, label: suffix ? `${a.label}: ${clip(suffix, 40)}` : a.label, startedAt: at };
}
