import { Type } from "@mariozechner/pi-ai";

export const PathParams = Type.Object({
	from: Type.String({
		description:
			"Exact source/start symbol name for static tracing in the current Pi cwd, preferably copied from search. Examples: `main`, `handler`, `cmd_query`. Not a file path, route, docs heading, or natural-language question; no fuzzy matching or path scope in v1.",
	}),
	to: Type.String({
		description:
			"Exact target/end symbol name for static tracing in the current Pi cwd, preferably copied from search. Examples: `try_load_or_rebuild`, `process_payment`, `send_response`. `[]` from the tool means no static path was detected, not that runtime reachability is impossible.",
	}),
});
