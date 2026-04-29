# Pi CodeMapper Tool Extension Specification

Status: v1 design

This spec defines a small set of Pi-injected JavaScript tools built on top of the CodeMapper CLI (`cm`). The goal is to make codebase exploration easy for AI agents without exposing the full CLI surface or encouraging broad `grep`, `find`, and whole-file reads.

The tools are intentionally workflow-level, not one wrapper per `cm` command.

Final tool set:

```ts
map({ path?: string })
search({ query: string, path?: string, exact?: boolean })
outline({ file: string })
expand({ symbol: string })
path({ from: string, to: string })
```

## Design principles

1. Tools return exact CodeMapper-derived data only. No relevance scores, summaries, recommendations, or inferred explanations.
2. Successful tools return a top-level JSON array. There is no wrapper object and no `findings` field.
3. Tool failures return a plain string error message.
4. No-result cases return `[]`, not an error.
5. The JavaScript extension may normalize CodeMapper output into structured objects, but it must not rank, guess, or invent fields.
6. Tool descriptions should be explicit enough that the agent knows what each tool returns.
7. These tools narrow the search space; after that, the agent should still use targeted reads and tests to verify behavior.

Actual Pi tool implementations cannot literally return a raw array/string from `execute`; they must return Pi's normal tool result object. The agent-visible text should still be exactly either the JSON array or the string error:

```ts
function toPiToolResult(value: unknown[] | string) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
    details: { value },
  };
}
```

## Shared implementation rules

Resolve the `cm` binary in this order:

1. `process.env.CODEMAPPER_BIN`
2. `$HOME/.local/bin/cm`
3. `cm` from `PATH`

Always execute with argument arrays, not shell-interpolated strings. Normalize model-provided paths by stripping a leading `@` if present, because agents often refer to files as `@src/file.ts`.

Default working directory is the Pi session cwd. Most commands should run relative to that cwd.

When a `cm` command exits non-zero, return a plain string:

```text
CodeMapper failed: <stderr or stdout>
```

When `cm` succeeds but reports no matching data, return `[]`.

Use `--format ai` for v1 because it is currently available and compact. Long-term, the robust version should add `--format json` to CodeMapper and have these tools parse JSON instead of parsing AI text.

## Tool: `map`

Purpose: answer “what is here?” for a repo or directory.

Use when the agent needs a compact structure overview before knowing the right search term. This is the CodeMapper replacement for starting with broad `find` output.

Input schema:

```ts
type MapInput = {
  path?: string; // default "."
};
```

Command pipeline:

```bash
cm stats <path> --format ai
cm map <path> --level 2 --format ai
```

Execution details:

- Default `path` to `.`.
- Run `stats` first, then `map`.
- Parse `stats` into one `stats` item.
- Parse `map --level 2` into `file` items.
- If map output is too large to safely return, return a string error asking for a narrower path instead of silently truncating.

Returns:

```ts
type MapItem =
  | {
      kind: "stats";
      path: string;
      filesByLanguage: Record<string, number>;
      symbolsByType: Record<string, number>;
      totalFiles: number;
      totalSymbols: number;
      totalBytes: number;
    }
  | {
      kind: "file";
      path: string;
      language?: string;
      sizeBytes?: number;
      symbolCount?: number;
    };
```

Concrete use cases:

- “Understand this repo/package/module.”
- “Before touching the backend app, see its structure.”
- “Find likely areas for a feature when no search term is obvious yet.”

## Tool: `search`

Purpose: answer “where is X?”

Use when the agent has a symbol name, partial concept, domain term, endpoint, route, docs heading, or OR query and needs candidate symbols/docs/files.

Input schema:

```ts
type SearchInput = {
  query: string;
  path?: string;   // default "."
  exact?: boolean; // default false
};
```

`query` should be a code/docs search term, not a natural-language question. Good examples:

```ts
search({ query: "auth" })
search({ query: "authenticateUser", exact: true })
search({ query: "auth|session|token", path: "./src" })
search({ query: "/v1/orders", path: "./docs" })
search({ query: "CacheManager" })
```

Bad example:

```ts
search({ query: "how does authentication work?" })
```

Command pipeline:

```bash
cm query <query> <path> --format ai --context full --limit 50
```

