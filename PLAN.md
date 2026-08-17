# PLAN — dsh-web-notification

Browser notifications for DeepSeek Harness Web GUI: **task/turn completion** and **permission/approval asks**.

## 1. Research findings (verified against the live runtime via Inspect)

**Host events** (platform: host, from `Event.listEvents`):

| Event | Mode | Use |
| --- | --- | --- |
| `agent/status` | emit | `running`→`idle` transition = turn/task complete. Payload: `{ agent, status }`. |
| `approval/request` | **waterfall** | Permission ask. Observer must `return next()` or the approval pipeline breaks. Payload: `req` (agent, tool identity, reason, signal). |
| `subagent/end` | emit | Child agent settled (extended coverage). |
| `workflow/end` | emit | Workflow run settled (extended coverage). |
| `agent/turn-stopping` | serial | Alternative completion signal (turn about to close). |
| `agent/error` | emit | Optional: notify on failure. |

**Client constraints** (from `Builtin.listBuiltins` / `Service.listService`):
- Builtins available: `ctx`, `React`, `host` (RPC), `styles`, `console`. `Notification`/`window` are **not** confirmed → feature-detect with `typeof Notification !== 'undefined'`.
- Package RPC direction is **Client→Host only** (`host.call` → `harness.handle`). The Client must poll the Host's notification queue using the `timer` Service (`inject: ['timer']`).
- In-page fallback: toast UI in the `shell.overlay` Slot; an enable button can live in `tool.view.cordis` (`key: 'self'`) or `settings.general.item`.

**Existing implementations to study:**
- `omdsh-dev/dsh-notification` — turn-completion desktop notifications, per-outcome controls, keyword include/exclude rules. Closest prior art; review its event choices and UX before designing settings.
- `HsiangNianian/dsh-auto-continue` — uses browser notifications for failure resumption.

## 2. Architecture

Two-half Cordis plugin (Host + Client):

**Host half**
- `ctx.on('agent/status', ...)` — on `running`→`idle`, enqueue `{ kind: 'complete', sessionId, title?, at }`.
- `ctx.on('approval/request', (req, next) => { enqueue({ kind: 'approval', tool, reason, at }); return next() })` — observe only, never decide.
- In-memory queue (bounded, e.g. 50) + `harness.handle('drain', ...)` returning and clearing pending items; `harness.handle('config', ...)` for runtime toggles.
- Extract only scalar leaf fields from payloads (no serializing live Agent/Session objects).

**Client half**
- `inject: ['timer']`; poll `host.call('drain')` on a short interval (e.g. 2–3 s).
- Feature-detect `Notification`; on first run render an **Enable notifications** button (user gesture required for `Notification.requestPermission()`), registered in `tool.view.cordis` (`key: 'self'`).
- Fire `new Notification(title, { body })` per drained item; if unavailable/denied, render an in-page toast in `shell.overlay` instead.
- Suppress notifications while the tab is focused/visible (configurable); optional click-to-focus.

## 3. Phases

**Phase 0 — Research (mostly done)**
- [x] Verify events/services/builtins via Inspect Providers.
- [ ] Read `omdsh-dev/dsh-notification` source for packaging format, settings UX, and pitfalls.
- [ ] Read the official quickstart + Cordis tutorial for packaged-plugin layout.

**Phase 1 — Dynamic-plugin MVP (in-session prototype)**
- [ ] Define Host+Client dynamic Cordis Plugin with the two core events and poll-drain loop.
- [ ] Run it, grant Client approval, verify: completion notification, approval notification, waterfall not broken (approvals still resolve normally), toast fallback.
- Completion criterion: both notification kinds fire reliably in the live GUI with the tab unfocused.

**Phase 2 — Hardening**
- [ ] Dedupe/throttle (e.g. collapse bursts of subagent completions).
- [ ] Only-when-tab-hidden toggle; per-kind toggles; optional `agent/error`, `subagent/end`, `workflow/end` coverage.
- [ ] Small settings UI (`settings.general.item` or `settings.section` Slot) — in-memory only, no persistence.
- [ ] Click notification → focus tab / open session.

**Phase 3 — Package as a standalone repo**
- [ ] Scaffold per official docs (host + `dsh.client` web module), README with install instructions (`dsh plugin add`).
- [ ] Add the `dsh-plugin` GitHub topic for discoverability; submit to awesome lists.
- Completion criterion: plugin installs into a fresh DSH deployment and passes the Phase 1 test matrix.

## 4. Test matrix

| Case | Expected |
| --- | --- |
| Turn completes, tab hidden | Browser notification fires |
| Approval ask raised (e.g. sandbox escalation) | Notification fires; approval UI still works (waterfall intact) |
| Tab focused | Suppressed (when toggle on) |
| Notification permission denied | In-page toast fallback |
| Multiple sessions | Each notification names its session |
| Plugin stop/update | All listeners, timers, slots, RPC handlers disposed |

## 5. Risks / open questions

- **`approval/request` waterfall discipline** — the listener must always `return next()`; a throw fail-closes the approval. Keep the listener trivially safe.
- **`Notification` global availability** in the restricted Client evaluator — must be confirmed empirically in Phase 1; toast fallback covers failure.
- **Polling latency** — 2–3 s delay on approval asks is acceptable; shorter interval trades host load.
- **Delivery form** — dynamic plugin dies with the process; the Phase 3 packaged repo is the durable artifact.
