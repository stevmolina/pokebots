import { MESSAGE_REACTIONS, MORE_MESSAGE_REACTIONS } from "@pokebots/contracts/ipc";
import { router } from "expo-router";
import { Typography } from "heroui-native";
import Copy from "lucide-react-native/icons/copy";
import SmilePlus from "lucide-react-native/icons/face-slightly-smiling-plus";
import GitFork from "lucide-react-native/icons/git-fork";
import Hash from "lucide-react-native/icons/hash";
import MailDot from "lucide-react-native/icons/mail-dot";
import Pin from "lucide-react-native/icons/pin";
import Reply from "lucide-react-native/icons/reply";
import TextCursor from "lucide-react-native/icons/text-cursor";
import Trash2 from "lucide-react-native/icons/trash";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { SheetScrollView } from "@/shared/components/sheet-scroll-view";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { MIRROR_IN_RTL } from "@/shared/lib/text-direction";
import { usePreviewColors } from "../components/preview-parts";
import { previewSheet } from "../model/preview-tokens";

/** Two rows of six: the six reactions, then five more and the button for the rest. */
const EMOJI_ROWS = [MESSAGE_REACTIONS.slice(), [...MORE_MESSAGE_REACTIONS.slice(0, 5), null]];

/**
 * The touch-and-hold sheet of a preview message: two rows of reactions, then Reply and Mark unread,
 * Copy and Select text, the Pokebots actions (Branch, Send to channel, Pin), and Delete last.
 */
export function PreviewMessageSheet() {
  const { t } = useText();
  const colors = usePreviewColors();
  const danger = String(useCSSVariable("--openbot-danger-text"));
  const close = () => {
    void haptics.selection();
    router.back();
  };
  const size = previewSheet.iconSize;
  const circle = previewSheet.emojiCircle;
  const row = (icon: ReactNode, label: string, color?: string) => (
    <SettingsRow leading={icon} disclosure={false} onPress={close}>
      <Typography style={color ? { color } : undefined}>{label}</Typography>
    </SettingsRow>
  );
  return (
    <SheetScrollView scrollEdgeEffect={false} contentContainerClassName="gap-4 px-4 pb-safe-offset-5 pt-7">
      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t("mobile.chat.message.addReaction")}
        style={{ gap: previewSheet.emojiRowGap }}
      >
        {EMOJI_ROWS.map((emojis) => (
          <View key={emojis.join("")} style={{ flexDirection: "row" }}>
            {emojis.map((emoji) => (
              <View key={emoji ?? "more"} style={{ flex: 1, alignItems: "center" }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    emoji ? t("mobile.chat.message.react", { emoji }) : t("mobile.chat.message.moreEmoji")
                  }
                  onPress={close}
                  className="items-center justify-center rounded-full bg-grouped"
                  style={({ pressed }) => ({
                    width: circle,
                    height: circle,
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  })}
                >
                  {emoji ? (
                    <Typography style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Typography>
                  ) : (
                    <SmilePlus size={20} color={colors.preview} />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </View>
      <SettingsSection>
        {row(<Reply size={size} color={colors.icon} style={MIRROR_IN_RTL} />, t("mobile.chat.message.reply"))}
        {row(<MailDot size={size} color={colors.icon} />, t("mobile.chat.message.markUnread"))}
      </SettingsSection>
      <SettingsSection>
        {row(<Copy size={size} color={colors.icon} />, t("mobile.chat.message.copy"))}
        {row(<TextCursor size={size} color={colors.icon} />, t("mobile.chat.message.selectText"))}
      </SettingsSection>
      <SettingsSection>
        {row(<GitFork size={size} color={colors.icon} />, t("mobile.chat.message.branch"))}
        {row(<Hash size={size} color={colors.icon} />, t("mobile.chat.message.sendToChannel"))}
        {row(<Pin size={size} color={colors.icon} />, t("mobile.chat.pins.pin"))}
      </SettingsSection>
      <SettingsSection>{row(<Trash2 size={size} color={danger} />, t("common.delete"), danger)}</SettingsSection>
    </SheetScrollView>
  );
}
