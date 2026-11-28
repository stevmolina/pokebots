import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const { SystemRoot } = process.env;
if (process.platform !== "win32" || !SystemRoot) {
  throw new Error("This smoke check requires Windows.");
}

const runtime = resolve("build/remote-desktop-runtime/win32/x64");
const systemPath = [join(SystemRoot, "System32"), SystemRoot].join(";");
const env = { SystemRoot, PATH: systemPath };
console.log(`Runtime directory: ${runtime}\nPATH: ${systemPath}`);

function probe(executable, args, expectedOutput, stopAfterOutput = false) {
  return new Promise((resolveProbe, reject) => {
    const command = [executable, ...args].join(" ");
    const child = spawn(join(runtime, executable), args, {
      cwd: runtime,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let matched = false;
    let stopped = false;
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2048);
    });

    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      if (matched || !expectedOutput.test(line)) return;
      matched = true;
      console.log(`${command}: ${line}`);
      if (stopAfterOutput) stopped = child.kill("SIGKILL");
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command}: timed out after 15 seconds`));
    }, 15_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`${command}: ${error.message}`));
    });
    child.on("exit", () => child.stdin.destroy());
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const status = code === null ? signal : `${code} (0x${(code >>> 0).toString(16)})`;
      const expectedExit = stopAfterOutput ? stopped && signal === "SIGKILL" : code === 0;
      if (!matched || !expectedExit) {
        reject(new Error(`${command}: exit ${status}, expected output seen: ${matched}\n${stderr}`));
        return;
      }
      console.log(`${command}: passed, exit ${status}`);
      resolveProbe();
    });
  });
}

// Sunshine src/config.cpp and Moonlight src/cli.rs handle help before starting services.
await probe("sunshine.exe", ["--help"], /^Usage: .*\[options\]/);
await probe("web-server.exe", ["--help"], /^Usage: web-server(?:\.exe)?(?: |$)/);

// Moonlight streamer/src/main.rs has no CLI parser. It sends this JSON IPC message
// before it waits for Init. Keep stdin open and send no bytes.
await probe("streamer.exe", [], /"message"\s*:\s*"Completed Stage: Launch Streamer"/, true);
