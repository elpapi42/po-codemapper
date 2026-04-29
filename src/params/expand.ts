import { Type } from "@mariozechner/pi-ai";

export const ExpandParams = Type.Object({
	symbol: Type.String({
		description:
			"Exact indexed symbol name to analyze in the current Pi cwd, usually copied from a search result. Examples: `cmd_query`, `try_load_or_rebuild`, `parse_file`, `UserService`. Not a file path and not a natural-language phrase. No fuzzy matching or path scope in v1; duplicate names may return/merge multiple definitions and relationships.",
	}),
});
