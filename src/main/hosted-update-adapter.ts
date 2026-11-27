import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { compareReleaseVersions, isNewerRelease, parseReleaseVersion } from "@pokebots/contracts/release-version";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import { fetchLatestLinuxRelease } from "./host-release-service";
import type { UpdateAdapter, UpdateCancellationToken, UpdateCheckOutcome } from "./update-service";

/** The path unit that starts `openbot-hosted-update request`. Without it, no request is acted on. */
export const HOSTED_UPDATE_TRIGGER = "/etc/systemd/system/openbot-update-request.path";

/** The paths that scripts/hosting/openbot-hosted-update and openbot-update-request.path use. */
export interface HostedUpdatePaths {
  /** The runtime directory of openbot.service, which the service user owns. */
  readonly requests: string;
  /** Root writes the step of a request here while it runs. */
  readonly state: string;
  /** The version of a complete staged release. */
  readonly stagedReady: string;
}

/** The runtime directory of openbot.service (`RuntimeDirectory=openbot`). */
export const HOSTED_RUNTIME_DIRECTORY = "/run/openbot";

const HOSTED_UPDATE_PATHS: HostedUpdatePaths = {
  requests: HOSTED_RUNTIME_DIRECTORY,
  state: "/run/openbot-update.state",
  stagedReady: "/opt/OpenBot/staged.ready",
};

/**
 * The folders that docker/instances/compose.yaml mounts in a container. OpenBot writes requests, and
 * `openbot-instance update-request` on the host pulls the image and makes the container again.
 */
export const CONTAINER_UPDATE_PATHS: HostedUpdatePaths = {
  requests: "/var/lib/openbot-update/requests",
  state: "/var/lib/openbot-update/status/state",
  stagedReady: "/var/lib/openbot-update/status/staged.ready",
};

/** The host writes this file when its path unit acts on the requests of the container. */
export const CONTAINER_UPDATE_TRIGGER = "/var/lib/openbot-update/status/enabled";

/**
 * One build of a server image. All Pokebots images of one release have the same version, so the
 * commit and its time tell the builds apart. `docker/Dockerfile` gives the image its own values in
 * `OPENBOT_IMAGE_REVISION` and `OPENBOT_IMAGE_CREATED`.
 */
export interface ServerImageBuild {
  /** The release version, without a suffix such as "-custom". */
  readonly version: string;
  /** The short commit, or null when the image does not say it. */
  readonly revision: string | null;
  /** The time of the commit in UTC, such as 2026-11-26T17:00:00Z, or null. */
  readonly created: string | null;
}

const IMAGE_REVISION = /^[0-9a-f]{7,40}$/u;
const IMAGE_CREATED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const IMAGE_VERSION = /^(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.]+)?$/u;

/**
 * Reads a build from its version, commit and time. A value in the wrong form counts as unknown, so
 * a build that cannot be compared is never offered.
 */
export function serverImageBuild(
  version: string | undefined,
  revision: string | undefined,
  created: string | undefined,
): ServerImageBuild | null {
  const release = IMAGE_VERSION.exec(version?.trim() ?? "")?.[1];
  if (!release) return null;
  const commit = revision?.trim() ?? "";
  const time = created?.trim() ?? "";
  return {
    version: release,
    revision: IMAGE_REVISION.test(commit) ? commit : null,
    created: IMAGE_CREATED.test(time) ? time : null,
  };
}

/**
 * The image of this container, from the environment that `docker/Dockerfile` sets. Null outside an
 * image that says its commit.
 */
export function currentServerImageBuild(version: string, environment: NodeJS.ProcessEnv): ServerImageBuild | null {
  const build = serverImageBuild(version, environment.OPENBOT_IMAGE_REVISION, environment.OPENBOT_IMAGE_CREATED);
  return build?.revision ? build : null;
}

/** The text of `staged.ready`: "<version> [<commit> [<time>]]". A host that knows only the version writes one word. */
export function parseStagedBuild(text: string): ServerImageBuild | null {
  const [version, revision, created] = text.trim().split(/\s+/u);
  return serverImageBuild(version, revision, created);
}

