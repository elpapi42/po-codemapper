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
			"Search CodeMapper's indexed symbol and Markdown/doc names with `cm query --context full --limit 50`. Default matching is fuzzy/case-insensitive substring search; set exact=true only for a known exact indexed name. Query examples: `auth`, `cmd_query`, `Parser`, `parse|index|cache`, `Caching`, `functions`, `headings`, `/v1/orders`, or `GET /v1/orders`. Returns a JSON array of exact symbol, doc_section, and endpoint items with paths and line ranges; it is not semantic natural-language search and does not search arbitrary file text.",
		promptSnippet:
			"search: Locate symbols/docs/endpoints by compact keyword, exact name, route, heading, plural type, or OR query; returns JSON results.",
		promptGuidelines: [
			"Use search when you need candidate symbols, docs headings, code blocks, or endpoint-like routes before reading files.",
			"Use search.query as compact terms, not full questions: `auth`, `cmd_query`, `OrderService`, `parse|index|cache`, `Caching`, `/v1/orders`, `functions`, `headings`.",
			"Search is fuzzy/case-insensitive by default and may return partial matches; use search.exact only when you already know the exact indexed symbol or heading name.",
			"Scope search.path to a directory such as `src`, `docs`, or `packages/api`; do not pass a single file path to search.",
			"Search returns at most 50 CodeMapper results in this extension; narrow search.query or search.path if results are noisy or capped.",
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
