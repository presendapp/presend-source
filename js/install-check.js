// /install-check : finds the install commands in a pasted README, docs page or MCP configuration (js/install-commands.js,
// in the browser), then sends only the package names (and pinned versions) to Presend's API: existence, age,
// deprecation, publisher change (maintainer-change-check), look-alike names (typosquat-check), known vulnerabilities of
// pinned versions (vulnerability-check). A GitHub URL is read from raw.githubusercontent.com by the browser.
// Everything coming from the pasted text or the API is rendered with textContent, never innerHTML.
(function () {
  'use strict';
  var MAX = 100, MAX_VULN = 6;
  var IC = window.PresendInstallCommands;
  function el(id) { return document.getElementById(id); }
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function reg(eco) { return eco === 'npm' ? 'npm' : 'PyPI'; }

  async function post(endpoint, ecosystem, names) {
    var r = await fetch('/api/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Presend-Client': 'install-check' },
      body: JSON.stringify({ ecosystem: ecosystem, packages: names }) });
    if (r.status === 429) throw new Error('rate limited, wait a minute and try again');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    if (!d || !Array.isArray(d.results) || d.results.length !== names.length) throw new Error('unexpected response');
    return d.results;
  }

  // github.com/owner/repo, .../blob/ref/path, or raw.githubusercontent.com/... -> candidate raw URLs.
  function rawUrls(input) {
    var u;
    try { u = new URL(input.trim().replace(/^(?!https?:\/\/)/, 'https://')); } catch (e) { return null; }
    var parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 4) return [u.href];
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
    if (parts.length < 2) return null;
    var base = 'https://raw.githubusercontent.com/' + parts[0] + '/' + parts[1].replace(/\.git$/, '') + '/';
    if ((parts[2] === 'blob' || parts[2] === 'raw') && parts.length >= 5) return [base + parts.slice(3).join('/')];
    if (parts[2] === 'tree' && parts.length >= 4) {
      var dir = parts.slice(3).join('/') + '/';
      return [base + dir + 'README.md', base + dir + 'readme.md'];
    }
    return [base + 'HEAD/README.md', base + 'HEAD/readme.md', base + 'HEAD/Readme.md', base + 'HEAD/README.MD'];
  }

  async function loadGithub() {
    var status = el('installStatus'), urls = rawUrls(el('ghUrl').value);
    if (!urls) { status.textContent = 'Enter a GitHub repository or file URL, e.g. https://github.com/owner/repo'; return; }
    status.textContent = 'Reading ' + urls[0].replace('https://raw.githubusercontent.com/', '') + '...';
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i]);
        if (r.ok) { el('installSource').value = await r.text(); el('installSource').dataset.source = urls[i]; return run(); }
      } catch (e) { /* next candidate */ }
    }
    status.textContent = 'Could not read that file from GitHub (private repository, wrong path, or no README.md). Paste the text instead.';
  }

  function fixFor(g) {
    var o = g.occurrences[0];
    if (o.role === 'runner' && g.ecosystem === 'npm') return 'npx installs whatever is published under this name. If it is a command of your own package, name the package: npx -y -p <your-package> ' + g.name + '. Otherwise publish the package under this name.';
    if (o.role === 'runner') return 'uvx installs whatever is published under this name. If it is a command of your own package, name the package: uvx --from <your-package> ' + g.name + '. Otherwise publish the package under this name.';
    return 'Anyone can register this name, and the command would then install their package. Publish it under this name, or fix the command.';
  }

  async function run() {
    var status = el('installStatus'), table = el('installResults'), body = table.querySelector('tbody'), btn = el('runInstall'), okList = el('installOk');
    body.textContent = ''; table.hidden = true; okList.textContent = ''; okList.parentNode.hidden = true;
    var text = el('installSource').value;
    if (!text.trim()) { status.textContent = 'Paste a README, a docs page or an MCP configuration first, or load one from GitHub.'; return; }
    var groups = IC.group(IC.extract(text));
    if (groups.length === 0) { status.textContent = 'No install command found. This page reads npx, bunx, pnpm dlx, npm install, pip install, uv, uvx, pipx and poetry commands in code blocks, inline code and MCP configurations.'; return; }
    var all = groups.slice(0, MAX);
    all.forEach(function (g) { g.issues = []; g.warnings = []; g.unchecked = []; });
    status.textContent = 'Found ' + groups.length + ' package(s) in install commands. Checking...';
    btn.disabled = true; el('loadGh').disabled = true;
    try {
      for (var eco of ['npm', 'pypi']) {
        var gs = all.filter(function (g) { return g.ecosystem === eco; });
        if (!gs.length) continue;
        var names = gs.map(function (g) { return g.name; });
        for (var c of chunks(gs, 20)) {
          try {
            (await post('maintainer-change-check', eco, c.map(function (g) { return g.name; }))).forEach(function (x, i) {
              var g = c[i];
              if (x.error) { g.unchecked.push('registry'); return; }
              if (x.found === false) { g.missing = true; g.issues.push(['Does not exist on ' + reg(eco), fixFor(g)]); return; }
              if (x.suspicious) g.issues.push(['Publisher change', 'a new publisher took over after a long dormancy (the event-stream pattern)']);
              if (x.latest_deprecated) g.warnings.push(['Deprecated', 'the latest version is marked deprecated by its maintainer: ' + x.latest_deprecation_message]);
              if (x.new_package === true) g.warnings.push(['New package', 'first published ' + String(x.first_published).slice(0, 10) + ' (' + x.package_age_days + ' day(s) ago): check that it is the package the project means']);
            });
          } catch (e) { c.forEach(function (g) { g.unchecked.push('registry (' + e.message + ')'); }); }
        }
        try {
          (await post('typosquat-check', eco, names)).forEach(function (x, i) {
            if (x.error) gs[i].unchecked.push('look-alike');
            else if (x.suspicious) gs[i].warnings.push(['Close to a popular package', 'close to ' + (x.similar_to || []).map(function (s) { return s.name; }).join(', ') + ': check that the name is not a typo']);
          });
        } catch (e) { gs.forEach(function (g) { g.unchecked.push('look-alike (' + e.message + ')'); }); }
      }
      // Known vulnerabilities, for exact pinned versions only (a range or a tag says nothing about what gets installed).
      var pinned = [];
      all.forEach(function (g) {
        if (g.missing) return;
        g.versions.forEach(function (v) { if (/^v?\d+\.\d+(\.\d+)?([-.+][\w.]+)?$/.test(v)) pinned.push([g, v.replace(/^v/, '')]); });
      });
      for (var k = 0; k < pinned.length; k++) {
        var g = pinned[k][0], v = pinned[k][1];
        if (k >= MAX_VULN) { g.unchecked.push('vulnerabilities of ' + v + ' (limit of ' + MAX_VULN + ' pinned versions per check)'); continue; }
        try {
          var r = await fetch('/api/vulnerability-check?' + new URLSearchParams({ ecosystem: g.ecosystem, package: g.name, version: v }), { headers: { 'X-Presend-Client': 'install-check' } });
          if (!r.ok) throw new Error(r.status === 429 ? 'rate limited' : 'HTTP ' + r.status);
          var d = await r.json();
          if (d.vulnerable) {
            var fixed = d.vulnerabilities.map(function (x) { return x.fixed_in; }).filter(Boolean).sort().pop();
            g.issues.push(['Known vulnerabilities in ' + v, d.count + ' advisory(ies): ' + d.vulnerabilities.slice(0, 3).map(function (x) { return x.id + (x.severity ? ' (' + x.severity.toLowerCase() + ')' : ''); }).join(', ') + (d.count > 3 ? '...' : '') + (fixed ? '. Fixed in ' + fixed + ' or later.' : '')]);
          }
        } catch (e) { g.unchecked.push('vulnerabilities of ' + v + ' (' + e.message + ')'); }
      }
    } finally { btn.disabled = false; el('loadGh').disabled = false; }

    var nIssue = 0, nWarn = 0, nUnchecked = 0, ok = [];
    all.forEach(function (g) {
      var lines = g.issues.concat(g.warnings);
      if (g.unchecked.length) lines.push(['Not checked', g.unchecked.join(', ')]);
      if (g.issues.length) nIssue++; else if (g.warnings.length) nWarn++;
      if (g.unchecked.length) nUnchecked++;
      if (!lines.length) { ok.push(reg(g.ecosystem) + ' ' + g.name); return; }
      var o = g.occurrences[0], where = 'line ' + o.line + ': ' + o.snippet + (g.occurrences.length > 1 ? ' (+' + (g.occurrences.length - 1) + ' more)' : '');
      lines.forEach(function (l, idx) {
        var tr = document.createElement('tr'), a = document.createElement('td'), w = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td'), tag = document.createElement('span');
        if (idx === 0) { a.textContent = reg(g.ecosystem) + ' ' + g.name; var code = document.createElement('code'); code.textContent = where; w.appendChild(code); }
        tag.className = 'tag'; tag.textContent = l[0]; b.appendChild(tag); c.textContent = l[1];
        tr.appendChild(a); tr.appendChild(w); tr.appendChild(b); tr.appendChild(c); body.appendChild(tr);
      });
    });
    table.hidden = body.children.length === 0;
    if (ok.length) { okList.textContent = ok.join(', '); okList.parentNode.hidden = false; }
    var more = groups.length > MAX ? ' Only the first ' + MAX + ' of ' + groups.length + ' were checked.' : '';
    status.textContent = all.length + ' package(s) found in install commands: ' + nIssue + ' with an issue, ' + nWarn + ' to look at' +
      (nUnchecked ? ', ' + nUnchecked + ' not fully checked (see the table)' : '') + '.' +
      (nIssue + nWarn + nUnchecked === 0 ? ' No signal from these checks; see below for what they do not cover.' : '') + more;
  }

  el('runInstall').addEventListener('click', run);
  el('loadGh').addEventListener('click', loadGithub);
  el('ghUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); loadGithub(); } });
  var q = new URLSearchParams(location.search).get('repo');
  if (q) { el('ghUrl').value = q; loadGithub(); }
})();
