import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CM_TIMEOUT_MS } from "../constants.js";
import { renderToolFailure, runCm } from "../cm.js";
import { isMarkdownFile, normalizeRequiredPath } from "../paths.js";
import { parseInspectOutput, parseMarkdownTreeOutput } from "../parse.js";
import { OutlineParams } from "../params/outline.js";
import { toToolResult } from "../output.js";

export function registerOutlineTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "outline",
		label: "Outline",
		description:
			"Outline one known file with CodeMapper after map/search has identified it. For code files, returns file metadata plus symbols with names, types, line ranges, signatures, and exported flags when available. For Markdown files, returns h1-h3 heading sections with line counts. Use before reading a full file to choose targeted ranges; this is not repo-wide symbol search.",
		promptSnippet: "outline: Show one file's code symbols or Markdown h1-h3 sections before targeted reads; returns JSON items.",
		promptGuidelines: [
			"Use outline when you already have a specific file path from map/search and need its structure before reading content.",
			"For code files, outline returns symbol names/types/line ranges/signatures; for Markdown, outline returns section headings and sizes.",
			"Use search, not outline, when you need to locate an unknown symbol, route, or docs heading across a directory/repo.",
			"Outline takes a file path only; do not pass a directory to outline.file.",
		],
		parameters: OutlineParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const file = normalizeRequiredPath(params.file, "outline.file");
			if (typeof file !== "string") return toToolResult(file.error);

			const args = isMarkdownFile(file)
				? ["inspect", file, "--tree", "--sizes", "--level", "3"]
				: ["inspect", file, "--format", "ai"];

			try {
				const run = await runCm(ctx.cwd, args, { signal, timeoutMs: CM_TIMEOUT_MS });
				return toToolResult(isMarkdownFile(file) ? parseMarkdownTreeOutput(run.stdout, file) : parseInspectOutput(run.stdout));
			} catch (error) {
				return toToolResult(renderToolFailure(error));
			}
		},
	});
}