/**
 * True when `candidate` is a newer build than `running`. An older OpenBot cannot open a database that
 * a newer one migrated, so a build is offered only when it is surely not older:
 *
 * - a newer release version is newer;
 * - an older release version is never newer;
 * - with the same version, the commit must differ and the commit time must be later. A running image
 *   without a time is older than each image with one, because the label came after it.
 *
 * `docker/vps-update/openbot-vps-update` uses the same rule (`newer_build`), and
 * `scripts/vps-update-e2e.ts` checks both.
 */
export function isNewerServerBuild(candidate: ServerImageBuild, running: ServerImageBuild): boolean {
  const next = parseReleaseVersion(candidate.version);
  const now = parseReleaseVersion(running.version);
  if (!next || !now) return false;
  const order = compareReleaseVersions(next, now);
  if (order !== 0) return order > 0;
  if (!candidate.revision || candidate.revision === running.revision || !candidate.created) return false;
  return running.created === null || candidate.created > running.created;
}

/** The version that the app shows for a build: "0.73.0+5dfb288b7". See `releaseBuild`. */
export function serverBuildVersion(build: ServerImageBuild): string {
  return build.revision ? `${build.version}+${build.revision}` : build.version;
}

interface HostedUpdateOptions {
  currentVersion: string;
  arch: string;
  fetch?: typeof fetch;
  paths?: HostedUpdatePaths;
  pollIntervalMs?: number;
  /**
   * The image of a container whose host stages Pokebots server images. When it is set, a check asks
   * the host to stage the newest image and offers it by its build, not by the release feed.
   */
  imageBuild?: ServerImageBuild;
  /** The longest time that a check waits for the host to stage. */
  checkWaitMs?: number;
}

type HostedUpdateEvents = {
  "download-progress": [progress: ProgressInfo];
  "update-downloaded": [info: Pick<UpdateInfo, "version">];
};

/** A listener of any updater event. Each event passes at most one of these values, or none. */
type UpdateListener = (value: ProgressInfo & UpdateInfo & Error) => void;

class RequestCancellation implements UpdateCancellationToken {
  cancelled = false;
  cancel(): void {
    this.cancelled = true;
  }
}

/**
 * The updater of a hosted or self-installed Linux server. OpenBot runs as the service user from a
 * release that root owns, so it cannot replace itself. It asks root instead: an empty file in its
 * runtime directory starts `openbot-hosted-update request` through a path unit. That stages the
 * newest release, or stops OpenBot, moves the staged release into place and starts OpenBot again.
 *
 * UpdateService drives this as it drives electron-updater, so its deadlines apply. While root works,
 * the time of the state file changes, and each change is a progress event. When root stops without
 * a staged release, or never takes the request, the download fails. An install request has no
 * answer: shutdown preparation exits OpenBot after its deadline, and when root did not take the
 * request, systemd starts the same release again. Each start of openbot.service starts the path
 * unit, so this happens only when an administrator stopped it.
 */
export class HostedUpdateAdapter implements UpdateAdapter {
  allowPrerelease = false;
  autoDownload = false;
  autoInstallOnAppQuit = false;
  readonly #events = new EventEmitter();
  readonly #options: HostedUpdateOptions;
  readonly #paths: HostedUpdatePaths;

  constructor(options: HostedUpdateOptions) {
    this.#options = options;
    this.#paths = options.paths ?? HOSTED_UPDATE_PATHS;
  }

  on(event: string, listener: UpdateListener): this {
    this.#events.on(event, listener);
    return this;
  }

