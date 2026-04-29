import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { MAX_BUFFER_BYTES } from "./constants.js";
import { combineOutputs, truncateText } from "./output.js";
import type { RunOptions, RunResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class CmError extends Error {
	readonly command: string;
	readonly cwd: string;
	readonly stdout: string;
	readonly stderr: string;
	readonly code: unknown;
	readonly signal: unknown;
	readonly killed: boolean;
	readonly timedOut: boolean;
	readonly cancelled: boolean;
	readonly causeName?: string;

	constructor(
		message: string,
		fields: {
			command: string;
			cwd: string;
			stdout?: string;
			stderr?: string;
			code?: unknown;
			signal?: unknown;
			killed?: boolean;
			timedOut?: boolean;
			cancelled?: boolean;
			causeName?: string;
		},
	) {
		super(message);
		this.name = "CmError";
		this.command = fields.command;
		this.cwd = fields.cwd;
		this.stdout = fields.stdout ?? "";
		this.stderr = fields.stderr ?? "";
		this.code = fields.code;
		this.signal = fields.signal;
		this.killed = fields.killed ?? false;
		this.timedOut = fields.timedOut ?? false;
		this.cancelled = fields.cancelled ?? false;
		this.causeName = fields.causeName;
	}

	get combinedOutput(): string {
		return combineOutputs(this.stdout, this.stderr || this.message);
	}
}

export function resolveCmBinary(): string {
	const configured = process.env.CODEMAPPER_BIN?.trim();
	if (configured) return configured;

	const local = join(homedir(), ".local", "bin", "cm");
	if (existsSync(local)) return local;

	return "cm";
}

export async function runCm(cwd: string, args: string[], options: RunOptions): Promise<RunResult> {
	const bin = resolveCmBinary();
	const command = formatCommand(args, bin);
	try {
		const result = await execFileAsync(bin, args, {
			cwd,
			timeout: options.timeoutMs,
			maxBuffer: MAX_BUFFER_BYTES,
			signal: options.signal,
			env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
		});
		return { command, cwd, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
	} catch (error: unknown) {
		const err = error as NodeJS.ErrnoException & {
			stdout?: unknown;
			stderr?: unknown;
			code?: unknown;
			signal?: unknown;
			killed?: boolean;
		};
		const cancelled = isRawCancellation(err, options.signal);
		const timedOut = !cancelled && isRawTimeout(err);
		throw new CmError(renderRawFailure(err, command), {
			command,
			cwd,
			stdout: String(err.stdout ?? ""),
			stderr: String(err.stderr ?? err.message ?? ""),
			code: err.code,
			signal: err.signal,
			killed: err.killed,
			timedOut,
			cancelled,
			causeName: err.name,
		});
	}
}

export function renderToolFailure(error: unknown): string {
	if (error instanceof CmError) return `CodeMapper failed: ${error.message}`;
	if (error instanceof Error) return `CodeMapper failed: ${error.message}`;
	return `CodeMapper failed: ${String(error)}`;
}

export function missingCmMessage(): string {
	return [
		"CodeMapper is unavailable because the `cm` command was not found.",
		"Install or build CodeMapper, then make it available as `cm`.",
		"Expected locations checked: CODEMAPPER_BIN, ~/.local/bin/cm, and cm on PATH.",
	].join("\n");
}

export function renderRawFailure(
	error: { code?: unknown; name?: string; stdout?: unknown; stderr?: unknown; message?: string },
	command: string,
): string {
	if (error.code === "ENOENT") return missingCmMessage();
	if (error.name === "AbortError" || error.code === "ABORT_ERR") return `Cancelled: ${command}`;

	const combined = combineOutputs(String(error.stdout ?? ""), String(error.stderr ?? error.message ?? ""));
	const truncated = truncateText(combined || String(error.message ?? "Unknown cm error."), "tail").text;
	const exitInfo = typeof error.code === "number" ? ` (exit ${error.code})` : "";
	return `${command} failed${exitInfo}.\n\n${truncated}`;
}

export function isRawCancellation(error: { code?: unknown; name?: unknown } | undefined, signal?: AbortSignal): boolean {
	return Boolean(signal?.aborted || error?.name === "AbortError" || error?.code === "ABORT_ERR");
}

export function isRawTimeout(error: { message?: unknown; signal?: unknown; killed?: boolean } | undefined): boolean {
	const message = typeof error?.message === "string" ? error.message : "";
	return Boolean((error?.killed === true && error.signal === "SIGTERM") || /timed?\s*out|timeout/i.test(message));
}

export function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

export function formatCommand(args: string[], bin = "cm"): string {
	return [bin, ...args].map(shellQuote).join(" ");
}
