// The built-in Agent Computer tools: every agent can start a cloud Ubuntu desktop, run commands on it,
// look at it, pull a file into its workspace, publish a file, pause it, and delete it. They call the
// REST API with the key of this OpenBot server, so no MCP server or Composio connection is needed.

import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets } from "@openbot/logging";
import { Effect } from "effect";
import { z } from "zod";
import type { DynamicToolResult } from "../protocol";
import {
  AGENT_COMPUTER_BASH_TIMEOUT_MAX,
  AGENT_COMPUTER_CONTEXT_PATTERN,
  AGENT_COMPUTER_SIZES,
  type AgentComputerApi,
  type AgentComputerFailed,
} from "./agent-computer-api";

const machineId = z.string().trim().min(1).max(200).describe("Id from computer_start or computer_list.");
const remotePath = z.string().trim().min(1).max(4_096).describe("Absolute path on the machine.");

const startSchema = z.strictObject({
  context: z
    .string()
    .trim()
    .regex(AGENT_COMPUTER_CONTEXT_PATTERN)
    .describe(
      "Machine label: a-z, 0-9 and -, up to 32. The same label resumes that machine with its files and logins; a new label makes a new machine. Labels are in other_contexts and computer_list.",
    ),
  size: z
    .enum(AGENT_COMPUTER_SIZES)
    .optional()
    .describe(
      'Only for a new machine. "standard" (default): 2 vCPU. "large": 8 vCPU for renders and video; it uses 2.5 runtime minutes per minute. For another size, use a new context.',
    ),
});
const bashSchema = z.strictObject({
  id: machineId,
  cmd: z.string().min(1).max(100_000).describe("Runs in bash -lc."),
  timeout_s: z
    .number()
    .int()
    .min(1)
    .max(AGENT_COMPUTER_BASH_TIMEOUT_MAX)
    .optional()
    .describe(
      `Seconds to wait, 1-${AGENT_COMPUTER_BASH_TIMEOUT_MAX}, default 120. For longer jobs use nohup … & and poll.`,
    ),
  cwd: z.string().trim().min(1).max(4_096).optional().describe("Default /home/user."),
});
const idSchema = z.strictObject({ id: machineId });
const getFileSchema = z.strictObject({
  id: machineId,
  path: remotePath,
  saveAs: z
    .string()
    .trim()
    .min(1)
    .max(1_024)
    .optional()
    .describe("Path in your workspace. Default computer-files/<file name>."),
});
const publishSchema = z.strictObject({
  id: machineId,
  path: remotePath,
  filename: z.string().trim().min(1).max(255).optional().describe("Download name. Default: the file name."),
});

const MACHINE_RULES =
  "A cloud computer is the user's Ubuntu desktop with passwordless sudo; change anything on it. At deadline_at it pauses with everything kept: publish results before then, and computer_start the same context to go on. Runtime is billed to the user.";

export const AGENT_COMPUTER_TOOL_DEFINITIONS = [
  {
    name: "computer_list",
    description: "List this server's cloud computers: id, context, size, status, deadline_at, updated_at. Read-only.",
    shape: {},
  },
  {
    name: "computer_start",
    description: `Start or resume the cloud computer of a context; returns its id. ${MACHINE_RULES} The chat shows the user a live view button; live view and billing links are not for you. Work in visible windows ($DISPLAY is set). Read ~/PLAYBOOK.md before a big task. briefing has more rules.`,
    shape: startSchema.shape,
  },
  {
    name: "computer_bash",
    description:
      "Run a shell command on a running cloud computer and wait: stdout, stderr, exit_code, timed_out. After MACHINE_PAUSED, computer_start the same context and run it again.",
    shape: bashSchema.shape,
  },
  {
    name: "computer_screenshot",
    description: "See a running cloud computer's desktop as an image. Only you see it.",
    shape: idSchema.shape,
  },
  {
    name: "computer_get_file",
    description:
      "Copy one file (up to 1 MiB) from a cloud computer into your workspace; returns its path and the text of a small text file. Attach it with attach_files_to_response. For larger files, use computer_publish.",
    shape: getFileSchema.shape,
  },
  {
    name: "computer_publish",
    description:
      "Upload a file from a cloud computer and get a download link that expires at expires_at. Use it for large results, such as videos.",
    shape: publishSchema.shape,
  },
  {
    name: "computer_stop",
    description:
      "Pause a cloud computer when work is done or waits for the user. It keeps everything and stops billing; computer_start the same context resumes it.",
    shape: idSchema.shape,
  },
  {
    name: "computer_destroy",
    description:
      "Delete a cloud computer with all its files and logins; it cannot be undone. Only when the user asks; to end work, use computer_stop. The user approves it.",
    shape: idSchema.shape,
  },
] as const;