  async checkForUpdates(): Promise<UpdateCheckOutcome> {
    const build = this.#options.imageBuild;
    if (build) {
      await this.#stage(this.#options.checkWaitMs ?? 60_000);
      const staged = await this.#stagedBuild();
      if (!staged) return { isUpdateAvailable: false, updateInfo: { version: serverBuildVersion(build) } };
      return {
        isUpdateAvailable: true,
        updateInfo: { version: serverBuildVersion(staged) },
        cancellationToken: new RequestCancellation(),
      };
    }
    const version = await fetchLatestLinuxRelease(
      this.#options.arch,
      this.#options.fetch ?? fetch,
      AbortSignal.timeout(15_000),
    );
    if (!isNewerRelease(version, this.#options.currentVersion))
      return { isUpdateAvailable: false, updateInfo: { version } };
    return { isUpdateAvailable: true, updateInfo: { version }, cancellationToken: new RequestCancellation() };
  }

  /**
   * Root answers also when the timer staged the release already: it answers after boat restored the
   * disk, which can take minutes after a wake. An install during the restore would wait for it with
   * OpenBot stopped.
   */
  async downloadUpdate(cancellationToken?: UpdateCancellationToken): Promise<void> {
    const request = join(this.#paths.requests, "update-stage");
    await writeFile(request, "", { mode: 0o600 });
    let changedAt: number | null = null;
    for (;;) {
      await delay(this.#options.pollIntervalMs ?? 2_000);
      if (cancellationToken?.cancelled) throw new Error("The download was cancelled.");
      if (await this.#exists(request)) continue;
      const state = await this.#readState();
      if (state) {
        if (state.changedAt !== changedAt) {
          changedAt = state.changedAt;
          // Root reports only the percent. Before the download, root can wait for the disk restore
          // that boat runs after a resume, or for the download of the timer, for minutes. After it,
          // root checks, unpacks and stages the release, and can install packages.
          this.#emit("download-progress", {
            percent: state.percent,
            total: 0,
            transferred: 0,
            delta: 0,
            bytesPerSecond: 0,
          });
        }
        continue;
      }
      // `stage` removes a staged release that is not the latest one, so what is there now is.
      const ready = await this.#stagedVersion();
      if (!ready) throw new Error("The server staged no release.");
      this.#emit("update-downloaded", { version: ready });
      return;
    }
  }

  /**
   * The build that an install request installs now: root installs the image that `staged.ready`
   * names, without a new download. Null outside a container whose host stages images.
   */
  async readyVersion(): Promise<string | null> {
    return this.#options.imageBuild ? this.#stagedVersion() : null;
  }

  /** Root stops this process when it takes the request. */
  quitAndInstall(): void {
    writeFileSync(join(this.#paths.requests, "update-install"), "", { mode: 0o600 });
  }

  #emit<Event extends keyof HostedUpdateEvents>(event: Event, ...values: HostedUpdateEvents[Event]): void {
    this.#events.emit(event, ...values);
  }

  async #stagedVersion(): Promise<string | null> {
    if (this.#options.imageBuild) {
      const staged = await this.#stagedBuild();
      return staged ? serverBuildVersion(staged) : null;
    }
    const version = await readFile(this.#paths.stagedReady, "utf8").then(
      (value) => value.trim(),
      () => "",
    );
    return isNewerRelease(version, this.#options.currentVersion) ? version : null;
  }

  /** The staged build, only when it is newer than the image of this container. */
  async #stagedBuild(): Promise<ServerImageBuild | null> {
    const running = this.#options.imageBuild;
    if (!running) return null;
    const staged = await readFile(this.#paths.stagedReady, "utf8").then(parseStagedBuild, () => null);
    return staged && isNewerServerBuild(staged, running) ? staged : null;
  }

  /**
   * Asks the host to pull the newest image and to write it to `staged.ready` when it is newer. A
   * check waits at most `limitMs`: a large image can take longer, and the next check finds it.
   * A request that another check or a download wrote already is not written again.
   */
  async #stage(limitMs: number): Promise<void> {
    const request = join(this.#paths.requests, "update-stage");
    if (!(await this.#exists(request))) await writeFile(request, "", { mode: 0o600 });
    const deadline = Date.now() + limitMs;
    while (Date.now() < deadline) {
      await delay(this.#options.pollIntervalMs ?? 2_000);
      if (!(await this.#exists(request)) && !(await this.#exists(this.#paths.state))) return;
    }
  }

  /** `percent` is NaN while root waits or prepares the release, which UpdateService shows as no percent. */
  async #readState(): Promise<{ changedAt: number; percent: number } | null> {
    try {
      const [text, info] = await Promise.all([readFile(this.#paths.state, "utf8"), stat(this.#paths.state)]);
      const [step, value] = text.trim().split(" ");
      const percent = step === "downloading" ? Math.min(Number(value) || 0, 100) : Number.NaN;
      return { changedAt: info.mtimeMs, percent };
    } catch {
      return null;
    }
  }

  async #exists(path: string): Promise<boolean> {
    return stat(path).then(
      () => true,
      () => false,
    );
  }
}
