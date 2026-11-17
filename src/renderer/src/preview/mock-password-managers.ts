import {
  disconnectedPasswordManager,
  type OpenBotDesktopApi,
  type PasswordManagerId,
  type PasswordManagerMethod,
  type PasswordManagerStatus,
} from "@openbot/contracts/ipc";

type PasswordManagersApi = OpenBotDesktopApi["passwordManagers"];

/** How long the mock sign-in takes in the browser, and to make the vault and its key. */
const MOCK_SIGN_IN_MS = 2_500;
const MOCK_SETUP_MS = 1_500;
/** How long the mock Keeper takes to ask for the approval of the device. */
const MOCK_KEEPER_APPROVAL_MS = 1_200;
/** The mock key expires one year after it is made. */
const MOCK_KEY_DAYS = 365;
/** The only code that the mock Keeper takes. An empty code means that the user approved the device. */
const MOCK_KEEPER_CODE = "123456";

const SIGN_IN_URL = "https://account.proton.me/authorize?app=proton-pass-cli";

const MANAGERS: readonly PasswordManagerId[] = ["protonpass", "keeper"];

const METHODS = {
  protonpass: ["browser", "key"],
  keeper: ["account"],
} as const satisfies Partial<Record<PasswordManagerId, PasswordManagerMethod[]>>;

const methodsOf = (manager: PasswordManagerId): PasswordManagerMethod[] =>
  manager === "keeper" ? [...METHODS.keeper] : [...METHODS.protonpass];

function idle(manager: PasswordManagerId): PasswordManagerStatus {
  return disconnectedPasswordManager(manager, methodsOf(manager));
}

function connected(manager: PasswordManagerId): PasswordManagerStatus {
  return {
    ...idle(manager),
    state: "connected",
    vaultNames: ["Shared with OpenBot"],
    loginCount: 12,
    // Keeper keeps no access key, so its connection does not expire on a date.
    expiresAt: manager === "keeper" ? null : Date.now() + MOCK_KEY_DAYS * 24 * 60 * 60 * 1_000,
  };
}

/**
 * Proton Pass and Keeper. A Proton Pass browser connection names the sign-in page, then the user signs
 * in in the browser, then the host makes the vault and its key. An access key connects at once. A Keeper
 * account connection asks for the approval of the device, then the host makes the folder. The preview
 * opens no page: "Open again" does nothing.
 */
export function createMockPasswordManagers(): PasswordManagersApi {
  const statuses = new Map<PasswordManagerId, PasswordManagerStatus>(MANAGERS.map((id) => [id, idle(id)]));
  /** Each connect, cancel and disconnect replaces the sign-in that a timer waits for. */
  const attempts = new Map<PasswordManagerId, number>();
  const listeners = new Set<(status: PasswordManagerStatus) => void>();
  const current = (manager: PasswordManagerId) => statuses.get(manager) ?? idle(manager);
  const set = (next: PasswordManagerStatus): PasswordManagerStatus => {
    statuses.set(next.manager, next);
    for (const listener of listeners) listener({ ...next });
    return { ...next };
  };
  const nextAttempt = (manager: PasswordManagerId) => {
    const attempt = (attempts.get(manager) ?? 0) + 1;
    attempts.set(manager, attempt);
    return attempt;
  };
  const later = (manager: PasswordManagerId, attempt: number, ms: number, next: () => PasswordManagerStatus) => {
    setTimeout(() => {
      if (attempt === attempts.get(manager)) set(next());
    }, ms);
  };
  const reset = (manager: PasswordManagerId) => {
    nextAttempt(manager);
    return set(idle(manager));
  };
  const signingIn = (manager: PasswordManagerId): PasswordManagerStatus => ({
    ...idle(manager),
    state: "signing-in",
  });

  const api = {
    list: async () => MANAGERS.map((id) => ({ ...current(id) })),
    connect: async ({ manager, method }) => {
      const attempt = nextAttempt(manager);
      if (method.kind === "key") return set(connected(manager));
      if (manager === "keeper") {
        if (method.kind === "account") {
          later(manager, attempt, MOCK_KEEPER_APPROVAL_MS, () => ({ ...signingIn(manager), step: "device-approval" }));
          return set({ ...signingIn(manager), step: "setup" });
        }
        if (method.kind === "code") {
          if (method.code !== "" && method.code !== MOCK_KEEPER_CODE) {
            return set({
              ...signingIn(manager),
              step: "device-approval",
              errorCode: "code",
              error: "The code is not correct. Enter it again.",
            });
          }
          later(manager, attempt, MOCK_SETUP_MS, () => connected(manager));
          return set({ ...signingIn(manager), step: "setup" });
        }
        return set(current(manager));
      }
      const signing = signingIn(manager);
      later(manager, attempt, MOCK_SIGN_IN_MS, () => ({ ...signing, step: "setup" }));
      later(manager, attempt, MOCK_SIGN_IN_MS + MOCK_SETUP_MS, () => connected(manager));
      return set({ ...signing, step: "browser", signInUrl: SIGN_IN_URL });
    },
    cancel: async (manager) => reset(manager),
    disconnect: async (manager) => reset(manager),
    openSignIn: async () => undefined,
    onChanged: (listener: (status: PasswordManagerStatus) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  } satisfies Omit<PasswordManagersApi, `host${string}`>;
  // The preview has one connection for each manager, so a joined server shows the same ones.
  return {
    ...api,
    hostList: () => api.list(),
    hostConnect: (input) => api.connect(input),
    hostCancel: (manager) => api.cancel(manager),
    hostDisconnect: (manager) => api.disconnect(manager),
    hostOpenSignIn: () => api.openSignIn(),
  };
}
