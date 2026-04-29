import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerExpandTool } from "./tools/expand.js";
import { registerMapTool } from "./tools/map.js";
import { registerOutlineTool } from "./tools/outline.js";
import { registerPathTool } from "./tools/path.js";
import { registerSearchTool } from "./tools/search.js";

export default function codemapperExtension(pi: ExtensionAPI): void {
	registerMapTool(pi);
	registerSearchTool(pi);
	registerOutlineTool(pi);
	registerExpandTool(pi);
	registerPathTool(pi);
}
