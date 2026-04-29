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
			"Outline one known file with CodeMapper. Returns only a JSON array of exact file and symbol items for code files, or file and doc_section items for Markdown files. Use outline after search/map identifies a file and before reading the full file.",
		promptSnippet: "outline: Outline one file's symbols or Markdown sections with CodeMapper. Returns a JSON array.",
		promptGuidelines: [
			"Use outline when you have a file path and need its symbols/headings before reading the file contents.",
			"Do not use outline for symbol lookup; use search for locating symbols and expand for symbol relationships.",
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
