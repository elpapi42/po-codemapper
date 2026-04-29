import { Type } from "@mariozechner/pi-ai";

export const MapParams = Type.Object({
	path: Type.Optional(
		Type.String({ description: "Directory or repository to map with CodeMapper. Defaults to the current working directory." }),
	),
});
