import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import {
  REMOTE_TERMINAL_CHUNK_BYTES,
  REMOTE_TERMINAL_COMMAND_MAX_LENGTH,
  REMOTE_TERMINAL_DEFAULT_TIMEOUT_SECONDS,
  REMOTE_TERMINAL_MAX_FILE_BYTES,
  REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS,
  REMOTE_TERMINAL_READ_TOOL,
  REMOTE_TERMINAL_RUN_TOOL,
} from "@openbot/contracts/team-protocol/remote-computer-terminal-v1";

// The two tools of `remote-computer-terminal-v1` that this computer answers itself, not its Computer
// Use driver: run one shell command, and read one chunk of one file. `RemoteComputerClient` lists
// them and routes to them only while the user's terminal switch for that server is on.
//
// Commands run as the user, in a login shell, so they see the same PATH and tools as a Terminal
// window. The process gets a small environment of its own, never the environment of this app, which
// can hold OpenBot's own keys. Each command runs in its own process group, so a timeout, a Stop or a
// switch that turns off ends it and everything it started.

/** The two tool names that this module answers. */
export const TERMINAL_TOOL_NAMES: ReadonlySet<string> = new Set([REMOTE_TERMINAL_RUN_TOOL, REMOTE_TERMINAL_READ_TOOL]);

/** Only a computer with a POSIX login shell offers the terminal. */
export function terminalAvailableHere(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin" || platform === "linux";
}

const MAX_RUNNING = 4;
const HEAD_CHARS = 20_000;
const TAIL_CHARS = 30_000;
const KILL_GRACE_MS = 2_000;
const PIPE_GRACE_MS = 500;
/** What survives of the app's own environment. The login shell adds the rest. */
const BASE_ENV_NAMES = ["HOME", "USER", "LOGNAME", "SHELL", "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR"] as const;
const MAC_PATH_FALLBACK = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to remove control characters
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

export function terminalTools(): Tool[] {
  return [
    {
      name: REMOTE_TERMINAL_RUN_TOOL,
      description:
        "Run one shell command on this computer, as its user, in a login shell. It starts in the home folder " +
        "unless `cwd` is set. The answer has the exit code, stdout and stderr; long output keeps its start and " +
        `its end. A command still running at the time limit is stopped, and the limit is at most ${REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS} seconds: ` +
        "for longer work, start it in the background and read its output file later.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command." },
          cwd: { type: "string", description: "The folder to run in. `~` is the home folder. Default: home." },
          timeout_seconds: {
            type: "integer",
            minimum: 1,
            maximum: REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS,
            description: `Seconds before the command is stopped. Default ${REMOTE_TERMINAL_DEFAULT_TIMEOUT_SECONDS}.`,
          },
        },
        required: ["command"],
      },
    },
    {
      name: REMOTE_TERMINAL_READ_TOOL,
      description:
        "Read one chunk of a file on this computer, as base64. To copy a whole file to the server, use " +
        "`openbot_fetch_file`, which reads every chunk for you.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file. An absolute path, or one that starts with `~`." },
          offset: { type: "integer", minimum: 0, description: "Where to start, in bytes. Default 0." },
          length: {
            type: "integer",
            minimum: 1,
            maximum: REMOTE_TERMINAL_CHUNK_BYTES,
            description: `How many bytes. Default and most ${REMOTE_TERMINAL_CHUNK_BYTES}.`,
          },
        },
        required: ["path"],
      },
    },
  ];
}

