// Runs the actual controller, remote shell commands and supervisor against a local machine fixture.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import { CodingComputerFailed, type CodingComputerPort } from "../src/backend/agent-tasks/coding-computer";
import { CodingJobs } from "../src/backend/agent-tasks/coding-jobs";
import { remoteCodingBrief } from "../src/backend/agent-tasks/remote-coding-task";

const root = await mkdtemp(join(tmpdir(), "coding-controller-"));
const bin = join(root, "bin");
await mkdir(bin);
const cli = `#!/bin/sh\nif [ "$1" = login ]; then exit 0; fi\nexec node -e 'console.log(JSON.stringify({type:"thread.started",thread_id:"fixture-session"}));setInterval(()=>{},1000);process.on("SIGTERM",()=>process.exit(0))'\n`;
const git = '#!/bin/sh\ncase "$1" in clone) mkdir repo;; -C) mkdir worktree;; diff) printf "fixture diff";; esac\n';
for (const [name, value] of Object.entries({ codex: cli, gh: "#!/bin/sh\nexit 0\n", git })) {
  await writeFile(join(bin, name), value);
  await chmod(join(bin, name), 0o700);
}
const exec = promisify(execFile);
const operations: string[] = [];
let failures = 0;
let refuseStop = false;
let machineId = "fixture";
const starts: Array<{ credential: string; context: string }> = [];
function fixturePort(credential: string): CodingComputerPort {
  return {
    start: (context) => {
      operations.push("START");
      starts.push({ credential, context });
      return Effect.succeed({
        id: machineId,
        deadline_at: new Date(Date.now() + 120_000).toISOString(),
        live_view_url: "https://example.invalid/live",
      });
    },
    stop: () => {
      operations.push("STOP");
      return Effect.void;
    },
    bash: (_id, cmd) => {
      operations.push("BASH");
      if (refuseStop && cmd.includes('"action":"stop"'))
        return Effect.fail(new CodingComputerFailed({ cause: "fixture refusal" }));
      return Effect.tryPromise({
        try: async () => {
          const output = await exec("bash", ["-c", cmd], {
            cwd: root,
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
            timeout: 25_000,
          });
          return { stdout: output.stdout, stderr: output.stderr };
        },
        catch: (cause) => new CodingComputerFailed({ cause }),
      });
    },
  };
}
const port = fixturePort("host");
const jobs = new CodingJobs(port, () => failures++);
const workspace = join(root, "workspace");
const checkpointPath = join(root, "openbot-coding-jobs", "job1", "checkpoint.json");
const checkpoint = async () => JSON.parse(await readFile(checkpointPath, "utf8"));
let pid: number | undefined;
try {
  const started = await Effect.runPromise(jobs.start("agent", workspace, "job1", "example/project", "Fixture task"));
  assert.equal(started?.phase, "running");
  pid = (await checkpoint()).pid;
  assert.ok(pid);
  const conflicting = await Effect.runPromise(
    jobs.start("agent", workspace, "job2", "example/other", "Other").pipe(Effect.result),
  );
  assert.equal(conflicting._tag, "Failure");
  await Effect.runPromise(jobs.control("agent", workspace, "job1", "pause"));
  assert.equal((await checkpoint()).phase, "paused");
  assert.equal(operations.at(-1), "STOP");
  jobs.dispose();
  const recovered = new CodingJobs(port, () => failures++);
  await Effect.runPromise(recovered.recover([{ id: "agent", workspacePath: workspace }]));
  await Effect.runPromise(recovered.resumePaused("agent", workspace, "job1"));
  assert.equal((await checkpoint()).pid, pid);
  refuseStop = true;
  const stops = operations.filter((name) => name.endsWith("STOP")).length;
  const refused = await Effect.runPromise(recovered.control("agent", workspace, "job1", "stop").pipe(Effect.result));
  assert.equal(refused._tag, "Failure");
  assert.equal(operations.filter((name) => name.endsWith("STOP")).length, stops);
  assert.equal(JSON.parse(await readFile(join(workspace, ".openbot/coding-jobs/job1.json"), "utf8")).phase, "running");
  refuseStop = false;
  await Effect.runPromise(recovered.control("agent", workspace, "job1", "stop"));
  assert.equal((await checkpoint()).phase, "stopped");
  assert.throws(() => process.kill(pid ?? 0, 0));
  pid = undefined;
  recovered.dispose();
  assert.equal(failures, 0);

  const legacyPort: CodingComputerPort = {
    start: () => Effect.die("A scoped job used the host key"),
    bash: () => Effect.die("A scoped job used the host key"),
    stop: () => Effect.die("A scoped job used the host key"),
  };
  let credentialsIssued = 0;
  let credentialAvailable = true;
  let originalRequesters: readonly string[] = [];
  const owner = "account-member";
  const taskId = "job-scoped";
  const context = "original-account-context";
  const registrationPath = join(workspace, ".openbot", "coding-jobs", `${taskId}.json`);
  const remote = join(root, "openbot-coding-jobs", taskId);
  const readRegistration = async () => JSON.parse(await readFile(registrationPath, "utf8"));
  const readCheckpoint = async () => JSON.parse(await readFile(join(remote, "checkpoint.json"), "utf8"));
  const recovery = {
    computerForMember: (memberId: string) => {
      assert.equal(memberId, owner);
      credentialsIssued += 1;
      return credentialAvailable ? fixturePort(`restored-${credentialsIssued}`) : undefined;
    },
    originalBrief: (_agentId: string, id: string) =>
      id === taskId
        ? { text: remoteCodingBrief("example/project", "Fixture task", context), requesterIds: originalRequesters }
        : undefined,
  };
  const scoped = new CodingJobs(legacyPort, () => failures++, recovery);
  const restarted = new CodingJobs(legacyPort, () => failures++, recovery);
  const legacy = new CodingJobs(legacyPort, () => failures++, recovery);
  const resumeWith = (controller: CodingJobs, memberId?: string) =>
    Effect.runPromise(controller.resumePaused("agent", workspace, taskId, memberId));
  try {
    await Effect.runPromise(
      scoped.start("agent", workspace, taskId, "example/project", "Fixture task", context, {
        memberId: owner,
        port: fixturePort("original"),
      }),
    );
    assert.equal((await readRegistration()).creatorMemberId, owner);
    assert.equal((await readRegistration()).accountScoped, true);
    assert.equal(Object.hasOwn(await readRegistration(), "port"), false);
    const running = await readCheckpoint();
    assert.ok(running.pid);
    pid = running.pid;
    await Effect.runPromise(scoped.control("agent", workspace, taskId, "pause"));
    scoped.dispose();

    const agents = [{ id: "agent", workspacePath: workspace }];
    const before = operations.length;
    await Effect.runPromise(restarted.recover(agents));
    await assert.rejects(resumeWith(restarted, "other-member"));
    await assert.rejects(resumeWith(restarted));
    assert.equal(restarted.scopedCreator("agent", workspace, taskId), owner);
    assert.equal(credentialsIssued, 0);
    assert.equal(operations.length, before);
    credentialAvailable = false;
    await assert.rejects(resumeWith(restarted, owner));
    assert.equal(operations.length, before);
    credentialAvailable = true;
    machineId = "replacement";
    await assert.rejects(resumeWith(restarted, owner));
    assert.deepEqual(operations.slice(before), ["START"]);
    assert.equal((await readRegistration()).machine, "fixture");
    assert.equal((await readCheckpoint()).phase, "paused");
    machineId = "fixture";
    const continuations = await Promise.all([resumeWith(restarted, owner), resumeWith(restarted, owner)]);
    assert.deepEqual(
      continuations.map((job) => job?.phase),
      ["running", "running"],
    );
    assert.equal(credentialsIssued, 3);
    assert.deepEqual(starts.at(-1), { context, credential: "restored-3" });
    assert.deepEqual(operations.slice(before), ["START", "START", "BASH"]);
    const resumed = await readCheckpoint();
    assert.equal(resumed.pid, running.pid);
    assert.equal(resumed.identity, running.identity);
    assert.equal(resumed.worktree, running.worktree);
    assert.equal(resumed.branch, running.branch);
    assert.equal(resumed.sessionId, "fixture-session");

    await Effect.runPromise(restarted.control("agent", workspace, taskId, "pause"));
    restarted.dispose();
    const { creatorMemberId: _, ...oldRegistration } = await readRegistration();
    // The remote supervisor paused while the host was stopped. Its local phase is stale.
    await writeFile(registrationPath, JSON.stringify({ ...oldRegistration, phase: "running" }));
    await Effect.runPromise(legacy.recover(agents));
    assert.equal(failures, 1);
    const beforeLegacy = operations.length;
    for (const requesters of [[], ["local"], [owner, "other-member"], ["other-member"]]) {
      originalRequesters = requesters;
      await assert.rejects(resumeWith(legacy, owner));
    }
    assert.equal(operations.length, beforeLegacy);
    originalRequesters = [owner];
    assert.equal((await resumeWith(legacy, owner))?.phase, "running");
    assert.equal((await readRegistration()).creatorMemberId, owner);
    assert.equal((await readCheckpoint()).pid, running.pid);
    await Effect.runPromise(legacy.control("agent", workspace, taskId, "stop"));
    pid = undefined;

    await assert.rejects(
      Effect.runPromise(restarted.resumePaused("agent", join(root, "no-registration"), taskId, owner)),
    );
    assert.equal(restarted.scopedCreator("agent", join(root, "no-registration"), taskId), null);
    assert.equal(await Effect.runPromise(restarted.resumePaused("agent", workspace, "ordinary-task", owner)), null);

    const stopped = await readFile(join(remote, "checkpoint.json"), "utf8");
    await rename(join(remote, "checkpoint.json"), join(remote, "checkpoint.saved"));
    await writeFile(registrationPath, JSON.stringify({ ...oldRegistration, creatorMemberId: owner }));
    await assert.rejects(resumeWith(restarted, owner));
    await assert.rejects(readCheckpoint(), { code: "ENOENT" });
    assert.equal(await readFile(join(remote, "checkpoint.saved"), "utf8"), stopped);
    const unrelated = JSON.stringify({ ...JSON.parse(stopped), branch: "coding/different-task" });
    await writeFile(join(remote, "checkpoint.json"), unrelated);
    await assert.rejects(resumeWith(restarted, owner));
    assert.equal(await readFile(join(remote, "checkpoint.json"), "utf8"), unrelated);
  } finally {
    scoped.dispose();
    restarted.dispose();
    legacy.dispose();
  }
  const out = resolve(import.meta.dirname, "../.openbot-build/coding-jobs-controller-smoke");
  await mkdir(out, { recursive: true });
  const report = {
    passed: true,
    operations,
    checks: [
      "native launch",
      "single machine ownership",
      "verified pause before machine Stop",
      "persisted recovery",
      "same PID resume",
      "native Stop confirmation",
      "refused Stop never reports stopped or pauses the machine",
      "the creator resumes with a fresh scoped port on the original context after restart",
      "two concurrent retries perform one remote resume",
      "the resumed checkpoint keeps the PID, process identity, session, worktree and branch",
      "another member, a signed-out sender and an unavailable credential cannot resume",
      "a legacy record needs one original requester and saves that creator after recovery",
      "a replacement machine, missing registration, and missing or mismatched checkpoints cannot launch a replacement CLI",
    ],
    liveRemoteExecution: false,
  };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  jobs.dispose();
  if (pid) {
    try {
      process.kill(-pid, "SIGCONT");
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
}
