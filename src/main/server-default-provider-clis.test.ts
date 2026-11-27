import { sourceText } from "@pokebots/i18n/source";
import { describe, expect, it } from "vitest";
import { providerFailureStatus } from "../backend/agent/provider-status";
import { CodexCliError } from "../backend/cli";
import {
  initialPreferredProvider,
  needsServerDefaultCliDownload,
  SERVER_DEFAULT_PROVIDER_CLIS,
} from "./server-default-provider-clis";

describe("needsServerDefaultCliDownload", () => {
  it("matches missing Claude and Codex statuses produced by providerFailureStatus", () => {
    const claudeStatus = {
      id: "claude" as const,
      ...providerFailureStatus(
        "claude",
        new CodexCliError(sourceText("error.provider.claudeMissing"), "missing"),
        null,
      ),
    };
    const codexStatus = {
      id: "codex" as const,
      ...providerFailureStatus("codex", new CodexCliError(sourceText("error.provider.codexMissing"), "missing"), null),
    };

    expect(claudeStatus.state).toBe("error");
    expect(codexStatus.state).toBe("error");
    expect(needsServerDefaultCliDownload(claudeStatus, "not-downloaded")).toBe(true);
    expect(needsServerDefaultCliDownload(codexStatus, "not-downloaded")).toBe(true);
  });

  it("matches not-installed Cursor, Grok, and OpenCode statuses", () => {
    for (const id of ["cursor", "grok", "opencode"] as const) {
      expect(
        needsServerDefaultCliDownload(
          { id, state: "not-installed", version: null, message: `${id} is not downloaded.` },
          "not-downloaded",
        ),
      ).toBe(true);
    }
  });

  it("does not download Claude or Codex for non-missing errors or when a runtime is already present", () => {
    const claudeMissing = {
      id: "claude" as const,
      state: "error" as const,
      version: null,
      message: sourceText("error.provider.claudeMissing"),
    };

    expect(needsServerDefaultCliDownload(claudeMissing, "ready")).toBe(false);
    expect(needsServerDefaultCliDownload(claudeMissing, "downloading")).toBe(false);
    expect(needsServerDefaultCliDownload({ ...claudeMissing, cliSource: "system" }, "not-downloaded")).toBe(false);
    expect(needsServerDefaultCliDownload({ ...claudeMissing, version: "2.1.0" }, "not-downloaded")).toBe(false);
    expect(
      needsServerDefaultCliDownload(
        {
          id: "codex",
          state: "error",
          version: null,
          message: sourceText("error.provider.codexNotStartedHint"),
        },
        "not-downloaded",
      ),
    ).toBe(false);
  });

  it("ignores providers outside SERVER_DEFAULT_PROVIDER_CLIS", () => {
    expect(SERVER_DEFAULT_PROVIDER_CLIS).toEqual(["claude", "codex", "cursor", "grok", "opencode"]);
    expect(
      needsServerDefaultCliDownload(
        { id: "antigravity", state: "not-installed", version: null, message: "Gemini is not downloaded." },
        "not-downloaded",
      ),
    ).toBe(false);
    expect(
      needsServerDefaultCliDownload(
        { id: "cline", state: "not-installed", version: null, message: "Cline is not downloaded." },
        "not-downloaded",
      ),
    ).toBe(false);
  });
});

describe("initialPreferredProvider", () => {
  it("defaults new servers to OpenCode free models when no provider is saved", () => {
    expect(initialPreferredProvider(null, true)).toBe("opencode");
  });

  it("keeps Codex as the default for desktop apps with no saved provider", () => {
    expect(initialPreferredProvider(null, false)).toBe("codex");
  });

  it("preserves any saved provider choice on servers and desktop", () => {
    expect(initialPreferredProvider("claude", true)).toBe("claude");
    expect(initialPreferredProvider("codex", true)).toBe("codex");
    expect(initialPreferredProvider("grok", false)).toBe("grok");
  });
});
