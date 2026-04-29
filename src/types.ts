export type TruncationMode = "head" | "tail";

export interface RunOptions {
	signal?: AbortSignal;
	timeoutMs: number;
}

export interface RunResult {
	command: string;
	cwd: string;
	stdout: string;
	stderr: string;
}

export interface StatsItem {
	kind: "stats";
	path: string;
	filesByLanguage: Record<string, number>;
	symbolsByType: Record<string, number>;
	totalFiles: number;
	totalSymbols: number;
	totalBytes: number;
}

export interface FileItem {
	kind: "file";
	path: string;
	language?: string;
	sizeBytes?: number;
	symbolCount?: number;
}

export interface SymbolItem {
	kind: "symbol";
	name: string;
	symbolType: string;
	path: string;
	lines: [number, number];
	signature?: string;
	exported?: boolean;
}

export interface DocSectionItem {
	kind: "doc_section";
	path: string;
	heading: string;
	level?: number;
	line: number;
	lineCount?: number;
}

export interface EndpointItem {
	kind: "endpoint";
	name: string;
	path: string;
	method?: string;
	route?: string;
	line: number;
}

export type MapItem = StatsItem | FileItem;
export type SearchItem = SymbolItem | DocSectionItem | EndpointItem;
export type OutlineItem = FileItem | SymbolItem | DocSectionItem;

export interface DefinitionItem {
	kind: "definition";
	name: string;
	symbolType: string;
	path: string;
	lines: [number, number];
	signature?: string;
}

export interface CallerItem {
	kind: "caller";
	target: string;
	caller: string;
	callerType?: string;
	path: string;
	line: number;
}

export interface CalleeItem {
	kind: "callee";
	source: string;
	callee: string;
	calleeType?: string;
	path?: string;
	line?: number;
	resolved: boolean;
}

export interface TestItem {
	kind: "test";
	target: string;
	testName: string;
	testType?: string;
	path: string;
	line: number;
	callLine?: number;
}

export type ExpandItem = DefinitionItem | CallerItem | CalleeItem | TestItem;

export interface PathItem {
	kind: "call_path";
	from: string;
	to: string;
	steps: Array<{
		name: string;
		symbolType?: string;
		path?: string;
		line?: number;
	}>;
}
