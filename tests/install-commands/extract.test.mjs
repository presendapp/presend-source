// node tests/install-commands/extract.test.mjs  -- unit tests of js/install-commands.js (no network).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extract } = require('../../js/install-commands.js');

let fail = 0;
function eq(label, text, expected) {
  const got = extract(text).map((h) => `${h.ecosystem}:${h.name}${h.version ? '@' + h.version : ''}:${h.role}`);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) { fail++; console.log(`FAIL ${label}\n  got      ${JSON.stringify(got)}\n  expected ${JSON.stringify(expected)}`); }
  else console.log(`ok   ${label}`);
}

eq('npx -y bin', '```\nnpx -y foo-mcp\n```', ['npm:foo-mcp:runner']);
eq('npx -p explicit', '`npx -y -p @acme/tool acme-tool --flag`', ['npm:@acme/tool:package']);
eq('npx --package=', '$ npx --package=@acme/tool@1.2.3 acme', ['npm:@acme/tool@1.2.3:package']);
eq('npx pinned', '```sh\nnpx repomix@1.4.2 --mcp\n```', ['npm:repomix@1.4.2:runner']);
eq('npx latest', '```\nnpx foo@latest\n```', ['npm:foo:runner']);
eq('prose ignored', 'You can use npx to run it, or pip install it later.', []);
eq('inline code in prose', 'Run `npx create-foo my-app` then `pip install barlib==1.0`.', ['npm:create-foo:runner', 'pypi:barlib@1.0:package']);
eq('npm install many', '```\nnpm install --save-dev typescript @types/node express@^4\n```', ['npm:typescript:package', 'npm:@types/node:package', 'npm:express@^4:package']);
eq('npm i -g', '$ npm i -g acme-cli', ['npm:acme-cli:package']);
eq('pnpm add / yarn add / bun add', '```\npnpm add a1\nyarn add b2\nbun add c3\nyarn global add d4\n```', ['npm:a1:package', 'npm:b2:package', 'npm:c3:package', 'npm:d4:package']);
eq('pnpm install no args', '```\npnpm install\nnpm install\n```', []);
eq('pip variants', '```\npip install -U "requests[socks]>=2.0" -r requirements.txt\npython -m pip install foo_bar==0.3\npip3 install -e .\nuv pip install bazlib\nuv add qux\npipx install hatch\npoetry add pendulum\nuv tool install ruff\n```',
  ['pypi:requests:package', 'pypi:foo_bar@0.3:package', 'pypi:bazlib:package', 'pypi:qux:package', 'pypi:hatch:package', 'pypi:pendulum:package', 'pypi:ruff:package']);
eq('pip index url', '```\npip install --index-url https://x.example/simple mypkg2\n```', ['pypi:mypkg2:package']);
eq('uvx', '```\nuvx mcp-server-fetch\nuvx --from awesome-pkg awesome-cli serve\nuvx --python 3.12 --with extra1 tool1@0.4.0\n```', ['pypi:mcp-server-fetch:runner', 'pypi:awesome-pkg:package', 'pypi:tool1@0.4.0:runner', 'pypi:extra1:package']);
eq('placeholders and sources', '```\nnpx <package>\npip install your-package\nnpm install ./local git+https://github.com/a/b user/repo\npip install https://x/y.whl\nnpx $PKG\npip install package-name\n```', []);
eq('shell chain', '$ cd app && npm install left-pad && npx cowsay hi', ['npm:left-pad:package', 'npm:cowsay:runner']);
eq('dockerfile and yaml', 'RUN pip install --no-cache-dir flask\n      - run: npx -y semantic-release', ['pypi:flask:package', 'npm:semantic-release:runner']);
eq('MCP config JSON', `{
  "mcpServers": {
    "github": { "command": "uvx", "args": ["mcp-server-github"], "env": { "GITHUB_TOKEN": "x" } },
    "fs": { "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"], "command": "npx" },
    "local": { "command": "node", "args": ["server.js"] },
    "explicit": { "command": "npx", "args": ["-y", "-p", "@acme/mcp", "acme-mcp"] }
  }
}`, ['pypi:mcp-server-github:runner', 'npm:@modelcontextprotocol/server-filesystem:runner', 'npm:@acme/mcp:package']);
eq('MCP config in markdown with windows npx.cmd', '```json\n{"servers": {"x": {"command": "C:\\\\Program Files\\\\nodejs\\\\npx.cmd", "args": ["-y", "xpkg"]}}}\n```', ['npm:xpkg:runner']);
eq('dedupe same line', '`pnpm dlx foolib`', ['npm:foolib:runner']);
eq('npm in pnpm not matched twice', '```\npnpm add zz\n```', ['npm:zz:package']);
eq('html code', '<p>Install with <code>pip install htmlpkg</code></p>', ['pypi:htmlpkg:package']);
eq('label prefix', 'Install: pip install labelpkg', ['pypi:labelpkg:package']);
eq('npx -c stops', '`npx -c "eslint ."`', []);
eq('trailing semicolon', '`npm i semi;`', ['npm:semi:package']);
eq('comments', '```\nnpm install # or pnpm install\npip install "cua[sandbox]"   # cua-sandbox: Sandbox, Image\npip install cua-bench-rl  # workers, client\n```', ['pypi:cua:package', 'pypi:cua-bench-rl:package']);
eq('sentences in code', '```\nnpm install will have --save-exact added\nnpm install and start\nthrow "npm install without a lock file? That is bad."\n```', []);
eq('quoted extras with spaces', '```\npip install -e ".[test, deploy]"\npip install "$(python -c \'import json\')"\n```', []);
eq('possessive and one-line json', "npx's flags; {\"x\": {\"command\": \"uvx\", \"args\": [\"mcp-server-fetch\"]}}", ['pypi:mcp-server-fetch:runner']);
eq('sentence end', 'Then run `uv tool install mytool`.', ['pypi:mytool:package']);
eq('alternatives and substitution', '```\nnpm install / yarn install\nnpm install needed\npython -m pip install "$(python -c "import json")"\nnpx -y some-existing-server\n```', []);
process.exit(fail ? 1 : 0);
