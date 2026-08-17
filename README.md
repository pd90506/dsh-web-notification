# dsh-web-notification

Browser **system notifications** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI:

- **Task complete** — fired when any session's agent transitions `running → idle` (turn finished).
- **Permission requested** — fired when the harness raises an approval/permission ask (tool name + reason + session).

So you can switch tabs or apps and still know the moment DSH needs you — on macOS these arrive as real Notification Center banners, with sound if your browser's notification settings allow it.

Notifications fire **only while the page is hidden or unfocused** (when you're watching the tab, the GUI's own UI already tells you). Clicking a notification focuses the DSH window. Repeated notifications for the same session replace each other instead of stacking.

```
host:  agent/status (running→idle) + approval/request (observe-only) events
        -> bounded in-memory queue -> GET /__dsh-web-notification/poll?after=<seq>
client: polls with a monotonic cursor (every tab sees every item)
        -> permission + visibility gate
        -> new Notification("Task complete", { body: "deploy done finished its turn" })
```

## Install

```sh
dsh plugin --profile web add https://github.com/pd90506/dsh-web-notification/archive/refs/tags/v0.1.0.tar.gz
```

Restart the web server so the host half and the served client bundle pick up the plugin. Then grant notification permission for the DSH origin once (e.g. via the browser's site settings for `http://127.0.0.1:3080`), and make sure macOS System Settings → Notifications → your browser allows banners and sound.

No harness change is needed: `cordis.patch.yml` mounts the host row, and the web profile's client module loader serves `lib/client.js`.

## How it works

- The **host half** listens to two Cordis events. `agent/status` reports the `running → idle` edge per session (the turn's end); `approval/request` is a waterfall event the plugin only *observes* — it always calls `next()` and can never block, alter, or answer an approval. Each event becomes a small JSON item (kind, session id, session title, tool name, reason) in a bounded queue (200 items / 60 s TTL).
- The **client half** polls the queue over a same-origin endpoint with a monotonic `after=<seq>` cursor, so multiple open tabs each see every item. It fires a `Notification` only when permission is granted and the page is not visible.
- The notification icon is the site's own `/favicon.svg`, rasterized to PNG in-page.

## Permission boundary

- The plugin registers no model-facing tools, writes nothing to session logs, and adds no prompt sections. Notifications are UI-only and cost zero tokens.
- The approval listener is strictly pass-through; the harness's own approval cards and policies remain the only decision path.
- The poll endpoint serves only the notification items above (no message content, no tool arguments) on the same origin as the GUI.

## Known limitations

- Notifications require the DSH page to be open in a tab (the browser shows them while it is hidden, but not after the tab is closed) and Notification permission granted; a denied site permission cannot be overridden from inside the page.
- Delivery latency is up to the 2 s poll interval.
- A completion or ask that happens while no page is connected is queued for at most 60 s.

## Development

Zero build step: the host half is plain ESM JavaScript (`lib/index.js`), and the client half is a dependency-free single-file bundle (`lib/client.js`) in the ModuleLoader handshake format. Edit, reinstall, restart.

Related: [omdsh-dev/dsh-notification](https://github.com/omdsh-dev/dsh-notification) — turn-completion notifications with per-outcome toggles and keyword rules (this plugin instead covers permission asks and needs no build tooling).

## License

MIT
