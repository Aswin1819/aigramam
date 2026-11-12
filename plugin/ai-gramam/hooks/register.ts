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
import type { EngineInterface, Register } from 'claude-code'

const VERSION = '0.1.0'
const DEFAULT_BASE = 'http://127.0.0.1:4317'
const POLL_MS = 1500
const APPROVAL_WAIT_MS = 45_000
/** Tools whose question only the person in the terminal can answer. */
const PERSON_ONLY = new Set(['AskUserQuestion', 'ExitPlanMode'])
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
      void $.turn.abort({ turnId: link.mainTurnId })
      $.ui.toast('Stopped from Ai Gramam')
    }
  }
}

/** Offer a permission request to the browser; resolves its answer, or null to ask here. */
async function askBrowser($: EngineInterface, tool: string, input: unknown, signal: AbortSignal): Promise<'allow' | 'deny' | null> {
  const opened = await call($, '/approvals', 'POST', { sessionId: link.sessionId, tool, input: slim(input) })
  const id = typeof opened?.id === 'string' ? opened.id : null
  if (!id) return null
  $.ui.toast('Waiting for your answer in Ai Gramam (the prompt shows here in 45 s)')
  const deadline = (await $.clock.now()) + APPROVAL_WAIT_MS
  while (!signal.aborted) {
    const left = deadline - (await $.clock.now())
    if (left <= 0) break
    const r = await call($, `/approvals/${id}?wait=${Math.min(25_000, Math.max(1000, left))}`)
    if (!r) break
    if (r.decision === 'allow' || r.decision === 'deny') return r.decision
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
      send($, [{ hook_event_name: e.reason === 'error' ? 'StopFailure' : 'Stop' }])
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
    const decision = await askBrowser($, e.tool_name, e.tool_input, next.signal)
    if (decision === 'allow') return { decision: { behavior: 'allow' as const } }
    if (decision === 'deny') return { decision: { behavior: 'deny' as const, message: 'Denied in Ai Gramam.' } }
    return next(e)
  }).catch(($, e, next) => next(e))
}
