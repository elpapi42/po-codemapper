export function normalizeOptionalPath(value: string | undefined, fallback = "."): string {
	const normalized = stripLeadingAt(value ?? fallback).trim();
	return normalized || fallback;
}

export function normalizeRequiredPath(value: string, field: string): string | { error: string } {
	const normalized = stripLeadingAt(value).trim();
	if (!normalized) return { error: `${field} cannot be empty` };
	return normalized;
}

export function normalizeRequiredString(value: string, field: string): string | { error: string } {
	const normalized = value.trim();
	if (!normalized) return { error: `${field} cannot be empty` };
	return normalized;
}

export function isMarkdownFile(file: string): boolean {
	return /\.(md|markdown)$/i.test(file);
}

function stripLeadingAt(value: string): string {
	return value.replace(/^@+/, "");
}
