import type { PasswordManagerStatus } from "@openbot/contracts/ipc";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  Field,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  PlushLoader,
  SettingsSection,
  TriangleAlert,
} from "@openbot/ui";
import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import { useText } from "../../text";
import { KeeperTile } from "./brand-marks";
import {
  IntegrationPage,
  type IntegrationPageSlots,
  Stepper,
  WizardDialog,
  type WizardLink,
} from "./IntegrationLayout";
import {
  SharedVaultSection,
  VaultDangerZone,
  VaultRow,
  type VaultStatus,
  vaultFailure,
  vaultHeader,
} from "./VaultParts";

export interface KeeperConnectorPanelProps extends IntegrationPageSlots {
  /** The status from the shared password manager engine. It never holds a password or a code. */
  status: PasswordManagerStatus;
  /** True while an action runs. Every button waits for it. */
  busy: boolean;
  /** The joined server whose connection this is. Absent: this computer's. */
  hostName?: string | undefined;
  /**
   * Why the last status read failed, when no newer status came. The state is not known: the page
   * shows the reason and Retry, not the setup of a connection that may be there.
   */
  statusError?: string | null | undefined;
  /** Reads the status again. */
  onRetry?: (() => void) | undefined;
  /** Signs in with the account. The host gives the email and the master password to Keeper Commander once. */
  onConnect: (email: string, password: string) => void;
  /** Sends the code that Keeper asks for. In the `device-approval` step an empty code means "I approved it". */
  onSubmitCode: (code: string) => void;
  /** Stops the sign-in. */
  onCancel: () => void;
  onDisconnect: () => void;
}

/**
 * The connect dialog shows one of these. `failed` is a sign-in that stopped, and `connected` stays
 * until the user closes the dialog. The host never sends `browser` or `extra-password` for Keeper;
 * they count as `setup`.
 */
type ConnectStep = "setup" | "two-factor" | "device-approval" | "connected" | "failed";

function connectStep(status: PasswordManagerStatus): ConnectStep {
  if (status.state === "connected") return "connected";
  if (status.state !== "signing-in") return "failed";
  return status.step === "two-factor" || status.step === "device-approval" ? status.step : "setup";
}

/** True while the host waits for a code. */
function asksForCode(step: ConnectStep): step is "two-factor" | "device-approval" {
  return step === "two-factor" || step === "device-approval";
}

/** True when the Keeper session ended, so the user connects again. */
function expired(status: PasswordManagerStatus): boolean {
  return status.errorCode === "expired";
}

const KEEPER_STATUS = {
  disconnected: { status: "idle", label: "marketplace.app.notConnected" },
  connecting: { status: "connecting", label: "connector.keeper.statusConnecting" },
  connected: { status: "connected", label: "connector.keeper.statusConnected" },
  expired: { status: "attention", label: "connector.keeper.statusExpired" },
} as const satisfies Record<"disconnected" | "connecting" | "connected" | "expired", VaultStatus>;

/** The status of the connection, as its page header and every list of connectors show it. */
export function keeperStatus(props: Pick<KeeperConnectorPanelProps, "status" | "statusError">) {
  const status = props.status;
  const state = expired(status)
    ? "expired"
    : status.state === "signing-in"
      ? "connecting"
      : status.state === "connected"
        ? "connected"
        : "disconnected";
  return vaultHeader(props.statusError, KEEPER_STATUS[state]);
}

/**
 * The Keeper page of one OpenBot computer or joined server. The user enters the account email and
 * master password. The host gives them to Keeper Commander once and keeps no copy of them. Keeper can
 * then ask for a two-step code or for approval of this device. The host makes the folder
 * "Shared with OpenBot" in the vault and reads the logins in it.
 *
 * Connect opens a dialog with the steps. × closes the dialog and the sign-in goes on: the page shows
 * the current step, and "Show steps" opens the dialog again. Cancel stops the sign-in.
 */
