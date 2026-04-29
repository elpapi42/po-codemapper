import { Type } from "@mariozechner/pi-ai";

export const SearchParams = Type.Object({
	query: Type.String({
		description:
			"CodeMapper query: a symbol name, partial concept keyword, route, endpoint, docs heading, or `|`-separated OR query. Do not use a full natural-language question.",
	}),
	path: Type.Optional(Type.String({ description: "Directory/docs scope for the search. Defaults to the current working directory." })),
	exact: Type.Optional(Type.Boolean({ description: "Use exact matching instead of CodeMapper's default fuzzy/case-insensitive search." })),
});
