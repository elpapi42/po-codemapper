import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS, SEARCH_LIMIT } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { normalizeOptionalPath, normalizeRequiredString } from "../paths.js";
import { parseQueryOutput } from "../parse.js";
import { SearchParams } from "../params/search.js";
import { toToolResult } from "../output.js";

export function registerSearchTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search",
		label: "Search",
		description:
			"Search code and docs with CodeMapper by symbol name, partial concept, route, endpoint, docs heading, or `|`-separated OR query. Returns only a JSON array of exact symbol, doc_section, and endpoint items, or a plain string error. Use search when you need candidate code/docs before reading files. This is not natural-language semantic search.",
		promptSnippet:
			"search: Search CodeMapper symbols/docs/endpoints by keyword, symbol, route, heading, or OR query. Returns a JSON array.",
		promptGuidelines: [
			"Use search before grep when looking for symbols, concepts, endpoints, or docs headings in code.",
			"Use search.query as a compact code/docs term, symbol, route, heading, or `|`-separated OR query, not a full natural-language question.",
			"Use search.exact only when you already know the exact symbol/name and want strict matching.",
		],
		parameters: SearchParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const query = normalizeRequiredString(params.query, "search.query");
			if (typeof query !== "string") return toToolResult(query.error);

			const searchPath = normalizeOptionalPath(params.path, ".");
			const args = ["query", query, searchPath, "--format", "ai", "--context", "full", "--limit", String(SEARCH_LIMIT)];
			if (params.exact) args.push("--exact");

			try {
				const run = await runCm(ctx.cwd, args, { signal, timeoutMs: CM_TIMEOUT_MS });
				return toToolResult(parseQueryOutput(run.stdout));
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}