If `exact: true`, add `--exact`:

```bash
cm query <query> <path> --format ai --context full --limit 50 --exact
```

Execution details:

- Default `path` to `.`.
- Default `exact` to `false`.
- Keep the internal `--limit 50`; do not expose limit in the tool schema.
- Returned items are exact data for returned matches, but the result set is intentionally bounded by the internal limit.

Returns:

```ts
type SearchItem =
  | {
      kind: "symbol";
      name: string;
      symbolType: string;
      path: string;
      lines: [number, number];
      signature?: string;
      exported?: boolean;
    }
  | {
      kind: "doc_section";
      path: string;
      heading: string;
      level?: number;
      line: number;
      lineCount?: number;
    }
  | {
      kind: "endpoint";
      name: string;
      path: string;
      method?: string;
      route?: string;
      line: number;
    };
```

Concrete use cases:

- “The user asks for a feature involving auth, billing, checkout, orders, etc.”
- “Find candidate implementation files for a bug report.”
- “Find docs for an endpoint or API section.”
- “Confirm an exact symbol exists before expanding or editing it.”

## Tool: `outline`

Purpose: answer “what is inside this file?”

Use when the agent already has a file path and needs its symbol/document outline. This replaces broad file reads when the agent only needs the file’s structure first.

Input schema:

```ts
type OutlineInput = {
  file: string;
};
```

Command pipeline for code files:

```bash
cm inspect <file> --format ai
```

Command pipeline for Markdown files:

```bash
cm inspect <file> --tree --sizes --level 3
```

Execution details:

- Determine Markdown mode by file extension `.md` or `.markdown`.
- For code files, parse `cm inspect --format ai` into a file item and symbol items.
- For Markdown files, parse heading tree output into doc section items.
- Do not include function bodies in v1.
- Do not support symbol inspection in this tool. Symbol lookup belongs in `search`; symbol relationships belong in `expand`.

Returns:

```ts
type OutlineItem =
  | {
      kind: "file";
      path: string;
      language: string;
      sizeBytes: number;
      symbolCount?: number;
    }
  | {
      kind: "symbol";
      name: string;
      symbolType: string;
      path: string;
      lines: [number, number];
      signature?: string;
    }
  | {
      kind: "doc_section";
      path: string;
      heading: string;
      level?: number;
      line: number;
      lineCount?: number;
    };
```

Concrete use cases:

- “A `search` result points to `src/auth/session.ts`; understand what functions/classes are there before reading.”
- “A docs file is likely relevant; list headings and section sizes before loading a section.”
- “Before editing a file, understand neighboring symbols and structure.”

## Tool: `expand`

Purpose: answer “what is connected to this symbol?”

Use when the agent has one known symbol and needs its relationship radius: definition, callers, callees, and tests. This is the pre-edit/refactor safety tool.

Input schema:

```ts
type ExpandInput = {
  symbol: string;
};
```

Command pipeline, in order:

```bash
cm query <symbol> . --format ai --context full --exact
cm callers <symbol> . --format ai
cm callees <symbol> . --format ai
cm tests <symbol> . --format ai
```

Execution details:

- `expand` intentionally has no `path` input. It analyzes the current repo/session cwd.
- Use exact definition lookup first.
- If the exact definition lookup returns no symbol items, return:

```text
No exact symbol found: <symbol>
```

- If one or more exact definitions are found, continue with callers/callees/tests.
- Do not use `cm impact` in v1. It mixes multiple concepts into one report and is less clean to parse than separate commands.
- `callers`, `callees`, and `tests` should use their default matching, not `--fuzzy`.

Returns:

```ts
type ExpandItem =
  | {
      kind: "definition";
      name: string;
      symbolType: string;
      path: string;
      lines: [number, number];
      signature?: string;
    }
  | {
      kind: "caller";
      target: string;
      caller: string;
      callerType?: string;
      path: string;
      line: number;
    }
  | {
      kind: "callee";
      source: string;
      callee: string;
      calleeType?: string;
      path?: string;
      line?: number;
      resolved: boolean;
    }
  | {
      kind: "test";
      target: string;
      testName: string;
      testType?: string;
      path: string;
      line: number;
      callLine?: number;
    };
```

