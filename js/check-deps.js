// /check : reads a package.json or requirements.txt in the browser and sends only package names to Presend's API
// (typosquat-check; maintainer-change-check: existence and age for npm and PyPI, publisher change for npm only). Everything coming from the
// pasted text or the API is rendered with textContent, never innerHTML.
(function () {
  'use strict';
  var MAX = 100;
  function el(id) { return document.getElementById(id); }
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

  function parseManifest(text) {
    var t = (text || '').trim();
    if (!t) return null;
    if (t.charAt(0) === '{') {
      var j;
      try { j = JSON.parse(t); } catch (e) { return { error: 'This looks like JSON but could not be parsed: ' + e.message }; }
      var names = [];
      ['dependencies', 'devDependencies', 'optionalDependencies'].forEach(function (k) {
        if (j && j[k] && typeof j[k] === 'object') Object.keys(j[k]).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
      });
      return { ecosystem: 'npm', names: names };
    }
    var seen = {}, out = [];
    t.split(/\r?\n/).forEach(function (line) {
      var l = line.replace(/#.*$/, '').trim();
      if (!l || l.charAt(0) === '-' || /:\/\//.test(l) || /^[.\/~]/.test(l)) return;
      var m = l.match(/^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/);
      if (!m) return;
      var key = m[1].toLowerCase().replace(/[-_.]+/g, '-');
      if (!seen[key]) { seen[key] = true; out.push(m[1]); }
    });
    return { ecosystem: 'pypi', names: out };
  }

  async function post(endpoint, ecosystem, names) {
    var r = await fetch('/api/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Presend-Client': 'check' },
      body: JSON.stringify({ ecosystem: ecosystem, packages: names }) });
    if (r.status === 429) throw new Error('rate limited, wait a minute and try again');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    if (!d || !Array.isArray(d.results) || d.results.length !== names.length) throw new Error('unexpected response');
    return d.results;
  }

  async function run() {
    var status = el('checkStatus'), table = el('checkResults'), body = table.querySelector('tbody'), btn = el('runCheck');
    body.textContent = ''; table.hidden = true;
    var p = parseManifest(el('manifest').value);
    if (!p) { status.textContent = 'Paste a package.json or a requirements.txt first.'; return; }
    if (p.error) { status.textContent = p.error; return; }
    if (p.names.length === 0) { status.textContent = 'No dependencies found.'; return; }
    var names = p.names.slice(0, MAX), rows = {};
    names.forEach(function (n) { rows[n] = { issues: [], warnings: [], unchecked: [] }; });
    status.textContent = 'Checking ' + names.length + ' ' + (p.ecosystem === 'npm' ? 'npm' : 'PyPI') + ' package(s)...';
    btn.disabled = true;
    try {
      for (var g1 of chunks(names, 100)) {
        try {
          (await post('typosquat-check', p.ecosystem, g1)).forEach(function (x, i) {
            if (x.error) rows[g1[i]].unchecked.push('typosquat');
            else if (x.suspicious) rows[g1[i]].issues.push(['Possible typosquat', 'close to ' + (x.similar_to || []).map(function (s) { return s.name; }).join(', ')]);
          });
        } catch (e) { g1.forEach(function (n) { rows[n].unchecked.push('typosquat (' + e.message + ')'); }); }
      }
      // Existence and age for npm and PyPI; publisher change for npm only (suspicious is null on PyPI).
      {
        for (var g2 of chunks(names, 20)) {
          try {
            (await post('maintainer-change-check', p.ecosystem, g2)).forEach(function (x, i) {
              var r = rows[g2[i]];
              if (x.error) { r.unchecked.push('registry'); return; }
              if (x.found === false) { r.issues.push(['Does not exist on ' + (p.ecosystem === 'npm' ? 'npm' : 'PyPI'), 'the name may be invented; check it against the project documentation']); return; }
              if (x.suspicious) r.issues.push(['Publisher change', 'new publisher after a long dormancy (the event-stream pattern)']);
              if (x.new_package === true) { var ago = (x.package_age_days === 0 ? 'less than a day' : x.package_age_days + ' day(s)') + ' ago (' + String(x.first_published).slice(0, 10) + ')'; r.warnings.push(['New package', p.ecosystem === 'npm' ? 'first published ' + ago : 'oldest release still on PyPI uploaded ' + ago + ': a new project, or its earlier releases were deleted']); }
            });
          } catch (e) { g2.forEach(function (n) { rows[n].unchecked.push('registry (' + e.message + ')'); }); }
        }
      }
    } finally { btn.disabled = false; }
    var nIssue = 0, nWarn = 0, nUnchecked = 0;
    names.forEach(function (n) {
      var r = rows[n], lines = [];
      r.issues.forEach(function (x) { lines.push(x); });
      r.warnings.forEach(function (x) { lines.push(x); });
      if (r.unchecked.length) lines.push(['Not checked', r.unchecked.join(', ')]);
      if (r.issues.length) nIssue++; else if (r.warnings.length) nWarn++;
      if (r.unchecked.length) nUnchecked++;
      lines.forEach(function (l) {
        var tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td'), tag = document.createElement('span');
        a.textContent = n; tag.className = 'tag'; tag.textContent = l[0]; b.appendChild(tag); c.textContent = l[1];
        tr.appendChild(a); tr.appendChild(b); tr.appendChild(c); body.appendChild(tr);
      });
    });
    table.hidden = body.children.length === 0;
    var more = p.names.length > MAX ? ' Only the first ' + MAX + ' of ' + p.names.length + ' were checked.' : '';
    status.textContent = names.length + ' ' + (p.ecosystem === 'npm' ? 'npm' : 'PyPI') + ' package(s) checked: ' + nIssue + ' with an issue, ' + nWarn + ' new package(s) to look at' +
      (nUnchecked ? ', ' + nUnchecked + ' not fully checked (see the table)' : '') + '.' +
      (nIssue + nWarn + nUnchecked === 0 ? ' No signal from these checks; see below for what they do not cover.' : '') + more;
  }

  el('runCheck').addEventListener('click', run);
})();