export function KeeperConnectorPanel(props: KeeperConnectorPanelProps) {
  const { t } = useText();
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  /** True after Keeper asked for a code in this sign-in, so the last `setup` step is the folder. */
  const [verified, setVerified] = createSignal(false);
  // A sign-in that asks for a code shows its dialog, also after the user closed it.
  createEffect(
    () => (props.status.state === "signing-in" ? connectStep(props.status) : null),
    (step) => {
      if (step === null) setVerified(false);
      else if (asksForCode(step)) {
        setVerified(true);
        setDialogOpen(true);
      }
    },
  );
  const header = () => keeperStatus(props);
  const signingIn = () => props.status.state === "signing-in";
  const connected = () => props.status.state === "connected";
  const ended = () => expired(props.status);
  const showForm = () => !props.statusError && !signingIn() && (!connected() || ended());
  const failure = () => {
    const code = props.status.errorCode;
    if (dialogOpen() || code === "plan" || code === "expired") return null;
    return vaultFailure(t("connector.keeper.actionFailed"), props.statusError, props.status.error);
  };
  const folderName = () => props.status.vaultNames[0] ?? t("connector.keeper.folderName");
  const loginCount = () => {
    const count = props.status.loginCount;
    return count === null ? t("connector.keeper.loginsLoading") : t("connector.keeper.loginCount", { count });
  };

  const submitAccount = (event: SubmitEvent) => {
    event.preventDefault();
    const address = email().trim();
    const secret = password();
    if (!address || !secret || props.busy) return;
    // The master password leaves the form when the request starts, so the page keeps no copy.
    setPassword("");
    setDialogOpen(true);
    props.onConnect(address, secret);
  };
  const cancel = () => {
    setDialogOpen(false);
    props.onCancel();
  };

  return (
    <IntegrationPage
      class="keeper-connector"
      logo={<KeeperTile />}
      name={t("connector.keeper.title")}
      subtitle={
        props.hostName
          ? t("connector.keeper.descriptionHost", { host: props.hostName })
          : t("connector.keeper.description")
      }
      status={header().status}
      statusLabel={t(header().label)}
      readError={props.statusError}
      onRetry={props.onRetry}
      failure={failure()}
      alert={
        <Switch>
          <Match when={!props.statusError && ended()}>
            <Alert tone="warning" role="alert">
              <AlertIcon>
                <TriangleAlert />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>{t("connector.keeper.expiredTitle")}</AlertTitle>
                <AlertDescription>{t("connector.keeper.expiredDescription")}</AlertDescription>
              </AlertContent>
            </Alert>
          </Match>
          <Match when={!props.statusError && !dialogOpen() && props.status.errorCode === "plan"}>
            <Alert tone="warning" role="alert">
              <AlertIcon>
                <TriangleAlert />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>{t("connector.keeper.planTitle")}</AlertTitle>
                <AlertDescription>{t("connector.keeper.planDescription")}</AlertDescription>
              </AlertContent>
            </Alert>
          </Match>
        </Switch>
      }
      tagline={props.tagline}
      intro={props.intro}
      details={props.details}
      // With the state not known, the page offers neither the setup nor Disconnect.
      danger={
        <VaultDangerZone
          show={!props.statusError && connected()}
          title={t("connector.keeper.disconnectTitle")}
          description={
            props.hostName
              ? t("connector.keeper.disconnectSummaryHost", { host: props.hostName })
              : t("connector.keeper.disconnectSummary")
          }
          action={t("connector.keeper.disconnect")}
          busy={props.busy}
          onDisconnect={props.onDisconnect}
        />
      }
    >
      <Show when={!props.statusError}>
        <Show when={signingIn()}>
          <SettingsSection title={t("connector.keeper.setupTitle")}>
            <ItemGroup class="settings-modal-card">
              <StepRow
                status={props.status}
                hostName={props.hostName}
                folderName={folderName()}
                verified={verified()}
                onShowSteps={() => setDialogOpen(true)}
              />
            </ItemGroup>
          </SettingsSection>
        </Show>
        <Show when={showForm()}>
          <SettingsSection
            title={t("connector.keeper.setupTitle")}
            description={
              props.hostName
                ? t("connector.keeper.setupDescriptionHost", { host: props.hostName })
                : t("connector.keeper.setupDescription")
            }
          >
            <ItemGroup class="settings-modal-card">
              <div class="integration-card-body">
                <form class="bitwarden-connector-host-form" onSubmit={submitAccount}>
                  <Field label={t("connector.keeper.emailLabel")}>
                    <Input
                      type="email"
                      size="sm"
                      autocomplete="email"
                      spellcheck={false}
                      value={email()}
                      onInput={(event) => setEmail(event.currentTarget.value)}
                    />
                  </Field>
                  <Field label={t("connector.keeper.passwordLabel")}>
                    <Input
                      type="password"
                      size="sm"
                      autocomplete="off"
                      spellcheck={false}
                      value={password()}
                      onInput={(event) => setPassword(event.currentTarget.value)}
                    />
                  </Field>
                  <div class="bitwarden-connector-actions">
                    <Button type="submit" size="sm" loading={props.busy} disabled={!email().trim() || !password()}>
                      {t("connector.keeper.connect")}
                    </Button>
                  </div>
                </form>
              </div>
              <VaultRow title={folderName()} description={t("connector.keeper.folderSetup")} />
            </ItemGroup>
          </SettingsSection>
        </Show>
        <Show when={connected() && !ended()}>
          <SharedVaultSection
            title={t("connector.keeper.folderTitle")}
            description={t("connector.keeper.folderDescription")}
          >
            <VaultRow title={folderName()} description={loginCount()} />
          </SharedVaultSection>
        </Show>
      </Show>

      <ConnectDialog
        open={dialogOpen()}
        status={props.status}
        busy={props.busy}
        hostName={props.hostName}
        folderName={folderName()}
        verified={verified()}
        onClose={() => setDialogOpen(false)}
        onCancel={cancel}
        onSubmitCode={props.onSubmitCode}
      />
    </IntegrationPage>
  );
}

