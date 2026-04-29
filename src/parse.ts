import type {
	CalleeItem,
	CallerItem,
	DefinitionItem,
	DocSectionItem,
	EndpointItem,
	ExpandItem,
	FileItem,
	MapItem,
	OutlineItem,
	PathItem,
	SearchItem,
	StatsItem,
	SymbolItem,
	TestItem,
} from "./types.js";

const SYMBOL_TYPE_NAMES: Record<string, string> = {
	f: "function",
	c: "class",
	m: "method",
	e: "enum",
	s: "static",
	h: "heading",
	cb: "code_block",
	ep: "endpoint",
	if: "interface",
	ty: "type",
};

export function symbolTypeName(code: string): string {
	return SYMBOL_TYPE_NAMES[code] ?? code;
}

export function parseStatsOutput(stdout: string, path = "."): StatsItem[] {
	const lines = dataLines(stdout);
	if (isNoResults(stdout)) return [];

	const langsLine = lines.find((line) => line.startsWith("LANGS:"));
	const symsLine = lines.find((line) => line.startsWith("SYMS:"));
	const totalsLine = lines.find((line) => line.startsWith("TOTALS:"));
	if (!langsLine && !symsLine && !totalsLine) return [];

	const totals = parseKeyValues(totalsLine?.slice("TOTALS:".length).trim() ?? "");
	return [
		{
			kind: "stats",
			path,
			filesByLanguage: parseKeyValues(langsLine?.slice("LANGS:".length).trim() ?? ""),
			symbolsByType: mapSymbolTypeRecord(parseKeyValues(symsLine?.slice("SYMS:".length).trim() ?? "")),
			totalFiles: totals.files ?? 0,
			totalSymbols: totals.syms ?? 0,
			totalBytes: totals.bytes ?? 0,
		},
	];
}

export function parseMapOutput(stdout: string): FileItem[] {
	const lines = dataLines(stdout);
	const files: FileItem[] = [];
	let inFiles = false;
	for (const line of lines) {
		if (line === "[FILES]") {
			inFiles = true;
			continue;
		}
		if (line.startsWith("[") && line !== "[FILES]") {
			inFiles = false;
			continue;
		}
		if (!inFiles) continue;
		const parts = line.split("|");
		if (parts.length < 3) continue;
		const size = Number(parts[2]);
		files.push({
			kind: "file",
			path: parts[0],
			language: parts[1] || undefined,
			...(Number.isFinite(size) ? { sizeBytes: size } : {}),
		});
	}
	return files;
}

export function parseQueryOutput(stdout: string): SearchItem[] {
	return parseQuerySymbols(stdout).map(symbolToSearchItem).filter((item): item is SearchItem => item !== undefined);
}

export function parseDefinitionsOutput(stdout: string): DefinitionItem[] {
	return parseQuerySymbols(stdout).map((symbol) => ({
		kind: "definition",
		name: symbol.name,
		symbolType: symbol.symbolType,
		path: symbol.path,
		lines: symbol.lines,
		...(symbol.signature !== undefined ? { signature: symbol.signature } : {}),
	}));
}

export function parseInspectOutput(stdout: string): OutlineItem[] {
	const rawLines = stdout.split(/\r?\n/);
	let filePath = "";
	let fileItem: FileItem | undefined;
	const symbolRows: string[] = [];
	let pending = "";

	const flushPending = () => {
		if (pending) {
			symbolRows.push(pending);
			pending = "";
		}
	};

	for (const rawLine of rawLines) {
		const line = rawLine.trimEnd();
		if (!line.trim()) continue;
		const fileMatch = line.match(/^\[FILE:(.+)\]$/);
		if (fileMatch) {
			flushPending();
			filePath = fileMatch[1];
			continue;
		}
		const metaMatch = line.match(/^LANG:([^\s]+)\s+SIZE:(\d+)\s+SYMS:(\d+)/);
		if (metaMatch) {
			flushPending();
			fileItem = {
				kind: "file",
				path: filePath,
				language: metaMatch[1],
				sizeBytes: Number(metaMatch[2]),
				symbolCount: Number(metaMatch[3]),
			};
			continue;
		}
		if (isIgnorableLine(line)) {
			flushPending();
			continue;
		}
		if (looksLikeInspectSymbolStart(line)) {
			flushPending();
			pending = line;
			continue;
		}
		if (pending) {
			pending += `\n${line}`;
		}
	}
	flushPending();

	const items: OutlineItem[] = [];
	if (fileItem) items.push(fileItem);
	for (const row of symbolRows) {
		const parsed = parseInspectSymbolRow(row, filePath);
		if (parsed) items.push(parsed);
	}
	return items;
}

