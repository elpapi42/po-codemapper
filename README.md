# pi-codemapper

`pi-codemapper` is a Pi extension that exposes the CodeMapper CLI (`cm`) as five small agent-facing tools. The goal is to help AI agents reduce the search space before they read files, edit code, or run tests.

It intentionally wraps workflow intents, not every `cm` command:

```ts
map({ path?: string })
search({ query: string, path?: string, exact?: boolean })
outline({ file: string })
expand({ symbol: string })
path({ from: string, to: string })
```

The tools return exact CodeMapper-derived data only. They do not add relevance scores, summaries, recommendations, or inferred explanations.

## Prerequisites

You need Pi and a working CodeMapper binary. The extension resolves `cm` in this order: `CODEMAPPER_BIN`, then `$HOME/.local/bin/cm`, then `cm` on `PATH`.

Quick check:

```bash
cm --help
cm stats . --format ai
```

If Pi cannot see your shell `PATH`, either install `cm` at `~/.local/bin/cm` or start Pi with `CODEMAPPER_BIN=/absolute/path/to/cm`.

## Install and load in Pi

For normal use, install the package from GitHub over SSH:

```bash
pi install git:git@github.com:elpapi42/pi-codemapper.git
```

This requires SSH access to `github.com:elpapi42/po-codemapper.git`. Pi will clone the package, run `npm install`, and load the extension declared in `package.json`.

To try the remote package for one session without writing it to Pi settings, use:

```bash
pi -e git:git@github.com:elpapi42/pi-codemapper.git
```

For local development from a checkout, run Pi with the local package as an extension:

```bash
pi -e /home/whitman/pi-codemapper
```

After installing, restart Pi or use `/reload` if Pi is already running. Confirm the package is present with:

```bash
pi list
```