/** The title and the description of the dialog, and of the page row while the sign-in runs. */
function stepText(
  status: PasswordManagerStatus,
  hostName: string | undefined,
  folderName: string,
  verified: boolean,
  text: ReturnType<typeof useText>,
) {
  const { t, sourceText } = text;
  const wrongCode = status.errorCode === "code";
  switch (connectStep(status)) {
    case "setup":
      return verified
        ? {
            title: t("connector.keeper.setupStepTitle"),
            description: t("connector.keeper.setupStepDescription", { folder: folderName }),
          }
        : {
            title: t("connector.keeper.signInTitle"),
            description: hostName
              ? t("connector.keeper.signInDescriptionHost", { host: hostName })
              : t("connector.keeper.signInDescription"),
          };
    case "two-factor":
      return {
        title: t("connector.keeper.twoFactorTitle"),
        description: wrongCode ? t("connector.keeper.codeWrong") : t("connector.keeper.twoFactorDescription"),
      };
    case "device-approval":
      return {
        title: t("connector.keeper.deviceTitle"),
        description: wrongCode ? t("connector.keeper.codeWrong") : t("connector.keeper.deviceDescription"),
      };
    case "connected":
      return {
        title: t("connector.keeper.doneTitle"),
        description: t("connector.keeper.doneDescription", { folder: folderName }),
      };
    case "failed":
      return {
        title: t("connector.keeper.failedTitle"),
        description:
          status.errorCode === "plan"
            ? t("connector.keeper.planDescription")
            : status.error
              ? sourceText(status.error)
              : t("connector.keeper.actionFailed"),
      };
  }
}

