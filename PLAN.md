# PLAN — dsh-web-notification

**Status: shipped.** v0.1.0 published at https://github.com/pd90506/dsh-web-notification and installed into the `web` profile (activated by restarting the DSH web server). Phase 2 items remain as future work.

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

**Phase 0 — Research — DONE**
- [x] Verify events/services/builtins via Inspect Providers.
- [x] Read `omdsh-dev/dsh-notification` source for packaging format, settings UX, and pitfalls.
- [x] Read the official quickstart + Cordis tutorial for packaged-plugin layout.

**Phase 1 — Dynamic-plugin MVP (in-session prototype) — DONE**
- [x] Define Host+Client dynamic Cordis Plugin with the two core events and poll-drain loop.
- [x] Run it, grant Client approval, verify: completion notification fires (user-confirmed); per user feedback, removed all in-page UI and used the site favicon as the icon.
- Completion criterion: both notification kinds fire reliably in the live GUI with the tab unfocused.

**Phase 2 — Hardening (future work)**
- [ ] Dedupe/throttle (e.g. collapse bursts of subagent completions). (Partially: same-session notifications replace each other via `tag`.)
- [x] Only-when-tab-hidden gate (shipped, not yet toggleable); per-kind toggles; optional `agent/error`, `subagent/end`, `workflow/end` coverage.
- [ ] Small settings UI (`settings.general.item` or `settings.section` Slot).
- [x] Click notification → focus tab (shipped; deep link to session is future work).

**Phase 3 — Package as a standalone repo — DONE (v0.1.0)**
- [x] Zero-build packaged plugin: plain-JS ESM host (`lib/index.js`) + dependency-free ModuleLoader client (`lib/client.js`), `dsh.plugin.json` + `cordis.patch.yml` modeled on omdsh-dev/dsh-notification. Host→Client via same-origin `webServer` poll endpoint with a monotonic cursor (replaces package RPC).
- [x] Add the `dsh-plugin` GitHub topic for discoverability; submit to awesome lists (future).
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
