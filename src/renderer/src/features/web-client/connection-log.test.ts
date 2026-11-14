import { describe, expect, it } from "vitest";
import { type ConnectionSession, formatConnectionLog, formatDuration, trimSessions } from "./connection-log";

const context = { now: Date.UTC(2026, 10, 14, 12, 0, 0), userAgent: "Test UA", build: "/assets/index-abc.js" };

function session(stages: [string, number][], startedAt = Date.UTC(2026, 10, 14, 11, 59, 0)): ConnectionSession {
  return { startedAt, stages: stages.map(([name, at]) => ({ name, at })), page: null };
}

describe("formatDuration", () => {
  it("uses milliseconds below a second and seconds above", () => {
    expect(formatDuration(420.4)).toBe("420ms");
    expect(formatDuration(12_340)).toBe("12.3s");
    expect(formatDuration(null)).toBe("n/a");
  });
});

describe("formatConnectionLog", () => {
  it("says when nothing is recorded", () => {
    expect(formatConnectionLog([], context)).toContain("No stage is recorded yet.");
  });

  it("lists each stage with its time and the time since the stage before", () => {
    const text = formatConnectionLog(
      [
        session([
          ["session", 900],
          ["hosts", 5_900],
          ["workspace-ready", 65_900],
        ]),
      ],
      context,
    );
    expect(text).toContain("Open 1 (this one)");
    expect(text).toMatch(/900ms\s+\+900ms\s+session/);
    expect(text).toMatch(/5\.9s\s+\+5\.0s\s+hosts/);
    expect(text).toMatch(/65\.9s\s+\+60\.0s\s+workspace-ready/);
  });

  it("shows the page summary and the slowest files", () => {
    const text = formatConnectionLog(
      [
        {
          ...session([["session", 1_000]]),
          page: {
            timeToFirstByte: 300,
            domContentLoaded: 2_000,
            loaded: null,
            files: 40,
            transferredBytes: 3 * 1024 * 1024,
            slowestFiles: [{ path: "/assets/web-1.js", duration: 9_000 }],
            network: "3g, 400ms round trip, 1.1 Mbps",
            serviceWorker: false,
          },
        },
      ],
      context,
    );
    expect(text).toContain("first byte 300ms, document 2.0s, loaded n/a");
    expect(text).toContain("files: 40, 3.0 MB over the network, network 3g");
    expect(text).toContain("slowest files: /assets/web-1.js 9.0s");
  });
});

describe("trimSessions", () => {
  it("keeps the newest four sessions and the first eighty stages of each", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      session(
        Array.from({ length: 100 }, (_, stage): [string, number] => [`stage-${stage}`, stage]),
        index,
      ),
    );
    const trimmed = trimSessions(many);
    expect(trimmed.map((entry) => entry.startedAt)).toEqual([2, 3, 4, 5]);
    expect(trimmed.every((entry) => entry.stages.length === 80)).toBe(true);
  });
});