export function parseMarkdownTreeOutput(stdout: string, fallbackPath = ""): OutlineItem[] {
	const items: OutlineItem[] = [];
	let filePath = fallbackPath;
	let language = "markdown";
	let sizeBytes: number | undefined;

	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		const inspecting = line.match(/^→\s+Inspecting:\s+(.+)$/);
		if (inspecting) {
			filePath = inspecting[1].trim();
			continue;
		}
		const languageMatch = line.match(/^Language:\s+(.+)$/);
		if (languageMatch) {
			language = languageMatch[1].trim();
			continue;
		}
		const sizeMatch = line.match(/^Size:\s+(\d+)\s+bytes$/);
		if (sizeMatch) {
			sizeBytes = Number(sizeMatch[1]);
			continue;
		}
	}

	if (filePath && language && sizeBytes !== undefined) {
		items.push({ kind: "file", path: filePath, language, sizeBytes });
	}

	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s+\(L(\d+),\s+(\d+)\s+lines?\)$/);
		if (!heading) continue;
		items.push({
			kind: "doc_section",
			path: filePath,
			heading: heading[2],
			level: heading[1].length,
			line: Number(heading[3]),
			lineCount: Number(heading[4]),
		});
	}

	return items;
}

export function parseCallersOutput(stdout: string): CallerItem[] {
	if (isNoResults(stdout)) return [];
	const lines = dataLines(stdout);
	let target = "";
	const header = lines.find((line) => line.startsWith("[CALLERS:"));
	const headerMatch = header?.match(/^\[CALLERS:([^|\]]+)\|\d+\]$/);
	if (headerMatch) target = headerMatch[1];

	const items: CallerItem[] = [];
	for (const line of lines) {
		if (line.startsWith("[")) continue;
		const parts = line.split("|");
		if (parts.length < 3) continue;
		const location = parseLocation(parts[2]);
		if (!location || location.line === undefined || !location.path) continue;
		items.push({
			kind: "caller",
			target,
			caller: parts[0],
			callerType: symbolTypeName(parts[1]),
			path: location.path,
			line: location.line,
		});
	}
	return items;
}

export function parseCalleesOutput(stdout: string): CalleeItem[] {
	if (isNoResults(stdout)) return [];
	const lines = dataLines(stdout);
	let source = "";
	const header = lines.find((line) => line.startsWith("[CALLEES:"));
	const headerMatch = header?.match(/^\[CALLEES:([^|\]]+)\|\d+\]$/);
	if (headerMatch) source = headerMatch[1];

	const items: CalleeItem[] = [];
	for (const line of lines) {
		if (line.startsWith("[")) continue;
		const parts = line.split("|");
		if (parts.length < 3) continue;
		const location = parseLocation(parts[2]);
		if (!location) continue;
		const resolved = location.path !== undefined && location.path !== "<external>";
		items.push({
			kind: "callee",
			source,
			callee: parts[0],
			calleeType: symbolTypeName(parts[1]),
			...(location.path !== undefined ? { path: location.path } : {}),
			...(location.line !== undefined ? { line: location.line } : {}),
			resolved,
		});
	}
	return items;
}

