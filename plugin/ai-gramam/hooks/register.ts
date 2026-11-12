/**
 * Ai Gramam mod: links this Claude Code session to the Ai Gramam app running
 * on this computer (http://127.0.0.1:4317 by default, AI_GRAMAM_URL to change).
 *
 * - Sends exact session events (prompt, tool start/end, turn end, subagents).
 * - Every 1.5 s collects what the person queued in the browser: a message
 *   (submitted as their own prompt once the session is idle) or a stop.
 * - When a permission request is about to be put to the person, offers it to
 *   the browser first; with no answer in 45 s the normal prompt appears here.
 *
 * Only small fields are sent (paths, a command, a pattern), never file
 * contents, and only to 127.0.0.1 with the key from ~/.ai-gramam/hook-key.
 */
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

const VERSION = '0.2.0'
const DEFAULT_BASE = 'http://127.0.0.1:4317'
const POLL_MS = 1500
const APPROVAL_WAIT_MS = 45_000
/** Claude's multiple-choice questions: answered in the browser at the tool call (see tool.call). */
const QUESTION_TOOL = 'AskUserQuestion'
/** Tools whose permission request isn't put to the browser: plan approval stays in the terminal, questions are answered at the tool call. */
const PERSON_ONLY = new Set(['ExitPlanMode', QUESTION_TOOL])
/** The only input fields Ai Gramam needs to label an action. */
const LABEL_FIELDS = ['file_path', 'notebook_path', 'path', 'command', 'description', 'pattern', 'query', 'url', 'subagent_type', 'skill', 'name']

type Json = Record<string, unknown>

/** This session's link state (starts over when the mod reloads). */
const link = {
  base: DEFAULT_BASE,
  key: null as string | null,
  sessionId: '',
  cwd: '',
  linked: false,
  mainTurnId: null as string | null,
  stoppedTurnId: null as string | null, // the turn Ai Gramam asked to stop
  quietPolls: 0,
  agentTurns: new Map<string, string>(), // turnId → subagent id
}

function slim(input: unknown): Json {
  const out: Json = {}
  if (!input || typeof input !== 'object') return out
  for (const k of LABEL_FIELDS) {
    const v = (input as Json)[k]
    if (typeof v === 'string') out[k] = v.length > 300 ? `${v.slice(0, 299)}…` : v
  }
  return out
}

async function loadKey($: EngineInterface): Promise<string | null> {
  if (link.key) return link.key
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return null
  try {
    const k = (await $.fs.read(`${home}/.ai-gramam/hook-key`)).trim()
    link.key = /^[a-f0-9]{48}$/.test(k) ? k : null
  } catch {
    link.key = null // Ai Gramam has never run on this computer
  }
  return link.key
}

