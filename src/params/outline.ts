import { Type } from "@mariozechner/pi-ai";

export const OutlineParams = Type.Object({
	file: Type.String({
		description:
			"Known file path to inspect, relative to the Pi session cwd. Examples: `src/index.ts`, `src/tools/search.ts`, `README.md`, `docs/api.md`. Must be a file, not a directory. Optional leading `@` is accepted and stripped. Markdown files return h1-h3 sections with line counts; code files return symbols with line ranges/signatures.",
	}),
});