export type AgentComputerToolName = (typeof AGENT_COMPUTER_TOOL_DEFINITIONS)[number]["name"];

const TOOL_NAMES: ReadonlySet<string> = new Set(AGENT_COMPUTER_TOOL_DEFINITIONS.map(({ name }) => name));

export function isAgentComputerTool(tool: string): tool is AgentComputerToolName {
  return TOOL_NAMES.has(tool);
}

export interface AgentComputerToolRequest {
  tool: AgentComputerToolName;
  arguments: unknown;
  /** The calling agent's workspace, where `computer_get_file` saves. */
  workspacePath: string;
  accountScoped?: boolean;
  idempotencyKey?: string;
  /** Asks the user to approve a change, with `reason` as the question. True when approved. */
  approve: (reason: string) => Effect.Effect<boolean>;
  /**
   * Called after `computer_start` started or resumed a machine, with its id only. The router posts the
   * chat card whose button reads the live view link on the person's own client.
   */
  onStarted?: ((machineId: string) => void) | undefined;
}

/** A small text file comes back as text too, so the agent need not read it again. */
const TEXT_PREVIEW_LIMIT = 64 * 1024;

/**
 * Runs one tool. A failure of the API, bad arguments and a refused approval are all results that
 * the agent reads and corrects; nothing here throws for them.
 */
export const handleAgentComputerTool = Effect.fn("AgentComputerTools.handle")(function* (
  api: AgentComputerApi,
  request: AgentComputerToolRequest,
) {
  const outcome: Effect.Effect<DynamicToolResult, AgentComputerFailed | z.ZodError | Error> = Effect.gen(function* () {
    switch (request.tool) {
      case "computer_list": {
        const machines = yield* api.list();
        const allowance = request.accountScoped ? yield* api.allowance() : undefined;
        return textResult({
          ...(allowance ? { allowance } : {}),
          machines: machines.map(({ id, context, size, status, deadline_at, updated_at }) => ({
            id,
            context,
            size: size ?? "standard",
            status,
            deadline_at,
            updated_at,
          })),
        });
      }
      case "computer_start": {
        const input = yield* parse(startSchema, request.arguments);
        const started = yield* api.start(input.context, input.size, { idempotencyKey: request.idempotencyKey });
        // The machine runs already: a chat card that cannot be posted must not hide its id from the agent.
        yield* Effect.try(() => request.onStarted?.(started.id)).pipe(Effect.ignore);
        return textResult({
          id: started.id,
          context: started.context,
          size: started.size ?? "standard",
          size_note: started.size_note,
          existing: started.existing,
          resumed: started.resumed,
          other_contexts: started.other_contexts,
          deadline_at: started.deadline_at,
          billing: started.billing && {
            plan: started.billing.plan,
            minutes_remaining: started.billing.minutes_remaining,
            seconds_remaining: started.billing.seconds_remaining,
            resets_at: started.billing.resets_at,
            rate: started.billing.rate,
          },
          briefing: started.briefing?.filter((line) => !/live_view_url|billing\.(?:upgrade|manage)_url/u.test(line)),
        });
      }
      case "computer_bash": {
        const input = yield* parse(bashSchema, request.arguments);
        const output = yield* api.bash(input.id, input);
        const stdout = keepEnd(output.stdout);
        const stderr = keepEnd(output.stderr);
        return textResult({
          ...output,
          stdout: stdout.text,
          stderr: stderr.text,
          ...(stdout.cut || stderr.cut ? { truncated: true } : {}),
        });
      }
      case "computer_screenshot": {
        const input = yield* parse(idSchema, request.arguments);
        const image = yield* api.screenshot(input.id);
        return {
          success: true,
          contentItems: [
            { type: "inputText", text: JSON.stringify({ id: input.id, bytes: image.bytes.length }) },
            { type: "inputImage", imageUrl: `data:${image.mimeType};base64,${image.bytes.toString("base64")}` },
          ],
        };
      }
      case "computer_get_file": {
        const input = yield* parse(getFileSchema, request.arguments);
        const file = yield* api.file(input.id, input.path);
        const target = yield* Effect.try({
          try: () =>
            workspaceTarget(request.workspacePath, input.saveAs ?? join("computer-files", basename(input.path))),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        });
        const saved = yield* Effect.tryPromise({
          try: () => saveWorkspaceFile(request.workspacePath, target, file.bytes, input.saveAs === undefined),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        });
        const text = textPreview(file.bytes, file.mimeType);
        const result = {
          path: saved,
          bytes: file.bytes.length,
          mimeType: file.mimeType,
          ...(text === null ? {} : { text }),
        };
        if (!file.mimeType.startsWith("image/")) return textResult(result);
        return {
          success: true,
          contentItems: [
            { type: "inputText", text: JSON.stringify(result) },
            { type: "inputImage", imageUrl: `data:${file.mimeType};base64,${file.bytes.toString("base64")}` },
          ],
        };
      }
      case "computer_publish": {
        const input = yield* parse(publishSchema, request.arguments);
        return textResult(yield* api.publish(input.id, input.path, input.filename));
      }
      case "computer_stop": {
        const input = yield* parse(idSchema, request.arguments);
        return textResult(yield* api.stop(input.id));
      }
      case "computer_destroy": {
        const input = yield* parse(idSchema, request.arguments);
        const approved = yield* request.approve(
          sourceText("status.agent.agentComputerDestroyApproval", { id: input.id }),
        );
        if (!approved) return failure(sourceText("error.agent.agentComputerDestroyDeclined"));
        return textResult(yield* api.destroy(input.id));
      }
    }
  });
  return yield* outcome.pipe(
    Effect.catch((error) =>
      Effect.succeed(
        error instanceof z.ZodError
          ? failure(z.prettifyError(error))
          : "_tag" in error && error._tag === "AgentComputerFailed"
            ? failure(`${error.code}: ${error.message}`, error.code)
            : failure(error.message),
      ),
    ),
  );
});

