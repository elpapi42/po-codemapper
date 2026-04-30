import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS, MAX_MODEL_OUTPUT_BYTES } from "../constants.js";
import { renderToolFailure, runCm, runCmStreamingLines } from "../cm.js";
import { normalizeOptionalPath } from "../paths.js";
import { parseStatsOutput } from "../parse.js";
import { MapParams } from "../params/map.js";
import { toToolResult } from "../output.js";
import { buildMapResult } from "../mapFallback.js";
import type { FileItem } from "../types.js";

export function registerMapTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "map",
		label: "Map",
		description:
			"Map a repository or directory with CodeMapper before choosing files or search terms. Runs `cm stats` plus `cm map --level 2` and returns a JSON array containing one stats item plus file items when the file map fits. If the level-2 file map is too large, map returns stats, a notice, and compact directory groups so the agent can call map again on a smaller returned directory path. Use for repo/package/module orientation such as `.`, `src`, `packages/api`, or `docs`; the path must be a directory scope, not a single file.",
		promptSnippet:
			"map: Repo/directory orientation via CodeMapper stats + level-2 file map; large maps fall back to directory groups.",
		promptGuidelines: [
			"Use map first when you do not yet know the relevant files, symbols, or docs sections; it is cheaper than broad ls/find/read.",
			"Use map.path to scope the overview to the smallest useful directory such as `src`, `apps/web`, `packages/api`, or `docs`.",
			"Map normally returns file-level structure; if map returns a map_output_optimized notice, call map again with a smaller path from the returned directory items for file-level mapping.",
			"Do not pass a file path to map; use outline.file for single-file structure.",
		],
		parameters: MapParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const targetPath = normalizeOptionalPath(params.path, ".");
			try {
				const stats = await runCm(ctx.cwd, ["stats", targetPath, "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS });
				const fileItems: FileItem[] = [];
				const handleMapLine = createMapLineHandler(fileItems);
				await runCmStreamingLines(ctx.cwd, ["map", targetPath, "--level", "2", "--format", "ai"], { signal, timeoutMs: CM_TIMEOUT_MS }, handleMapLine);
				return toToolResult(buildMapResult(parseStatsOutput(stats.stdout, targetPath), fileItems, targetPath, MAX_MODEL_OUTPUT_BYTES));
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}

function createMapLineHandler(fileItems: FileItem[]): (line: string) => void {
	let inFiles = false;
	return (line) => {
		const trimmed = line.trimEnd();
		if (trimmed === "[FILES]") {
			inFiles = true;
			return;
		}
		if (trimmed.startsWith("[") && trimmed !== "[FILES]") {
			inFiles = false;
			return;
		}
		if (!inFiles || !trimmed.trim()) return;

		const parts = trimmed.split("|");
		if (parts.length < 3) return;
		const size = Number(parts[2]);
		fileItems.push({
			kind: "file",
			path: parts[0],
			language: parts[1] || undefined,
			...(Number.isFinite(size) ? { sizeBytes: size } : {}),
		});
	};
}
