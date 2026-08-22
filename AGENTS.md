# dsh-web-notification

## Goal

Develop a DeepSeek Harness (DSH) plugin that fires web browser notifications when:
1. an agent **task/turn completes**, and
2. a **permission/approval ask** is raised (so the user can return to the GUI and decide).

Full plan: see `PLAN.md`.

**Status: shipped.** v0.1.0 is published at https://github.com/pd90506/dsh-web-notification and installed into the user's `web` profile. The packaged plugin (`lib/index.js` host + `lib/client.js` client, zero build step) is the durable artifact; future work lives in PLAN.md Phase 2.

**Local v0.1.1 (unpublished):** DSH ≥ 0.1.1-rc removed `agent.sessionId` from event payloads (agents now expose `session.id`); `lib/index.js` resolves the session id via `sessionIdOf()` (`sessionId` → `session.id` → `id`). To ship: commit, tag v0.1.1, push, reinstall in the `web` profile, restart the server.

## References

- Official repo: https://github.com/deepseek-ai/deepseek-harness
- Dev docs (quickstart): https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart
- Plugin ecosystem topic: https://github.com/topics/dsh-plugin
- Closest existing implementation (study first): https://github.com/omdsh-dev/dsh-notification — desktop notifications for turn completions, per-outcome controls, keyword rules
- Curated plugin lists: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin , https://github.com/0xsline/awesome-deepseek-harness
- Cordis tutorial: https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/

## Working agreements

- This is a Cordis plugin. Load the `cordis-plugin-development` skill before writing plugin code; query Inspect Providers (`Service.listService`, `Event.listEvents`, `Builtin.listBuiltins`, `Slots.listSubTree`) for exact contracts — never guess APIs.
- Plugin code is plain JavaScript: no TypeScript, JSX, import/require, or unconfirmed globals.
- Key Host events (verified via Inspect): `agent/status` (`running`→`idle` = turn complete), `approval/request` (waterfall — observer MUST `return next()`), plus `subagent/end`, `workflow/end`, `goal/changed` for extended coverage.
- Client→Host only via package RPC (`harness.handle` / `host.call`); the Client polls the Host queue with the `timer` Service.
- Browser `Notification` is not a confirmed Builtin — feature-detect it and fall back to an in-page toast in the `shell.overlay` Slot. Permission requests need a user-gesture button.
