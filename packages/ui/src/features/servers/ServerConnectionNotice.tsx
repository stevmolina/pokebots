import type { HostedServerIssue, HostedServerSleep, HostedServerStart } from "@openbot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";
import { Button } from "../../button";
import { ErrorReference } from "../../error-reference";
import { useText } from "../../text";
import { AppLoadingScreen } from "../account/AppLoadingScreen";
import { ServerStatusDialog } from "./ServerStatusDialog";

export type ServerWorkspacePhase =
  | "connecting"
  | "loading"
  | "reconnecting"
  | "waiting"
  | "sleeping"
  | "waking"
  | "updating"
  | "blocked";

/** What the desktop and the web know about a server that is not ready yet. */
export interface ServerWorkspaceState {
  /** The sleep phase of a hosted server, which wins over all other states. */
  hostedSleep?: HostedServerSleep | null | undefined;
  updating: boolean;
  blocked: boolean;
  /** The connection failed and waits before it tries again. */
  waiting?: boolean;
  /** The server is online or connecting, and its workspace loads. */
  loading: boolean;
  /** The workspace was on screen before, so the notice reconnects instead of connecting. */
  hasContent: boolean;
}

/** The phase that the notice shows, in order of priority. */
export function serverWorkspacePhase(state: ServerWorkspaceState): ServerWorkspacePhase {
  if (state.hostedSleep) return state.hostedSleep;
  if (state.updating) return "updating";
  if (state.blocked) return "blocked";
  if (state.waiting) return "waiting";
  if (state.loading) return "loading";
  return state.hasContent ? "reconnecting" : "connecting";
}

/**
 * The phases of a connection that mends itself. The pane shows no notice for them: the composer
 * already says "Connecting...", and the chat stays as it is. A server that sleeps, updates, has an
 * issue, or needs the user (blocked) still shows its notice with Retry.
 */
export function isQuietServerPhase(phase: ServerWorkspacePhase): boolean {
  return phase === "connecting" || phase === "loading" || phase === "reconnecting";
}

export interface ServerConnectionNoticeProps {
  name: string;
  phase: ServerWorkspacePhase;
  initial: boolean;
  /** The screen covers the whole window, server rail included, so it does not say that another server can be selected. */
  fullWindow?: boolean;
  issue?: HostedServerIssue | null;
  /** The step of a hosted start, shown with its time while the phase is `waking`. */
  start?: HostedServerStart | null;
  remainingSeconds?: number;
  busy?: boolean;
  detail?: string | null;
  /** The code of the failure in `detail`, for a user to copy into a report. */
  reference?: string | null;
  /** The OpenBot version that the server restarts into, while it updates. */
  updateVersion?: string | null;
  /** The first load ended: the full-window screen hops its crew out. Remove the notice in `onExited`. */
  ready?: boolean | undefined;
  onExited?: (() => void) | undefined;
  /** The full-window screen still covers the window, and heavy views can mount before its crew hop out. */
  onMountViews?: (() => void) | undefined;
  /** False when another loading screen already covers the window: the first load then shows only its inline notice. */
  screen?: boolean;
  /** Puts recovery controls in the loading screen that already covers this notice. */
  onLoadingNotice?: ((notice: JSX.Element) => void) | undefined;
  onRetry: () => void;
  onManage?: () => void;
  /** The offer of a hosted server, for the user's own computer that is offline. */
  upsell?: { onSeePlans: () => void } | null | undefined;
}

/** A first load that takes longer than this shows its message and actions on the loading screen. */
const FIRST_LOAD_NOTICE_DELAY_MS = 10_000;

/**
 * Connection feedback stays visible until the workspace can answer the user's actions. A first load
 * shows the loading screen. Its message and actions (Retry, Details, Manage) show on that screen after
 * a long wait, or at once when the server fails, sleeps or needs the user. It never opens a toast.
 */
