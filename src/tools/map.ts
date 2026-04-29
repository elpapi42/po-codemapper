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
			"Map a repository or directory with CodeMapper before choosing files or search terms. Runs `cm stats` plus `cm map --level 2` and returns a JSON array containing one stats item and file items with path, language, and size. Use for repo/package/module orientation such as `.`, `src`, `packages/api`, or `docs`; it does not return symbol bodies or per-file symbol lists. The path must be a directory scope, not a single file; narrow map.path if output is too large.",
		promptSnippet: "map: Repo/directory orientation via CodeMapper stats + level-2 file map; returns JSON stats/file items.",
		promptGuidelines: [
			"Use map first when you do not yet know the relevant files, symbols, or docs sections; it is cheaper than broad ls/find/read.",
			"Use map.path to scope the overview to the smallest useful directory such as `src`, `apps/web`, `packages/api`, or `docs`.",
			"Map returns file-level structure only; after map identifies candidate files, use outline for one file or search for symbols/headings/endpoints.",
			"Do not pass a file path to map; use outline.file for single-file structure.",
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
