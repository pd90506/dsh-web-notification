/**
 * dsh-web-notification client bundle (single file, no dependencies).
 *
 * The web server serves exactly one file per plugin
 * (/plugins/dsh-web-notification/client.js) wrapped in the ModuleLoader
 * factory handshake. This half polls the host endpoint with a monotonic
 * cursor and fires a browser system Notification for turn completions and
 * permission asks, only while the page is hidden or unfocused.
 */
window.__ModuleLoader__.load({
  id: 'dsh-web-notification',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var POLL_PATH = '/__dsh-web-notification/poll'
    var POLL_MS = 2000
    var BODY_MAX = 180

    /** Rasterize the site's own /favicon.svg to a PNG data URL once. */
    function startIcon() {
      var iconUrl
      try {
        var img = new Image()
        img.onload = function () {
          try {
            var c = document.createElement('canvas')
            c.width = 192
            c.height = 192
            var g = c.getContext('2d')
            g.drawImage(img, 0, 0, 192, 192)
            iconUrl = c.toDataURL('image/png')
          } catch (e) {
            /* keep the SVG fallback */
          }
        }
        img.src = '/favicon.svg'
      } catch (e) {
        /* no icon */
      }
      return function () {
        return iconUrl
      }
    }

    function clip(text) {
      text = String(text || '')
      return text.length > BODY_MAX ? text.slice(0, BODY_MAX - 1) + '…' : text
    }

    function describe(item) {
      var where = item.title || 'Session ' + String(item.sessionId || '').slice(0, 8)
      if (item.kind === 'approval') {
        return {
          title: 'Permission requested',
          body: clip(String(item.toolName || 'tool') + (item.reason ? ' — ' + item.reason : '') + ' (' + where + ')'),
          tag: 'dshwn-approval-' + String(item.sessionId || ''),
        }
      }
      return {
        title: 'Task complete',
        body: clip(where + ' finished its turn'),
        tag: 'dshwn-complete-' + String(item.sessionId || ''),
      }
    }

    /**
     * Client plugin body.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client root context.
     */
    function apply(ctx) {
      var getIcon = startIcon()
      var lastSeq = 0
      var inflight = false

      function fire(item) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
        var d = describe(item)
        try {
          var icon = getIcon()
          var n = new Notification(d.title, {
            body: d.body,
            icon: icon || '/favicon.svg',
            tag: d.tag,
          })
          n.onclick = function () {
            try {
              window.focus()
            } catch (e) {
              /* best effort */
            }
          }
        } catch (e) {
          /* Notification constructor can throw in iframes etc. */
        }
      }

      function poll() {
        if (inflight) return
        inflight = true
        fetch(POLL_PATH + '?after=' + lastSeq, { cache: 'no-store' })
          .then(function (res) {
            return res.ok ? res.json() : { items: [] }
          })
          .then(function (data) {
            inflight = false
            var items = (data && data.items) || []
            for (var i = 0; i < items.length; i++) {
              if (items[i].seq > lastSeq) lastSeq = items[i].seq
              fire(items[i])
            }
          })
          .catch(function () {
            inflight = false
          })
      }

      var timer = setInterval(poll, POLL_MS)
      ctx.effect(function () {
        return function () {
          clearInterval(timer)
        }
      }, 'dsh-web-notification: poll')
    }

    exports.apply = apply
    return module.exports
  },
})
