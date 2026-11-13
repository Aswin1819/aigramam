/**
 * The live link between Ai Gramam and the Ai Gramam mod running inside each
 * Claude Code session.
 *
 * The mod (plugin/ai-gramam) posts exact session events here, collects
 * commands the person queued in the browser (a message, stop) and asks the
 * browser to answer permission requests. Every request needs the shared key
 * and must come from this computer.
 */
import crypto from "crypto";
import express, { type Request, type Response, type Router } from "express";
import { isLocalRequest } from "../_core/security";
import type { LinkQuestion } from "@shared/model";
import type { HookPayload } from "../monitor/store";

export const LINK_PATH = "/api/link";
export const LINK_HEADER = "x-ai-gramam-key";

/** A session counts as linked while its mod checked in within this window. */
const LINKED_MS = 6_000;
/** Longest a single approval long-poll is held open. */
const MAX_WAIT_MS = 30_000;
/** Pending approvals nobody answered are dropped after this. */
const APPROVAL_TTL_MS = 5 * 60_000;
const MAX_MESSAGE = 8_000;
const MAX_QUEUE = 20;
const MAX_ANSWER = 2_000;

export type LinkCommand = { id: string; type: "prompt"; text: string; at: number } | { id: string; type: "stop"; at: number };

export type Decision = "allow" | "deny";
/** What the mod gets back: the decision, plus the answers when it was a question. */
export interface Outcome {
  decision: Decision;
  answers?: Record<string, string>;
}

export interface Approval {
  id: string;
  sessionId: string;
  tool: string;
  label: string;
  createdAt: number;
  /** Set for AskUserQuestion: the browser answers instead of approving. */
  questions?: LinkQuestion[];
  outcome?: Outcome;
  waiters: Array<(o: Outcome | null) => void>;
}

export interface LinkInfo {
  connected: boolean;
  queued: number;
  approval?: { id: string; tool: string; label: string; since: number; questions?: LinkQuestion[] };
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/** Keep only the parts of an AskUserQuestion input the browser shows, bounded. */
export function sanitizeQuestions(input: unknown): LinkQuestion[] | undefined {
  const qs = (input as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(qs)) return undefined;
  const out: LinkQuestion[] = [];
  for (const q of qs.slice(0, 4)) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;
    const question = clip(o.question, 500).trim();
    const options = Array.isArray(o.options)
      ? o.options.slice(0, 6).flatMap((x) => {
          const opt = (x ?? {}) as Record<string, unknown>;
          const label = clip(opt.label, 120).trim();
          const description = clip(opt.description, 300).trim();
          return label ? [{ label, ...(description ? { description } : {}) }] : [];
        })
      : [];
    if (question) out.push({ question, header: clip(o.header, 40).trim(), options, multiSelect: o.multiSelect === true });
  }
  return out.length ? out : undefined;
}

/** Answers must name the asked questions; values are bounded, non-empty strings. */
function validAnswers(answers: unknown, questions: LinkQuestion[]): Record<string, string> | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const asked = new Set(questions.map((q) => q.question));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (!asked.has(k) || typeof v !== "string") return null;
    const t = v.trim();
    if (t) out[k] = t.slice(0, MAX_ANSWER);
  }
  return Object.keys(out).length ? out : null;
}

interface LinkedSession {
  lastSeen: number;
  inbox: LinkCommand[];
  version?: string;
}

