import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCalleesOutput,
  parseCallersOutput,
  parseDefinitionsOutput,
  parseInspectOutput,
  parseMapOutput,
  parseMarkdownTreeOutput,
  parseQueryOutput,
  parseStatsOutput,
  parseTestsOutput,
  parseTraceOutput,
} from "../src/parse.ts";
import { normalizeOptionalPath, normalizeRequiredPath, normalizeRequiredString } from "../src/paths.ts";

test("path normalization strips @ only for paths, not symbols or queries", () => {
  assert.equal(normalizeOptionalPath("@src/cache.rs"), "src/cache.rs");
  assert.equal(normalizeRequiredPath("@README.md", "outline.file"), "README.md");
  assert.equal(normalizeRequiredString("@Controller", "search.query"), "@Controller");
});

test("parseStatsOutput parses compact stats", () => {
  const items = parseStatsOutput(`[STATS]\nLANGS: markdown:1 rust:28\nSYMS: f:222 c:79 m:243 e:80 s:11 h:33 cb:13 ep:0 if:2 ty:1\nTOTALS: files:29 syms:684 bytes:646025`, ".");
  assert.deepEqual(items, [
    {
      kind: "stats",
      path: ".",
      filesByLanguage: { markdown: 1, rust: 28 },
      symbolsByType: {
        function: 222,
        class: 79,
        method: 243,
        enum: 80,
        static: 11,
        heading: 33,
        code_block: 13,
        endpoint: 0,
        interface: 2,
        type: 1,
      },
      totalFiles: 29,
      totalSymbols: 684,
      totalBytes: 646025,
    },
  ]);
});

test("parseMapOutput parses level 2 files", () => {
  const items = parseMapOutput(`[PROJECT]\nLANGS: rust:28 markdown:1\nFILES:29 SYMBOLS:681\n\n[FILES]\n./src/blame.rs|rust|7799\n./README.md|markdown|9872`);
  assert.deepEqual(items, [
    { kind: "file", path: "./src/blame.rs", language: "rust", sizeBytes: 7799 },
    { kind: "file", path: "./README.md", language: "markdown", sizeBytes: 9872 },
  ]);
});

test("parseQueryOutput handles exact symbols, exported flag, headings, endpoints, interfaces, types, and multiline signatures", () => {
  const stdout = `[RESULTS:6]\nCacheManager|c|./src/cache.rs|83-83|exp\nsave_internal|m|./src/cache.rs|329-393|sig:(\n        index: &CodeIndex,\n        root: &Path,\n    )\nCacheOptions|if|./src/types.ts|12-18|exp\nUserId|ty|./src/types.ts|20-20|sig:type UserId = string\nRoot > Caching|h|./README.md|148-149|sig:h2 (##)\nGET /v1/orders|ep|./docs/api.md|42-42`;
  assert.deepEqual(parseQueryOutput(stdout), [
    { kind: "symbol", name: "CacheManager", symbolType: "class", path: "./src/cache.rs", lines: [83, 83], exported: true },
    {
      kind: "symbol",
      name: "save_internal",
      symbolType: "method",
      path: "./src/cache.rs",
      lines: [329, 393],
      signature: "(\n        index: &CodeIndex,\n        root: &Path,\n    )",
    },
    { kind: "symbol", name: "CacheOptions", symbolType: "interface", path: "./src/types.ts", lines: [12, 18], exported: true },
    {
      kind: "symbol",
      name: "UserId",
      symbolType: "type",
      path: "./src/types.ts",
      lines: [20, 20],
      signature: "type UserId = string",
    },
    { kind: "doc_section", path: "./README.md", heading: "Root > Caching", level: 2, line: 148 },
    { kind: "endpoint", name: "GET /v1/orders", path: "./docs/api.md", method: "GET", route: "/v1/orders", line: 42 },
  ]);
});

test("parseDefinitionsOutput maps query symbols to definitions", () => {
  const items = parseDefinitionsOutput(`[RESULTS:1]\ncompute_cache_key|m|./src/cache.rs|87-99|sig:(root: &Path, extensions: &[&str])`);
  assert.deepEqual(items, [
    {
      kind: "definition",
      name: "compute_cache_key",
      symbolType: "method",
      path: "./src/cache.rs",
      lines: [87, 99],
      signature: "(root: &Path, extensions: &[&str])",
    },
  ]);
});

