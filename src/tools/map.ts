import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { normalizeOptionalPath } from "../paths.js";
import { parseMapOutput, parseStatsOutput } from "../parse.js";
import { MapParams } from "../params/map.js";
import { toToolResult } from "../output.js";

export function registerMapTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "map",
		label: "Map",
		description:
			"Map a repository or directory with CodeMapper. Returns only a JSON array of exact stats and file items, or a plain string error. Use map when you need to know what is in a repo/package/directory before choosing a search term or reading files.",
		promptSnippet: "map: Map a repository or directory with CodeMapper stats and file-level structure. Returns a JSON array.",
		promptGuidelines: [
			"Use map before broad find/ls when you need a compact codebase or directory structure overview.",
			"Use map.path to scope the overview to a known package, app, module, or docs directory.",
		],
		parameters: MapParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const targetPath = normalizeOptionalPath(params.path, ".");
			try {
				const stats = await runCm(ctx.cwd, ["stats", targetPath, "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });
				const mapped = await runCm(ctx.cwd, ["map", targetPath, "--level", "2", "--format", "ai"], {
					signal,
					timeoutMs: CM_TIMEOUT_MS,
				});
				return toToolResult([...parseStatsOutput(stats.stdout, targetPath), ...parseMapOutput(mapped.stdout)]);
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}
