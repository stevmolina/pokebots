import {
  type AgentBrowserProfile,
  agentAutomationAllowed,
  agentNotificationLevelMap,
  type BrowserProfileSummary,
  type BrowserProxyComputer,
  type BrowserProxySummary,
  canPreviewAttachment,
  DEFAULT_AGENT_DEFAULTS,
  type FilePreview,
  type ServerNotificationLevel,
  type StoredFileRow,
  type TestRoutineInput,
  userAssignedSkills,
} from "@pokebots/contracts/ipc";
import { fileTypeOf } from "@pokebots/team-client/stored-files";
import {
  Blocks,
  BookMarked,
  Button,
  ChevronRight,
  FileText,
  Folder,
  Gauge,
  Puzzle,
  Table2,
  Upload,
} from "@pokebots/ui";
import { ProviderModelPicker } from "@pokebots/ui/components/ProviderModelPicker";
import { SettingsLinkGroup, SettingsLinkRow } from "@pokebots/ui/components/SettingsPanel";
import type { AgentProfile } from "@pokebots/ui/data";
import type { BrowserProfileSelectProfile } from "@pokebots/ui/features/browser/BrowserProfileSelect";
import { browserProfileProxyNames } from "@pokebots/ui/features/browser/BrowserProxies";
import {
  type AgentInstructionsCalls,
  AgentInstructionsView,
} from "@pokebots/ui/features/conversation/AgentInstructionsView";
import {
  AgentSessionSettings,
  type AgentSessionSettingsApi,
} from "@pokebots/ui/features/conversation/AgentSessionSettings";
import SharedAgentSettingsPanel, {
  type AgentBrowserProfileOptions,
  type AgentNotificationLevelOptions,
  type AgentSettingsPanelProps as SharedAgentSettingsPanelProps,
} from "@pokebots/ui/features/conversation/AgentSettingsPanel";
import { AttachmentReferenceVisual } from "@pokebots/ui/features/conversation/AttachmentReference";
import type { AgentSettingLinkId, AgentSettingReveal } from "@pokebots/ui/features/conversation/agent-setting-links";
import { PinnedMessages, type PinnedMessagesProps } from "@pokebots/ui/features/conversation/PinnedMessages";
import { AgentSessions, type AgentSessionsProps } from "@pokebots/ui/features/conversation/threads/AgentSessions";
import { agentFilesLinkValue } from "@pokebots/ui/features/files/AgentFilesView";
import { sidebarMessageTime } from "@pokebots/ui/features/sidebar/sidebar-filtering";
import { useText } from "@pokebots/ui/text";
import type { ComponentProps } from "@solidjs/web";
import { createEffect, createMemo, createSignal, createStore, For, Show, untrack } from "solid-js";
import { actionToast } from "../../action-toast";
import { createSidePanelWidth, readSidePanelWidth, saveSidePanelWidth } from "../../components/side-panel-width";
import type { SkillCatalogCalls } from "../../skills-port";
import { agentSkillCalls, skillsPort } from "../../skills-port";
import type { BrowserProfileCalls } from "../browser/browser-profiles-port";
import { createBrowserProfilesStore } from "../browser/stores/browser-profiles-store";
import { type AgentFilesOptions, AgentFilesSettings } from "../files/AgentFilesSettings";
import { filesPort } from "../files/files-port";
import { createStorageUsage } from "../files/storage-usage";
import { AgentMemoriesSettings } from "./AgentMemoriesSettings";
import { AgentRoutinesSettings, type DetailLeaveGuard, type RoutineSelectionRequest } from "./AgentRoutinesSettings";
import { AgentSkillsModal, type AgentSkillsMode, type SkillDetail } from "./AgentSkillsModal";
import { conversationPort, type SharedTableCalls } from "./conversation-port";
import type { AgentNotificationLevelCalls, ConversationRuntime } from "./conversation-runtime";
import { type AgentMemoriesApi, agentMemoriesPort, type MemoriesPort } from "./memories-port";
import { routineCompleted } from "./routine-summary";
import type { EventRoutinesApi } from "./routine-webhooks-api";
import {
  type AgentRoutinesApi,
  agentRoutinesPort,
  eventRoutinesPort,
  type RoutineEditorRecord,
  type RoutineResultsCalls,
  type RoutinesPort,
} from "./routines-port";
import { SharedTablesModal } from "./SharedTablesModal";