function keyMatches(given: unknown, expected: string): boolean {
  const a = Buffer.from(typeof given === "string" ? given : "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isSessionId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,80}$/.test(v);

export class Link {
  private sessions = new Map<string, LinkedSession>();
  private approvals = new Map<string, Approval>();
  /** When any mod last checked in (kept after its session is pruned), and with which version. */
  private lastContact: { at: number; version?: string } | null = null;
  /** Called whenever something the browser shows changed. */
  onChange: () => void = () => {};

  constructor(
    private readonly getKey: () => string,
    private readonly onEvent: (p: HookPayload) => void,
    private readonly describe: (tool: string, input: unknown) => string,
  ) {}

  private touch(sessionId: string, version?: string): LinkedSession {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = { lastSeen: 0, inbox: [] };
      this.sessions.set(sessionId, s);
    }
    const wasLinked = Date.now() - s.lastSeen < LINKED_MS;
    s.lastSeen = Date.now();
    if (version) s.version = version;
    this.lastContact = { at: s.lastSeen, version: s.version };
    if (!wasLinked) this.onChange();
    return s;
  }

  info(sessionId: string, now = Date.now()): LinkInfo | undefined {
    const s = this.sessions.get(sessionId);
    const approval = [...this.approvals.values()].find((a) => a.sessionId === sessionId && !a.outcome);
    if (!s && !approval) return undefined;
    return {
      connected: !!s && now - s.lastSeen < LINKED_MS,
      queued: s?.inbox.filter((c) => c.type === "prompt").length ?? 0,
      approval: approval && { id: approval.id, tool: approval.tool, label: approval.label, since: approval.createdAt, ...(approval.questions ? { questions: approval.questions } : {}) },
    };
  }

  /** For the setup checks: sessions linked right now, their mod versions, and the last time any mod checked in. */
  summary(now = Date.now()): { linkedNow: number; versions: string[]; lastContactAt: number | null; lastVersion: string | null } {
    const live = [...this.sessions.values()].filter((s) => now - s.lastSeen < LINKED_MS);
    const versions = [...new Set(live.map((s) => s.version).filter((v): v is string => !!v))].sort();
    return { linkedNow: live.length, versions, lastContactAt: this.lastContact?.at ?? null, lastVersion: this.lastContact?.version ?? null };
  }

  // ── Browser side ───────────────────────────────────────────────────────────

  /** Queue a message for a linked session; it runs as a turn once the session is idle. */
  queueMessage(sessionId: string, text: string): { ok: true } | { ok: false; error: string } {
    const s = this.sessions.get(sessionId);
    if (!s || Date.now() - s.lastSeen >= LINKED_MS) return { ok: false, error: "That session isn't linked to Ai Gramam (the mod isn't running in it)." };
    const t = text.trim();
    if (!t) return { ok: false, error: "The message is empty." };
    if (t.length > MAX_MESSAGE) return { ok: false, error: `Messages are limited to ${MAX_MESSAGE} characters.` };
    if (s.inbox.length >= MAX_QUEUE) return { ok: false, error: "Too many messages are already waiting for this session." };
    s.inbox.push({ id: crypto.randomUUID(), type: "prompt", text: t, at: Date.now() });
    this.onChange();
    return { ok: true };
  }

  queueStop(sessionId: string): { ok: true } | { ok: false; error: string } {
    const s = this.sessions.get(sessionId);
    if (!s || Date.now() - s.lastSeen >= LINKED_MS) return { ok: false, error: "That session isn't linked to Ai Gramam." };
    s.inbox.push({ id: crypto.randomUUID(), type: "stop", at: Date.now() });
    this.onChange();
    return { ok: true };
  }

  /**
   * Answer a request from the browser. For a question, "allow" needs answers
   * to the asked questions; "deny" hands the question back to the terminal.
   */
  decide(approvalId: string, decision: Decision, answers?: unknown): { ok: true } | { ok: false; error: string } {
    const a = this.approvals.get(approvalId);
    if (!a || a.outcome) return { ok: false, error: "That request was already answered or has expired." };
    let outcome: Outcome = { decision };
    if (a.questions && decision === "allow") {
      const valid = validAnswers(answers, a.questions);
      if (!valid) return { ok: false, error: "Pick an answer first." };
      outcome = { decision, answers: valid };
    }
    a.outcome = outcome;
    for (const w of a.waiters.splice(0)) w(outcome);
    this.onChange();
    return { ok: true };
  }

  // ── Mod side ───────────────────────────────────────────────────────────────

  /** Drains a session's inbox (the mod acts on each command). */
  takeInbox(sessionId: string, version?: string): LinkCommand[] {
    const s = this.touch(sessionId, version);
    const out = s.inbox.splice(0);
    if (out.length) this.onChange();
    return out;
  }

  openApproval(sessionId: string, tool: string, input: unknown): Approval {
    this.touch(sessionId);
    // A session has at most one open request: a new one replaces an unanswered one.
    for (const a of this.approvals.values()) if (a.sessionId === sessionId && !a.outcome) this.closeApproval(a.id);
    const questions = tool === "AskUserQuestion" ? sanitizeQuestions(input) : undefined;
    const label = questions ? questions[0]!.question : this.describe(tool, input);
    const a: Approval = { id: crypto.randomUUID(), sessionId, tool, label, createdAt: Date.now(), waiters: [], ...(questions ? { questions } : {}) };
    this.approvals.set(a.id, a);
    this.onChange();
    return a;
  }

  waitApproval(id: string, ms: number): Promise<Outcome | null> {
    const a = this.approvals.get(id);
    if (!a) return Promise.resolve(null);
    if (a.outcome) return Promise.resolve(a.outcome);
    return new Promise((resolve) => {
      const done = (o: Outcome | null) => {
        clearTimeout(t);
        resolve(o);
      };
      const t = setTimeout(() => {
        a.waiters = a.waiters.filter((w) => w !== done);
        resolve(null);
      }, Math.min(ms, MAX_WAIT_MS));
      a.waiters.push(done);
    });
  }

  /** The mod stopped waiting (answered in the terminal, or gave up): forget the request. */
  closeApproval(id: string) {
    const a = this.approvals.get(id);
    if (!a) return;
    for (const w of a.waiters.splice(0)) w(null);
    this.approvals.delete(id);
    this.onChange();
  }

  prune(now = Date.now()) {
    for (const a of this.approvals.values()) if (now - a.createdAt > APPROVAL_TTL_MS) this.closeApproval(a.id);
    for (const [id, s] of this.sessions) if (now - s.lastSeen > 10 * 60_000 && s.inbox.length === 0) this.sessions.delete(id);
  }

  // ── HTTP API for the mod ───────────────────────────────────────────────────

  router(): Router {
    const r = express.Router();
    r.use((req: Request, res: Response, next) => {
      if (!isLocalRequest(req) || !keyMatches(req.headers[LINK_HEADER], this.getKey())) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      next();
    });

    // Session events, same shape as Claude Code hook payloads.
    r.post("/events", (req, res) => {
      const { sessionId, events, version } = req.body ?? {};
      if (!isSessionId(sessionId) || !Array.isArray(events) || events.length > 200) {
        res.status(400).json({ error: "bad request" });
        return;
      }
      this.touch(sessionId, typeof version === "string" ? version.slice(0, 20) : undefined);
      res.json({ ok: true });
      for (const ev of events) {
        if (ev && typeof ev === "object") {
          try {
            this.onEvent({ ...(ev as HookPayload), session_id: sessionId });
          } catch {}
        }
      }
    });

    r.get("/inbox", (req, res) => {
      const sessionId = req.query.session;
      if (!isSessionId(sessionId)) {
        res.status(400).json({ error: "bad request" });
        return;
      }
      res.json({ commands: this.takeInbox(sessionId, typeof req.query.v === "string" ? req.query.v.slice(0, 20) : undefined) });
    });

    r.post("/approvals", (req, res) => {
      const { sessionId, tool, input } = req.body ?? {};
      if (!isSessionId(sessionId) || typeof tool !== "string" || tool.length > 200) {
        res.status(400).json({ error: "bad request" });
        return;
      }
      const a = this.openApproval(sessionId, tool, input);
      res.json({ id: a.id });
    });

    r.get("/approvals/:id", async (req, res) => {
      const wait = Math.max(0, Math.min(Number(req.query.wait) || 0, MAX_WAIT_MS));
      const outcome = await this.waitApproval(String(req.params.id), wait);
      res.json({ decision: outcome?.decision ?? null, ...(outcome?.answers ? { answers: outcome.answers } : {}) });
    });

    r.delete("/approvals/:id", (req, res) => {
      this.closeApproval(String(req.params.id));
      res.json({ ok: true });
    });
    return r;
  }
}
