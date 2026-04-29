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
			"Expand one exact symbol with CodeMapper into its relationship radius. Returns only a JSON array of exact definition, caller, callee, and test items, or a plain string error. Use expand before editing, deleting, renaming, or refactoring a known symbol.",
		promptSnippet:
			"expand: Expand one symbol into CodeMapper definition, callers, callees, and tests. Returns a JSON array.",
		promptGuidelines: [
			"Use expand before changing a known symbol to understand callers, dependencies, and detected tests.",
			"Use search first if you do not know the exact symbol name for expand.symbol.",
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