function parse<T extends z.ZodType>(schema: T, value: unknown): Effect.Effect<z.infer<T>, z.ZodError> {
  const parsed = schema.safeParse(value ?? {});
  return parsed.success ? Effect.succeed(parsed.data) : Effect.fail(parsed.error);
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: redactSecrets(JSON.stringify(value)) }] };
}

function failure(message: string, code?: string): DynamicToolResult {
  return {
    success: false,
    contentItems: [
      { type: "inputText", text: JSON.stringify({ error: redactSecrets(message), ...(code ? { code } : {}) }) },
    ],
  };
}

/** A path inside the workspace. A path that leaves it is refused. */
function workspaceTarget(workspace: string, path: string): string {
  const root = resolve(workspace);
  const target = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const inside = relative(root, target);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error(sourceText("error.agent.agentComputerPathOutside"));
  return target;
}

function textPreview(bytes: Buffer, mimeType: string): string | null {
  if (bytes.length > TEXT_PREVIEW_LIMIT || mimeType.startsWith("image/") || bytes.includes(0)) return null;
  const text = bytes.toString("utf8");
  return text.includes("�") ? null : text;
}

/** The most of stdout or stderr that one result carries. The end of a log says the most. */
const OUTPUT_LIMIT = 64 * 1024;

function keepEnd(text: string): { text: string; cut: boolean } {
  return text.length > OUTPUT_LIMIT ? { text: text.slice(-OUTPUT_LIMIT), cut: true } : { text, cut: false };
}

/** `name.ext`, then `name (2).ext`, `name (3).ext`: a file that is already there is never overwritten. */
function numberedName(name: string, attempt: number): string {
  if (attempt === 1) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${attempt})${name.slice(dot)}` : `${name} (${attempt})`;
}

/**
 * Refuse symlink ancestors and create a fresh file, so a linked or existing file cannot be overwritten.
 * When the default name is taken, the file gets the next free number; a name the agent chose that is
 * taken is refused. Returns the saved path.
 */
async function saveWorkspaceFile(workspace: string, target: string, bytes: Buffer, numbered: boolean): Promise<string> {
  const root = await realpath(workspace);
  const parts = relative(resolve(workspace), target).split(sep);
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    await mkdir(parent).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(parent)) !== parent)
      throw new Error(sourceText("error.agent.agentComputerPathOutside"));
  }
  const name = parts.at(-1) ?? "";
  for (let attempt = 1; attempt <= 100; attempt++) {
    const destination = join(parent, numberedName(name, attempt));
    const file = await open(
      destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST" && numbered) return null;
      throw error;
    });
    if (!file) continue;
    try {
      if ((await realpath(parent)) !== parent) throw new Error(sourceText("error.agent.agentComputerPathOutside"));
      await file.writeFile(bytes);
    } finally {
      await file.close();
    }
    return destination;
  }
  throw new Error(sourceText("error.agent.agentComputerFileExists"));
}
