import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNED_OUT_CHANNEL_MEMBER_ID } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { Effect, Semaphore } from "effect";
import { z } from "zod";
import { runCauseEffect } from "../effect-boundary";
import { type CodingCommandResult, CodingComputerFailed, type CodingComputerPort } from "./coding-computer";
import { CODING_JOB_RUNNER } from "./coding-job-runner";
import { REMOTE_CODING_BRIEF_HEADER } from "./remote-coding-task";

const stateSchema = z.object({
  taskId: z.string(),
  context: z.string(),
  repository: z.string(),
  task: z.string(),
  machine: z.string().optional(),
  accountScoped: z.boolean().optional(),
  creatorMemberId: z.string().min(1).optional(),
  deadline: z.number().optional(),
  phase: z.enum(["starting", "running", "paused", "stopped", "blocked", "completed"]),
});
type Job = z.infer<typeof stateSchema>;
const machineSchema = z.object({
  id: z.string().min(1),
  deadline_at: z.string().datetime({ offset: true }),
});
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

type JobAction = "resume" | "stop" | "pause";

interface ScopedRecovery {
  computerForMember(memberId: string): CodingComputerPort | undefined;
  originalBrief(agentId: string, taskId: string): { text: string; requesterIds: readonly string[] } | undefined;
}

function isAccountScoped(job: Job): boolean {
  return job.accountScoped === true || job.creatorMemberId !== undefined;
}

function resumeFailed() {
  return new CodingComputerFailed({ cause: new Error(sourceText("error.backend.codingJobResumeFailed")) });
}

export interface ScopedCodingComputer {
  memberId: string;
  port: CodingComputerPort;
}

