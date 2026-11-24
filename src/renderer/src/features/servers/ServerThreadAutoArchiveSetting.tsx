import {
  type OpenBotDesktopApi,
  THREAD_AUTO_ARCHIVE_IDLE_DAYS,
  type ThreadAutoArchiveIdleDays,
  type ThreadAutoArchiveSetting,
} from "@openbot/contracts/ipc";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { createEffect, createSignal, Show, untrack } from "solid-js";

/** The thread archive calls of one server's host. The desktop reaches them through main. */
export type HostThreadAutoArchiveCalls = Pick<
  OpenBotDesktopApi["hostAdmin"],
  "getThreadAutoArchive" | "setThreadAutoArchive"
>;

export interface ServerThreadAutoArchiveOptions {
  /** The calls of a client with no `window.openbot`, such as the web client. */
  calls?: HostThreadAutoArchiveCalls;
}

/** A select keys its options by value, so each idle time is text. A constant array, so the select stops updating. */
type IdleChoice = `${ThreadAutoArchiveIdleDays}`;
const IDLE_CHOICES: IdleChoice[] = THREAD_AUTO_ARCHIVE_IDLE_DAYS.map((days): IdleChoice => `${days}`);
const idleDaysOf = (choice: IdleChoice): ThreadAutoArchiveIdleDays =>
  THREAD_AUTO_ARCHIVE_IDLE_DAYS.find((days) => `${days}` === choice) ?? 0;

/** The last value that this window read for each server, so the rows keep their size when the settings open again. */
const lastSettings = new Map<string, ThreadAutoArchiveSetting>();

/**
 * Server Settings > Agents > Threads: when the host archives the side threads of its agents by itself
 * (`thread-auto-archive-v1`): after an idle time, and when the GitHub pull requests that a thread links
 * are merged or closed. The host checks the role again.
 */
export function ServerThreadAutoArchiveSetting(
  props: ServerThreadAutoArchiveOptions & {
    serverId: string;
    disabled: boolean;
    menuMount: HTMLElement | undefined;
    run: (key: string, action: () => Promise<void>) => Promise<boolean>;
  },
) {
  const { t, errorMessage } = useText();
  const calls = (): HostThreadAutoArchiveCalls => props.calls ?? window.openbot.hostAdmin;
  const [setting, setSetting] = createSignal<ThreadAutoArchiveSetting | null>(null);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  /** False until the host answers. A save sends both values, so a value from an earlier open must not overwrite a newer one. */
  const [loaded, setLoaded] = createSignal(false);
  /** Bumped for each server and each change, so an earlier answer is dropped. */
  let generation = 0;

  createEffect(
    () => props.serverId,
    (serverId) => {
      const current = ++generation;
      setSetting(lastSettings.get(serverId) ?? null);
      setLoadError(null);
      setLoaded(false);
      untrack(calls)
        .getThreadAutoArchive(serverId)
        .then(
          (next) => {
            if (current !== generation) return;
            lastSettings.set(serverId, next);
            setSetting(next);
            setLoaded(true);
          },
          (error: unknown) => {
            if (current !== generation) return;
            lastSettings.delete(serverId);
            setSetting(null);
            setLoadError(errorMessage(error, t("server.settings.threadAutoArchiveLoadFailed")));
          },
        );
    },
  );

  function save(change: Partial<ThreadAutoArchiveSetting>): void {
    const current = setting();
    if (!current) return;
    const input: ThreadAutoArchiveSetting = { ...current, ...change };
    if (input.idleDays === current.idleDays && input.mergedPullRequests === current.mergedPullRequests) return;
    const serverId = props.serverId;
    const request = ++generation;
    void props.run("threadAutoArchive", async () => {
      const next = await calls().setThreadAutoArchive(input, serverId);
      lastSettings.set(serverId, next);
      if (request === generation) setSetting(next);
    });
  }

  const idleLabel = (choice: IdleChoice) => {
    const days = idleDaysOf(choice);
    return days === 0
      ? t("server.settings.threadAutoArchiveIdleOff")
      : t("server.settings.threadAutoArchiveIdleDays", { count: days });
  };

  return (
    <>
      <Item>
        <ItemContent>
          <ItemTitle id="server-settings-thread-auto-archive-label">{t("server.settings.threadAutoArchiveIdle")}</ItemTitle>
          <ItemDescription>{loadError() ?? t("server.settings.threadAutoArchiveIdleDescription")}</ItemDescription>
        </ItemContent>
        <Show when={setting()}>
          {(current) => (
            <ItemActions>
              <Select<IdleChoice>
                class="settings-modal-select"
                options={IDLE_CHOICES}
                value={`${current().idleDays}`}
                disabled={props.disabled || !loaded()}
                placement="bottom-end"
                onChange={(next) => {
                  if (next) save({ idleDays: idleDaysOf(next) });
                }}
                itemComponent={(item) => <SelectItem item={item.item}>{idleLabel(item.item.rawValue)}</SelectItem>}
              >
                <SelectTrigger size="sm" aria-labelledby="server-settings-thread-auto-archive-label">
                  <SelectValue<IdleChoice>>{() => idleLabel(`${current().idleDays}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent mount={props.menuMount} />
              </Select>
            </ItemActions>
          )}
        </Show>
      </Item>
      <Show when={setting()}>
        {(current) => (
          <Item>
            <ItemContent>
              <ItemTitle>{t("server.settings.threadAutoArchivePullRequests")}</ItemTitle>
              <ItemDescription>{t("server.settings.threadAutoArchivePullRequestsDescription")}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("server.settings.threadAutoArchivePullRequests")}
                checked={current().mergedPullRequests}
                disabled={props.disabled || !loaded()}
                onChange={(mergedPullRequests) => save({ mergedPullRequests })}
              />
            </ItemActions>
          </Item>
        )}
      </Show>
    </>
  );
}