export function parseTestsOutput(stdout: string): TestItem[] {
	if (isNoResults(stdout)) return [];
	const lines = dataLines(stdout);
	let target = "";
	const header = lines.find((line) => line.startsWith("[TESTS:"));
	const headerMatch = header?.match(/^\[TESTS:([^|\]]+)\|\d+\]$/);
	if (headerMatch) target = headerMatch[1];

	const items: TestItem[] = [];
	for (const line of lines) {
		if (line.startsWith("[")) continue;
		const parts = line.split("|");
		if (parts.length < 3) continue;
		const location = parseLocation(parts[2]);
		if (!location || location.path === undefined || location.line === undefined) continue;
		const callPart = parts.find((part) => part.startsWith("call:"));
		const callLine = callPart ? Number(callPart.slice("call:".length)) : undefined;
		items.push({
			kind: "test",
			target,
			testName: parts[0],
			testType: symbolTypeName(parts[1]),
			path: location.path,
			line: location.line,
			...(Number.isFinite(callLine) ? { callLine } : {}),
		});
	}
	return items;
}

export function parseTraceOutput(stdout: string, from: string, to: string): PathItem[] {
	if (isNoResults(stdout)) return [];
	const lines = dataLines(stdout);
	const found = lines.find((line) => line.startsWith("FOUND:"));
	if (!found?.includes("FOUND:true")) return [];

	const steps: PathItem["steps"] = [];
	for (const line of lines) {
		if (line.startsWith("[") || line.startsWith("FOUND:") || line.startsWith("PATH:")) continue;
		const parts = line.split("|");
		if (parts.length < 3) continue;
		const location = parseLocation(parts[2]);
		steps.push({
			name: parts[0],
			symbolType: symbolTypeName(parts[1]),
			...(location?.path !== undefined ? { path: location.path } : {}),
			...(location?.line !== undefined ? { line: location.line } : {}),
		});
	}
	return steps.length > 0 ? [{ kind: "call_path", from, to, steps }] : [];
}

export function combineExpandItems(
	definitions: DefinitionItem[],
	callers: CallerItem[],
	callees: CalleeItem[],
	tests: TestItem[],
): ExpandItem[] {
	return [...definitions, ...callers, ...callees, ...tests];
}

function parseQuerySymbols(stdout: string): SymbolItem[] {
	if (isNoResults(stdout)) return [];
	const rows = collectDelimitedRows(stdout, looksLikeQuerySymbolStart);
	const symbols: SymbolItem[] = [];
	for (const row of rows) {
		const parsed = parseQuerySymbolRow(row);
		if (parsed) symbols.push(parsed);
	}
	return symbols;
}

function symbolToSearchItem(symbol: SymbolItem): SearchItem | undefined {
	if (symbol.symbolType === "heading") {
		return {
			kind: "doc_section",
			path: symbol.path,
			heading: symbol.name,
			level: parseHeadingLevel(symbol.signature),
			line: symbol.lines[0],
		};
	}
	if (symbol.symbolType === "endpoint") {
		const parsedEndpoint = parseEndpointName(symbol.name);
		return {
			kind: "endpoint",
			name: symbol.name,
			path: symbol.path,
			...(parsedEndpoint.method ? { method: parsedEndpoint.method } : {}),
			...(parsedEndpoint.route ? { route: parsedEndpoint.route } : {}),
			line: symbol.lines[0],
		};
	}
	return symbol;
}

function collectDelimitedRows(stdout: string, isStart: (line: string) => boolean): string[] {
	const rows: string[] = [];
	let pending = "";
	const flush = () => {
		if (pending) {
			rows.push(pending);
			pending = "";
		}
	};

	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.trim()) continue;
		if (isIgnorableLine(line)) {
			flush();
			continue;
		}
		if (isStart(line)) {
			flush();
			pending = line;
			continue;
		}
		if (pending) pending += `\n${line}`;
	}
	flush();
	return rows;
}

