/**
 * Presend Embeddable Widget (API-backed, no iframe)
 * Usage:
 *   <div data-presend-tool="url-cleaner"></div>
 *   <script src="https://presend.pages.dev/widget.js" async></script>
 *
 * Supported tools: url-cleaner, uuid, color, timestamp, base64, jwt-decode
 * Options:
 *   data-presend-tool  (required)
 *   data-badge         (optional) "false" to hide "Powered by Presend"
 */
(function () {
  var BASE = 'https://presend.pages.dev';
  var TOOL_SLUG_RE = /^[a-z0-9-]+$/;

  var STYLE = [
    '.presend-w{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:480px;border:1px solid #e2e2e2;border-radius:10px;padding:16px;background:#fff;color:#1a1a1a;}',
    '.presend-w input,.presend-w button{font:inherit;}',
    '.presend-w input[type=text]{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;margin-bottom:8px;}',
    '.presend-w button{background:#1F3A5F;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;}',
    '.presend-w button:hover{opacity:0.9;}',
    '.presend-w .presend-result{margin-top:10px;padding:10px;background:#f7f5f0;border-radius:6px;font-size:13px;word-break:break-all;white-space:pre-wrap;display:none;}',
    '.presend-w .presend-badge{display:block;text-align:right;font-size:11px;color:#8a8f98;text-decoration:none;margin-top:8px;}',
    '.presend-w .presend-badge:hover{color:#4a4f58;}',
    '.presend-w .presend-error{color:#c0392b;font-size:12px;margin-top:4px;}'
  ].join('');

  function injectStyleOnce() {
    if (document.getElementById('presend-widget-style')) return;
    var s = document.createElement('style');
    s.id = 'presend-widget-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function badge(tool) {
    var a = document.createElement('a');
    a.className = 'presend-badge';
    a.href = BASE + '/?utm_source=widget&utm_medium=embed&utm_campaign=' + encodeURIComponent(tool);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Powered by Presend';
    return a;
  }

  var BUILDERS = {
    'url-cleaner': function (root, tool, showBadge) {
      root.innerHTML =
        '<input type="text" class="presend-in" placeholder="Paste a URL to clean">' +
        '<button type="button" class="presend-go">Clean URL</button>' +
        '<div class="presend-result"></div><div class="presend-error"></div>';
      var input = root.querySelector('.presend-in');
      var btn = root.querySelector('.presend-go');
      var result = root.querySelector('.presend-result');
      var err = root.querySelector('.presend-error');
      btn.addEventListener('click', function () {
        err.textContent = '';
        var url = input.value.trim();
        if (!url) return;
        fetch(BASE + '/api/url-clean?url=' + encodeURIComponent(url))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { err.textContent = data.error; result.style.display = 'none'; return; }
            result.textContent = data.clean;
            result.style.display = 'block';
          })
          .catch(function () { err.textContent = 'Request failed.'; });
      });
      if (showBadge) root.appendChild(badge(tool));
    },

    'uuid': function (root, tool, showBadge) {
      root.innerHTML = '<button type="button" class="presend-go">Generate UUID</button><div class="presend-result"></div>';
      var btn = root.querySelector('.presend-go');
      var result = root.querySelector('.presend-result');
      btn.addEventListener('click', function () {
        fetch(BASE + '/api/uuid')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            result.textContent = (data.uuids && data.uuids[0]) || 'Error';
            result.style.display = 'block';
          })
          .catch(function () { result.textContent = 'Request failed.'; result.style.display = 'block'; });
      });
      if (showBadge) root.appendChild(badge(tool));
    },

    'color': function (root, tool, showBadge) {
      root.innerHTML =
        '<input type="text" class="presend-in" placeholder="#ff5733 or 255,87,51">' +
        '<button type="button" class="presend-go">Convert</button>' +
        '<div class="presend-result"></div><div class="presend-error"></div>';
      var input = root.querySelector('.presend-in');
      var btn = root.querySelector('.presend-go');
      var result = root.querySelector('.presend-result');
      var err = root.querySelector('.presend-error');
      btn.addEventListener('click', function () {
        err.textContent = '';
        var v = input.value.trim().replace('#', '');
        var param = /^[0-9a-fA-F]{3,6}$/.test(v) ? ('hex=' + v) : ('rgb=' + encodeURIComponent(v));
        fetch(BASE + '/api/color?' + param)
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { err.textContent = data.error; result.style.display = 'none'; return; }
            result.textContent = data.hex + '  ·  ' + data.rgb + '  ·  ' + data.hsl;
            result.style.display = 'block';
          })
          .catch(function () { err.textContent = 'Request failed.'; });
      });
      if (showBadge) root.appendChild(badge(tool));
    }
  };

  function buildWidget(el) {
    var tool = (el.getAttribute('data-presend-tool') || '').trim();
    if (!TOOL_SLUG_RE.test(tool) || !BUILDERS[tool]) {
      el.innerHTML = '<p style="color:#c0392b;font-family:sans-serif;font-size:13px;">Presend widget: unsupported tool "' + tool.replace(/[<>]/g, '') + '". Supported: ' + Object.keys(BUILDERS).join(', ') + '.</p>';
      return;
    }
    injectStyleOnce();
    el.classList.add('presend-w');
    var showBadge = el.getAttribute('data-badge') !== 'false';
    BUILDERS[tool](el, tool, showBadge);
  }

  function init() {
    var elements = document.querySelectorAll('[data-presend-tool]');
    for (var i = 0; i < elements.length; i++) buildWidget(elements[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