async function call($: EngineInterface, path: string, method = 'GET', body?: Json): Promise<Json | null> {
  const k = await loadKey($)
  if (!k || !link.sessionId) return null
  try {
    const res = await $.http.fetch(`${link.base}/api/link${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-ai-gramam-key': k },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    return JSON.parse(res.text) as Json
  } catch {
    return null
  }
}

function send($: EngineInterface, events: Json[]) {
  void call($, '/events', 'POST', { sessionId: link.sessionId, version: VERSION, events: events.map(e => ({ cwd: link.cwd, ...e })) })
}

function setLinked($: EngineInterface, value: boolean) {
  if (value === link.linked) return
  link.linked = value
  $.ui.status(value ? 'Ai Gramam ● linked' : undefined)
}

async function poll($: EngineInterface) {
  // Back off when Ai Gramam isn't running: check every ~15 s instead of 1.5 s.
  if (!link.linked && link.quietPolls > 0 && link.quietPolls++ % 10 !== 0) return
  const r = await call($, `/inbox?session=${encodeURIComponent(link.sessionId)}&v=${VERSION}`)
  if (!r) {
    link.quietPolls = Math.max(link.quietPolls, 1)
    setLinked($, false)
    return
  }
  link.quietPolls = 0
  setLinked($, true)
  const commands = Array.isArray(r.commands) ? (r.commands as Json[]) : []
  for (const c of commands) {
    if (c.type === 'prompt' && typeof c.text === 'string') {
      $.ui.toast('Message from Ai Gramam: it runs when this session is free')
      void $.prompt.submit({ text: c.text, asUser: true })
    } else if (c.type === 'stop' && link.mainTurnId) {
      link.stoppedTurnId = link.mainTurnId
      void $.turn.abort({ turnId: link.mainTurnId })
      $.ui.toast('Stopped from Ai Gramam')
    }
  }
}

interface BrowserAnswer {
  decision: 'allow' | 'deny'
  /** Question text → chosen label(s) or typed text; only for AskUserQuestion. */
  answers?: Record<string, string>
}

/** Offer a permission request (or a question) to the browser; resolves its answer, or null to ask here. */
async function askBrowser($: EngineInterface, tool: string, input: unknown, signal: AbortSignal): Promise<BrowserAnswer | null> {
  const question = tool === QUESTION_TOOL
  // A question needs its text and options in the browser; anything else only needs its label fields.
  const opened = await call($, '/approvals', 'POST', { sessionId: link.sessionId, tool, input: question ? input : slim(input) })
  const id = typeof opened?.id === 'string' ? opened.id : null
  if (!id) return null
  $.ui.toast(question ? 'Claude asked a question: answer it in Ai Gramam (it shows here in 45 s)' : 'Waiting for your answer in Ai Gramam (the prompt shows here in 45 s)')
  const deadline = (await $.clock.now()) + APPROVAL_WAIT_MS
  while (!signal.aborted) {
    const left = deadline - (await $.clock.now())
    if (left <= 0) break
    const r = await call($, `/approvals/${id}?wait=${Math.min(25_000, Math.max(1000, left))}`)
    if (!r) break
    if (r.decision === 'allow' || r.decision === 'deny') {
      const answers = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, string>) : undefined
      return { decision: r.decision, ...(answers ? { answers } : {}) }
    }
  }
  void call($, `/approvals/${id}`, 'DELETE')
  return null
}

async function start($: EngineInterface) {
  link.sessionId = await $.session.id()
  link.cwd = await $.session.cwd()
  const url = await $.env.get('AI_GRAMAM_URL')
  if (url && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/.test(url)) link.base = url.replace(/\/$/, '')
  send($, [{ hook_event_name: 'SessionStart' }])
  $.clock.every(POLL_MS, () => poll($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await start($)
    return result
  })

  on('prompt.submit', ($, e, next) => {
    send($, [{ hook_event_name: 'UserPromptSubmit' }])
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const { tool, tool_use_id, agentId } = e as unknown as { tool: string; tool_use_id?: string; agentId?: string }
    const id = tool_use_id ?? `mod-${Date.now()}`
    send($, [{ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: slim(e), tool_use_id: id, agent_id: agentId }])
    // Claude's question: offer it in the browser first; its answers become the tool's result, as the terminal dialog's would.
    if (tool === QUESTION_TOOL && link.linked) {
      const questions = (e as unknown as { questions?: unknown }).questions
      const answer = await askBrowser($, tool, { questions }, next.signal)
      if (answer?.decision === 'allow' && answer.answers) {
        send($, [{ hook_event_name: 'PostToolUse', tool_name: tool, tool_use_id: id, agent_id: agentId }])
        const answered: ToolCallResult = { result: { questions, answers: answer.answers } }
        return answered
      }
      // Skipped in the browser, or no answer in time: the dialog opens in the terminal as usual.
    }
    const result = await next(e)
    const failed = (result as { deny?: string }).deny !== undefined || (result as { isError?: boolean }).isError === true
    send($, [{ hook_event_name: failed ? 'PostToolUseFailure' : 'PostToolUse', tool_name: tool, tool_use_id: id, agent_id: agentId }])
    return result
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId) {
      link.agentTurns.set(e.turnId, e.agentId)
      send($, [{ hook_event_name: 'SubagentStart', agent_id: e.agentId }])
    } else {
      link.mainTurnId = e.turnId
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    const agentId = link.agentTurns.get(e.turnId)
    if (agentId) {
      link.agentTurns.delete(e.turnId)
      send($, [{ hook_event_name: 'SubagentStop', agent_id: agentId }])
    } else {
      if (link.mainTurnId === e.turnId) link.mainTurnId = null
      const fromApp = link.stoppedTurnId === e.turnId
      if (fromApp) link.stoppedTurnId = null
      send($, [{ hook_event_name: e.reason === 'error' ? 'StopFailure' : 'Stop', aborted: e.isAborted, stopped_by_app: fromApp && e.isAborted }])
    }
    return next(e)
  })

  on('session.end', ($, e, next) => {
    send($, [{ hook_event_name: 'SessionEnd' }])
    return next(e)
  })

  // A permission request is about to be put to the person: offer it to the browser first.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (!link.linked || PERSON_ONLY.has(e.tool_name)) return next(e)
    const answer = await askBrowser($, e.tool_name, e.tool_input, next.signal)
    if (answer?.decision === 'allow') return { decision: { behavior: 'allow' as const } }
    if (answer?.decision === 'deny') return { decision: { behavior: 'deny' as const, message: 'Denied in Ai Gramam.' } }
    return next(e)
  }).catch(($, e, next) => next(e))
}
