import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { normalizeRequiredString } from "../paths.js";
import { combineExpandItems, parseCalleesOutput, parseCallersOutput, parseDefinitionsOutput, parseTestsOutput } from "../parse.js";
import { ExpandParams } from "../params/expand.js";
import { toToolResult } from "../output.js";

export function registerExpandTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "expand",
		label: "Expand",
		description:
			"Expand one known exact symbol into its CodeMapper relationship radius before editing or refactoring. Returns a JSON array combining exact definition item(s), static callers, direct callees/dependencies, and detected tests. Use for impact analysis of symbols like `cmd_query`, `try_load_or_rebuild`, `parse_file`, or `UserService`. This v1 tool runs in the current cwd with no path scope and no fuzzy lookup; duplicate names can produce multiple definition/name-based relationship results.",
		promptSnippet:
			"expand: Impact radius for one exact symbol: definition(s), static callers, direct callees, and detected tests before edits/refactors.",
		promptGuidelines: [
			"Use expand before changing, deleting, renaming, or refactoring a symbol to see likely impact and available tests.",
			"Use search first if you are unsure of the exact indexed symbol name; expand does not do fuzzy matching.",
			"Do not pass a file path or natural-language phrase to expand.symbol; pass the exact symbol name from CodeMapper results.",
			"If a symbol name is duplicated, expand may include multiple definitions and name-based relationship results; verify important callers with targeted reads.",
			"Expand callees can include unresolved external/built-in calls, and test results are based on CodeMapper's supported test file/name/attribute conventions.",
		],
		parameters: ExpandParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const symbol = normalizeRequiredString(params.symbol, "expand.symbol");
			if (typeof symbol !== "string") return toToolResult(symbol.error);

			try {
				const definitionsRun = await runCm(ctx.cwd, ["query", symbol, ".", "--format", "ai", "--context", "full", "--exact"], {
					signal,
					timeoutMs: CM_TIMEOUT_MS,
				});
				const definitions = parseDefinitionsOutput(definitionsRun.stdout);
				if (definitions.length === 0) return toToolResult(`No exact symbol found: ${symbol}`);

				const callersRun = await runCm(ctx.cwd, ["callers", symbol, ".", "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });
				const calleesRun = await runCm(ctx.cwd, ["callees", symbol, ".", "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });
				const testsRun = await runCm(ctx.cwd, ["tests", symbol, ".", "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });

				return toToolResult(
					combineExpandItems(
						definitions,
						parseCallersOutput(callersRun.stdout),
						parseCalleesOutput(calleesRun.stdout),
						parseTestsOutput(testsRun.stdout),
					),
				);
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}
