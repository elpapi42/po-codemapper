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
			"Find a detected static call path from one exact symbol to another using CodeMapper. Returns only a JSON array containing one call_path item, an empty array when no static path is detected, or a plain string error. `[]` does not prove runtime impossibility.",
		promptSnippet: "path: Find a static CodeMapper call path from one symbol to another. Returns a JSON array.",
		promptGuidelines: [
			"Use path when you need to know whether and how one known symbol can statically call another known symbol.",
			"Use expand for the relationship radius around one symbol; use path only for a call chain between two symbols.",
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
