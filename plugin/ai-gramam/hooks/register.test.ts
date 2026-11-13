import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const KEY = 'a'.repeat(48)
type World = { key: string | null; reply: 'ok' | 'down' | 'forbidden' }

/** Stands in for Claude Code and Ai Gramam: the key file, the app's replies, and what the status line shows. */
function engine(on: On, world: World) {
  const clock = mock.clock(on, { now: 1_000 })
  const status: Array<string | undefined> = []
  on('session.id', () => ({ value: 'sess-0001' }))
  on('session.cwd', () => ({ value: 'C:/work/app' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/me' : undefined }))
  on('fs.read', () => (world.key ? { value: world.key } : { deny: 'no such file' }))
  on('http.fetch', () => {
    if (world.reply === 'down') return { deny: 'connection refused' }
    const ok = world.reply === 'ok'
    return { value: { status: ok ? 200 : 403, ok, headers: {}, text: ok ? '{"commands":[]}' : '{"error":"forbidden"}' } }
  })
  on('ui.status', (_, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  return { clock, status }
}

test('the status line says why a session is not linked, and clears up when the app answers', async ($, on) => {
  const world: World = { key: KEY, reply: 'down' }
  const { clock, status } = engine(on, world)
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })

  await clock.advance(1_500)
  expect(status.at(-1)).toBe('Ai Gramam ○ app not running')

  // While the app is down the mod checks every ~15 s.
  world.reply = 'ok'
  await clock.advance(15_000)
  expect(status.at(-1)).toBe('Ai Gramam ● linked')

  world.reply = 'forbidden'
  await clock.advance(1_500)
  expect(status.at(-1)).toBe('Ai Gramam ○ key not accepted, retrying')
})

test('without the local key it asks for the app to be started once', async ($, on) => {
  const { clock, status } = engine(on, { key: null, reply: 'ok' })
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1_500)
  expect(status.at(-1)).toBe('Ai Gramam ○ not set up: start the app once')
})
