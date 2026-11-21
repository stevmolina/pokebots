import type { PasswordManagerStatus } from "@pokebots/contracts/ipc";
import {
  PASSWORD_MANAGERS_CODE_LIMIT,
  PASSWORD_MANAGERS_EMAIL_LIMIT,
  PASSWORD_MANAGERS_KEY_LIMIT,
  PASSWORD_MANAGERS_PASSWORD_LIMIT,
} from "@pokebots/contracts/team-protocol/password-managers-v1";
import type { UseQueryResult } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { openBrowserAsync } from "expo-web-browser";
import { Typography } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { ConnectorError, ConnectorHeader } from "@/features/servers/components/connector-header";
import { CONNECTOR_STATUS_KEYS, CONNECTOR_TITLE_KEYS } from "@/features/servers/model/connectors";
import {
  type MobilePasswordManagerId,
  PASSWORD_MANAGER_TEXT,
  passwordManagerConnectorStatus,
  passwordManagerExpired,
  passwordManagerSignInPage,
} from "@/features/servers/model/password-managers";
import { useConnectorAction } from "@/features/servers/model/use-server-connectors";
import {
  SettingsContent,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/settings-content";
import { useMobileWorkspaceActions } from "@/features/workspace/context/mobile-workspace-context";
import type { MobileServer } from "@/features/workspace/model/workspace-types";
import { SheetFormField } from "@/shared/components/sheet-form-field";
import { currentText, useText } from "@/shared/lib/text";

const EXPIRY_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

/** Opens the sign-in page that the host named. The phone opens only a page of the manager's sign-in site. */
async function openSignIn(manager: MobilePasswordManagerId, address: string | null): Promise<void> {
  const page = passwordManagerSignInPage(manager, address);
  if (!page) throw new Error(currentText().t("mobile.server.connectors.openFailed"));
  await openBrowserAsync(page);
}

/**
 * Server settings › Connectors › a password manager of a joined server, such as Proton Pass or Keeper
 * (`password-managers-v1`). The host runs the sign-in of the manager's CLI. For Proton Pass, the phone
 * opens the sign-in page, and sends the extra password when the manager asks for one. Then the host
 * makes its own read-only access key and keeps only that key. An access key that the user made is the
 * other way in. For Keeper, the phone takes the account's email and master password, and the code that
 * Keeper asks for. A key, a password or a code goes to the host once; this phone keeps no copy.
 */
export function PasswordManagerConnectorPage({
  server,
  manager,
  query,
}: {
  server: MobileServer;
  manager: MobilePasswordManagerId;
  query: UseQueryResult<PasswordManagerStatus[]>;
}) {
  const { t, format, errorMessage, sourceText } = useText();
  const { connectPasswordManager, cancelPasswordManager, disconnectPasswordManager } = useMobileWorkspaceActions();
  const action = useConnectorAction(query.refetch);
  const [key, setKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [extraPassword, setExtraPassword] = useState("");
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [code, setCode] = useState("");
  /** True after the manager asked for a code in this sign-in, so the last `setup` step is the folder. */
  const [verified, setVerified] = useState(false);
  /** True after Connect when the host had no sign-in page yet: the page opens it when it comes. */
  const openWhenReady = useRef(false);
  const status = query.data?.find((candidate) => candidate.manager === manager);
  const signInUrl = status?.state === "signing-in" && status.step === "browser" ? status.signInUrl : null;
  const signInStep = status?.state === "signing-in" ? (status.step ?? "setup") : null;
  useEffect(() => {
    if (signInStep === null) setVerified(false);
    else if (signInStep === "two-factor" || signInStep === "device-approval") setVerified(true);
  }, [signInStep]);
  useEffect(() => {
    if (!openWhenReady.current || signInUrl === null) return;
    openWhenReady.current = false;
    void action.perform(() => openSignIn(manager, signInUrl));
  }, [signInUrl, manager, action.perform]);
  const host = server.name;
  const name = t(CONNECTOR_TITLE_KEYS[manager]);
  /** The texts of the access key. Only Proton Pass has them. */
  const keyText = manager === "protonpass" ? PASSWORD_MANAGER_TEXT[manager] : null;
  if (!status)
    return (
      <SettingsContent>
        <SettingsNote>
          {query.isError
            ? errorMessage(query.error, t("mobile.server.connectors.readFailed"))
            : query.data
              ? t("mobile.server.connectors.passwordManager.unavailable", { name })
              : t("mobile.server.connectors.loading")}
        </SettingsNote>
      </SettingsContent>
    );
  const now = Date.now();
  const expired = passwordManagerExpired(status, now);
  const state = passwordManagerConnectorStatus(status, now);
  const trimmedKey = key.trim();
  const canSignIn = status.methods.includes("browser");
  const canUseKey = keyText !== null && status.methods.includes("key");
  const canUseAccount = status.methods.includes("account");

  const signIn = () =>
    void action.perform(async () => {
      openWhenReady.current = false;
      const next = await connectPasswordManager({ manager, method: { kind: "browser" } }, server.id);
      if (next.state !== "signing-in" || next.step !== "browser") return;
      if (next.signInUrl === null) openWhenReady.current = true;
      else await openSignIn(manager, next.signInUrl);
    });
  const connectWithKey = () =>
    void action
      .perform(async () => {
        await connectPasswordManager({ manager, method: { kind: "key", key: trimmedKey } }, server.id);
      })
      .then((connected) => {
        if (!connected) return;
        setKey("");
        setKeyOpen(false);
      });
  const connectWithAccount = () => {
    const address = email.trim();
    const secret = masterPassword;
    // The master password leaves the form when the request starts, as on the desktop.
    setMasterPassword("");
    void action.perform(async () => {
      await connectPasswordManager(
        { manager, method: { kind: "account", email: address, password: secret } },
        server.id,
      );
    });
  };
  const sendCode = () => {
    const typed = code.trim();
    setCode("");
    void action.perform(async () => {
      await connectPasswordManager({ manager, method: { kind: "code", code: typed } }, server.id);
    });
  };
  const sendExtraPassword = () => {
    const password = extraPassword;
    // The password leaves the form when the request starts, as on the desktop.
    setExtraPassword("");
    void action.perform(async () => {
      await connectPasswordManager({ manager, method: { kind: "extra-password", password } }, server.id);
    });
  };
  const cancel = () =>
    void action.perform(async () => {
      openWhenReady.current = false;
      await cancelPasswordManager(manager, server.id);
    });
  const disconnect = () =>
    Alert.alert(
      t("mobile.server.connectors.passwordManager.disconnectTitle", { name }),
      canUseAccount
        ? t("mobile.server.connectors.keeper.disconnectBody", { host })
        : t("mobile.server.connectors.passwordManager.disconnectBody", { host, name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("mobile.server.connectors.disconnect"),
          style: "destructive",
          onPress: () =>
            void action.perform(async () => {
              await disconnectPasswordManager(manager, server.id);
            }),
        },
      ],
    );
  const reconnect = () => {
    if (canSignIn) signIn();
    else setKeyOpen(true);
  };
  const accountForm = (
    <>
      <SheetFormField
        label={t("mobile.server.connectors.keeper.email")}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="email"
        maxLength={PASSWORD_MANAGERS_EMAIL_LIMIT}
        value={email}
        editable={!action.busy}
        onChangeText={(value) => {
          setEmail(value);
          action.reset();
        }}
      />
      <SheetFormField
        label={t("mobile.server.connectors.keeper.masterPassword")}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        maxLength={PASSWORD_MANAGERS_PASSWORD_LIMIT}
        value={masterPassword}
        editable={!action.busy}
        onChangeText={(value) => {
          setMasterPassword(value);
          action.reset();
        }}
      />
      <SettingsSection>
        <SettingsRow
          disclosure={false}
          disabled={action.busy || email.trim().length === 0 || masterPassword.length === 0}
          onPress={connectWithAccount}
        >
          <Typography.Paragraph className="text-accent">
            {action.busy
              ? t("mobile.server.connectors.passwordManager.connecting")
              : t("mobile.server.connectors.passwordManager.connect", { name })}
          </Typography.Paragraph>
        </SettingsRow>
      </SettingsSection>
    </>
  );
  /** The known failures have their own text. Another failure shows the host's sentence. */
  const statusFailure = (): string | null => {
    if (status.errorCode === "plan") return keyText ? t(keyText.plan) : t("mobile.server.connectors.keeper.plan");
    if (status.errorCode === "extra-password") return t("mobile.server.connectors.passwordManager.extraPasswordWrong");
    // A wrong code shows under its field.
    if (status.errorCode === "code") return null;
    if (status.errorCode === "expired") {
      if (status.state === "connected") return null;
      return canUseAccount
        ? t("mobile.server.connectors.keeper.expiredTitle")
        : t("mobile.server.connectors.passwordManager.expiredTitle", { name });
    }
    return status.error ? sourceText(status.error) : null;
  };
  const failure = action.error
    ? errorMessage(action.error, t("mobile.server.connectors.actionFailed", { name }))
    : (statusFailure() ?? (query.isError ? errorMessage(query.error, t("mobile.server.connectors.readFailed")) : null));
  const vaultFooter = canUseAccount
    ? t("mobile.server.connectors.keeper.folderFooter")
    : t("mobile.server.connectors.passwordManager.vaultFooter", { name });
  const cancelRow = (
    <SettingsRow disclosure={false} disabled={action.busy} onPress={cancel}>
      <Typography.Paragraph className="text-accent">{t("common.cancel")}</Typography.Paragraph>
    </SettingsRow>
  );

  return (
    <SettingsContent>
      <ConnectorHeader
        id={manager}
        status={t(expired ? "mobile.server.connectors.statusExpired" : CONNECTOR_STATUS_KEYS[state])}
        attention={state === "attention"}
        description={
          manager === "keeper"
            ? t(PASSWORD_MANAGER_TEXT.keeper.description, { host })
            : t(PASSWORD_MANAGER_TEXT.protonpass.description, { host })
        }
      />
      <ConnectorError message={failure} />
      {status.state === "connected" ? (
        <>
          {expired ? (
            canUseAccount ? (
              <>
                <SettingsNote>
                  {`${t("mobile.server.connectors.keeper.expiredTitle")}. ${t("mobile.server.connectors.keeper.expiredBody", { host })}`}
                </SettingsNote>
                {accountForm}
              </>
            ) : (
              <SettingsSection
                title={t("mobile.server.connectors.passwordManager.expiredTitle", { name })}
                footer={t("mobile.server.connectors.passwordManager.expiredBody", { host })}
              >
                <SettingsRow disclosure={false} disabled={action.busy} onPress={reconnect}>
                  <Typography.Paragraph className="text-accent">
                    {t("mobile.server.connectors.reconnect")}
                  </Typography.Paragraph>
                </SettingsRow>
              </SettingsSection>
            )
          ) : null}
          <SettingsSection
            title={
              canUseAccount
                ? t("mobile.server.connectors.keeper.folderTitle")
                : t("mobile.server.connectors.passwordManager.vaultTitle")
            }
            footer={
              status.loginCount === null
                ? vaultFooter
                : `${t("mobile.server.connectors.passwordManager.loginCount", { count: status.loginCount })} · ${vaultFooter}`
            }
          >
            {status.vaultNames.map((vault) => (
              <SettingsRow key={vault} disclosure={false}>
                <Typography.Paragraph>{vault}</Typography.Paragraph>
              </SettingsRow>
            ))}
            {canUseAccount ? null : (
              <SettingsRow
                disclosure={false}
                supportingText={
                  status.expiresAt === null
                    ? t("mobile.server.connectors.passwordManager.keyReadOnly")
                    : t(
                        expired
                          ? "mobile.server.connectors.passwordManager.keyExpired"
                          : "mobile.server.connectors.passwordManager.keyExpires",
                        { date: format.date(status.expiresAt, EXPIRY_FORMAT) },
                      )
                }
              >
                <Typography.Paragraph>{t("mobile.server.connectors.passwordManager.keyTitle")}</Typography.Paragraph>
              </SettingsRow>
            )}
          </SettingsSection>
          <SettingsSection>
            <SettingsRow disclosure={false} disabled={action.busy} onPress={disconnect}>
              <Typography.Paragraph className="text-danger-text">
                {t("mobile.server.connectors.passwordManager.disconnect", { name })}
              </Typography.Paragraph>
            </SettingsRow>
          </SettingsSection>
        </>
      ) : status.state === "signing-in" ? (
        status.step === "browser" ? (
          <SettingsSection
            title={t("mobile.server.connectors.passwordManager.signInTitle", { name })}
            footer={t("mobile.server.connectors.passwordManager.signInFooter", { name })}
          >
            <SettingsRow
              disclosure={false}
              disabled={action.busy || signInUrl === null}
              supportingText={
                signInUrl === null ? t("mobile.server.connectors.passwordManager.signInWaiting", { host }) : undefined
              }
              onPress={() => void action.perform(() => openSignIn(manager, signInUrl))}
            >
              <Typography.Paragraph className="text-accent">
                {t("mobile.server.connectors.passwordManager.openSignIn")}
              </Typography.Paragraph>
            </SettingsRow>
            <SettingsRow
              disclosure={false}
              disabled={action.busy || signInUrl === null}
              onPress={() =>
                void action.perform(async () => {
                  if (signInUrl) await Clipboard.setStringAsync(signInUrl);
                })
              }
            >
              <Typography.Paragraph className="text-accent">
                {t("mobile.server.connectors.passwordManager.copyLink")}
              </Typography.Paragraph>
            </SettingsRow>
            {cancelRow}
          </SettingsSection>
        ) : status.step === "extra-password" ? (
          <>
            <SheetFormField
              label={t("mobile.server.connectors.passwordManager.extraPassword")}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              maxLength={PASSWORD_MANAGERS_PASSWORD_LIMIT}
              value={extraPassword}
              editable={!action.busy}
              hint={t("mobile.server.connectors.passwordManager.extraPasswordHint", { host, name })}
              onChangeText={(value) => {
                setExtraPassword(value);
                action.reset();
              }}
            />
            <SettingsSection>
              <SettingsRow
                disclosure={false}
                disabled={action.busy || extraPassword.length === 0}
                onPress={sendExtraPassword}
              >
                <Typography.Paragraph className="text-accent">
                  {t("mobile.server.connectors.passwordManager.continue")}
                </Typography.Paragraph>
              </SettingsRow>
              {cancelRow}
            </SettingsSection>
          </>
        ) : status.step === "two-factor" || status.step === "device-approval" ? (
          <>
            <SheetFormField
              label={t("mobile.server.connectors.keeper.code")}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={PASSWORD_MANAGERS_CODE_LIMIT}
              value={code}
              editable={!action.busy}
              error={status.errorCode === "code" ? t("mobile.server.connectors.keeper.codeWrong") : undefined}
              hint={
                status.step === "two-factor"
                  ? t("mobile.server.connectors.keeper.twoFactorHint", { host })
                  : t("mobile.server.connectors.keeper.deviceHint")
              }
              onChangeText={(value) => {
                setCode(value);
                action.reset();
              }}
            />
            <SettingsSection>
              <SettingsRow
                disclosure={false}
                // Device approval accepts an empty code: the user approved the device elsewhere.
                disabled={action.busy || (status.step === "two-factor" && code.trim().length === 0)}
                onPress={sendCode}
              >
                <Typography.Paragraph className="text-accent">
                  {t("mobile.server.connectors.passwordManager.continue")}
                </Typography.Paragraph>
              </SettingsRow>
              {cancelRow}
            </SettingsSection>
          </>
        ) : (
          <>
            <SettingsNote>
              {canUseAccount
                ? verified
                  ? t("mobile.server.connectors.keeper.makingFolder", { host })
                  : t("mobile.server.connectors.keeper.signingIn", { host })
                : t("mobile.server.connectors.passwordManager.setupBody", { host })}
            </SettingsNote>
            <SettingsSection>{cancelRow}</SettingsSection>
          </>
        )
      ) : (
        <>
          <SettingsNote>
            {canUseAccount
              ? t("mobile.server.connectors.keeper.accountHelp", { host })
              : canSignIn
                ? t("mobile.server.connectors.passwordManager.howItWorks", { host, name })
                : keyText !== null && canUseKey
                  ? t(keyText.keyHelp, { host })
                  : t("mobile.server.connectors.passwordManager.unavailable", { name })}
          </SettingsNote>
          {canUseAccount ? accountForm : null}
          {canSignIn ? (
            <SettingsSection>
              <SettingsRow disclosure={false} disabled={action.busy} onPress={signIn}>
                <Typography.Paragraph className="text-accent">
                  {action.busy
                    ? t("mobile.server.connectors.passwordManager.connecting")
                    : t("mobile.server.connectors.passwordManager.connect", { name })}
                </Typography.Paragraph>
              </SettingsRow>
            </SettingsSection>
          ) : null}
          {keyText !== null && canUseKey && (keyOpen || !canSignIn) ? (
            <>
              <SheetFormField
                label={t("mobile.server.connectors.passwordManager.key")}
                placeholder={t(keyText.keyPlaceholder)}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                maxLength={PASSWORD_MANAGERS_KEY_LIMIT}
                value={key}
                editable={!action.busy}
                hint={canSignIn ? t(keyText.keyHelp, { host }) : undefined}
                onChangeText={(value) => {
                  setKey(value);
                  action.reset();
                }}
              />
              <SettingsSection>
                <SettingsRow
                  disclosure={false}
                  disabled={action.busy || trimmedKey.length === 0}
                  onPress={connectWithKey}
                >
                  <Typography.Paragraph className="text-accent">
                    {t("mobile.server.connectors.passwordManager.connectWithKey")}
                  </Typography.Paragraph>
                </SettingsRow>
              </SettingsSection>
            </>
          ) : canUseKey ? (
            <SettingsSection>
              <SettingsRow disclosure={false} disabled={action.busy} onPress={() => setKeyOpen(true)}>
                <Typography.Paragraph className="text-accent">
                  {t("mobile.server.connectors.passwordManager.useKey")}
                </Typography.Paragraph>
              </SettingsRow>
            </SettingsSection>
          ) : null}
        </>
      )}
    </SettingsContent>
  );
}
