import { Type } from "@mariozechner/pi-ai";

export const OutlineParams = Type.Object({
	file: Type.String({
		description:
			"File to outline. Returns symbols for code files or heading sections for Markdown files. Use a project-relative path; an optional leading @ is accepted.",
	}),
});
