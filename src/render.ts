import { Text } from "@mariozechner/pi-tui";

type ToolResult = {
	content?: Array<{ type: string; text?: string }>;
	details?: { value?: unknown };
};

type RenderOptions = { expanded: boolean; isPartial: boolean };

type Theme = {
	fg(name: string, text: string): string;
	bold(text: string): string;
};

export function renderCodeMapperCall(name: string, formatArgs?: (args: any) => string) {
	return (args: any, theme: Theme) => {
		let text = theme.fg("toolTitle", theme.bold(name));
		const suffix = formatArgs?.(args);
		if (suffix) text += theme.fg("accent", ` ${suffix}`);
		return new Text(text, 0, 0);
	};
}

export function renderCodeMapperResult(summary: string) {
	return (result: ToolResult, { expanded, isPartial }: RenderOptions, theme: Theme) => {
		if (isPartial) return new Text(theme.fg("warning", "Running CodeMapper..."), 0, 0);

		const content = result.content?.find((entry) => entry.type === "text")?.text ?? "";
		const value = result.details?.value;
		let text = theme.fg("success", summarize(value, content, summary));

		if (expanded) {
			const lines = content.split("\n").slice(0, 80);
			for (const line of lines) text += `\n${theme.fg("dim", line)}`;
			const totalLines = content ? content.split("\n").length : 0;
			if (totalLines > lines.length) text += `\n${theme.fg("muted", "... (output truncated in UI)")}`;
		}

		return new Text(text, 0, 0);
	};
}

function summarize(value: unknown, content: string, fallback: string): string {
	if (Array.isArray(value)) {
		const kindCounts = new Map<string, number>();
		for (const item of value) {
			const kind = typeof item === "object" && item !== null && "kind" in item ? String((item as { kind?: unknown }).kind) : "item";
			kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
		}
		const counts = [...kindCounts.entries()].map(([kind, count]) => `${kind} ${count}`).join(", ");
		return `${fallback} (${value.length} item${value.length === 1 ? "" : "s"}${counts ? `: ${counts}` : ""})`;
	}

	if (typeof value === "string") return withFirstLine(fallback, value);
	return withFirstLine(fallback, content);
}

function withFirstLine(summary: string, text: string): string {
	const firstLine = text.split("\n").find((line) => line.trim().length > 0)?.trim();
	if (!firstLine) return summary;
	return `${summary} — ${firstLine.slice(0, 120)}`;
}