test("parseInspectOutput parses file metadata and symbols with multiline signatures", () => {
  const stdout = `[FILE:src/cache.rs]\nLANG:rust SIZE:22455 SYMS:39\nFileChange|c|34-40\nnew|m|62-80|sig:(\n        root_path: PathBuf,\n        extensions: Vec<String>,\n    )\ncompute_cache_key|m|87-99|sig:(root: &Path, extensions: &[&str])\n\n→ Parse time: 22ms`;
  assert.deepEqual(parseInspectOutput(stdout), [
    { kind: "file", path: "src/cache.rs", language: "rust", sizeBytes: 22455, symbolCount: 39 },
    { kind: "symbol", name: "FileChange", symbolType: "class", path: "src/cache.rs", lines: [34, 40] },
    {
      kind: "symbol",
      name: "new",
      symbolType: "method",
      path: "src/cache.rs",
      lines: [62, 80],
      signature: "(\n        root_path: PathBuf,\n        extensions: Vec<String>,\n    )",
    },
    {
      kind: "symbol",
      name: "compute_cache_key",
      symbolType: "method",
      path: "src/cache.rs",
      lines: [87, 99],
      signature: "(root: &Path, extensions: &[&str])",
    },
  ]);
});

test("parseMarkdownTreeOutput parses file metadata and heading tree", () => {
  const stdout = `→ Inspecting: README.md\n\nLanguage: markdown\nSize: 9872 bytes\n\n# CodeMapper Rust - Fast Code Indexing and Mapping Tool (L1, 294 lines)\n  ## 🚀 Performance (L5, 25 lines)\n  ### Nested (L7, 2 lines)\n\n→ Parse time: 3ms`;
  assert.deepEqual(parseMarkdownTreeOutput(stdout, "README.md"), [
    { kind: "file", path: "README.md", language: "markdown", sizeBytes: 9872 },
    { kind: "doc_section", path: "README.md", heading: "CodeMapper Rust - Fast Code Indexing and Mapping Tool", level: 1, line: 1, lineCount: 294 },
    { kind: "doc_section", path: "README.md", heading: "🚀 Performance", level: 2, line: 5, lineCount: 25 },
    { kind: "doc_section", path: "README.md", heading: "Nested", level: 3, line: 7, lineCount: 2 },
  ]);
});

test("parseCallersOutput parses caller rows", () => {
  const items = parseCallersOutput(`[CALLERS:collect_file_metadata|1]\nsave_internal|m|./src/cache.rs:345`);
  assert.deepEqual(items, [
    { kind: "caller", target: "collect_file_metadata", caller: "save_internal", callerType: "method", path: "./src/cache.rs", line: 345 },
  ]);
});

test("parseCalleesOutput parses resolved and external callees", () => {
  const stdout = `[CALLEES:collect_file_metadata|2]\nhidden|f|<external>:144|sig:.hidden(false)\ncompute_file_metadata_single|m|./src/cache.rs:189|sig:(path: &Path)`;
  assert.deepEqual(parseCalleesOutput(stdout), [
    { kind: "callee", source: "collect_file_metadata", callee: "hidden", calleeType: "function", path: "<external>", line: 144, resolved: false },
    {
      kind: "callee",
      source: "collect_file_metadata",
      callee: "compute_file_metadata_single",
      calleeType: "method",
      path: "./src/cache.rs",
      line: 189,
      resolved: true,
    },
  ]);
});

test("parseTestsOutput parses tests and no-test output", () => {
  const stdout = `[TESTS:compute_cache_key|2]\ntest_compute_cache_key_same_inputs|f|./src/cache.rs:589|call:593\ntest_compute_cache_key_same_inputs|f|./src/cache.rs:589|call:594`;
  assert.deepEqual(parseTestsOutput(stdout), [
    {
      kind: "test",
      target: "compute_cache_key",
      testName: "test_compute_cache_key_same_inputs",
      testType: "function",
      path: "./src/cache.rs",
      line: 589,
      callLine: 593,
    },
    {
      kind: "test",
      target: "compute_cache_key",
      testName: "test_compute_cache_key_same_inputs",
      testType: "function",
      path: "./src/cache.rs",
      line: 589,
      callLine: 594,
    },
  ]);
  assert.deepEqual(parseTestsOutput(`✗ No tests found for 'collect_file_metadata'`), []);
});

test("parseTraceOutput parses found and no-path outputs", () => {
  const found = `[TRACE:save_internal->collect_file_metadata]\nFOUND:true STEPS:2\nPATH:save_internal|collect_file_metadata\nsave_internal|m|./src/cache.rs:329\ncollect_file_metadata|m|./src/cache.rs:136`;
  assert.deepEqual(parseTraceOutput(found, "save_internal", "collect_file_metadata"), [
    {
      kind: "call_path",
      from: "save_internal",
      to: "collect_file_metadata",
      steps: [
        { name: "save_internal", symbolType: "method", path: "./src/cache.rs", line: 329 },
        { name: "collect_file_metadata", symbolType: "method", path: "./src/cache.rs", line: 136 },
      ],
    },
  ]);
  assert.deepEqual(parseTraceOutput(`✗ No call path found from 'a' to 'b'`, "a", "b"), []);
});
