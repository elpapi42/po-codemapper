import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { normalizeRequiredString } from "../paths.js";
import { parseTraceOutput } from "../parse.js";
import { PathParams } from "../params/path.js";
import { toToolResult } from "../output.js";

export function registerPathTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "path",
		label: "Path",
		description:
			"Find the shortest detected static call path from one exact symbol to another using CodeMapper trace. Returns a JSON array with one call_path item when a path is found, `[]` when no static path is detected, or a plain string error. Use for questions like `main` -> `try_load_or_rebuild` or `handler` -> `send_response` after search has confirmed both exact symbol names. This v1 tool runs in the current cwd with no path scope or fuzzy lookup; `[]` does not prove runtime impossibility.",
		promptSnippet: "path: Trace a static call chain from exact symbol A to exact symbol B in current cwd; returns one JSON call_path or [].",
		promptGuidelines: [
			"Use path when you know two exact symbols and need to see whether CodeMapper detects a static call chain between them.",
			"Use search first to confirm exact path.from and path.to names; path does not do fuzzy matching in this extension.",
			"Use expand for the relationship radius around one symbol; use path only for a specific A-to-B chain.",
			"Do not pass file paths, routes, docs headings, or natural-language questions to path.from or path.to.",
			"Treat [] from path as 'no static path detected', not proof that runtime/framework/dynamic code cannot connect the symbols.",
		],
		parameters: PathParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const from = normalizeRequiredString(params.from, "path.from");
			if (typeof from !== "string") return toToolResult(from.error);
			const to = normalizeRequiredString(params.to, "path.to");
			if (typeof to !== "string") return toToolResult(to.error);

			try {
				const run = await runCm(ctx.cwd, ["trace", from, to, ".", "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });
				return toToolResult(parseTraceOutput(run.stdout, from, to));
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}