This package declares its Pi entrypoint in `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Note: this extension intentionally registers a generic `search` tool. If it is loaded alongside another extension that also registers `search` (for example `pi-cocoindex`), extension load order determines which tool name wins.

## Tool reference

### `map({ path?: string })`

Answers “what is here?” for a repo or directory. Use it before broad `find`/`ls` output when the agent needs a compact structure overview.

Input: `path` defaults to `.`. Leading `@` is stripped from path inputs, so `@src/cache.rs` becomes `src/cache.rs`.

Runs:

```bash
cm stats <path> --format ai
cm map <path> --level 2 --format ai
```

Returns a JSON array containing one `stats` item plus `file` items when the level-2 file map fits. If the full file map is too large, the tool returns `stats`, a `notice` item with code `map_output_optimized`, and compact `directory` items. The notice tells the agent to call `map` again with a smaller `path` from the returned directory items when it needs file-level mapping.

### `search({ query, path?, exact? })`

Answers “where is X?” Use it for a symbol name, partial concept, domain term, endpoint, route, docs heading, or `|`-separated OR query. It is not natural-language semantic search.

Good queries: `auth`, `authenticateUser`, `auth|session|token`, `/v1/orders`, `CacheManager`. Avoid full questions like `how does authentication work?`.

Input: `path` defaults to `.`, `exact` defaults to false. `exact: true` asks CodeMapper for strict matching.

Runs:

```bash
cm query <query> <path> --format ai --context full --limit 50
```

Adds `--exact` when requested. Returns `symbol`, `doc_section`, and `endpoint` items.

### `outline({ file })`

Answers “what is inside this file?” Use it after `map` or `search` identifies a likely file, before reading the whole file.

Input: `file` is required. Leading `@` is stripped from file paths.

For code files, runs:

```bash
cm inspect <file> --format ai
```

For Markdown files (`.md` or `.markdown`), runs:

```bash
cm inspect <file> --tree --sizes --level 3
```

Returns a file item plus symbols for code files, or document sections for Markdown files. It does not return function bodies.

### `expand({ symbol })`

Answers “what is connected to this symbol?” Use it before editing, renaming, deleting, or refactoring a known symbol.

Input: `symbol` must be the exact symbol name. `expand` has no `path` input; it analyzes the current Pi working directory.

Runs:

```bash
cm query <symbol> . --format ai --context full --exact
cm callers <symbol> . --format ai
cm callees <symbol> . --format ai
cm tests <symbol> . --format ai
```

If the exact definition lookup finds nothing, the tool returns `No exact symbol found: <symbol>`. Otherwise it returns `definition`, `caller`, `callee`, and `test` items.

### `path({ from, to })`

Answers “is there a detected static call path from A to B?” Use it when runtime flow between two known symbols matters.

Input: `from` and `to` are exact symbol names. `path` has no `path` input; it analyzes the current Pi working directory.

Runs:

```bash
cm trace <from> <to> . --format ai
```

Returns one `call_path` item when CodeMapper detects a path, `[]` when no static path is detected, or a plain string if CodeMapper errors. `[]` does not prove runtime impossibility; dynamic dispatch, framework routing, dependency injection, macros, generated code, and string-based calls can be missed.

## Output contract

Pi tool execution returns Pi’s normal tool result object internally, but the model-visible `content[0].text` is always one of:

- a top-level JSON array string on success,
- `[]` for successful no-result cases,
- a plain string error on failure.

For `map`, very large level-2 file maps are still successful JSON responses: the tool returns `stats`, a `notice`, and aggregated `directory` items instead of failing with an output-size error.

There is no wrapper object, no `findings` field, no `commandsRun`, and no relevance score.

Example `search({ query: "CacheManager", exact: true })` output:

```json
[
  {
    "kind": "symbol",
    "name": "CacheManager",
    "symbolType": "class",
    "path": "./src/cache.rs",
    "lines": [83, 83],
    "exported": true
  }
]
```

Example `expand({ symbol: "compute_cache_key" })` output shape:

```json
[
  {
    "kind": "definition",
    "name": "compute_cache_key",
    "symbolType": "method",
    "path": "./src/cache.rs",
    "lines": [87, 99],
    "signature": "(root: &Path, extensions: &[&str])"
  },
  {
    "kind": "test",
    "target": "compute_cache_key",
    "testName": "test_compute_cache_key_same_inputs",
    "testType": "function",
    "path": "./src/cache.rs",
    "line": 589,
    "callLine": 593
  }
]
```

Example no-result and error outputs:

```text
[]
```

```text
No exact symbol found: authenticateUser
```

```text
CodeMapper failed: cm query auth . --format ai failed (exit 1).
...
```

## Common agent workflows

Unknown repo or package: start with `map({ path: "." })`, then `search` for domain terms from the map, then `outline` likely files before targeted reads.

Feature or bug in a known area: use `search({ query: "checkout|payment|charge", path: "src" })`, then `outline` the likely files, then read only the relevant line ranges.

Before changing a symbol: use `expand({ symbol: "processPayment" })` to get definitions, callers, callees, and detected tests before editing.

Flow question: use `path({ from: "login", to: "verifyPassword" })` when you need a detected static call chain between two known symbols. If no path is found, fall back to targeted reads or runtime/framework investigation.

Docs/API lookup: use `search({ query: "/v1/orders", path: "docs" })` or `search({ query: "Orders", path: "docs" })`, then `outline({ file: "docs/api.md" })` to inspect headings and section sizes.

## Development and validation

Install local dependencies for typechecking and tests:

```bash
cd /home/whitman/pi-codemapper
npm install
npm run typecheck
npm test
npm pack --dry-run
```

The parser tests cover representative `cm --format ai` outputs for stats, map, query, inspect, callers, callees, tests, trace, Markdown trees, multiline signatures, and path normalization.

## Configuration

Use `CODEMAPPER_BIN` when `cm` is not on Pi’s runtime `PATH` or when you want a specific build:

```bash
CODEMAPPER_BIN=/home/whitman/.local/bin/cm pi -e git:git@github.com:elpapi42/po-codemapper.git
```

The extension sets `NO_COLOR=1` and `TERM=dumb` when invoking `cm`, uses argument arrays instead of shell-interpolated commands, and runs commands in the current Pi session working directory.

## Limitations and caveats

- v1 parses `cm --format ai` because CodeMapper does not yet expose JSON output for these commands. The parser is conservative, but a future `cm --format json` would be more robust.
- CodeMapper commands are read-only from the product perspective, but they can write or update `.codemapper` cache files in the target repo.
- Successful JSON output is capped at 1000KB to protect the model context. If output is too large, most tools return `CodeMapper output too large; narrow with path or query.` The `map` tool first tries an optimized directory-group response so broad repo maps can still guide the agent toward smaller paths.
- `search` is CodeMapper fuzzy/case-insensitive search by default, not semantic embedding search. Use `exact: true` for known exact names.
- `expand` and `path` operate on exact symbols in the current working directory and intentionally do not expose a `path` parameter in v1.
- Static call graph results are heuristic. Dynamic dispatch, reflection, framework routing, dependency injection, macros, generated code, and string-based calls may not appear.
- The generic `search` tool name can collide with other Pi extensions that register `search`.

## Troubleshooting

`CodeMapper is unavailable because the cm command was not found.` Ensure `cm --help` works, install it at `~/.local/bin/cm`, or set `CODEMAPPER_BIN=/absolute/path/to/cm` before starting Pi.

Tool not visible in Pi: restart Pi, run `/reload`, and confirm the package is installed with `pi list`. For a quick remote test, run `pi -e git:git@github.com:elpapi42/po-codemapper.git`; for local development, run `pi -e /home/whitman/pi-codemapper`.

`search` behaves like a different tool: another extension probably registered `search`. Disable the other extension, change load order, or rename one of the tools in its extension code.

`No exact symbol found: <symbol>` from `expand`: run `search({ query: "<symbol>" })` first to discover the exact CodeMapper symbol name.

`[]` from `path`: CodeMapper did not detect a static call path. This may still be a real runtime path through framework wiring or dynamic dispatch.

Output too large: call `map` with a narrower `path`, call `search` with a more specific query or scoped `path`, or use `outline` on a known file.

Unexpected cache behavior: remove the repo-local cache and retry:

```bash
rm -rf .codemapper
cm stats . --rebuild-cache
```

For the detailed implementation contract, see `SPEC.md`.