/** Owns local job registration, serialized remote controls and deadline timers. No credentials persist here. */
export class CodingJobs {
  #owner: string | null = null;
  readonly #accounts = new Map<string, ScopedCodingComputer>();
  readonly #machineLock = Semaphore.makeUnsafe(1);
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    readonly computer: CodingComputerPort,
    readonly failed: (agentId: string, taskId: string) => void,
    readonly recovery?: ScopedRecovery,
  ) {}

  #folder(workspace: string) {
    return join(workspace, ".openbot", "coding-jobs");
  }
  #path(workspace: string, taskId: string) {
    return join(this.#folder(workspace), `${encodeURIComponent(taskId)}.json`);
  }
  #read(workspace: string, taskId: string) {
    try {
      const job = stateSchema.parse(JSON.parse(readFileSync(this.#path(workspace, taskId), "utf8")));
      if (job.taskId !== taskId) throw new Error("The coding job record does not match this task");
      return job;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }
  #save(workspace: string, job: Job) {
    mkdirSync(this.#folder(workspace), { recursive: true, mode: 0o700 });
    const path = this.#path(workspace, job.taskId);
    writeFileSync(`${path}.next`, JSON.stringify(job), { mode: 0o600 });
    renameSync(`${path}.next`, path);
  }
  #remote(job: Job) {
    return `openbot-coding-jobs/${encodeURIComponent(job.taskId)}`;
  }

  readonly start = Effect.fn("CodingJobs.start")(function* (
    this: CodingJobs,
    agentId: string,
    workspace: string,
    taskId: string,
    repository: string,
    task: string,
    context = "openbot-coding-jobs",
    account?: ScopedCodingComputer,
  ) {
    return yield* this.#machineLock.withPermit(
      Effect.gen({ self: this }, function* () {
        if (this.#owner && this.#owner !== taskId)
          return yield* Effect.fail(new CodingComputerFailed({ cause: "Another coding job owns Agent Computer" }));
        if (yield* this.#load(workspace, taskId)) return yield* resumeFailed();
        const job: Job = {
          taskId,
          repository,
          task,
          context,
          phase: "starting",
          ...(account ? { accountScoped: true, creatorMemberId: account.memberId } : {}),
        };
        yield* this.#write(workspace, job);
        const started = yield* this.#apply(agentId, workspace, job, "resume", account?.port ?? this.computer, false);
        if (account && (started.phase === "running" || started.phase === "blocked"))
          this.#accounts.set(taskId, account);
        return started;
      }),
    );
  });

  readonly control = Effect.fn("CodingJobs.control")(function* (
    this: CodingJobs,
    agentId: string,
    workspace: string,
    taskId: string,
    action: JobAction,
  ) {
    return yield* this.#machineLock.withPermit(
      Effect.gen({ self: this }, function* () {
        const job = yield* this.#load(workspace, taskId);
        if (!job || job.phase === "completed" || job.phase === "stopped") return job;
        const computer = yield* this.#computerFor(job);
        return yield* this.#apply(agentId, workspace, job, action, computer, false);
      }),
    );
  });

  #load(workspace: string, taskId: string) {
    return Effect.try({
      try: () => this.#read(workspace, taskId),
      catch: (cause) => new CodingComputerFailed({ cause }),
    });
  }

  #write(workspace: string, job: Job) {
    return Effect.try({
      try: () => this.#save(workspace, job),
      catch: (cause) => new CodingComputerFailed({ cause }),
    });
  }

  readonly #apply = Effect.fn("CodingJobs.apply")(function* (
    this: CodingJobs,
    agentId: string,
    workspace: string,
    job: Job,
    action: JobAction,
    computer: CodingComputerPort,
    requireCheckpoint: boolean,
  ) {
    const { taskId } = job;
    if (this.#owner && this.#owner !== taskId)
      return yield* Effect.fail(new CodingComputerFailed({ cause: "Another coding job owns Agent Computer" }));
    clearTimeout(this.#timers.get(taskId));
    this.#timers.delete(taskId);
    const started = yield* computer.start(job.context);
    const machine = machineSchema.safeParse(started).data;
    if (!machine)
      return yield* Effect.fail(
        new CodingComputerFailed({ cause: "Agent Computer returned no validated machine deadline" }),
      );
    if (requireCheckpoint && job.machine && machine.id !== job.machine) return yield* resumeFailed();
    job.machine = machine.id;
    job.deadline = Date.parse(machine.deadline_at) - 60_000;
    yield* this.#write(workspace, job);
    const directory = this.#remote(job);
    const branch = `coding/${job.taskId}`;
    const payload = Buffer.from(
      JSON.stringify({
        repository: job.repository,
        task: job.task,
        branch,
        deadline: job.deadline,
      }),
    ).toString("base64");
    const runner = Buffer.from(CODING_JOB_RUNNER).toString("base64");
    const expected =
      action === "resume"
        ? ["running", "completed", "blocked", "stopped"]
        : [action === "stop" ? "stopped" : "paused", "completed", "blocked"];
    const probe = `const fs=require('fs');const end=Date.now()+15000;const t=setInterval(()=>{if(fs.existsSync('checkpoint.json')){const s=JSON.parse(fs.readFileSync('checkpoint.json'));if(${JSON.stringify(expected)}.includes(s.phase)){clearInterval(t);process.stdout.write('OPENBOT_CODING_CHECKPOINT='+JSON.stringify(s)+'\\n');return}}if(Date.now()>end)process.exit(1)},100)`;
    const validateCheckpoint = `const s=JSON.parse(require('fs').readFileSync('checkpoint.json','utf8'));if(s.repository!==${JSON.stringify(job.repository)}||s.branch!==${JSON.stringify(branch)}||!${JSON.stringify(stateSchema.shape.phase.options)}.includes(s.phase))process.exit(1)`;
    const prepare = requireCheckpoint
      ? `cd ${shellQuote(directory)} && test -s checkpoint.json && node -e ${shellQuote(validateCheckpoint)}`
      : `mkdir -p ${shellQuote(directory)} && cd ${shellQuote(directory)}`;
    const command =
      action === "resume"
        ? `${prepare} && printf %s ${shellQuote(payload)} | base64 -d > job.json && printf %s ${shellQuote(runner)} | base64 -d > runner.cjs && printf %s ${shellQuote(JSON.stringify({ action, deadline: job.deadline }))} > control.next && mv control.next control.json && (nohup node runner.cjs >> runner.log 2>&1 < /dev/null &) && node -e ${shellQuote(probe)}`
        : `cd ${shellQuote(directory)} && printf %s ${shellQuote(JSON.stringify({ action }))} > control.next && mv control.next control.json && node -e ${shellQuote(probe)}`;
    const response = yield* computer.bash(machine.id, command, 20);
    const checkpoint = readCheckpoint(response);
    if (!checkpoint || !expected.includes(checkpoint.phase))
      return yield* Effect.fail(new CodingComputerFailed({ cause: "Remote checkpoint was not confirmed" }));
    job.phase = action === "resume" ? "running" : action === "stop" ? "stopped" : "paused";
    if (checkpoint.phase === "completed" || checkpoint.phase === "blocked" || checkpoint.phase === "stopped")
      job.phase = checkpoint.phase;
    if (action !== "resume" || job.phase !== "running") yield* computer.stop(machine.id);
    yield* this.#write(workspace, job);
    if (job.phase === "completed" || job.phase === "stopped" || job.phase === "blocked") {
      this.#owner = null;
      if (job.phase !== "blocked") this.#accounts.delete(taskId);
    } else {
      this.#owner = taskId;
    }
    if (action === "resume" && job.phase === "running") {
      this.#schedule(agentId, workspace, job);
    }
    return { ...job };
  });

  #computerFor(job: Job): Effect.Effect<CodingComputerPort, CodingComputerFailed> {
    if (!isAccountScoped(job) && !this.#accounts.has(job.taskId)) return Effect.succeed(this.computer);
    const account = this.#accounts.get(job.taskId);
    return account
      ? Effect.succeed(account.port)
      : Effect.fail(new CodingComputerFailed({ cause: "The coding job account is no longer authorized on this host" }));
  }

  #schedule(agentId: string, workspace: string, job: Job) {
    this.#timers.set(
      job.taskId,
      setTimeout(
        () => {
          this.#timers.delete(job.taskId);
          void runCauseEffect(this.#tick(agentId, workspace, job.taskId)).catch(() => {
            if (this.#accounts.delete(job.taskId) && this.#owner === job.taskId) this.#owner = null;
            this.failed(agentId, job.taskId);
          });
        },
        Math.max(0, Math.min(10_000, (job.deadline ?? Date.now()) - Date.now())),
      ),
    );
  }

  readonly #tick = Effect.fn("CodingJobs.tick")(function* (
    this: CodingJobs,
    agentId: string,
    workspace: string,
    taskId: string,
  ) {
    const job = yield* this.#load(workspace, taskId);
    if (job?.phase !== "running" || !job.machine) return;
    if (Date.now() >= (job.deadline ?? 0)) {
      yield* this.control(agentId, workspace, taskId, "pause");
      return;
    }
    const command = `cd ${shellQuote(this.#remote(job))} && node -e ${shellQuote("process.stdout.write('OPENBOT_CODING_CHECKPOINT='+require('fs').readFileSync('checkpoint.json','utf8')+'\\n')")}`;
    const computer = yield* this.#computerFor(job);
    const response = yield* computer.bash(job.machine, command, 10);
    const checkpoint = readCheckpoint(response);
    if (!checkpoint) return yield* Effect.fail(new CodingComputerFailed({ cause: "Remote checkpoint unavailable" }));
    if (["completed", "blocked", "paused", "stopped"].includes(checkpoint.phase)) {
      yield* this.control(agentId, workspace, taskId, "pause");
      return;
    }
    this.#schedule(agentId, workspace, job);
  });

  #scopedCreator(agentId: string, job: Job): string | null | undefined {
    const account = this.#accounts.get(job.taskId);
    if (!isAccountScoped(job) && !account) return undefined;
    if (job.creatorMemberId) return job.creatorMemberId;
    if (account) return account.memberId;
    const brief = this.recovery?.originalBrief(agentId, job.taskId);
    const [memberId] = brief?.requesterIds ?? [];
    return brief?.text.startsWith(REMOTE_CODING_BRIEF_HEADER) &&
      brief.requesterIds.length === 1 &&
      memberId &&
      memberId !== SIGNED_OUT_CHANNEL_MEMBER_ID
      ? memberId
      : null;
  }

  #hasCodingBrief(agentId: string, taskId: string): boolean {
    return this.recovery?.originalBrief(agentId, taskId)?.text.startsWith(REMOTE_CODING_BRIEF_HEADER) === true;
  }

  /** Null means a coding task has no verified account. Undefined permits the normal tool routing. */
  scopedCreator(agentId: string, workspace: string, taskId: string): string | null | undefined {
    try {
      const job = this.#read(workspace, taskId);
      if (!job) return this.#hasCodingBrief(agentId, taskId) ? null : undefined;
      return this.#scopedCreator(agentId, job);
    } catch {
      return null;
    }
  }

  readonly resumePaused = Effect.fn("CodingJobs.resumePaused")(function* (
    this: CodingJobs,
    agentId: string,
    workspace: string,
    taskId: string,
    memberId?: string,
  ) {
    // A normal task message can proceed while a different job starts a machine.
    if (!(yield* this.#load(workspace, taskId))) {
      if (this.#hasCodingBrief(agentId, taskId)) return yield* resumeFailed();
      return null;
    }
    return yield* this.#machineLock.withPermit(
      Effect.gen({ self: this }, function* () {
        const job = yield* this.#load(workspace, taskId);
        if (!job) return yield* resumeFailed();
        const creator = this.#scopedCreator(agentId, job);
        if (creator !== undefined && (!creator || creator !== memberId)) return yield* resumeFailed();
        const interrupted = creator !== undefined && job.phase === "running" && !this.#accounts.has(taskId);
        if (!interrupted && job.phase !== "paused" && job.phase !== "blocked" && job.phase !== "starting") return job;
        if (!creator) return yield* this.#apply(agentId, workspace, job, "resume", this.computer, false);
        const port = yield* Effect.try({
          try: () => this.recovery?.computerForMember(creator),
          catch: resumeFailed,
        });
        if (!port) return yield* resumeFailed();
        job.creatorMemberId = creator;
        // A saved machine means a previous launch could have reached the runner.
        const requireCheckpoint = job.phase !== "starting" || job.machine !== undefined;
        const resumed = yield* this.#apply(agentId, workspace, job, "resume", port, requireCheckpoint).pipe(
          Effect.mapError(() => resumeFailed()),
        );
        if (resumed.phase === "running" || resumed.phase === "blocked")
          this.#accounts.set(taskId, { memberId: creator, port });
        return resumed;
      }),
    );
  });

  readonly recover = Effect.fn("CodingJobs.recover")(function* (
    this: CodingJobs,
    agents: readonly { id: string; workspacePath: string }[],
  ) {
    for (const agent of agents) {
      const jobs = yield* Effect.try({
        try: () => {
          try {
            return readdirSync(this.#folder(agent.workspacePath))
              .filter((name) => name.endsWith(".json"))
              .map((name) =>
                stateSchema.parse(JSON.parse(readFileSync(join(this.#folder(agent.workspacePath), name), "utf8"))),
              );
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
            throw error;
          }
        },
        catch: (cause) => new CodingComputerFailed({ cause }),
      });
      for (const job of jobs) {
        if (isAccountScoped(job)) {
          if (job.phase === "running" || job.phase === "starting") this.failed(agent.id, job.taskId);
          continue;
        }
        if (job.phase === "paused") {
          if (!this.#owner) this.#owner = job.taskId;
          continue;
        }
        if (job.phase !== "running" && job.phase !== "starting") continue;
        // Recovery checkpoints first. It never launches a replacement CLI after a host crash.
        yield* this.control(agent.id, agent.workspacePath, job.taskId, "pause").pipe(
          Effect.catch(() => Effect.sync(() => this.failed(agent.id, job.taskId))),
        );
      }
    }
  });

  dispose() {
    this.#owner = null;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#accounts.clear();
  }
}

function readCheckpoint(response: CodingCommandResult) {
  for (const line of response.stdout.split("\n"))
    if (line.startsWith("OPENBOT_CODING_CHECKPOINT=")) {
      try {
        return z.object({ phase: z.string() }).parse(JSON.parse(line.slice("OPENBOT_CODING_CHECKPOINT=".length)));
      } catch {
        return null;
      }
    }
  return null;
}