export interface RemoteComputerTerminalOptions {
  home?: () => string;
  /** The environment to take the base from. This process's, unless a test gives another. */
  env?: () => NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export class RemoteComputerTerminal {
  readonly #home: () => string;
  readonly #env: () => NodeJS.ProcessEnv;
  readonly #platform: NodeJS.Platform;
  #running = 0;

  constructor(options: RemoteComputerTerminalOptions = {}) {
    this.#home = options.home ?? homedir;
    this.#env = options.env ?? (() => process.env);
    this.#platform = options.platform ?? process.platform;
  }

  async call(tool: string, input: DynamicRecord, signal: AbortSignal): Promise<CallToolResult> {
    if (tool === REMOTE_TERMINAL_RUN_TOOL) return this.#run(input, signal);
    if (tool === REMOTE_TERMINAL_READ_TOOL) return this.#read(input);
    return failure(`This computer has no tool "${tool}".`);
  }

  async #run(input: DynamicRecord, signal: AbortSignal): Promise<CallToolResult> {
    const { command, cwd: requestedCwd, timeout_seconds: requestedTimeout } = input;
    if (typeof command !== "string" || command.trim().length === 0) return failure("`command` must be a string.");
    if (command.length > REMOTE_TERMINAL_COMMAND_MAX_LENGTH) return failure("The command is too long.");
    let timeoutSeconds = REMOTE_TERMINAL_DEFAULT_TIMEOUT_SECONDS;
    if (requestedTimeout !== undefined) {
      if (
        typeof requestedTimeout !== "number" ||
        !Number.isInteger(requestedTimeout) ||
        requestedTimeout < 1 ||
        requestedTimeout > REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS
      )
        return failure(`\`timeout_seconds\` must be a whole number from 1 to ${REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS}.`);
      timeoutSeconds = requestedTimeout;
    }
    if (requestedCwd !== undefined && typeof requestedCwd !== "string") return failure("`cwd` must be a string.");
    const cwd = this.#path(requestedCwd ?? "~");
    try {
      if (!(await stat(cwd)).isDirectory()) return failure(`"${cwd}" is not a folder.`);
    } catch {
      return failure(`The folder "${cwd}" does not exist.`);
    }
    if (signal.aborted) return failure("The command was stopped before it started.");
    if (this.#running >= MAX_RUNNING) return failure("Too many commands are running on this computer. Try again.");
    this.#running += 1;
    try {
      return await this.#spawn(command, cwd, timeoutSeconds, signal);
    } finally {
      this.#running -= 1;
    }
  }

  #spawn(command: string, cwd: string, timeoutSeconds: number, signal: AbortSignal): Promise<CallToolResult> {
    const started = Date.now();
    const shell = this.#shell();
    const stdout = new Capture();
    const stderr = new Capture();
    let timedOut = false;
    let cancelled = false;
    return new Promise<CallToolResult>((done) => {
      let child: ReturnType<typeof spawn>;
      try {
        // `-l` makes it a login shell: the user's profile sets PATH, as in a Terminal window.
        child = spawn(shell, ["-l", "-c", command], {
          cwd,
          env: this.#childEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
          // Its own process group, so one signal ends the command and what it started.
          detached: true,
        });
      } catch (error) {
        done(failure(`The command could not start: ${error instanceof Error ? error.message : "unknown error"}`));
        return;
      }
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      child.stdout?.on("data", (chunk: Buffer) => stdout.add(stdoutDecoder.write(chunk)));
      child.stderr?.on("data", (chunk: Buffer) => stderr.add(stderrDecoder.write(chunk)));
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      const killGroup = (killSignal: NodeJS.Signals) => {
        const pid = child.pid;
        if (pid === undefined) return;
        try {
          process.kill(-pid, killSignal);
        } catch {
          // The group is already gone.
        }
      };
      const stop = () => {
        if (killTimer) return;
        killGroup("SIGTERM");
        killTimer = setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS);
        killTimer.unref?.();
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        stop();
      }, timeoutSeconds * 1000);
      const onAbort = () => {
        cancelled = true;
        stop();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      let finished = false;
      const finish = (exitCode: number | null, exitSignal: NodeJS.Signals | null, spawnError: Error | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        signal.removeEventListener("abort", onAbort);
        // A command that left a background child holding the pipes must not hold the answer.
        killGroup("SIGKILL");
        stdout.add(stdoutDecoder.end());
        stderr.add(stderrDecoder.end());
        if (spawnError) {
          done(failure(`The command could not start: ${spawnError.message}`));
          return;
        }
        const report = {
          exit_code: exitCode,
          signal: exitSignal,
          timed_out: timedOut,
          stopped: cancelled,
          cwd,
          duration_ms: Date.now() - started,
          stdout: stdout.text(),
          stderr: stderr.text(),
        };
        done({
          isError: timedOut || cancelled,
          content: [{ type: "text", text: JSON.stringify(report) }],
        });
      };
      child.once("error", (error) => finish(null, null, error));
      // `close` comes when the process ended and both pipes are read to their end.
      child.once("close", (code, exitSignal) => finish(code, exitSignal, null));
      child.once("exit", (code, exitSignal) => {
        // A command that left a background child holding the pipes never reaches `close`.
        setTimeout(() => finish(code, exitSignal, null), PIPE_GRACE_MS).unref?.();
      });
    });
  }

  async #read(input: DynamicRecord): Promise<CallToolResult> {
    const { path: requested, offset: requestedOffset, length: requestedLength } = input;
    if (typeof requested !== "string" || requested.length === 0) return failure("`path` must be a string.");
    const offset = requestedOffset ?? 0;
    const length = requestedLength ?? REMOTE_TERMINAL_CHUNK_BYTES;
    if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
      return failure("`offset` must be a whole number, 0 or more.");
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > REMOTE_TERMINAL_CHUNK_BYTES
    )
      return failure(`\`length\` must be a whole number from 1 to ${REMOTE_TERMINAL_CHUNK_BYTES}.`);
    let resolved: string;
    try {
      resolved = await realpath(this.#path(requested));
    } catch {
      return failure(`The file "${requested}" does not exist.`);
    }
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      // A named pipe or a device would block a thread of this app forever when opened, so only a
      // regular file is opened, and without waiting for a writer.
      if (!(await stat(resolved)).isFile()) return failure(`"${resolved}" is not a file.`);
      handle = await open(resolved, constants.O_RDONLY | constants.O_NONBLOCK);
      const info = await handle.stat();
      if (!info.isFile()) return failure(`"${resolved}" is not a file.`);
      if (info.size > REMOTE_TERMINAL_MAX_FILE_BYTES) return failure("The file is too large to copy.");
      const wanted = Math.max(0, Math.min(length, info.size - offset));
      const buffer = Buffer.alloc(wanted);
      let read = 0;
      while (read < wanted) {
        const { bytesRead } = await handle.read(buffer, read, wanted - read, offset + read);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      const report = {
        path: resolved,
        size: info.size,
        mtime_ms: Math.trunc(info.mtimeMs),
        offset,
        length: read,
        eof: offset + read >= info.size,
        data_base64: buffer.subarray(0, read).toString("base64"),
      };
      return { content: [{ type: "text", text: JSON.stringify(report) }] };
    } catch (error) {
      return failure(`The file could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  /** An absolute path from `~`, an absolute path, or a path in the home folder. */
  #path(value: string): string {
    const home = this.#home();
    if (value === "~") return home;
    if (value.startsWith("~/")) return join(home, value.slice(2));
    return isAbsolute(value) ? resolve(value) : resolve(home, value);
  }

  #shell(): string {
    const configured = this.#env().SHELL;
    if (configured && isAbsolute(configured) && existsSync(configured)) return configured;
    return this.#platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  }

  #childEnvironment(): NodeJS.ProcessEnv {
    const source = this.#env();
    const env: NodeJS.ProcessEnv = {};
    for (const name of BASE_ENV_NAMES) {
      const value = source[name];
      if (value !== undefined) env[name] = value;
    }
    env.HOME ??= this.#home();
    env.TERM = "dumb";
    if (this.#platform === "darwin") {
      // An app opened from Finder has a short PATH. The login shell usually extends it; this covers
      // a profile that does not set up Homebrew.
      const parts = (env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin").split(":");
      for (const fallback of MAC_PATH_FALLBACK) if (!parts.includes(fallback)) parts.push(fallback);
      env.PATH = parts.join(":");
    }
    return env;
  }
}

/** Keeps the start and the end of a stream, and counts what it dropped, so memory stays small. */
class Capture {
  #head = "";
  #tail = "";
  #total = 0;

  add(text: string): void {
    const clean = text.replace(CONTROL_CHARACTERS, "");
    if (clean.length === 0) return;
    this.#total += clean.length;
    let rest = clean;
    if (this.#head.length < HEAD_CHARS) {
      const room = HEAD_CHARS - this.#head.length;
      this.#head += rest.slice(0, room);
      rest = rest.slice(room);
    }
    if (rest.length > 0) this.#tail = (this.#tail + rest).slice(-TAIL_CHARS);
  }

  text(): string {
    const omitted = this.#total - this.#head.length - this.#tail.length;
    return omitted > 0
      ? `${this.#head}\n[... ${omitted} characters omitted ...]\n${this.#tail}`
      : this.#head + this.#tail;
  }
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * For the log: the tool and what it was asked to do. The caller redacts the result with `redactText`
 * first and cuts it after, so a key that straddles the cut is still hidden. Password flags and
 * variables that no pattern knows are masked here.
 */
export function describeTerminalCall(tool: string, input: unknown, redact: (text: string) => string): string {
  if (!isDynamicRecord(input)) return tool;
  if (tool === REMOTE_TERMINAL_RUN_TOOL && typeof input.command === "string")
    return cut(maskPasswords(redact(input.command)));
  if (typeof input.path === "string") return cut(redact(input.path));
  return tool;
}

function cut(text: string): string {
  return text.slice(0, 200);
}

function maskPasswords(text: string): string {
  return text
    .replace(/\b(\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY)\w*)=\S+/giu, "$1=[redacted]")
    .replace(/(--(?:password|passwd|token|secret)[= ]|sshpass\s+-p\s*|\s-u\s+[^\s:]+:|\s-p)\S+/giu, "$1[redacted]");
}