export function ServerConnectionNotice(props: ServerConnectionNoticeProps) {
  const { t } = useText();
  const since = Date.now();
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  // A wait is long after the delay, or at once when the server does not only load. A retry starts a new wait.
  const [round, setRound] = createSignal(0);
  const [waitedLong, setWaitedLong] = createSignal(false);
  /**
   * A hosted server that starts and has no issue does what it must: it is not a failure, so it has no
   * error code, and its notice waits as a long load does. When the start fails, the issue makes the
   * notice urgent again, with its code, Details and Retry.
   */
  const starting = () => props.phase === "waking" && !props.issue;
  const urgent = () =>
    Boolean(props.issue) || (props.phase !== "loading" && props.phase !== "connecting" && !starting());
  const reference = () => (starting() ? null : props.reference);
  createEffect(round, () => {
    const timer = setTimeout(() => setWaitedLong(true), FIRST_LOAD_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  });
  // A server that failed once keeps its notice while it connects again.
  createEffect(urgent, (now) => {
    if (now) setWaitedLong(true);
  });
  const retry = () => {
    if (props.initial && !urgent()) setWaitedLong(false);
    setRound((current) => current + 1);
    props.onRetry();
  };
  const title = () => {
    switch (props.issue) {
      case "plan_ended":
        return t("server.connection.planEnded", { name: props.name });
      case "wake_failed":
        return t("server.connection.wakeFailed", { name: props.name });
      case "start_timeout":
        return t("server.connection.startTimeout", { name: props.name });
    }
    switch (props.phase) {
      case "sleeping":
        return t("server.connection.sleeping", { name: props.name });
      case "waking":
        return t("server.connection.waking", { name: props.name });
      case "updating":
        return t("server.connection.updating", { name: props.name });
      case "loading":
        return t("server.connection.loading", { name: props.name });
      case "connecting":
        return t("server.connection.connecting", { name: props.name });
      case "blocked":
        return t("server.connection.blocked", { name: props.name });
      default:
        return t("server.connection.reconnecting", { name: props.name });
    }
  };
  const [now, setNow] = createSignal(Date.now());
  createEffect(
    () => props.phase === "waking" && !props.issue && Boolean(props.start),
    (counting) => {
      if (!counting) return;
      setNow(Date.now());
      const clock = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(clock);
    },
  );
  const startProgress = () => {
    const start = props.start;
    if (props.phase !== "waking" || props.issue || !start) return null;
    const step =
      start.step === "provider_limit"
        ? t("server.connection.providerLimit")
        : t(start.step === "openbot" ? "server.hosted.detail.start.app" : "server.hosted.detail.start.boot");
    const seconds = Math.max(0, Math.floor((now() - start.startedAt) / 1000));
    return t("server.connection.startProgress", { step, time: formatElapsed(seconds) });
  };
  const detail = () =>
    startProgress() ??
    props.detail ??
    (props.remainingSeconds
      ? t("server.connection.nextRetry", { seconds: props.remainingSeconds })
      : props.phase === "sleeping"
        ? t("server.connection.wakeHint")
        : props.issue === "plan_ended"
          ? t("server.connection.planHint")
          : props.initial
            ? props.fullWindow
              ? undefined
              : t("server.connection.loadingHint")
            : t("server.connection.cachedHint"));
  const manageButton = (size: "default" | "sm") => (
    <Show when={props.onManage && (props.issue === "plan_ended" || props.phase === "blocked")}>
      <Button variant="outline" size={size} onClick={() => props.onManage?.()}>
        {t("server.connection.manage")}
      </Button>
    </Show>
  );
  const detailsButton = (size: "default" | "sm") => (
    <Button variant="ghost" size={size} onClick={() => setDetailsOpen(true)}>
      {t("server.connection.details")}
    </Button>
  );
  const actions = () => (
    <>
      {/* A first load can wait long while it connects, so its Retry also starts the connection again. */}
      <Button variant="outline" disabled={props.busy && !props.initial} onClick={retry}>
        {t("server.connection.retry")}
      </Button>
      {manageButton("default")}
      {detailsButton("default")}
    </>
  );
  const statusDialog = () => (
    <ServerStatusDialog
      open={detailsOpen()}
      onClose={() => setDetailsOpen(false)}
      name={props.name}
      title={title()}
      phase={props.phase}
      initial={props.initial}
      issue={props.issue ?? null}
      updateVersion={props.updateVersion ?? null}
      remainingSeconds={props.remainingSeconds ?? 0}
      detail={props.detail ?? null}
      reference={props.reference ?? null}
      since={since}
    />
  );
  const upsell = () => (
    <Show when={props.upsell}>
      {(offer) => (
        <p class="hosted-upsell-offline">
          <span>{t("server.upsell.offline")}</span>
          <Button size="sm" variant="link" onClick={() => offer().onSeePlans()}>
            {t("server.upsell.seePlans")}
          </Button>
        </p>
      )}
    </Show>
  );
  /** The message and actions of a first load that fails, sleeps, needs the user or takes long. */
  const firstLoadControls = () => props.initial && !props.ready && (urgent() || waitedLong());
  const firstLoadNotice = () => (
    <div class="server-connection-first-load">
      <Show when={detail()}>{(text) => <p class="server-connection-detail">{text()}</p>}</Show>
      <ErrorReference reference={reference()} />
      {upsell()}
      {/* A server that starts shows its progress only: the user has nothing to retry or read yet. */}
      <Show when={!starting()}>
        <div class="server-connection-actions">{actions()}</div>
      </Show>
    </div>
  );
  createEffect(
    () => {
      const send = props.screen === false ? props.onLoadingNotice : undefined;
      return send
        ? {
            send,
            notice: firstLoadControls() ? (
              <>
                <p>{title()}</p>
                {firstLoadNotice()}
              </>
            ) : undefined,
          }
        : null;
    },
    (value) => {
      if (!value) return;
      value.send(value.notice);
      return () => value.send(undefined);
    },
  );
  return (
    <>
      <Show
        when={props.initial}
        fallback={
          <Show when={!isQuietServerPhase(props.phase) || props.issue}>
            <section class="server-connection-notice" role="status" aria-live="polite">
              <div>
                <p>{title()}</p>
                <p class="server-connection-detail">{detail()}</p>
                <ErrorReference reference={reference()} />
                {upsell()}
              </div>
              <div class="server-connection-actions">{actions()}</div>
            </section>
          </Show>
        }
      >
        <Show
          when={props.screen !== false}
          fallback={
            // Another loading screen covers the window, so the notice sits in the pane as a banner.
            <Show when={firstLoadControls() && !props.onLoadingNotice}>
              <section class="server-connection-notice" role="status" aria-live="polite">
                <div>
                  <p>{title()}</p>
                  {firstLoadNotice()}
                </div>
              </section>
            </Show>
          }
        >
          <AppLoadingScreen
            label={title()}
            title={firstLoadControls() ? title() : undefined}
            ready={props.ready}
            onExited={props.onExited}
            onMountViews={props.onMountViews}
          >
            <Show when={firstLoadControls()}>{firstLoadNotice()}</Show>
          </AppLoadingScreen>
        </Show>
      </Show>
      {statusDialog()}
    </>
  );
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// A history that loads faster than this does not cover the chat, so a fast switch does not flash.
const CONVERSATION_LOADING_DELAY_MS = 150;

export interface ConversationLoadNoticeProps {
  /** The agent whose history loads. */
  name: string;
  /** The first page of the history is loading. */
  loading: boolean;
  /** Why the history did not load, if loading failed. */
  error: string | null;
  /**
   * The wait is sure to be long, such as the first load of a saved frame: the screen shows at once,
   * so the chat under it does not show for a moment first.
   */
  immediate?: boolean;
  /** Server recovery controls shown in this conversation loading screen. */
  children?: JSX.Element;
}

/**
 * While an agent's history loads for the first time, the lilac plush of the app loading screen covers
 * the chat and watches its balls, and the screen fades when the history is ready or loading fails.
 */
export function ConversationLoadNotice(props: ConversationLoadNoticeProps) {
  const { t } = useText();
  // A memo, so that a read in the loading screen's `onSettled` does not run the caller's prop getter:
  // a getter such as `a && b` makes a memo when it runs, and `onSettled` does not permit one.
  const waiting = createMemo(() => props.loading && !props.error);
  // Each wait gets its own screen: a screen that started its exit cannot load again.
  const [screen, setScreen] = createSignal<number | null>(null);
  // The screen that started its exit. It stays ready, so a new wait does not stop its exit.
  const [exiting, setExiting] = createSignal<number | null>(null);
  let screens = 0;
  // Whether the screen that shows now came at once.
  let immediate = false;
  createEffect(waiting, (current) => {
    if (!current) {
      // The chat under the screen measures its rows and moves to its latest message in the next two
      // frames. The screen starts its exit after them, so the reader does not see the rows move.
      const shown = untrack(screen);
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setExiting(shown));
      });
      return () => cancelAnimationFrame(frame);
    }
    const show = () => {
      screens += 1;
      setScreen(screens);
    };
    immediate = untrack(() => props.immediate === true);
    if (immediate) {
      show();
      return;
    }
    const timer = setTimeout(show, CONVERSATION_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  });
  return (
    <Show when={screen()} keyed>
      {(key) => (
        <AppLoadingScreen
          scene="thinking"
          immediate={immediate}
          ready={key === exiting()}
          label={t("server.connection.loading", { name: props.name })}
          title={t("server.connection.loading", { name: props.name })}
          onExited={() => setScreen((current) => (current === key ? null : current))}
        >
          {props.children}
        </AppLoadingScreen>
      )}
    </Show>
  );
}

/** A failed optional read does not prevent work in the loaded workspace. */
export function ServerPanelLoadNotice(props: { busy: boolean; onRetry: () => void }) {
  const { t } = useText();
  return (
    <section class="server-connection-notice" role="status">
      <p>{t("server.connection.panelsFailed")}</p>
      <Button variant="outline" disabled={props.busy} onClick={() => props.onRetry()}>
        {t("server.connection.retry")}
      </Button>
    </section>
  );
}
