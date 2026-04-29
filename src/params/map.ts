import { Type } from "@mariozechner/pi-ai";

export const MapParams = Type.Object({
	path: Type.Optional(
		Type.String({
			description:
				"Directory/repo scope to summarize, relative to the Pi session cwd; defaults to `.`. Examples: `.`, `src`, `packages/api`, `docs`. Must be a directory, not a single file; optional leading `@` is accepted and stripped. Narrow this for monorepos or large output.",
		}),
	),
});
