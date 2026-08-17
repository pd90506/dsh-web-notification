/**
 * dsh-web-notification host plugin: watches agent turn completion and
 * approval/permission asks, keeps a bounded in-memory queue, and exposes it
 * to the browser half over one same-origin HTTP endpoint. The client polls
 * with a monotonic cursor (?after=<seq>), so every open tab sees every item.
 *
 * No harness change is needed: the row is inserted into the profile
 * composition by cordis.patch.yml at install time.
 */

/** Cordis plugin name (the Loader entry and client bundle id). */
export const name = 'dsh-web-notification'

/** Services required before load: the browser HTTP carrier. */
export const inject = ['webServer']

/** How long an undelivered item stays deliverable (ms). */
const TTL_MS = 60_000
/** Hard cap on queued items. */
const MAX_ITEMS = 200
/** Same-origin endpoint the client half polls. */
const POLL_PATH = '/__dsh-web-notification/poll'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - host cordis context.
 */
export function apply(ctx) {
  /** @type {Array<{ seq: number, at: number, kind: string, sessionId: string, title: string, toolName?: string, reason?: string }>} */
  const items = []
  let seq = 0

  // Optional services: resolve the human-readable session title when present.
  const sessions = ctx.get('sessions')
  const sessionTitle = ctx.get('sessionTitle')
  const titleOf = (sessionId) => {
    try {
      if (sessions === undefined || sessionTitle === undefined || sessionId === '') return ''
      const session = sessions.get(sessionId)
      const snap = session !== undefined ? sessionTitle.get(session) : undefined
      return snap !== undefined && snap !== null && snap.title ? String(snap.title) : ''
    } catch {
      return ''
    }
  }

  const push = (item) => {
    items.push(Object.assign({ seq: ++seq, at: Date.now() }, item))
    const cutoff = Date.now() - TTL_MS
    while (items.length > 0 && items[0].at < cutoff) items.shift()
    if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS)
  }

  // Turn completion: only the running -> idle edge notifies, tracked per session.
  const lastStatus = new Map()
  ctx.on('agent/status', (payload) => {
    try {
      const status = payload && payload.status
      const agent = payload && payload.agent
      const sessionId = agent && agent.sessionId !== undefined ? String(agent.sessionId) : ''
      const prev = lastStatus.get(sessionId)
      lastStatus.set(sessionId, status)
      if (status === 'idle' && prev === 'running') {
        push({ kind: 'complete', sessionId, title: titleOf(sessionId) })
      }
    } catch (e) {
      console.error('[dsh-web-notification] agent/status listener failed', e)
    }
  })

  // Permission asks: waterfall event — observe only, ALWAYS pass through.
  ctx.on('approval/request', (req, next) => {
    try {
      const agent = req && req.agent
      const sessionId = agent && agent.sessionId !== undefined ? String(agent.sessionId) : ''
      push({
        kind: 'approval',
        sessionId,
        title: titleOf(sessionId),
        toolName: req && req.toolName !== undefined ? String(req.toolName) : 'tool',
        reason: req && req.reason !== undefined ? String(req.reason).slice(0, 300) : '',
      })
    } catch (e) {
      console.error('[dsh-web-notification] approval/request listener failed', e)
    }
    return next()
  })

  // Same-origin poll endpoint; registration is a fiber effect, removed on unload.
  ctx.webServer.register({
    kind: 'exact',
    path: POLL_PATH,
    handler(req, res) {
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const after = Number(url.searchParams.get('after') || '0') || 0
        const out = items.filter((i) => i.seq > after)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ items: out }))
      } catch (e) {
        console.error('[dsh-web-notification] poll handler failed', e)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{"error":"internal"}')
      }
    },
  })
}
