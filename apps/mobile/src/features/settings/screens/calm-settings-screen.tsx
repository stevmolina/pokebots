import { MOBILE_ATTACHMENT_BYTES } from "@openbot/team-client/remote-peer";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { Typography } from "heroui-native";
import Bell from "lucide-react-native/icons/bell";
import Bot from "lucide-react-native/icons/bot";
import Check from "lucide-react-native/icons/check";
import CreditCard from "lucide-react-native/icons/credit-card";
import EyeOff from "lucide-react-native/icons/eye-off";
import Info from "lucide-react-native/icons/info";
import Languages from "lucide-react-native/icons/languages";
import Layers2 from "lucide-react-native/icons/layers-2";
import Lock from "lucide-react-native/icons/lock";
import MessageCircleQuestionMark from "lucide-react-native/icons/message-circle-question-mark";
import Mic from "lucide-react-native/icons/mic";
import Palette from "lucide-react-native/icons/palette";
import PanelLeft from "lucide-react-native/icons/panel-left";
import Shield from "lucide-react-native/icons/shield";
import Vibrate from "lucide-react-native/icons/vibrate";
import WandSparkles from "lucide-react-native/icons/wand-sparkles";
import X from "lucide-react-native/icons/x";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";
import { mobileUserName } from "@/features/auth/api/mobile-user-name";
import { AppLogo } from "@/features/auth/components/app-logo";
import { useMobileSession } from "@/features/auth/context/mobile-session-context";
import { fileLimitText, MOBILE_LARGE_FILE_BYTES } from "@/features/chat/model/large-files";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { useAppDrawer } from "@/features/servers/components/app-drawer-shell";
import { ServerAvatar } from "@/features/servers/components/server-avatar";
import { SettingsContent, SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { SettingsSwitch } from "@/features/settings/components/settings-controls";
import { RowIcon } from "@/features/settings/components/settings-row-icon";
import { agentDefaultsServers } from "@/features/settings/model/agent-defaults";
import { useBillingState } from "@/features/settings/model/billing";
import { saveLargeFilePreference, useLargeFilePreference } from "@/features/settings/model/large-files";
import { savePhotoQualityPreference, usePhotoQualityPreference } from "@/features/settings/model/photo-quality";
import { shortcutsSupported } from "@/features/shortcuts/shortcuts-native";
import {
  type MobileServer,
  useMobileWorkspaceActions,
  useMobileWorkspaceSelector,
} from "@/features/workspace/context/mobile-workspace-context";
import { serverStatusLabel } from "@/features/workspace/model/server-status";
import { AndroidHeaderButton } from "@/shared/components/android-header-button";
import { ProfileAvatar } from "@/shared/components/profile-avatar";
import { APP_BRAND, POKEBOTS_MARK } from "@/shared/lib/app-brand";
import { haptics } from "@/shared/lib/haptics";
import { refreshMobileFeatures, useMobileFeature } from "@/shared/lib/mobile-features";
import { isAndroid } from "@/shared/lib/platform";
import { useText } from "@/shared/lib/text";

/**
 * Settings in the new design, as the approved design preview draws it: a close button at the top left,
 * the account, the servers with a check on the open one (a tap opens that server), the server tools,
 * then the same app settings as the current look, help, sign out and the app name and version. Every
 * row of the current look is here; only the order and the grouping change.
 */
export function CalmSettingsScreen() {
  const { session, signOut } = useMobileSession();
  const text = useText();
  const { t } = text;
  const { theme } = useUniwind();
  const { openDrawer } = useAppDrawer();
  const danger = String(useCSSVariable("--openbot-danger-text"));
  const accent = usePreviewColors().accent;
  const servers = useMobileWorkspaceSelector((current) => current.servers);
  const activeServerId = useMobileWorkspaceSelector((current) => current.activeServer.id);
  const { selectServer } = useMobileWorkspaceActions();
  const largeFiles = useLargeFilePreference();
  const managesAgents = useMobileWorkspaceSelector((workspace) => agentDefaultsServers(workspace).length > 0);
  const [largeFilesError, setLargeFilesError] = useState<string | null>(null);
  const photoQuality = usePhotoQualityPreference();
  const [photoQualityError, setPhotoQualityError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const displayName = session ? mobileUserName(session.user) : t("mobile.settings.home.profile");
  const apiUrl = session?.apiUrl ?? "";
  const cloudServersOn = useMobileFeature(apiUrl, "cloudServers");
  useEffect(() => {
    if (apiUrl) void refreshMobileFeatures(apiUrl);
  }, [apiUrl]);
  const billing = useBillingState(cloudServersOn);
  const showsBilling = cloudServersOn && billing.data?.available !== false;
  const planCount = billing.data?.servers.length;

  function close() {
    void haptics.impact("soft");
    router.back();
  }
  function openServer(server: MobileServer) {
    if (server.id !== activeServerId) selectServer(server.id);
    router.back();
  }
  // The drawer holds every tool of the open server. It opens under the sheet while the sheet closes.
  function openServerTools() {
    router.back();
    openDrawer();
  }
  function saveLargeFiles(automatic: boolean) {
    setLargeFilesError(null);
    void saveLargeFilePreference(automatic).catch(() => {
      setLargeFilesError(t("mobile.settings.saveFailed"));
      void haptics.notification("error");
    });
  }
  function savePhotoQuality(fullQuality: boolean) {
    setPhotoQualityError(null);
    void savePhotoQualityPreference(fullQuality).catch(() => {
      setPhotoQualityError(t("mobile.settings.saveFailed"));
      void haptics.notification("error");
    });
  }
  function confirmSignOut() {
    Alert.alert(t("mobile.settings.profile.signOutTitle"), t("mobile.settings.profile.signOutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("mobile.settings.profile.signOut"),
        style: "destructive",
        onPress: () => {
          setSigningOut(true);
          void signOut()
            .catch(() => {
              void haptics.notification("error");
              Alert.alert(t("mobile.settings.saveFailed"));
            })
            .finally(() => setSigningOut(false));
        },
      },
    ]);
  }

  return (
    <>
      {isAndroid ? (
        <AndroidHeaderButton placement="left" icon={X} accessibilityLabel={t("common.close")} onPress={close} />
      ) : (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" accessibilityLabel={t("common.close")} onPress={close}>
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      )}
      <SettingsContent>
        <SettingsSection>
          <SettingsRow
            onPress={() => router.push("/settings/profile")}
            supportingText={session?.user.email}
            leading={
              <ProfileAvatar
                neutral
                name={displayName}
                imageUrl={session?.user.avatarUrl ? new URL(session.user.avatarUrl, session.apiUrl).toString() : null}
                size={40}
              />
            }
          >
            <Typography.Paragraph>{displayName}</Typography.Paragraph>
          </SettingsRow>
          {showsBilling ? (
            <SettingsRow
              leading={<RowIcon icon={CreditCard} />}
              onPress={() => router.push("/settings/billing")}
              value={
                planCount === undefined
                  ? undefined
                  : planCount === 0
                    ? t("mobile.settings.billing.noPlans")
                    : t("mobile.settings.billing.planCount", { count: planCount })
              }
            >
              <Typography.Paragraph>{t("mobile.settings.billing.title")}</Typography.Paragraph>
            </SettingsRow>
          ) : null}
        </SettingsSection>
        {servers.length > 0 ? (
          <SettingsSection title={t("mobile.settings.calm.servers")}>
            {servers.map((server) => (
              <SettingsRow
                key={server.id}
                checked={server.id === activeServerId}
                disclosure={false}
                onPress={() => openServer(server)}
                supportingText={
                  server.state === "error" || (server.state === "connecting" && server.initialConnectionPending)
                    ? serverStatusLabel(server, t)
                    : server.kind === "local"
                      ? t("mobile.server.drawer.local")
                      : t("mobile.server.drawer.remote")
                }
                leading={<ServerAvatar server={server} size={32} />}
                trailing={
                  server.id === activeServerId ? <Check size={18} color={accent} strokeWidth={2.2} /> : undefined
                }
              >
                <Typography.Paragraph numberOfLines={1}>{server.name}</Typography.Paragraph>
              </SettingsRow>
            ))}
            <SettingsRow leading={<RowIcon icon={PanelLeft} />} onPress={openServerTools}>
              <Typography.Paragraph>{t("mobile.settings.calm.serverTools")}</Typography.Paragraph>
            </SettingsRow>
          </SettingsSection>
        ) : null}
        <SettingsSection title={t("mobile.settings.calm.app")}>
          <SettingsRow leading={<RowIcon icon={Bell} />} onPress={() => router.push("/settings/notifications")}>
            <Typography.Paragraph>{t("mobile.settings.notifications.title")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Palette} />} onPress={() => router.push("/settings/appearance")}>
            <Typography.Paragraph>{t("mobile.settings.appearance.title")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={WandSparkles} />} onPress={() => router.push("/settings/animations")}>
            <Typography.Paragraph>{t("mobile.settings.animations.title")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Languages} />} onPress={() => router.push("/settings/language")}>
            <Typography.Paragraph>{t("mobile.settings.language.title")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Vibrate} />} onPress={() => router.push("/settings/haptics")}>
            <Typography.Paragraph>{t("mobile.settings.feedback.haptics")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Mic} />} onPress={() => router.push("/settings/voice")}>
            <Typography.Paragraph>{t("mobile.settings.voice.title")}</Typography.Paragraph>
          </SettingsRow>
          {shortcutsSupported ? (
            <SettingsRow leading={<RowIcon icon={Layers2} />} onPress={() => router.push("/settings/shortcuts")}>
              <Typography.Paragraph>{t("mobile.settings.shortcuts.title")}</Typography.Paragraph>
            </SettingsRow>
          ) : null}
          {managesAgents ? (
            <SettingsRow leading={<RowIcon icon={Bot} />} onPress={() => router.push("/settings/agents")}>
              <Typography.Paragraph>{t("mobile.settings.agents.title")}</Typography.Paragraph>
            </SettingsRow>
          ) : null}
          <SettingsRow leading={<RowIcon icon={Shield} />} onPress={() => router.push("/settings/privacy")}>
            <Typography.Paragraph>{t("mobile.settings.privacy.title")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Lock} />} onPress={() => router.push("/settings/app-lock")}>
            <Typography.Paragraph>{t("mobile.appLock.title")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection
          title={t("mobile.settings.conversations.title")}
          footer={
            largeFilesError ??
            t("mobile.settings.conversations.largeFilesFooter", {
              small: fileLimitText(text, MOBILE_ATTACHMENT_BYTES),
              large: fileLimitText(text, MOBILE_LARGE_FILE_BYTES),
            })
          }
        >
          <SettingsRow leading={<RowIcon icon={EyeOff} />} onPress={() => router.push("/settings/hidden-chats")}>
            <Typography.Paragraph>{t("mobile.settings.conversations.hiddenChats")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow>
            <SettingsSwitch
              value={largeFiles.automatic}
              disabled={!largeFiles.ready || largeFiles.saving}
              label={t("mobile.settings.conversations.largeFiles")}
              dark={theme === "dark"}
              onValueChange={saveLargeFiles}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection footer={photoQualityError ?? t("mobile.settings.conversations.fullQualityPhotosFooter")}>
          <SettingsRow>
            <SettingsSwitch
              value={photoQuality.fullQuality}
              disabled={!photoQuality.ready || photoQuality.saving}
              label={t("mobile.settings.conversations.fullQualityPhotos")}
              dark={theme === "dark"}
              onValueChange={savePhotoQuality}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection>
          <SettingsRow
            leading={<RowIcon icon={MessageCircleQuestionMark} />}
            onPress={() => router.push("/settings/support")}
          >
            <Typography.Paragraph>{t("mobile.settings.home.support")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow leading={<RowIcon icon={Info} />} onPress={() => router.push("/settings/about")}>
            <Typography.Paragraph>{t("mobile.settings.home.about")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
        {session ? (
          <SettingsSection>
            <SettingsRow disclosure={false} disabled={signingOut} onPress={confirmSignOut}>
              <Typography.Paragraph style={{ color: danger }}>
                {t("mobile.settings.profile.signOut")}
              </Typography.Paragraph>
            </SettingsRow>
          </SettingsSection>
        ) : null}
        <CalmSettingsFooter />
      </SettingsContent>
    </>
  );
}

/** The app's mark, name and version at the end of Settings, as About shows them. */
function CalmSettingsFooter() {
  const { t } = useText();
  const name = Constants.expoConfig?.name ?? "OpenBot";
  const version = Constants.expoConfig?.version ?? t("mobile.settings.about.development");
  const build = Application.nativeBuildVersion;
  return (
    <View className="items-center gap-2 px-4 pb-8 pt-4">
      {APP_BRAND === "pokebots" ? (
        <Image source={POKEBOTS_MARK} style={{ width: 44, height: 44, borderRadius: 10 }} />
      ) : (
        <AppLogo size={44} />
      )}
      <View className="items-center gap-0.5">
        <Typography.Paragraph weight="medium" align="center">
          {name}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-xs" align="center" className="text-grouped-secondary">
          {build ? `${version} (${build})` : version}
        </Typography.Paragraph>
      </View>
    </View>
  );
}
