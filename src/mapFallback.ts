import { Buffer } from "node:buffer";
import type { DirectoryItem, FileItem, MapItem, NoticeItem, StatsItem } from "./types.js";

export function buildMapResult(statsItems: StatsItem[], fileItems: FileItem[], targetPath: string, maxBytes: number): MapItem[] {
	if (maxBytes < 2) throw new RangeError("maxBytes must be at least 2 to encode a JSON array");

	const fullResult: MapItem[] = [...statsItems, ...fileItems];
	if (jsonByteLength(fullResult) <= maxBytes) return fullResult;

	return buildOptimizedMapResult(statsItems, fileItems, targetPath, maxBytes);
}

export function aggregateDirectoryItems(fileItems: FileItem[], targetPath: string): DirectoryItem[] {
	const groups = new Map<string, DirectoryItem>();

	for (const file of fileItems) {
		const groupPath = directoryGroupPath(file.path, targetPath);
		const existing = groups.get(groupPath) ?? {
			kind: "directory" as const,
			path: groupPath,
			fileCount: 0,
			sizeBytes: 0,
			filesByLanguage: {},
		};

		existing.fileCount += 1;
		existing.sizeBytes += file.sizeBytes ?? 0;
		const language = file.language ?? "unknown";
		existing.filesByLanguage[language] = (existing.filesByLanguage[language] ?? 0) + 1;
		groups.set(groupPath, existing);
	}

	return Array.from(groups.values()).sort((a, b) => {
		const fileCountDelta = b.fileCount - a.fileCount;
		if (fileCountDelta !== 0) return fileCountDelta;
		const sizeDelta = b.sizeBytes - a.sizeBytes;
		if (sizeDelta !== 0) return sizeDelta;
		return a.path.localeCompare(b.path);
	});
}

function buildOptimizedMapResult(
	statsItems: StatsItem[],
	fileItems: FileItem[],
	targetPath: string,
	maxBytes: number,
): MapItem[] {
	const directories = aggregateDirectoryItems(fileItems, targetPath);
	const optimizedNotice = createOptimizedNotice(targetPath, fileItems.length, directories.length);
	const optimizedResult: MapItem[] = [...statsItems, optimizedNotice, ...directories];
	if (jsonByteLength(optimizedResult) <= maxBytes) return optimizedResult;

	const included: DirectoryItem[] = [];
	for (const directory of directories) {
		const candidate: MapItem[] = [
			...statsItems,
			optimizedNotice,
			...included,
			directory,
			createDirectoryGroupsTruncatedNotice(included.length + 1, directories.length),
		];
		if (jsonByteLength(candidate) > maxBytes) break;
		included.push(directory);
	}

	const truncatedResult: MapItem[] = [
		...statsItems,
		optimizedNotice,
		...included,
		createDirectoryGroupsTruncatedNotice(included.length, directories.length),
	];

	if (jsonByteLength(truncatedResult) <= maxBytes) return truncatedResult;

	const minimalWithStats: MapItem[] = [...statsItems, optimizedNotice, createDirectoryGroupsTruncatedNotice(0, directories.length)];
	if (jsonByteLength(minimalWithStats) <= maxBytes) return minimalWithStats;

	const minimalWithoutStats: MapItem[] = [optimizedNotice, createDirectoryGroupsTruncatedNotice(0, directories.length)];
	if (jsonByteLength(minimalWithoutStats) <= maxBytes) return minimalWithoutStats;

	const smallestNotice: MapItem[] = [
		{
			kind: "notice",
			code: "map_output_optimized",
			message: "Map output too large.",
			suggestedAction: "Call map with a smaller path.",
		},
	];
	if (jsonByteLength(smallestNotice) <= maxBytes) return smallestNotice;

	return [];
}

function createOptimizedNotice(targetPath: string, fileCount: number, directoryCount: number): NoticeItem {
	return {
		kind: "notice",
		code: "map_output_optimized",
		message: `The full level-2 file map for ${targetPath} produced ${fileCount} file items and was too large to return safely, so this response was optimized into ${directoryCount} top-level directory group(s).`,
		suggestedAction:
			"If you need file-level mapping, call map again with a smaller path from one of the returned directory.path values.",
	};
}

function createDirectoryGroupsTruncatedNotice(includedCount: number, totalCount: number): NoticeItem {
	return {
		kind: "notice",
		code: "map_directory_groups_truncated",
		message: `The optimized directory grouping was also too large, so only ${includedCount} of ${totalCount} directory group(s) are returned.`,
		suggestedAction: "Call map again with a smaller path to get a complete file-level map for that subtree.",
	};
}

function directoryGroupPath(filePath: string, targetPath: string): string {
	const file = normalizeForGrouping(filePath);
	const target = normalizeForGrouping(targetPath);
	const targetIsRoot = target === ".";
	const relative = targetIsRoot ? file : stripTargetPrefix(file, target);
	const segments = relative.split("/").filter(Boolean);

	if (segments.length <= 1) return targetIsRoot ? "." : target;
	return targetIsRoot ? segments[0] : `${target}/${segments[0]}`;
}

function stripTargetPrefix(filePath: string, targetPath: string): string {
	if (filePath === targetPath) return "";
	if (filePath.startsWith(`${targetPath}/`)) return filePath.slice(targetPath.length + 1);
	return filePath;
}

function normalizeForGrouping(path: string): string {
	let normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
	while (normalized.startsWith("./")) normalized = normalized.slice(2);
	return normalized || ".";
}

function jsonByteLength(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}