Concrete use cases:

- “Before changing this function, find what calls it and what tests cover it.”
- “Understand the dependencies of a core service function.”
- “Assess blast radius for deleting/renaming/changing a symbol.”
- “Find the user-facing entrypoints that reach a business function.”

## Tool: `path`

Purpose: answer “is there a detected call path from A to B?”

Use when the agent has two known symbols and needs the static call chain between them.

Input schema:

```ts
type PathInput = {
  from: string;
  to: string;
};
```

Command pipeline:

```bash
cm trace <from> <to> . --format ai
```

Execution details:

- `path` intentionally has no `path` input. It analyzes the current repo/session cwd.
- Do not use fuzzy matching in v1.
- If CodeMapper finds a path, return one `call_path` item.
- If CodeMapper succeeds and reports no path, return `[]`.
- If either symbol cannot be found and CodeMapper reports that as an error, return a plain string error.
- `[]` means “no static path detected,” not “runtime impossible.” Dynamic dispatch, framework routing, dependency injection, reflection, macros, generated code, and string-based calls may not appear in the static call graph.

Returns:

```ts
type PathItem = {
  kind: "call_path";
  from: string;
  to: string;
  steps: Array<{
    name: string;
    symbolType?: string;
    path?: string;
    line?: number;
  }>;
};
```

Concrete use cases:

- “How does the login handler reach password verification?”
- “Can this endpoint call the charge function?”
- “What execution chain connects this route to this lower-level service?”

## Typical agent workflows

### User goal: “Add SSO login support”

The agent should not start by grepping the whole repo. A good exploration flow is:

```ts
map({ path: "." })
search({ query: "auth|login|session|oauth|sso" })
outline({ file: "<main auth file from search>" })
expand({ symbol: "<login/session symbol>" })
```

Then use targeted reads/edits/tests.

### User goal: “Checkout sometimes charges customers twice. Fix it.”

```ts
search({ query: "checkout|payment|charge|invoice" })
outline({ file: "<payment service file>" })
expand({ symbol: "<charge symbol>" })
path({ from: "<checkout handler>", to: "<charge symbol>" })
```

Then inspect exact code paths for idempotency, retries, and concurrency behavior.

### User goal: “Can we remove the old CSV export?”

```ts
search({ query: "csv|export|download" })
search({ query: "<candidate exact symbol>", exact: true })
expand({ symbol: "<candidate exact symbol>" })
outline({ file: "<export file>" })
```

Then report static callers/tests and caveat dynamic references if relevant.

### User goal: “Users report logout doesn’t always work.”

```ts
search({ query: "logout|session|token|cookie" })
outline({ file: "<logout/session file>" })
expand({ symbol: "<logout symbol>" })
path({ from: "<logout route/handler>", to: "<session invalidation symbol>" })
```

Then validate user-visible behavior with targeted reads and tests/browser checks where appropriate.

## Parsing notes for v1

The v1 JavaScript extension will parse `--format ai` text. This is feasible, but not as robust as JSON. Parser implementation should be command-specific and conservative.

General symbol line shape often resembles:

```text
name|typeCode|path|start-end|flags...|sig:...
```

Examples:

```text
collect_file_metadata|m|src/cache.rs|136-186|sig:(root: &Path, extensions: &[&str])
CacheMetadata|c|src/cache.rs|50-59
```

Important parser cautions:

- Some signatures span multiple lines. Continue collecting signature text until the next recognizable item line.
- Progress/status lines like `→ Indexing...` or `✓ Loaded from cache ...` are not data items.
- `inspect` for Markdown with `--tree --sizes` has a different format from `--format ai`; parse it separately.
- Call graph outputs usually provide single call lines, not full `[start, end]` ranges.
- If a field is not present in CodeMapper output, omit it. Do not infer it.

## Future improvement: JSON output in CodeMapper

For durable exact tooling, CodeMapper should eventually support:

```bash
--format json
```

for the commands used here:

- `stats`
- `map`
- `query`
- `inspect`
- `callers`
- `callees`
- `tests`
- `trace`

Once available, these Pi tools should switch from parsing `--format ai` to parsing JSON. That would make the extension thinner, safer, and easier to test.
