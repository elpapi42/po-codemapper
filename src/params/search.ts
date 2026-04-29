import { Type } from "@mariozechner/pi-ai";

export const SearchParams = Type.Object({
	query: Type.String({
		description:
			"Compact CodeMapper query, not a natural-language question. Supports symbol/concept substrings (`auth`, `Parser`), exact names with exact=true (`cmd_query`), OR terms (`parse|index|cache`), Markdown headings/code blocks (`Caching`, `Quick Start`), endpoint-like routes (`/v1/orders`, `GET /v1/orders`), and plural type shortcuts (`functions`, `classes`, `methods`, `headings`, `endpoints`, `interfaces`, `types`).",
	}),
	path: Type.Optional(
		Type.String({
			description:
				"Optional directory/docs scope relative to the Pi session cwd; defaults to `.`. Examples: `src`, `docs`, `packages/api`. Must be a directory scope, not a file path; use outline.file for one known file. Optional leading `@` is accepted and stripped.",
		}),
	),
	exact: Type.Optional(
		Type.Boolean({
			description:
				"Set true only when query is the exact indexed name you want, e.g. `cmd_query` or `UserService`; exact matching is strict and less forgiving. Leave false/omitted for fuzzy case-insensitive substring discovery such as `auth` matching `authenticate` or `Authorization`.",
		}),
	),
});