interface AgentSettingsPanelProps
  extends Omit<
    SharedAgentSettingsPanelProps,
    | "width"
    | "onResize"
    | "onResizeEnd"
    | "links"
    | "detailOpen"
    | "children"
    | "browserProfiles"
    | "notificationLevel"
    | "reveal"
  > {
  remoteClient?: boolean;
  /** The marketplace skills catalog of a remote client. Absent, its skills show only what the host sends. */
  skillCatalog?: SkillCatalogCalls | undefined;
  /** Routines can copy local run commands only on the computer that runs the agent. */
  localHost?: boolean;
  sessionSettingsEditable?: boolean;
  /**
   * The memory cap of the agent's server: this computer's, or a joined server's for an owner or admin.
   * Absent for a member of a joined server: its host still refuses a memory past the cap.
   */
  memoryLimit?: number | undefined;
  /** The web client's host calls for the settings that its server supports. */
  adminCalls?: ConversationRuntime["admin"] | undefined;
  onPublish?: (() => void) | undefined;
  onOpenUsage?: ((trigger: HTMLButtonElement) => void) | undefined;
  /** Opens the Marketplace on Apps. Absent for a user who cannot manage the server's MCP servers. */
  onOpenApps?: (() => void) | undefined;
  onWidthChange: (width: number) => void;
  /** The agent's sessions, at the top of the panel. Missing on a host without side threads. */
  sessions?: AgentSessionsProps | undefined;
  /** The agent's model, as a row under the sessions. The message box has no model chip. */
  modelPicker?: ComponentProps<typeof ProviderModelPicker> | undefined;
  /** The pinned messages of the chat in view, as a row under the model. Missing on a host without pins. */
  pins?: Omit<PinnedMessagesProps, "variant" | "openRequest" | "quiet"> | undefined;
  /** The agent's computer: the remote desktop of a joined server. Missing where the agent has none. */
  computer?: AgentComputerRow | undefined;
  skillSelectionRequest?: { skillId: string } | null | undefined;
  /**
   * The instruction file in the agent's workspace: on this computer, or on a joined server through
   * `agent-instructions-v1` for an owner or admin.
   */
  instructionsFile?: AgentInstructionsCalls | undefined;
  /** Opens the Instructions page, from the chat line that says the agent changed the file. */
  instructionsRequest?: { agentId: string } | null | undefined;
  /** Shows one setting, from a setting card in the chat. A new object shows it again. */
  settingReveal?: AgentSettingReveal | null | undefined;
  /** The panel took the `settingReveal` with this nonce. */
  onSettingRevealHandled?: ((nonce: number) => void) | undefined;
  routineSelectionRequest?: RoutineSelectionRequest | null | undefined;
  onRoutineSelectionRequestHandled?: ((nonce: number) => void) | undefined;
  onOpenRoutineRun?: ((messageId: string, routineId?: string) => void) | undefined;
  /** Opens the side thread where a routine runs. Resolves false when the routine has no thread. */
  onOpenRoutineThread?: ((routineId: string) => Promise<boolean>) | undefined;
  skillsMode?: AgentSkillsMode | undefined;
  /** The joined server that runs the agent, for the `host` skills mode. */
  skillsServerId?: string | undefined;
  skillsMarketplaceOpen?: boolean | undefined;
  /** Another page of the window covers the conversation. */
  workspaceCovered?: boolean | undefined;
  /** The shared data lives on the computer that runs the agents. A joined server shows it to an admin only. */
  tablesVisible?: boolean | undefined;
  /** Names the agent that keeps each set of records. Threaded like `customProviders`, for the same reason. */
  agents?: readonly AgentProfile[] | undefined;
  /** Event routine calls for a host that advertises `events-v1`; absent keeps the released schedule API. */
  eventRoutines?: EventRoutinesApi | undefined;
  /** The released schedule API of a client without the desktop port. Absent, preload sends it. */
  routines?: AgentRoutinesApi | undefined;
  /** A joined host that advertises `routine-run-place-v1` keeps where each routine runs. */
  routineRunPlace?: boolean | undefined;
  /** A joined host that advertises `routines-once-v1` lists and saves the routines that run once. */
  routinesOnce?: boolean | undefined;
  /**
   * Gives the command that runs a routine from a script on the host: this computer, or a joined host
   * that serves `routine-run-command-v1` to this owner or admin. The panel offers it only when the
   * agent allows Local scripts.
   */
  routineRunCommand?: ((input: TestRoutineInput) => Promise<string>) | undefined;
  /**
   * A joined server whose host serves `routine-results-v1` to this owner or admin: its id on desktop,
   * or the calls of the web client.
   */
  routineResultsServerId?: string | RoutineResultsCalls | undefined;
  /** The memory calls of a client without the desktop port. Absent there, the Memories row is hidden. */
  memoriesApi?: AgentMemoriesApi | undefined;
  onCreateSkill?: (() => void) | undefined;
  onTrySkill?: ((skill: SkillDetail) => void) | undefined;
  /** Reads a file in the agent workspace, on the computer that runs the agent. */
  previewWorkspaceFile?: ((path: string) => Promise<FilePreview>) | undefined;
  onAddFromMarketplace?: ((agentId: string) => void) | undefined;
  /** The Files row. Left out for a remote server without `storage-v1`. */
  files?: AgentFilesOptions | undefined;
  /** The profile calls of the host that runs the agent, for an owner or admin. Absent hides the row. */
  browserProfileCalls?: BrowserProfileCalls | undefined;
  /** Opens the Browser profiles section of the settings of the server that runs the agent. */
  onManageBrowserProfiles?: ((trigger: HTMLElement) => void) | undefined;
  /** The user's own level of each agent on the server. Absent when the server cannot keep it. */
  notificationLevelCalls?: AgentNotificationLevelCalls | undefined;
  /** The level of the server that runs the agent. */
  serverNotificationLevel?: ServerNotificationLevel | undefined;
  /** Opens the notification settings of the server that runs the agent. Absent hides the row. */
  onOpenNotificationSettings?: ((trigger: HTMLElement) => void) | undefined;
}