/** The page row of a sign-in that runs, with the way back to its dialog. */
function StepRow(props: {
  status: PasswordManagerStatus;
  hostName: string | undefined;
  folderName: string;
  verified: boolean;
  onShowSteps: () => void;
}) {
  const text = useText();
  const current = () => stepText(props.status, props.hostName, props.folderName, props.verified, text);
  return (
    <Item class="settings-modal-row onepassword-connector-step">
      <ItemMedia>
        <PlushLoader size={24} label={current().title} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{current().title}</ItemTitle>
        <ItemDescription aria-live="polite">{current().description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button type="button" size="sm" variant="outline" onClick={() => props.onShowSteps()}>
          {text.t("connector.keeper.showSteps")}
        </Button>
      </ItemActions>
    </Item>
  );
}

function ConnectDialog(props: {
  open: boolean;
  status: PasswordManagerStatus;
  busy: boolean;
  hostName: string | undefined;
  folderName: string;
  verified: boolean;
  /** Closes the dialog. The sign-in goes on. */
  onClose: () => void;
  /** Stops the sign-in and closes the dialog. */
  onCancel: () => void;
  onSubmitCode: (code: string) => void;
}) {
  const text = useText();
  const { t } = text;
  const [code, setCode] = createSignal("");
  const step = () => connectStep(props.status);
  const current = () => stepText(props.status, props.hostName, props.folderName, props.verified, text);
  const link = (): WizardLink => {
    const value = step();
    if (value === "connected") return "connected";
    return value === "failed" ? "broken" : "connecting";
  };
  const steps = () => [
    t("connector.keeper.stepSignIn"),
    t("connector.keeper.stepVerify"),
    t("connector.keeper.stepDone"),
  ];
  const stepIndex = () => {
    const value = step();
    if (value === "connected") return steps().length;
    if (asksForCode(value)) return 1;
    return props.verified ? 2 : 0;
  };
  const submitCode = () => {
    const value = step();
    if (!asksForCode(value) || props.busy) return;
    const typed = code().trim();
    // Two-step needs the code. Device approval also accepts an empty code: the user approved it elsewhere.
    if (value === "two-factor" && !typed) return;
    setCode("");
    props.onSubmitCode(typed);
  };
  const close = () => {
    setCode("");
    props.onClose();
  };
  return (
    <WizardDialog
      open={props.open}
      dismissible={false}
      closeLabel={t("connector.keeper.close")}
      onClose={close}
      logo={<KeeperTile />}
      link={link()}
      title={current().title}
      description={current().description}
      stepper={<Stepper steps={steps()} current={stepIndex()} label={t("connector.keeper.stepsLabel")} />}
      onSubmit={submitCode}
      footer={
        <Switch>
          <Match when={step() === "two-factor"}>
            <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" loading={props.busy} disabled={!code().trim()}>
              {t("connector.keeper.continue")}
            </Button>
          </Match>
          <Match when={step() === "device-approval"}>
            <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" loading={props.busy}>
              {t("connector.keeper.continue")}
            </Button>
          </Match>
          <Match when={step() === "setup"}>
            <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
              {t("common.cancel")}
            </Button>
          </Match>
          <Match when={step() === "failed"}>
            <Button type="button" size="sm" onClick={close}>
              {t("connector.keeper.close")}
            </Button>
          </Match>
          <Match when={step() === "connected"}>
            <Button type="button" size="sm" onClick={close}>
              {t("connector.keeper.done")}
            </Button>
          </Match>
        </Switch>
      }
    >
      <Switch>
        <Match when={asksForCode(step())}>
          <Input
            type="text"
            autocomplete="one-time-code"
            spellcheck={false}
            aria-label={t("connector.keeper.codeLabel")}
            aria-invalid={props.status.errorCode === "code" ? "true" : undefined}
            value={code()}
            onInput={(event) => setCode(event.currentTarget.value)}
          />
        </Match>
        <Match when={step() === "setup"}>
          <div class="github-connector-center">
            <PlushLoader size={48} label={current().title} />
          </div>
        </Match>
      </Switch>
    </WizardDialog>
  );
}