function parseQuerySymbolRow(row: string): SymbolItem | undefined {
	const firstLine = row.split("\n", 1)[0] ?? "";
	const parts = firstLine.split("|");
	if (parts.length < 4) return undefined;
	const range = parseRange(parts[3]);
	if (!range) return undefined;
	const signature = extractField(row, "sig");
	return {
		kind: "symbol",
		name: parts[0],
		symbolType: symbolTypeName(parts[1]),
		path: parts[2],
		lines: range,
		...(signature !== undefined ? { signature } : {}),
		...(parts.includes("exp") ? { exported: true } : {}),
	};
}

function parseInspectSymbolRow(row: string, path: string): SymbolItem | undefined {
	const firstLine = row.split("\n", 1)[0] ?? "";
	const parts = firstLine.split("|");
	if (parts.length < 3) return undefined;
	const range = parseRange(parts[2]);
	if (!range) return undefined;
	const signature = extractField(row, "sig");
	return {
		kind: "symbol",
		name: parts[0],
		symbolType: symbolTypeName(parts[1]),
		path,
		lines: range,
		...(signature !== undefined ? { signature } : {}),
	};
}

function parseKeyValues(input: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const token of input.split(/\s+/).filter(Boolean)) {
		const [key, value] = token.split(":");
		const numberValue = Number(value);
		if (key && Number.isFinite(numberValue)) out[key] = numberValue;
	}
	return out;
}

function mapSymbolTypeRecord(input: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [key, value] of Object.entries(input)) out[symbolTypeName(key)] = value;
	return out;
}

function parseRange(value: string): [number, number] | undefined {
	const match = value.match(/^(\d+)(?:-(\d+))?$/);
	if (!match) return undefined;
	const start = Number(match[1]);
	const end = Number(match[2] ?? match[1]);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
	return [start, end];
}

function parseLocation(value: string): { path?: string; line?: number } | undefined {
	const index = value.lastIndexOf(":");
	if (index < 0) return { path: value || undefined };
	const path = value.slice(0, index);
	const line = Number(value.slice(index + 1));
	return {
		...(path ? { path } : {}),
		...(Number.isFinite(line) ? { line } : {}),
	};
}

function parseHeadingLevel(signature: string | undefined): number | undefined {
	const match = signature?.match(/h(\d+)/);
	if (!match) return undefined;
	const level = Number(match[1]);
	return Number.isFinite(level) ? level : undefined;
}

function parseEndpointName(name: string): { method?: string; route?: string } {
	const match = name.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
	if (!match) return {};
	return { method: match[1].toUpperCase(), route: match[2] };
}

function extractField(row: string, key: string): string | undefined {
	const marker = `|${key}:`;
	const index = row.indexOf(marker);
	if (index < 0) return undefined;
	const value = row.slice(index + marker.length);
	return value.length ? value : undefined;
}

function looksLikeQuerySymbolStart(line: string): boolean {
	return /^[^|\[]+\|[A-Za-z_][A-Za-z0-9_]*\|.+\|\d+(?:-\d+)?(?:\||$)/.test(line);
}

function looksLikeInspectSymbolStart(line: string): boolean {
	return /^[^|\[]+\|[A-Za-z_][A-Za-z0-9_]*\|\d+(?:-\d+)?(?:\||$)/.test(line);
}

function isIgnorableLine(line: string): boolean {
	const trimmed = line.trim();
	return (
		!trimmed ||
		trimmed.startsWith("[") ||
		trimmed.startsWith("→") ||
		trimmed.startsWith("✓") ||
		trimmed.startsWith("✗") ||
		trimmed.startsWith("Language:") ||
		trimmed.startsWith("Size:")
	);
}

function isNoResults(stdout: string): boolean {
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.some((line) => /^✗\s+No\s+/i.test(line));
}

function dataLines(stdout: string): string[] {
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("→") && !line.startsWith("✓"));
}
