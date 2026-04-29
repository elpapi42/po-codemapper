import { Type } from "@mariozechner/pi-ai";

export const PathParams = Type.Object({
	from: Type.String({ description: "Starting symbol for static call-path tracing." }),
	to: Type.String({ description: "Target symbol for static call-path tracing." }),
});
