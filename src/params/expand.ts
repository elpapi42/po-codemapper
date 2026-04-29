import { Type } from "@mariozechner/pi-ai";

export const ExpandParams = Type.Object({
	symbol: Type.String({ description: "Exact symbol name to expand into its definition, callers, callees, and tests." }),
});
