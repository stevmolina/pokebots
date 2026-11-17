import { useLocalSearchParams, useRouter } from "expo-router";
import { Typography } from "heroui-native";
import Clock from "lucide-react-native/icons/clock";
import Cpu from "lucide-react-native/icons/cpu";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Folder from "lucide-react-native/icons/folder";
import Monitor from "lucide-react-native/icons/monitor";
import Share from "lucide-react-native/icons/share";
import Sparkles from "lucide-react-native/icons/sparkles";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useUniwind } from "uniwind";
import { RoutineActiveSwitch } from "@/features/agents/components/routine-active-switch";
import { MenuView } from "@/shared/components/menu-view";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import {
  PreviewCaption,
  PreviewGap,
  PreviewGroup,
  PreviewHelp,
  PreviewPage,
  PreviewRow,
} from "../components/preview-page";
import { PreviewCircleButton, PreviewFace, PreviewGlass, usePreviewColors } from "../components/preview-parts";
import { previewAgent } from "../model/preview-data";
import { previewModelName, usePreviewModelChoice } from "../model/preview-model-choice";
import { previewProfile as profile, previewSize as size, previewType as type } from "../model/preview-tokens";

/**
 * The agent profile of the preview, opened from the chat's name pill: the face, the name, one Edit
 * pill, then short groups. The model lives here, as the first row, not in the composer.
 */
export function PreviewAgentScreen() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const { theme } = useUniwind();
  const { agentId, sheet } = useLocalSearchParams<{ agentId: string; sheet?: string }>();
  const agent = previewAgent(agentId ?? "");
  const modelId = usePreviewModelChoice((state) => state.modelId);
  const [notify, setNotify] = useState(true);
  const iconColor = colors.icon;
  const iconSize = profile.rowIconSize;
  const openModel = () => router.push("/design-preview/model");

  // `?sheet=model` opens the model picker over the profile, so it can be shown without a touch.
  const sheetOpened = useRef(false);
  useEffect(() => {
    if (sheetOpened.current || sheet !== "model") return;
    sheetOpened.current = true;
    const timer = setTimeout(() => router.push("/design-preview/model"), 600);
    return () => clearTimeout(timer);
  }, [router, sheet]);

  const trailing = (
    <>
      <PreviewCircleButton label={t("mobile.workspace.preview.share")}>
        <Share size={20} color={colors.icon} strokeWidth={1.8} />
      </PreviewCircleButton>
      <MenuView
        colorScheme={theme === "dark" ? "dark" : "light"}
        actions={[
          { id: "copy-id", title: t("mobile.workspace.preview.copyId") },
          { id: "delete", title: t("mobile.workspace.preview.deleteAgent"), attributes: { destructive: true } },
        ]}
        onPressAction={() => void haptics.selection()}
      >
        <View accessible accessibilityRole="button" accessibilityLabel={t("mobile.workspace.preview.more")}>
          <PreviewGlass width={size.headerButton} height={size.headerButton}>
            <Ellipsis size={22} color={colors.icon} strokeWidth={2} />
          </PreviewGlass>
        </View>
      </MenuView>
    </>
  );

  return (
    <PreviewPage trailing={trailing} contentTop={profile.faceTop}>
      <View style={{ alignItems: "center" }}>
        <PreviewFace agent={agent} size={profile.face} />
        <Typography style={[type.profileName, { color: colors.title, marginTop: profile.nameGap }]}>
          {agent.name}
        </Typography>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void haptics.selection();
            router.push(`/design-preview/agent/${agent.id}/edit`);
          }}
          style={({ pressed }) => ({
            marginTop: profile.editPillGap,
            height: profile.editPillHeight,
            paddingHorizontal: profile.editPillPaddingX,
            borderRadius: profile.editPillHeight / 2,
            backgroundColor: colors.softFill,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Typography style={[type.rowLabel, { color: colors.title }]}>{t("mobile.workspace.preview.edit")}</Typography>
        </Pressable>
      </View>
      <PreviewGap size={profile.groupsTop} />
      <PreviewGroup>
        <PreviewRow
          icon={<Cpu size={iconSize} color={iconColor} strokeWidth={1.6} />}
          label={t("mobile.workspace.preview.model")}
          value={previewModelName(modelId)}
          onPress={openModel}
        />
        <PreviewRow
          icon={<Folder size={iconSize} color={iconColor} strokeWidth={1.6} />}
          label={t("mobile.workspace.preview.library")}
          onPress={() => router.push(`/design-preview/agent/${agent.id}/library`)}
        />
        <PreviewRow
          icon={<Monitor size={iconSize} color={iconColor} strokeWidth={1.6} />}
          label={t("mobile.workspace.preview.computer")}
          value={t("mobile.workspace.preview.idle")}
          onPress={() => undefined}
        />
      </PreviewGroup>
      <PreviewGap />
      <PreviewCaption>{t("mobile.workspace.preview.setUp")}</PreviewCaption>
      <PreviewGroup>
        <PreviewRow
          icon={<Clock size={iconSize} color={iconColor} strokeWidth={1.6} />}
          label={t("mobile.workspace.preview.routines")}
          value={t("mobile.workspace.preview.routinesActive", { count: 1 })}
          onPress={() => router.push(`/design-preview/agent/${agent.id}/routines`)}
        />
        <PreviewRow
          icon={<Sparkles size={iconSize} color={iconColor} strokeWidth={1.6} />}
          label={t("mobile.workspace.preview.skills")}
          value="4"
          onPress={() => undefined}
        />
      </PreviewGroup>
      <PreviewGap />
      <PreviewGroup>
        <PreviewRow
          label={t("mobile.workspace.preview.notifications")}
          height={profile.toggleRowHeight}
          trailing={
            <RoutineActiveSwitch
              label={t("mobile.workspace.preview.notifications")}
              value={notify}
              disabled={false}
              onValueChange={setNotify}
            />
          }
        />
      </PreviewGroup>
      <PreviewHelp>{t("mobile.workspace.preview.notificationsHelp")}</PreviewHelp>
    </PreviewPage>
  );
}
