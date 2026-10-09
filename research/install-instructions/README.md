# Install commands that point to unclaimed package names

Measured on 8 October 2026. An install command in a README or an MCP configuration is code that other people
run as written. When it names a package that nobody has registered, the command fails today, but anyone can
register that name and the same command then installs and runs their package.

## 1. npm READMEs that run a bin through npx

A common pattern: a package ships a command (a `bin`) whose name differs from the package name, and the README
says `npx <bin>`. When the package is installed in the project or globally, npx uses that command. When it is
not, npx looks for a *package* called `<bin>` on the registry.

`scan_bins.py` takes the top 1,000 results of six npm searches (`keywords:mcp`, `mcp server`,
`keywords:mcp-server`, `keywords:claude`, `keywords:ai-agent`, `keywords:modelcontextprotocol`), reads the README
of each package's latest version, and keeps the `npx <name>`, `bunx <name>` and `pnpm dlx <name>` lines where
`<name>` is one of the package's own bins, differs from the package name, and returns 404 on the npm registry.
`classify.py` then checks whether the README also installs the package itself anywhere (`npm i`, `pnpm add`,
`yarn add`, `bun add`).

| Set | Count |
|---|---|
| Packages scanned (union of the six searches) | 4,830 |
| READMEs with at least one such line | 80 (1.7%) |
| ... of which the README never installs the package itself | 22 (0.5%) |
| Distinct unclaimed command names | 86 |

When the README installs the package somewhere (58 of the 80), the npx line can be safe if the reader follows
the steps in order and runs it in the same project. It is not safe when the line is copied on its own, for
example into an MCP client configuration, a CI job or another machine. When the README never installs the
package (22 of 80), the line only works by accident, from a previous global install.

We reviewed the newest findings by hand on 8 and 9 October 2026 and reported the cases that pass credentials
to the command (API keys, a wallet private key, session cookies, a piped `.env` file) to their maintainers
privately. The false positives in that review were READMEs that install the package in the same project just
before the npx line.

One related name had already been used: a bin name that an MCP server's README runs through npx was
published as a package by a third party on 31 July 2026, and replaced by npm with a "security holding package"
1 hour 46 minutes later.

## 2. Packages declared in the official MCP registry

On 8 October 2026 we read 16,300 entries of the official MCP registry (6,031 active latest versions) and checked
the 750 distinct npm and PyPI packages they declare:

| Finding | Entries |
|---|---|
| Declared package does not exist | 1 |
| Declared version no longer exists on the registry | 13 |
| Package deprecated by its maintainer | 11 |

The registry checks that a publisher owns a package when the entry is published, not afterwards. We reported
this privately to the registry maintainers.

## Names are withheld

The output of `scan_bins.py` (`hits.json`) lists package names, and those names are, by definition, still
available to anyone. We do not publish them. A reported case will be listed once it is fixed, or 90 days after
the report.

## Reproduce it

    python3 scan_bins.py          # several minutes, npm registry only -> hits.json
    python3 classify.py           # reads hits.json -> classified.json and the counts

Part 2 was produced with a separate script that is not in this folder yet; its figures are not reproducible
from here until it is.

Results change from day to day: new packages are published, READMEs are fixed, and names get registered.

## Caveats

- Only READMEs of the latest version on npm are read, not GitHub READMEs or documentation sites.
- Only bins of the package itself are considered. An `npx` line that names an unrelated package that does not
  exist (a typo, a renamed package) is not counted here.
- The install check is a text search; a README can install the package in a way it does not recognise.
- The npm search ranks by relevance; the six searches are a sample of MCP and agent packages, not all of them.
