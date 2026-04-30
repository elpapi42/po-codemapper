import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { MAX_BUFFER_BYTES, MAX_ERROR_OUTPUT_BYTES } from "./constants.js";
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

export async function runCmStreamingLines(
	cwd: string,
	args: string[],
	options: RunOptions,
	onStdoutLine: (line: string) => void,
): Promise<RunResult> {
	const bin = resolveCmBinary();
	const command = formatCommand(args, bin);

	return new Promise((resolve, reject) => {
		let stdoutTail = "";
		let stderrTail = "";
		let stdoutRemainder = "";
		let settled = false;
		let timedOut = false;

		const child = spawn(bin, args, {
			cwd,
			signal: options.signal,
			env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, options.timeoutMs);

		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			callback();
		};

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdoutTail = appendTail(stdoutTail, chunk);
			const text = stdoutRemainder + chunk;
			const lines = text.split(/\r?\n/);
			stdoutRemainder = lines.pop() ?? "";
			for (const line of lines) onStdoutLine(line);
		});

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderrTail = appendTail(stderrTail, chunk);
		});

		child.on("error", (error: NodeJS.ErrnoException) => {
			const cancelled = isRawCancellation(error, options.signal);
			finish(() => {
				reject(
					new CmError(renderRawFailure({ ...error, stdout: stdoutTail, stderr: stderrTail || error.message }, command), {
						command,
						cwd,
						stdout: stdoutTail,
						stderr: stderrTail || error.message,
						code: error.code,
						signal: undefined,
						killed: timedOut,
						timedOut: timedOut && !cancelled,
						cancelled,
						causeName: error.name,
					}),
				);
			});
		});

		child.on("close", (code, signal) => {
			if (settled) return;
			if (stdoutRemainder) {
				onStdoutLine(stdoutRemainder);
				stdoutRemainder = "";
			}
			finish(() => {
				if (code === 0) {
					resolve({ command, cwd, stdout: "", stderr: stderrTail });
					return;
				}

				const cancelled = Boolean(options.signal?.aborted);
				const raw = {
					code: typeof code === "number" ? code : undefined,
					name: cancelled ? "AbortError" : undefined,
					stdout: stdoutTail,
					stderr: stderrTail || (timedOut ? "Command timed out." : signal ? `Terminated by ${signal}.` : ""),
					message: stderrTail || (timedOut ? "Command timed out." : signal ? `Terminated by ${signal}.` : "Unknown cm error."),
				};
				reject(
					new CmError(renderRawFailure(raw, command), {
						command,
						cwd,
						stdout: stdoutTail,
						stderr: raw.stderr,
						code: raw.code,
						signal,
						killed: timedOut,
						timedOut: timedOut && !cancelled,
						cancelled,
						causeName: raw.name,
					}),
				);
			});
		});
	});
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

function appendTail(current: string, chunk: string): string {
	const combined = current + chunk;
	if (Buffer.byteLength(combined, "utf8") <= MAX_ERROR_OUTPUT_BYTES) return combined;
	return combined.slice(-MAX_ERROR_OUTPUT_BYTES);
}
