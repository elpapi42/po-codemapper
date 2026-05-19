import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { CM_TIMEOUT_MS } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { normalizeOptionalPath, normalizeRequiredString } from "../paths.js";
import { toToolResult } from "../output.js";
import { renderCodeMapperCall, renderCodeMapperResult } from "../render.js";

const ScopedSymbolParams = Type.Object({
	symbol: Type.String({ description: "Symbol/type/interface name to analyze. Prefer an exact name copied from search output." }),
	path: Type.Optional(Type.String({ description: "Directory scope relative to the Pi session cwd; defaults to `.`." })),
	fuzzy: Type.Optional(Type.Boolean({ description: "Enable fuzzy matching when supported by the underlying CodeMapper command." })),
});

const ScopedPathParams = Type.Object({
	path: Type.Optional(Type.String({ description: "Directory scope relative to the Pi session cwd; defaults to `.`." })),
});

const GitCompareParams = Type.Object({
	commit: Type.String({ description: "Git commit/ref to compare against, e.g. `main`, `HEAD~1`, or `v1.0`." }),
	path: Type.Optional(Type.String({ description: "Directory or file scope relative to the Pi session cwd; defaults to `.`." })),
});

const SinceParams = Type.Object({
	commit: Type.String({ description: "Git commit/ref to compare against, e.g. `main`, `HEAD~1`, or `v1.0`." }),
	path: Type.Optional(Type.String({ description: "Directory or file scope relative to the Pi session cwd; defaults to `.`." })),
	breaking: Type.Optional(Type.Boolean({ description: "Show only deleted symbols and signature changes." })),
});

export function registerMoreTools(pi: ExtensionAPI): void {
	registerImpactTool(pi);
	registerEntrypointsTool(pi);
	registerUntestedTool(pi);
	registerDiffTool(pi);
	registerSinceTool(pi);
	registerTypesTool(pi);
	registerSchemaTool(pi);
	registerImplementsTool(pi);
}

function registerImpactTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "impact",
		label: "Impact",
		description: "Run `cm impact` for a symbol: definition/signature, callers, tests, and quick breakage/coverage hints. Use after changing a function or before refactoring.",
		promptSnippet: "impact: Quick CodeMapper breakage report for one symbol: definition, callers, tests, and coverage hints.",
		promptGuidelines: ["Use impact after editing or before refactoring a specific symbol.", "Use search first if you do not know the exact symbol name."],
		parameters: ScopedSymbolParams,
		renderCall: renderCodeMapperCall("impact", (args) => args.symbol),
		renderResult: renderCodeMapperResult("Impact complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, buildSymbolArgs("impact", params, { exactByDefault: true }), signal);
		},
	});
}

function registerEntrypointsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "entrypoints",
		label: "Entrypoints",
		description: "Run `cm entrypoints`: find public/exported symbols with no internal callers, grouped as main entrypoints, API functions, and possibly unused code.",
		promptSnippet: "entrypoints: Find public API surface and dead-code candidates in a path scope.",
		promptGuidelines: ["Use entrypoints to understand a package's public surface or find unused exported code candidates.", "Scope path to a directory for large repos."],
		parameters: ScopedPathParams,
		renderCall: renderCodeMapperCall("entrypoints", (args) => args.path ?? "."),
		renderResult: renderCodeMapperResult("Entrypoints complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, ["entrypoints", normalizeOptionalPath(params.path, "."), "--format", "ai"], signal);
		},
	});
}

function registerUntestedTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "untested",
		label: "Untested",
		description: "Run `cm untested`: list functions/methods not called by detected tests in a path scope.",
		promptSnippet: "untested: Find symbols without detected test coverage in a path scope.",
		promptGuidelines: ["Use untested to choose high-value test targets.", "Treat results as heuristic because dynamic test coverage may not be statically detected."],
		parameters: ScopedPathParams,
		renderCall: renderCodeMapperCall("untested", (args) => args.path ?? "."),
		renderResult: renderCodeMapperResult("Untested scan complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, ["untested", normalizeOptionalPath(params.path, "."), "--format", "ai"], signal);
		},
	});
}

function registerDiffTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "diff",
		label: "Diff",
		description: "Run `cm diff`: show symbol-level additions, deletions, modifications, and signature changes versus a git commit/ref.",
		promptSnippet: "diff: Symbol-level changes versus a git commit/ref, useful before PR review.",
		promptGuidelines: ["Use diff before reviews to understand changed symbols instead of raw line diffs.", "Use commit=`main` for PR-style comparison when available."],
		parameters: GitCompareParams,
		renderCall: renderCodeMapperCall("diff", (args) => `${args.commit} ${args.path ?? "."}`),
		renderResult: renderCodeMapperResult("Diff complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, ["diff", params.commit, normalizeOptionalPath(params.path, "."), "--format", "ai"], signal);
		},
	});
}

function registerSinceTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "since",
		label: "Since",
		description: "Run `cm since`: show symbol-level changes since a git commit/ref, optionally only breaking changes.",
		promptSnippet: "since: Symbol-level changelog or breaking-change report since a git commit/ref.",
		promptGuidelines: ["Use since with breaking=true before releases or risky merges.", "Use diff when you only need direct symbol changes versus a ref."],
		parameters: SinceParams,
		renderCall: renderCodeMapperCall("since", (args) => `${args.commit} ${args.path ?? "."}`),
		renderResult: renderCodeMapperResult("Since complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const args = ["since", params.commit, normalizeOptionalPath(params.path, "."), "--format", "ai"];
			if (params.breaking) args.push("--breaking");
			return runSimpleCm(ctx.cwd, args, signal);
		},
	});
}

function registerTypesTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "types",
		label: "Types",
		description: "Run `cm types`: inspect parameter and return types for a symbol and locate custom type definitions.",
		promptSnippet: "types: Analyze parameter/return types flowing through one symbol.",
		promptGuidelines: ["Use types to understand API boundaries before changing a function signature.", "Use fuzzy=true only when exact lookup fails or the name is uncertain."],
		parameters: ScopedSymbolParams,
		renderCall: renderCodeMapperCall("types", (args) => args.symbol),
		renderResult: renderCodeMapperResult("Types complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, buildSymbolArgs("types", params, { fuzzyFlag: true }), signal);
		},
	});
}

function registerSchemaTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "schema",
		label: "Schema",
		description: "Run `cm schema`: show field structure for a class, struct, interface, dataclass, or similar data type.",
		promptSnippet: "schema: Show fields, types, optionality, and defaults for a data structure.",
		promptGuidelines: ["Use schema for data models and request/response types.", "Use search first to confirm the exact type name."],
		parameters: ScopedSymbolParams,
		renderCall: renderCodeMapperCall("schema", (args) => args.symbol),
		renderResult: renderCodeMapperResult("Schema complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, buildSymbolArgs("schema", params, { fuzzyFlag: true }), signal);
		},
	});
}

function registerImplementsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "implements",
		label: "Implements",
		description: "Run `cm implements`: find classes/structs/types that implement or extend an interface, trait, protocol, or base class.",
		promptSnippet: "implements: Find implementors/subclasses for an interface, trait, protocol, or base class.",
		promptGuidelines: ["Use implements to enumerate concrete implementations before changing an interface.", "Use fuzzy=true only when exact lookup fails or the name is uncertain."],
		parameters: ScopedSymbolParams,
		renderCall: renderCodeMapperCall("implements", (args) => args.symbol),
		renderResult: renderCodeMapperResult("Implements complete"),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return runSimpleCm(ctx.cwd, buildSymbolArgs("implements", params, { fuzzyFlag: true }), signal);
		},
	});
}

function buildSymbolArgs(command: string, params: { symbol?: string; path?: string; fuzzy?: boolean }, options: { exactByDefault?: boolean; fuzzyFlag?: boolean } = {}): string[] {
	const symbol = normalizeRequiredString(params.symbol ?? "", `${command}.symbol`);
	if (typeof symbol !== "string") return ["__invalid__", symbol.error];
	const args = [command, symbol, normalizeOptionalPath(params.path, "."), "--format", "ai"];
	if (options.exactByDefault && !params.fuzzy) args.push("--exact");
	if (options.fuzzyFlag && params.fuzzy) args.push("--fuzzy");
	return args;
}

async function runSimpleCm(cwd: string, args: string[], signal?: AbortSignal) {
	if (args[0] === "__invalid__") return toToolResult(args[1] ?? "Invalid CodeMapper arguments");
	try {
		const run = await runCm(cwd, args, { signal, timeoutMs: CM_TIMEOUT_MS });
		return toToolResult(run.stdout.trim() || "(no output)");
	} catch (error) {
		return toToolResult(renderToolFailure(error));
	}
}