export type { AgentSkillsMode };

/** The Computer row of the panel. */
export interface AgentComputerRow {
  /** A remote desktop session runs. */
  active: boolean;
  /** The remote desktop can open: the server is online, or a session runs. */
  enabled: boolean;
  onOpen: (trigger: HTMLElement) => void;
}

/** Each named profile with the name of its proxy, as the server settings show it. */
function profilesWithProxies(
  state: {
    profiles: readonly BrowserProfileSummary[] | undefined;
    proxies: readonly BrowserProxySummary[] | undefined;
    computers: readonly BrowserProxyComputer[] | undefined;
  },
  t: ReturnType<typeof useText>["t"],
): BrowserProfileSelectProfile[] | undefined {
  const names = browserProfileProxyNames(state.proxies ?? [], state.computers ?? [], t);
  return state.profiles?.map((profile) => ({ ...profile, proxy: names.get(profile.id) }));
}

export default function AgentSettingsPanel(props: AgentSettingsPanelProps) {
  const text = useText();
  const { t, errorMessage, format } = text;
  const sessionSettings = createMemo((): AgentSessionSettingsApi | undefined => {
    if (!props.sessionSettingsEditable) return undefined;
    if (props.remoteClient) return props.adminCalls?.sessionSettings;
    const serverId = props.skillsServerId;
    const api = conversationPort().agent;
    return {
      read: (agentId) => api.readAgentSessionSettings(agentId, serverId),
      set: (input) => api.setAgentSessionSetting(input, serverId),
      reset: (input) => api.resetAgentSessionSetting(input, serverId),
      subscribe: (agentId, listener) =>
        api.onScopedEvent((scoped) => {
          if (
            scoped.serverId === serverId &&
            scoped.event.type === "agent-session-settings-changed" &&
            scoped.event.agentId === agentId
          )
            listener();
        }),
    };
  });
  const [panelWidth, setPanelWidth] = createSidePanelWidth();
  const [draft, setDraft] = createStore({
    tables: { count: 0, open: false },
    memories: { count: 0, open: false },
    routines: { count: 0, open: false },
    files: { open: false },
    instructions: { open: false },
    skills: { count: 0, open: false, reopenAfterMarketplace: false },
  });
  const [routinesList, setRoutinesList] = createSignal<RoutineEditorRecord[]>([]);
  const [localRoutineRequest, setLocalRoutineRequest] = createSignal<RoutineSelectionRequest | null>(null);
  const activeRoutinesCount = createMemo(
    () => routinesList().filter((routine) => routine.active && !routineCompleted(routine)).length,
  );
  type LibraryFilter = "all" | "pages" | "media" | "files";
  const [libraryFilter, setLibraryFilter] = createSignal<LibraryFilter>("all");
  // One store per host. It goes with the host, so the list of the last server never shows for the next.
  const browserProfiles = createMemo(() => {
    const calls = props.browserProfileCalls;
    return calls ? createBrowserProfilesStore(() => calls) : undefined;
  });
  // The summary of an agent on a joined server does not carry its profile, so the panel reads it
  // from the host. Undefined until it arrives, and for an agent on this computer.
  const [hostChoice, setHostChoice] = createSignal<AgentBrowserProfile | undefined>(undefined);
  let choiceRequest = 0;
  // The settings page covers the conversation while it changes the profiles, so the list loads again
  // each time the conversation shows. A change made on another device, such as the phone, shows while
  // the settings are open. The choice of an agent on this computer comes with its summary.
  createEffect(
    () => ({
      store: props.workspaceCovered === true ? undefined : browserProfiles(),
      calls: props.browserProfileCalls,
      agentId: props.agent.id,
      local: props.localHost === true,
    }),
    ({ store, calls, agentId, local }) => {
      // A read that an earlier agent or server started does not show.
      ++choiceRequest;
      setHostChoice(undefined);
      if (!store || !calls) return;
      const failed = (error: unknown) => actionToast.error(errorMessage(error, t("browser.profiles.loadFailed")));
      const readChoice = (report: (error: unknown) => void) => {
        const request = ++choiceRequest;
        calls
          .readAgent(agentId)
          .then((choice) => {
            if (request === choiceRequest) setHostChoice(choice);
          })
          .catch(report);
      };
      store.refresh().catch(failed);
      if (local) return store.follow();
      readChoice(failed);
      // A read after a change keeps the shown choice when it fails; the next change reads it again.
      return store.follow(() => readChoice(() => undefined));
    },
  );
  const browserProfileOptions = (): AgentBrowserProfileOptions | undefined => {
    const store = browserProfiles();
    const manage = props.onManageBrowserProfiles;
    const current = hostChoice();
    if (!store || !manage || (!props.localHost && !current)) return undefined;
    return {
      profiles: profilesWithProxies(store.state, t),
      current,
      onChange: async (agentId, profile) => {
        const saved = await store.assign(agentId, profile);
        if (!props.localHost && agentId === props.agent.id) setHostChoice(saved);
      },
      onCreate: store.create,
      onManage: manage,
    };
  };
  const memoriesPort = createMemo(() =>
    agentMemoriesPort(props.agent.id, props.agent.name, props.memoryLimit ?? null, props.memoriesApi),
  );
  /** The web client shows memories and routines only when its runtime has their calls. */
  const memoriesShown = () => !props.remoteClient || props.memoriesApi !== undefined;
  const routinesShown = () => !props.remoteClient || props.routines !== undefined;
  /** The library holds the files, memories and tables. It shows when it has one of them. */
  const libraryShown = () => Boolean(props.files) || memoriesShown() || props.tablesVisible !== false;
  const legacyRoutinesPort = createMemo(() =>
    agentRoutinesPort(
      props.agent.id,
      // A joined host sends the Local scripts switch of the agent only to an owner or admin.
      (
        props.localHost === true
          ? agentAutomationAllowed(props.agent, props.agentDefaults ?? DEFAULT_AGENT_DEFAULTS)
          : props.agent.allowAutomation === true
      )
        ? props.routineRunCommand
        : undefined,
      // Set only for the host on this computer, the one place the policy is kept.
      props.localHost === true,
      props.routines,
      props.localHost === true || props.routineRunPlace === true,
      props.routineResultsServerId,
      props.localHost === true || props.routinesOnce === true,
    ),
  );
  const routinesPort = createMemo(() => {
    const eventApi = props.eventRoutines ?? props.adminCalls?.eventRoutines;
    return eventApi
      ? eventRoutinesPort({ kind: "agent", id: props.agent.id }, eventApi, legacyRoutinesPort())
      : legacyRoutinesPort();
  });
  const skillsMode = () => props.skillsMode ?? "mutable";
  /** `undefined` uses this computer's catalog; `null` shows only what the host sends. */
  const skillCatalog = () => (props.remoteClient ? (props.skillCatalog ?? null) : undefined);
  const tableCalls = (): SharedTableCalls => props.adminCalls?.sharedTables ?? conversationPort().agent;
  const skillCalls = () =>
    props.adminCalls?.skills ?? agentSkillCalls(skillsMode() === "host" ? props.skillsServerId : undefined);
  const storage = createStorageUsage(
    () => {
      const files = props.files;
      return files ? { serverId: files.serverId, input: { scope: "agent", agentId: props.agent.id } } : null;
    },
    () => props.files?.calls ?? filesPort(),
  );
  const matchesLibraryFilter = (file: StoredFileRow, filter: LibraryFilter): boolean => {
    if (filter === "all") return true;
    const type = fileTypeOf(file);
    if (filter === "pages") return type === "documents" || type === "code";
    if (filter === "media") return type === "images" || type === "media";
    return type === "spreadsheets" || type === "other";
  };
  const filteredLibraryFiles = createMemo(() => {
    const filter = libraryFilter();
    const files = storage.state.usage?.files ?? [];
    return [...files]
      .filter((file) => matchesLibraryFilter(file, filter))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
  const libraryFilesThisWeek = createMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return filteredLibraryFiles().filter((file) => {
      const time = Date.parse(file.createdAt);
      return !Number.isNaN(time) && time >= cutoff;
    });
  });
  const libraryFilesOlder = createMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return filteredLibraryFiles().filter((file) => {
      const time = Date.parse(file.createdAt);
      return Number.isNaN(time) || time < cutoff;
    });
  });
  function openLibraryFile(file: StoredFileRow): void {
    const files = props.files;
    if (!files) return;
    const showInChat = {
      onShowInChat: (row: StoredFileRow) => {
        if (row.messageId) files.onShowMessage(row.messageId);
      },
    };
    if (canPreviewAttachment(file)) {
      files.onPreviewFile(file);
      return;
    }
    void storage.fileAction(file, "open", showInChat);
  }
  let lastSkillsMarketplaceOpen = untrack(() => props.skillsMarketplaceOpen === true);
  createEffect(
    () => panelWidth(),
    (width) => {
      props.onWidthChange(width);
    },
  );

  // An effect runs again for an equal value, and each activity of the agent gives a new agent
  // object. The memo keeps an open view, such as a routine edit, until the agent changes.
  const currentAgentId = createMemo(() => props.agent.id);

  // The user's own level of each agent. Undefined while it loads, and when the read fails: the row
  // then stays hidden. Another device can change it, so it loads again for each agent.
  const [ownLevels, setOwnLevels] = createSignal<ReadonlyMap<string, ServerNotificationLevel> | undefined>(undefined);
  let levelsRequest = 0;
  let levelsCalls: AgentNotificationLevelCalls | undefined;
  createEffect(
    () => ({ calls: props.notificationLevelCalls, agentId: currentAgentId() }),
    ({ calls }) => {
      const request = ++levelsRequest;
      // The levels of the last server must not show for the next one.
      if (calls !== levelsCalls) {
        levelsCalls = calls;
        setOwnLevels(undefined);
      }
      if (!calls) return;
      calls.list().then(
        (snapshot) => {
          if (request === levelsRequest) setOwnLevels(agentNotificationLevelMap(snapshot));
        },
        () => undefined,
      );
    },
  );
  // A change on another device of the user shows at once.
  createEffect(
    () => props.notificationLevelCalls,
    (calls) => {
      if (!calls?.subscribe) return;
      return calls.subscribe((snapshot) => {
        if (calls === levelsCalls) {
          ++levelsRequest;
          setOwnLevels(agentNotificationLevelMap(snapshot));
        }
      });
    },
  );
  const notificationLevelOptions = (): AgentNotificationLevelOptions | undefined => {
    const open = props.onOpenNotificationSettings;
    const levels = ownLevels();
    if (!open || !levels) return undefined;
    return {
      current: levels.get(props.agent.id) ?? null,
      serverLevel: props.serverNotificationLevel ?? "all",
      onOpen: open,
    };
  };
  let routinesRequest = 0;
  createEffect(
    () => ({
      agentId: currentAgentId(),
      // Read here, not in the callback: a prop can be a compiled memo, and the callback has no owner.
      remoteClient: untrack(() => props.remoteClient === true),
      tablesVisible: untrack(() => props.tablesVisible !== false),
      memories: untrack(memoriesShown),
      routines: untrack(routinesShown),
    }),
    ({ agentId, remoteClient, tablesVisible, memories, routines }) => {
      setRoutinesList([]);
      setLocalRoutineRequest(null);
      setLibraryFilter("all");
      setDraft((state) => {
        state.tables.open = false;
        state.memories.open = false;
        state.routines.open = false;
        state.files.open = false;
        state.instructions.open = false;
        state.skills.open = false;
        state.skills.reopenAfterMarketplace = false;
      });
      if (!remoteClient || tablesVisible) {
        void tableCalls()
          .listTables()
          .catch(() => [])
          .then((items) => {
            setDraft((state) => {
              state.tables.count = items.length;
            });
          });
      }
      void untrack(() => loadSkillsCount(agentId));
      if (memories) untrack(() => loadMemoriesCount(memoriesPort()));
      if (routines) untrack(() => loadRoutines(routinesPort()));
    },
  );

  // The counts follow a memory or routine change, also one that the agent makes in a turn.
  createEffect(
    () => ({
      memories: memoriesShown() ? memoriesPort() : null,
      routines: routinesShown() ? routinesPort() : null,
    }),
    ({ memories, routines }) => {
      const stopMemories = memories?.subscribe(() => loadMemoriesCount(memories));
      const stopRoutines = routines?.subscribe(() => loadRoutines(routines));
      return () => {
        stopMemories?.();
        stopRoutines?.();
      };
    },
  );

  function loadMemoriesCount(port: MemoriesPort): void {
    void port
      .list()
      .catch(() => [])
      .then((items) => {
        setDraft((state) => {
          state.memories.count = items.length;
        });
      });
  }

  function loadRoutines(port: RoutinesPort): void {
    const request = ++routinesRequest;
    void port
      .list()
      .catch((): RoutineEditorRecord[] => [])
      .then((items) => {
        if (request !== routinesRequest) return;
        setRoutinesList(items);
        setDraft((state) => {
          state.routines.count = items.length;
        });
      });
  }

  // The count follows a skill change made anywhere, as the dialog does.
  createEffect(
    () => [props.agent.id, skillsMode(), skillCalls()] as const,
    ([agentId, mode, calls]) => {
      if (mode === "hidden" || !calls.onChanged) return;
      return calls.onChanged((changedId) => {
        if (changedId === agentId) void loadSkillsCount(agentId);
      });
    },
  );

  async function loadSkillsCount(agentId: string): Promise<void> {
    if (skillsMode() === "hidden") {
      setDraft((state) => {
        state.skills.count = 0;
      });
      return;
    }
    try {
      const items =
        skillsMode() === "readonly"
          ? await skillsPort().agent.listInstalledSkills(agentId)
          : await skillCalls().listInstalled(agentId);
      setDraft((state) => {
        // The same list as the skills dialog, so the row and the dialog show the same number.
        state.skills.count = userAssignedSkills(items).length;
      });
    } catch {
      setDraft((state) => {
        state.skills.count = 0;
      });
    }
  }

  createEffect(
    () => ({
      open: props.skillsMarketplaceOpen === true,
      // Read here, not in the callback: the prop can be a compiled memo, and the callback has no owner.
      covered: untrack(() => props.workspaceCovered === true),
    }),
    ({ open, covered }) => {
      if (lastSkillsMarketplaceOpen && !open && untrack(() => draft.skills.reopenAfterMarketplace)) {
        // The Marketplace page can close for another page. The skills dialog then stays closed.
        setDraft((state) => {
          state.skills.reopenAfterMarketplace = false;
          state.skills.open = !covered;
        });
      }
      lastSkillsMarketplaceOpen = open;
    },
  );

  createEffect(
    () => ({ request: props.routineSelectionRequest, agentId: props.agent.id }),
    ({ request }) => {
      if (request) {
        setLocalRoutineRequest(null);
        setDraft((state) => {
          state.routines.open = true;
        });
      }
    },
  );

  // The request stays set after the dialog closes, and it is read again at each activity of the agent.
  // The memo opens the dialog again only for a new request.
  const skillSelectionRequest = createMemo(() => props.skillSelectionRequest);
  createEffect(skillSelectionRequest, (request) => {
    if (request)
      setDraft((state) => {
        state.skills.open = true;
      });
  });

  // Like the skill request: a new request object opens the page again.
  const instructionsRequest = createMemo(() => props.instructionsRequest);
  createEffect(instructionsRequest, (request) => {
    if (request)
      setDraft((state) => {
        state.instructions.open = true;
      });
  });

  // A setting card opens the page of a link row here, and gives each other row to the shared panel.
  const settingReveal = createMemo(() => props.settingReveal);
  const [panelReveal, setPanelReveal] = createSignal<AgentSettingReveal | null>(null);
  // The open detail page that can hold a card, such as to ask before it discards an edit.
  let detailLeaveGuard: DetailLeaveGuard | null = null;
  createEffect(settingReveal, (request) => {
    if (!request) return;
    props.onSettingRevealHandled?.(request.nonce);
    const guard = detailLeaveGuard;
    untrack(() => (guard ? guard(() => revealSetting(request)) : revealSetting(request)));
  });
  function revealSetting(request: AgentSettingReveal): void {
    const detail = revealDetail(request.settingId);
    setDraft((state) => {
      state.instructions.open = detail === "instructions";
      state.memories.open = detail === "memories";
      state.skills.open = detail === "skills";
      state.routines.open = detail === "routines";
      state.files.open = false;
    });
    // A detail page covers the panel, and its Back goes to the root list that holds its link row, so the
    // panel still moves to that page. The skills dialog opens over the page that the panel shows.
    setPanelReveal(detail === "skills" ? null : request);
  }
  /** The page that a link row opens for the setting, when this agent shows that row. */
  function revealDetail(settingId: AgentSettingLinkId): "instructions" | "memories" | "skills" | "routines" | null {
    if (settingId === "agent.instructions" && props.instructionsFile) return "instructions";
    if (settingId === "agent.memories" && memoriesShown()) return "memories";
    if (settingId === "agent.skills" && skillsMode() !== "hidden") return "skills";
    if (settingId === "agent.routines" && routinesShown()) return "routines";
    return null;
  }

  return (
    <SharedAgentSettingsPanel
      {...props}
      reveal={panelReveal()}
      browserProfiles={browserProfileOptions()}
      notificationLevel={notificationLevelOptions()}
      width={panelWidth()}
      onResize={setPanelWidth}
      onResizeEnd={saveSidePanelWidth}
      preferredWidth={readSidePanelWidth}
      onUnshownSaveError={(message) =>
        actionToast.error(message, {
          id: "agent-settings-save-failed",
          report: { operation: "settings", source: "action", cause_code: "unknown" },
        })
      }
      detailOpen={draft.routines.open || draft.files.open || draft.memories.open || draft.instructions.open}
      overview={
        <>
          <Show when={props.modelPicker || props.computer}>
            <SettingsLinkGroup inset class="agent-settings-overview-card agent-settings-summary-card">
              <Show when={props.modelPicker}>
                {(picker) => (
                  <div class="agent-settings-model-row">
                    <span class="settings-link-text">{t("agentSettings.groups.model")}</span>
                    <ProviderModelPicker {...picker()} variant="pill" ariaLabel={t("agentSettings.runtime.model")} />
                  </div>
                )}
              </Show>
              <Show when={props.computer}>
                {(computer) => (
                  <SettingsLinkRow
                    label={t("agentSettings.links.computer")}
                    value={
                      <span class="agent-settings-computer-status">
                        <span
                          class={[
                            "agent-settings-computer-dot",
                            { "agent-settings-computer-dot-active": computer().active },
                          ]}
                          aria-hidden="true"
                        />
                        <span>
                          {computer().active
                            ? t("agentSettings.links.computerActive")
                            : computer().enabled
                              ? t("agentSettings.links.computerAsleep")
                              : t("agentSettings.links.computerOffline")}
                        </span>
                      </span>
                    }
                    onClick={(trigger) => {
                      if (computer().enabled) computer().onOpen(trigger);
                    }}
                  />
                )}
              </Show>
            </SettingsLinkGroup>
          </Show>
          <Show when={props.sessions}>{(sessions) => <AgentSessions {...sessions()} />}</Show>
          <Show when={routinesShown()}>
            <SettingsLinkGroup inset class="agent-settings-overview-card">
              <SettingsLinkRow
                label={t("agentSettings.links.routines")}
                value={
                  activeRoutinesCount() > 0
                    ? t("agentSettings.links.routinesActive", { count: activeRoutinesCount() })
                    : draft.routines.count > 0
                      ? t("agentSettings.links.routinesCount", { count: draft.routines.count })
                      : t("agentSettings.links.routinesNone")
                }
                onClick={() => {
                  setLocalRoutineRequest(null);
                  setDraft((state) => {
                    state.routines.open = true;
                  });
                }}
              />
            </SettingsLinkGroup>
          </Show>
        </>
      }
      libraryOverview={
        libraryShown() ? (
          <div class="agent-library-tab">
            <SettingsLinkGroup inset class="agent-settings-overview-card">
              <Show when={props.files}>
                <SettingsLinkRow
                  icon={<Folder aria-hidden="true" />}
                  label={t("agentSettings.links.files")}
                  value={storage.state.usage ? agentFilesLinkValue(storage.state.usage.breakdown) : undefined}
                  onClick={() =>
                    setDraft((state) => {
                      state.files.open = true;
                    })
                  }
                />
              </Show>
              <Show when={memoriesShown()}>
                <SettingsLinkRow
                  icon={<BookMarked aria-hidden="true" />}
                  label={t("agentSettings.links.memories")}
                  value={t("agentSettings.links.memoriesCount", { count: draft.memories.count })}
                  onClick={() =>
                    setDraft((state) => {
                      state.memories.open = true;
                    })
                  }
                />
              </Show>
              <Show when={props.tablesVisible !== false}>
                <SettingsLinkRow
                  icon={<Table2 aria-hidden="true" />}
                  label={t("agentSettings.links.tables")}
                  value={t("agentSettings.links.tablesCount", { count: draft.tables.count })}
                  onClick={() =>
                    setDraft((state) => {
                      state.tables.open = true;
                    })
                  }
                />
              </Show>
            </SettingsLinkGroup>
            <Show when={props.files}>
              <fieldset class="agent-library-chips" aria-label={t("agentSettings.library.filter.label")}>
                <For
                  each={
                    [
                      { id: "all", label: "agentSettings.library.filter.all" },
                      { id: "pages", label: "agentSettings.library.filter.pages" },
                      { id: "media", label: "agentSettings.library.filter.media" },
                      { id: "files", label: "agentSettings.library.filter.files" },
                    ] as const
                  }
                >
                  {(chip) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      class={["agent-library-chip", { "agent-library-chip-active": libraryFilter() === chip.id }]}
                      aria-pressed={libraryFilter() === chip.id ? "true" : "false"}
                      onClick={() => setLibraryFilter(chip.id)}
                    >
                      {t(chip.label)}
                    </Button>
                  )}
                </For>
              </fieldset>
              <Show
                when={filteredLibraryFiles().length > 0}
                fallback={
                  <SettingsLinkGroup inset class="agent-settings-overview-card">
                    <p class="agent-library-empty">
                      {libraryFilter() === "all" && (storage.state.usage?.files.length ?? 0) === 0
                        ? t("files.list.emptyTitle")
                        : t("agentSettings.library.emptyFiltered")}
                    </p>
                  </SettingsLinkGroup>
                }
              >
                <Show when={libraryFilesThisWeek().length > 0}>
                  <SettingsLinkGroup
                    inset
                    title={t("agentSettings.library.period.thisWeek")}
                    class="agent-settings-overview-card"
                  >
                    <For each={libraryFilesThisWeek()}>
                      {(file) => (
                        <Button
                          variant="ghost"
                          type="button"
                          class="agent-library-file-row"
                          onClick={() => openLibraryFile(file)}
                        >
                          <span class="agent-library-file-icon">
                            <AttachmentReferenceVisual name={file.name} />
                          </span>
                          <span class="agent-library-file-copy">
                            <span class="agent-library-file-name" dir="auto">
                              {file.name}
                            </span>
                            <span class="agent-library-file-meta">
                              {format.fileSize(file.size)} · {sidebarMessageTime(file.createdAt, format)}
                            </span>
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </Button>
                      )}
                    </For>
                  </SettingsLinkGroup>
                </Show>
                <Show when={libraryFilesOlder().length > 0}>
                  <SettingsLinkGroup
                    inset
                    title={t("agentSettings.library.period.older")}
                    class="agent-settings-overview-card"
                  >
                    <For each={libraryFilesOlder()}>
                      {(file) => (
                        <Button
                          variant="ghost"
                          type="button"
                          class="agent-library-file-row"
                          onClick={() => openLibraryFile(file)}
                        >
                          <span class="agent-library-file-icon">
                            <AttachmentReferenceVisual name={file.name} />
                          </span>
                          <span class="agent-library-file-copy">
                            <span class="agent-library-file-name" dir="auto">
                              {file.name}
                            </span>
                            <span class="agent-library-file-meta">
                              {format.fileSize(file.size)} · {sidebarMessageTime(file.createdAt, format)}
                            </span>
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </Button>
                      )}
                    </For>
                  </SettingsLinkGroup>
                </Show>
              </Show>
            </Show>
          </div>
        ) : undefined
      }
      links={
        <>
          <Show when={props.pins}>
            {(pins) => (
              <SettingsLinkGroup inset class="agent-settings-overview-card">
                <PinnedMessages {...pins()} variant="row" />
              </SettingsLinkGroup>
            )}
          </Show>
          <Show when={sessionSettings()}>
            {(api) => (
              <AgentSessionSettings
                agentId={props.agent.id}
                providerIdentity={`${props.runtimeSettings.provider}:${props.runtimeSettings.model}`}
                api={api()}
              />
            )}
          </Show>
          <Show when={skillsMode() !== "hidden" || props.instructionsFile}>
            <SettingsLinkGroup inset title={t("agentSettings.groups.knows")}>
              <Show when={props.instructionsFile}>
                <SettingsLinkRow
                  icon={<FileText aria-hidden="true" />}
                  label={t("agentSettings.instructions")}
                  onClick={() =>
                    setDraft((state) => {
                      state.instructions.open = true;
                    })
                  }
                />
              </Show>
              <Show when={skillsMode() !== "hidden"}>
                <SettingsLinkRow
                  icon={<Puzzle aria-hidden="true" />}
                  label={t("agentSettings.links.skills")}
                  value={t("agentSettings.links.skillsCount", { count: draft.skills.count })}
                  onClick={() =>
                    setDraft((state) => {
                      state.skills.open = true;
                    })
                  }
                />
              </Show>
            </SettingsLinkGroup>
          </Show>
          <Show when={props.onOpenUsage || props.onOpenApps || props.onPublish}>
            <SettingsLinkGroup inset title={t("agentSettings.groups.does")}>
              <Show when={props.onOpenUsage}>
                <SettingsLinkRow
                  icon={<Gauge aria-hidden="true" />}
                  label={t("agentSettings.links.usage")}
                  onClick={(trigger) => props.onOpenUsage?.(trigger)}
                />
              </Show>
              {/* Apps are the server's, not this agent's, so the row says that every agent gets them. */}
              <Show when={props.onOpenApps}>
                <SettingsLinkRow
                  icon={<Blocks aria-hidden="true" />}
                  label={t("agentSettings.links.apps")}
                  value={t("agentSettings.links.appsScope")}
                  onClick={() => props.onOpenApps?.()}
                />
              </Show>
              <Show when={props.onPublish}>
                <SettingsLinkRow
                  icon={<Upload aria-hidden="true" />}
                  label={t("conversation.header.publish")}
                  onClick={() => props.onPublish?.()}
                />
              </Show>
            </SettingsLinkGroup>
          </Show>
        </>
      }
    >
      <Show when={draft.instructions.open && props.instructionsFile}>
        {(calls) => (
          <AgentInstructionsView
            agentId={props.agent.id}
            folder={props.agent.workspacePath}
            working={props.working}
            calls={calls()}
            onBack={() =>
              setDraft((state) => {
                state.instructions.open = false;
              })
            }
            onClose={props.onClose}
          />
        )}
      </Show>
      <Show when={draft.files.open && props.files}>
        {(files) => (
          <AgentFilesSettings
            {...files()}
            agentName={props.agent.name}
            storage={storage}
            onBack={() =>
              setDraft((state) => {
                state.files.open = false;
              })
            }
            onClose={props.onClose}
          />
        )}
      </Show>
      <Show when={draft.routines.open}>
        <div class="agent-routines-overlay">
          <AgentRoutinesSettings
            port={routinesPort()}
            onCountChange={(count) =>
              setDraft((state) => {
                state.routines.count = count;
              })
            }
            onBack={() => {
              setDraft((state) => {
                state.routines.open = false;
              });
              setLocalRoutineRequest(null);
            }}
            onClose={props.onClose}
            registerLeaveGuard={(guard) => {
              detailLeaveGuard = guard;
            }}
            selectionRequest={localRoutineRequest() ?? props.routineSelectionRequest}
            onSelectionRequestHandled={(nonce) => {
              if (localRoutineRequest()?.nonce === nonce) {
                setLocalRoutineRequest(null);
                return;
              }
              props.onRoutineSelectionRequestHandled?.(nonce);
            }}
            onOpenRun={props.onOpenRoutineRun}
            onOpenThread={props.onOpenRoutineThread}
            agentName={props.agent.name}
          />
        </div>
      </Show>
      <Show when={props.tablesVisible !== false}>
        <SharedTablesModal
          agents={props.agents ?? []}
          calls={props.adminCalls?.sharedTables}
          open={draft.tables.open}
          onOpenChange={(open) =>
            setDraft((state) => {
              state.tables.open = open;
            })
          }
          onCountChange={(count) =>
            setDraft((state) => {
              state.tables.count = count;
            })
          }
        />
      </Show>
      <AgentMemoriesSettings
        port={memoriesPort()}
        open={draft.memories.open}
        onBack={() =>
          setDraft((state) => {
            state.memories.open = false;
          })
        }
        onClose={props.onClose}
        onCountChange={(count) =>
          setDraft((state) => {
            state.memories.count = count;
          })
        }
      />
      <Show when={skillsMode() !== "hidden"}>
        <AgentSkillsModal
          selectionRequest={props.skillSelectionRequest}
          agentId={props.agent.id}
          agentName={props.agent.name}
          open={draft.skills.open}
          skillsMode={skillsMode()}
          serverId={props.skillsServerId}
          calls={props.adminCalls?.skills}
          catalog={skillCatalog()}
          onCreateSkill={props.onCreateSkill}
          onTrySkill={props.onTrySkill}
          previewWorkspaceFile={props.previewWorkspaceFile}
          onAddFromMarketplace={
            props.onAddFromMarketplace
              ? (agentId) => {
                  setDraft((state) => {
                    state.skills.reopenAfterMarketplace = true;
                    state.skills.open = false;
                  });
                  props.onAddFromMarketplace?.(agentId);
                }
              : undefined
          }
          onOpenChange={(open) =>
            setDraft((state) => {
              state.skills.open = open;
            })
          }
          onCountChange={(count) =>
            setDraft((state) => {
              state.skills.count = count;
            })
          }
        />
      </Show>
    </SharedAgentSettingsPanel>
  );
}
