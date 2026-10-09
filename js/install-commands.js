// Extracts the npm and PyPI packages that install commands would fetch from a pasted text: a README, a docs page,
// an MCP configuration (JSON). Pure function, no network: used by /install-check in the browser and by the tests
// in Node (tests/install-commands/). What it reads:
//   npm runners   npx, bunx, pnpm dlx, yarn dlx    (-p/--package names the package; otherwise the first argument does)
//   npm installs  npm i/install/add, pnpm add/i, yarn add, bun add/i
//   PyPI          pip/pip3 install, python -m pip install, uv pip install, uv add, uv tool install, pipx install,
//                 poetry add, uvx and pipx run (--from names the package; otherwise the first argument does)
//   MCP configs   "command": "npx" | "bunx" | "uvx" with its "args" array, in JSON (parsed or not)
// Placeholders (<package>, $PKG, your-package...), paths, URLs and git sources are skipped: they are not registry names.
(function (root) {
  'use strict';

  var NPM_NAME = /^(@[A-Za-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.-]*$/;
  var PYPI_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
  var PLACEHOLDERS = ['package', 'packages', 'package-name', 'pkg', 'name', 'my-package', 'your-package', 'module', 'library',
    'your-package-name', 'packagename', 'mypackage', 'my-mcp-server', 'your-mcp-server', 'example', 'foo', 'bar', 'baz', 'xyz', 'abc'];

  // Options that take a value (the value is not a package).
  var NPM_RUNNER_VALUE_OPTS = { '--registry': 1, '--cache': 1, '--userconfig': 1, '--node-options': 1, '--prefix': 1, '--shell': 1 };
  var NPM_INSTALL_VALUE_OPTS = { '--registry': 1, '--prefix': 1, '--tag': 1, '-w': 1, '--workspace': 1, '--filter': 1, '-C': 1, '--dir': 1, '--cwd': 1, '--cache': 1 };
  var PIP_VALUE_OPTS = { '-r': 1, '--requirement': 1, '-c': 1, '--constraint': 1, '-e': 1, '--editable': 1, '-i': 1, '--index-url': 1,
    '--extra-index-url': 1, '--default-index': 1, '--index': 1, '-f': 1, '--find-links': 1, '-t': 1, '--target': 1, '--prefix': 1, '--root': 1,
    '--src': 1, '--python-version': 1, '--platform': 1, '--only-binary': 1, '--no-binary': 1, '--trusted-host': 1, '--upgrade-strategy': 1,
    '--python': 1, '-p': 1, '--group': 1, '--optional': 1, '--extra': 1, '--dev-group': 1, '-G': 1, '--source': 1, '--pip-args': 1, '--suffix': 1,
    '--spec': 1, '--branch': 1, '--rev': 1, '--tag': 1, '--path': 1, '--directory': 1, '--project': 1, '--package': 1 };
  var UVX_VALUE_OPTS = { '--python': 1, '-p': 1, '--index-url': 1, '--extra-index-url': 1, '--index': 1, '--default-index': 1, '-i': 1,
    '--find-links': 1, '-f': 1, '--directory': 1, '--project': 1, '--python-version': 1, '--with-requirements': 1, '--env-file': 1,
    '--pip-args': 1, '--spec': 1 };

  // Command starters, matched anywhere in a line (inline code in prose counts).
  var STARTERS = [
    { re: /\bnpx\b/g, kind: 'npm-runner', tool: 'npx' },
    { re: /\bbunx\b/g, kind: 'npm-runner', tool: 'bunx' },
    { re: /\bpnpm\s+dlx\b/g, kind: 'npm-runner', tool: 'pnpm dlx' },
    { re: /\byarn\s+dlx\b/g, kind: 'npm-runner', tool: 'yarn dlx' },
    { re: /\bnpm\s+(?:install|i|add)\b/g, kind: 'npm-install', tool: 'npm install' },
    { re: /\bpnpm\s+(?:add|install|i)\b/g, kind: 'npm-install', tool: 'pnpm add' },
    { re: /\byarn\s+(?:global\s+)?add\b/g, kind: 'npm-install', tool: 'yarn add' },
    { re: /\bbun\s+(?:add|install|i)\b/g, kind: 'npm-install', tool: 'bun add' },
    { re: /\b(?:python3?(?:\.\d+)?\s+-m\s+)?pip3?\s+install\b/g, kind: 'pypi-install', tool: 'pip install' },
    { re: /\buv\s+pip\s+install\b/g, kind: 'pypi-install', tool: 'uv pip install' },
    { re: /\buv\s+add\b/g, kind: 'pypi-install', tool: 'uv add' },
    { re: /\buv\s+tool\s+install\b/g, kind: 'pypi-install', tool: 'uv tool install' },
    { re: /\bpipx\s+install\b/g, kind: 'pypi-install', tool: 'pipx install' },
    { re: /\bpoetry\s+add\b/g, kind: 'pypi-install', tool: 'poetry add' },
    { re: /\buvx\b/g, kind: 'pypi-runner', tool: 'uvx' },
    { re: /\buv\s+tool\s+run\b/g, kind: 'pypi-runner', tool: 'uv tool run' },
    { re: /\bpipx\s+run\b/g, kind: 'pypi-runner', tool: 'pipx run' },
  ];


  // Ordinary English words: an install command followed by one of them is a sentence, not a command
  // ("npm install and start", "npm install without a lock file?"). Tokens stop there.
  var WORDS = ['and', 'or', 'will', 'without', 'with', 'to', 'the', 'a', 'an', 'in', 'on', 'for', 'is', 'are', 'has', 'have', 'then',
    'first', 'only', 'once', 'from', 'if', 'it', 'this', 'that', 'again', 'now', 'inside', 'before', 'after', 'at', 'as', 'by', 'using',
    'when', 'which', 'should', 'can', 'not', 'command', 'commands', 'run', 'runs', 'step', 'here', 'there', 'available', 'works', 'instead', 'needed', 'required', 'manually'];

  // Quote-aware split of what follows the command, up to the end of the inline code span, a comment or a shell operator.
  function tokenize(rest) {
    var out = [], cur = '', q = null, has = false, i, c;
    function push() { if (has) out.push(cur); cur = ''; has = false; }
    for (i = 0; i < rest.length; i++) {
      c = rest.charAt(i);
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; has = true; continue; }
      if (c === '`' || c === '\n') break;
      if (c === '#' && !has) break;
      if (c === ';' || c === '|' || (c === '&' && rest.charAt(i + 1) === '&') || c === '>' && !has) break;
      if (c === '<' && rest.charAt(i + 1) === '/') break;
      if (c === ')' && !has) break;
      if (/\s/.test(c)) { push(); continue; }
      cur += c; has = true;
    }
    push();
    var toks = [];
    for (i = 0; i < out.length; i++) {
      var t = out[i];
      if (t === '/' || /^\$\(/.test(t)) break;   // "npm install / yarn install", command substitution
      if (WORDS.indexOf(t.toLowerCase()) >= 0) break;
      var end = /[.?!,:)]$/.test(t) && !/^\./.test(t);
      t = t.replace(/[.?!,:)]+$/, '');
      if (t) toks.push(t);
      if (end) break;   // end of a sentence
    }
    return toks;
  }

  function isPlaceholder(t) {
    return /^[<\[%]|<[\w -]+>|[{}$*]|\.\.\.|^(your|some)[-_]/i.test(t) || PLACEHOLDERS.indexOf(t.toLowerCase()) >= 0;
  }
  function isSource(t) {
    // Paths, URLs, archives, git sources, GitHub shorthand (user/repo): not registry names.
    return /^(\.|\/|~|file:|git\+|git:|https?:|github:|ssh:|link:|workspace:|npm:)/.test(t) || /\.(whl|tgz|tar\.gz|zip|txt|toml|cfg|py)$/i.test(t) ||
      (t.charAt(0) !== '@' && t.indexOf('/') >= 0) || /^[A-Za-z]:\\/.test(t);
  }

  function npmSpec(t) {
    if (isPlaceholder(t) || isSource(t)) return null;
    var name = t, version = null, at = t.lastIndexOf('@');
    if (at > 0) { name = t.slice(0, at); version = t.slice(at + 1) || null; }
    if (!NPM_NAME.test(name) || name.length > 214) return null;
    if (version === 'latest') version = null;
    return { name: name, version: version };
  }
  function pypiSpec(t) {
    if (isSource(t) || /^[<\[%]|<[\w -]+>|[{}$*]|\.\.\./.test(t)) return null;
    var m = t.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?(?:(==|@|>=|<=|~=|!=|>|<|===)([^,;\s]*))?/);
    if (!m) return null;
    var name = m[1].replace(/[._-]+$/, '');
    if (!PYPI_NAME.test(name) || isPlaceholder(name)) return null;
    var version = (m[3] === '==' || m[3] === '===' || m[3] === '@') && m[4] ? m[4] : null;
    if (version === 'latest') version = null;
    return { name: name, version: version };
  }

  // Returns [{ name, version, role }] for one command (tokens after the starter).
  function packagesOf(kind, tokens) {
    var out = [], i, t, s;
    if (kind === 'npm-runner') {
      var explicit = [], first = null;
      for (i = 0; i < tokens.length; i++) {
        t = tokens[i];
        if (t === '-p' || t === '--package') { if (tokens[i + 1]) explicit.push(tokens[++i]); continue; }
        if (t.indexOf('--package=') === 0) { explicit.push(t.slice(10)); continue; }
        if (t === '-c' || t === '--call') break;
        if (NPM_RUNNER_VALUE_OPTS[t]) { i++; continue; }
        if (t.charAt(0) === '-') continue;
        first = t; break;
      }
      if (explicit.length) explicit.forEach(function (e) { s = npmSpec(e); if (s) { s.role = 'package'; out.push(s); } });
      else if (first !== null) { s = npmSpec(first); if (s) { s.role = 'runner'; out.push(s); } }
      return out;
    }
    if (kind === 'pypi-runner') {
      var from = null, withs = [], cmd = null;
      for (i = 0; i < tokens.length; i++) {
        t = tokens[i];
        if (t === '--from' || t === '--spec') { from = tokens[++i] || null; continue; }
        if (t.indexOf('--from=') === 0) { from = t.slice(7); continue; }
        if (t === '--with' || t === '-w') { if (tokens[i + 1]) withs.push(tokens[++i]); continue; }
        if (t.indexOf('--with=') === 0) { withs.push(t.slice(7)); continue; }
        if (UVX_VALUE_OPTS[t]) { i++; continue; }
        if (t.charAt(0) === '-') continue;
        cmd = t; break;
      }
      var main = from !== null ? from : cmd;
      if (main !== null) { s = pypiSpec(main); if (s) { s.role = from !== null ? 'package' : 'runner'; out.push(s); } }
      withs.forEach(function (w) { w.split(',').forEach(function (x) { s = pypiSpec(x); if (s) { s.role = 'package'; out.push(s); } }); });
      return out;
    }
    var npm = kind === 'npm-install', valueOpts = npm ? NPM_INSTALL_VALUE_OPTS : PIP_VALUE_OPTS;
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (valueOpts[t]) { i++; continue; }
      if (t.charAt(0) === '-') continue;
      s = npm ? npmSpec(t) : pypiSpec(t);
      if (s) { s.role = 'package'; out.push(s); }
    }
    return out;
  }

  // Outside a fenced block, a command counts only in inline code, after a prompt or a label ("$ ", "RUN ", "run: ",
  // "1. ", "Install: "), at the start of the line, or after && ; | -- not in prose ("use npx to run it").
  function inCode(before) {
    if ((before.match(/`/g) || []).length % 2 === 1) return true;
    if (/<(code|pre)[^>]*>\s*$/i.test(before)) return true;
    if (/(&&|;|\|)\s*$/.test(before)) return true;
    return /^\s*(?:[-*]\s+)?(?:\$|>|%|#|RUN|\d+[.)]|[A-Za-z][A-Za-z ]{0,30}:)?\s*$/.test(before);
  }

  function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

  // MCP configurations: "command": "npx" ... "args": [ ... ] in either order, parsed or not (JSONC, trailing commas).
  function mcpCommands(text) {
    var found = [];
    var re = /"command"\s*:\s*"([^"]*)"/g, m;
    while ((m = re.exec(text)) !== null) {
      var cmd = m[1].split(/[\\/]/).pop().replace(/\.(cmd|exe)$/i, '');
      var kind = cmd === 'npx' || cmd === 'bunx' ? 'npm-runner' : cmd === 'uvx' ? 'pypi-runner' : null;
      if (!kind) continue;
      // The args array of the same object: the nearest "args" within 600 characters, before or after.
      var start = Math.max(0, m.index - 600), end = Math.min(text.length, m.index + 600);
      var win = text.slice(start, end), best = null, am, are = /"args"\s*:\s*\[([^\]]*)\]/g;
      while ((am = are.exec(win)) !== null) {
        var pos = start + am.index, dist = Math.abs(pos - m.index);
        var between = pos > m.index ? text.slice(m.index, pos) : text.slice(pos, m.index);
        if (/"command"\s*:/.test(between.slice(10))) continue;   // belongs to another server
        if (!best || dist < best.dist) best = { dist: dist, body: am[1] };
      }
      if (!best) continue;
      var args = [], sm, sre = /"((?:[^"\\]|\\.)*)"/g;
      while ((sm = sre.exec(best.body)) !== null) args.push(sm[1]);
      found.push({ kind: kind, tool: cmd + ' (MCP config)', tokens: args, index: m.index });
    }
    return found;
  }

  function extract(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    var hits = [];
    function add(kind, tool, tokens, index, snippet) {
      packagesOf(kind, tokens).forEach(function (p) {
        hits.push({ ecosystem: kind.indexOf('npm') === 0 ? 'npm' : 'pypi', name: p.name, version: p.version, role: p.role,
          tool: tool, index: index, line: lineOf(text, index), snippet: snippet.trim().slice(0, 160) });
      });
    }
    var lines = text.split('\n'), offset = 0, inFence = false;
    lines.forEach(function (line) {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; offset += line.length + 1; return; }
      var l = line.replace(/\\$/, '');
      STARTERS.forEach(function (st) {
        st.re.lastIndex = 0;
        var m;
        while ((m = st.re.exec(l)) !== null) {
          // "npm install" inside "pnpm install" etc.: the starter must not be preceded by a letter or a dash.
          var prev = m.index > 0 ? l.charAt(m.index - 1) : ' ';
          if (/[A-Za-z0-9_.-]/.test(prev)) continue;
          if (/^"command"/.test(l.trim())) continue;   // handled by mcpCommands
          if (!inFence && !inCode(l.slice(0, m.index))) continue;
          var rest = l.slice(m.index + m[0].length);
          if (rest && !/^\s/.test(rest)) continue;   // "npx's", "uvx", ...
          add(st.kind, st.tool, tokenize(rest), offset + m.index, l.slice(m.index));
        }
      });
      offset += line.length + 1;
    });
    mcpCommands(text).forEach(function (c) {
      add(c.kind, c.tool, c.tokens, c.index, c.tool.replace(' (MCP config)', '') + ' ' + c.tokens.join(' '));
    });
    // "npx pkg" inside "pnpm dlx"-style overlaps produce duplicates on the same line: keep one per (eco, name, version, line).
    var seen = {}, uniq = [];
    hits.sort(function (a, b) { return a.index - b.index; }).forEach(function (h) {
      var k = h.ecosystem + ' ' + h.name.toLowerCase() + ' ' + (h.version || '') + ' ' + h.line;
      if (!seen[k]) { seen[k] = true; uniq.push(h); }
    });
    return uniq;
  }

  // Groups occurrences by package (PyPI names normalised as PyPI does).
  function group(hits) {
    var by = {}, order = [];
    hits.forEach(function (h) {
      var key = h.ecosystem + ':' + (h.ecosystem === 'pypi' ? h.name.toLowerCase().replace(/[-_.]+/g, '-') : h.name);
      if (!by[key]) { by[key] = { ecosystem: h.ecosystem, name: h.name, versions: [], occurrences: [] }; order.push(key); }
      if (h.version && by[key].versions.indexOf(h.version) < 0) by[key].versions.push(h.version);
      by[key].occurrences.push(h);
    });
    return order.map(function (k) { return by[k]; });
  }

  var api = { extract: extract, group: group, packagesOf: packagesOf, tokenize: tokenize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PresendInstallCommands = api;
})(this);
