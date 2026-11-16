import { router } from "expo-router";
import { Typography } from "heroui-native";
import MessageSquare from "lucide-react-native/icons/message-square";
import Pin from "lucide-react-native/icons/pin";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import { SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { SheetScrollView } from "@/shared/components/sheet-scroll-view";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { usePreviewColors } from "../components/preview-parts";
import { usePreviewTime } from "../components/preview-time";
import { PREVIEW_PINNED_COUNT, PREVIEW_SESSIONS } from "../model/preview-data";
import { previewSheet } from "../model/preview-tokens";

/**
 * The ••• sheet of the preview chat: the sessions of the agent, the current one checked, then New
 * session, Pinned messages and Search in chat. Each row closes the sheet; the preview changes nothing.
 */
export function PreviewSessionsSheet() {
  const { t } = useText();
  const colors = usePreviewColors();
  const time = usePreviewTime();
  const close = () => {
    void haptics.selection();
    router.back();
  };
  const icon = colors.icon;
  const size = previewSheet.iconSize;
  return (
    <SheetScrollView scrollEdgeEffect={false} contentContainerClassName="gap-4 px-4 pb-safe-offset-5 pt-7">
      <SettingsSection title={t("mobile.chat.sessions.title")}>
        {PREVIEW_SESSIONS.map((session) => (
          <SettingsRow
            key={session.id}
            leading={<MessageSquare size={size} color={icon} strokeWidth={1.7} />}
            value={time.row(session.minutesAgo)}
            checked={session.current}
            disclosure={false}
            onPress={close}
          >
            <Typography>{session.name ?? t("mobile.chat.threads.main")}</Typography>
          </SettingsRow>
        ))}
      </SettingsSection>
      <SettingsSection>
        <SettingsRow leading={<Plus size={size} color={icon} strokeWidth={1.7} />} disclosure={false} onPress={close}>
          <Typography>{t("mobile.chat.sessions.new")}</Typography>
        </SettingsRow>
        <SettingsRow
          leading={<Pin size={size} color={icon} strokeWidth={1.7} />}
          value={String(PREVIEW_PINNED_COUNT)}
          onPress={close}
        >
          <Typography>{t("mobile.chat.pins.title")}</Typography>
        </SettingsRow>
        <SettingsRow leading={<Search size={size} color={icon} strokeWidth={1.7} />} disclosure={false} onPress={close}>
          <Typography>{t("mobile.workspace.preview.searchInChat")}</Typography>
        </SettingsRow>
      </SettingsSection>
    </SheetScrollView>
  );
}
