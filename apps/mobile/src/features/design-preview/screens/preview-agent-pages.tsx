import { useLocalSearchParams, useRouter } from "expo-router";
import { Typography } from "heroui-native";
import FileText from "lucide-react-native/icons/file-text";
import Globe from "lucide-react-native/icons/globe";
import ImageIcon from "lucide-react-native/icons/image";
import Pencil from "lucide-react-native/icons/pencil";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { RoutineActiveSwitch } from "@/features/agents/components/routine-active-switch";
import { APP_FONT } from "@/shared/lib/app-font";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import {
  PreviewCaption,
  PreviewChips,
  PreviewGap,
  PreviewGroup,
  PreviewPage,
  PreviewRow,
} from "../components/preview-page";
import { PreviewFace, usePreviewColors } from "../components/preview-parts";
import { PREVIEW_LIBRARY, PREVIEW_ROUTINE, previewAgent } from "../model/preview-data";
import { previewProfile as profile, previewSize as size, previewType as type } from "../model/preview-tokens";

function useAgent() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  return previewAgent(agentId ?? "");
}

/** Edit: the face with a pencil, the name field, Appearance > Face, and a dark Done pill. */
export function PreviewAgentEditScreen() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const agent = useAgent();
  const [name, setName] = useState(agent.name);
  const done = (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void haptics.selection();
        router.back();
      }}
      style={({ pressed }) => ({
        height: size.headerButton,
        paddingHorizontal: 19,
        borderRadius: size.headerButton / 2,
        backgroundColor: colors.strongFill,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Typography style={[type.rowLabel, { color: colors.pageBackground }]}>
        {t("mobile.workspace.preview.saveDone")}
      </Typography>
    </Pressable>
  );
  return (
    <PreviewPage title={t("mobile.workspace.preview.editTitle")} trailing={done} contentTop={profile.faceTop}>
      <View style={{ alignSelf: "center", width: profile.face, height: profile.face }}>
        <PreviewFace agent={agent} size={profile.face} />
        <View
          style={{
            position: "absolute",
            right: -8,
            bottom: -6,
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.groupBackground,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
          }}
        >
          <Pencil size={19} color={colors.icon} strokeWidth={1.8} />
        </View>
      </View>
      <PreviewGap size={23} />
      <PreviewCaption>{t("mobile.workspace.preview.name")}</PreviewCaption>
      <PreviewGroup>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[
            type.rowLabel,
            { height: 51, paddingHorizontal: profile.rowPlainInset, fontFamily: APP_FONT, color: colors.title },
          ]}
        />
      </PreviewGroup>
      <PreviewGap />
      <PreviewCaption>{t("mobile.workspace.preview.appearance")}</PreviewCaption>
      <PreviewGroup>
        <PreviewRow label={t("mobile.workspace.preview.face")} onPress={() => undefined} />
      </PreviewGroup>
    </PreviewPage>
  );
}

/** Routines: one card with the routine's name, its schedule in gray and a switch. */
export function PreviewRoutinesScreen() {
  const { t } = useText();
  const colors = usePreviewColors();
  const [on, setOn] = useState(true);
  return (
    <PreviewPage title={t("mobile.workspace.preview.routines")}>
      <PreviewGroup>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            paddingLeft: profile.rowPlainInset,
            paddingRight: 19,
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Typography numberOfLines={1} style={[type.rowLabel, { color: colors.title }]}>
              {PREVIEW_ROUTINE.name}
            </Typography>
            <Typography style={[type.rowDetail, { color: colors.rowValue }]}>{PREVIEW_ROUTINE.schedule}</Typography>
            <Typography style={[type.rowDetail, { color: colors.rowValue }]}>{PREVIEW_ROUTINE.timezone}</Typography>
          </View>
          <RoutineActiveSwitch label={PREVIEW_ROUTINE.name} value={on} disabled={false} onValueChange={setOn} />
        </View>
      </PreviewGroup>
    </PreviewPage>
  );
}

type LibraryFilter = "all" | "media" | "links" | "files";

/** Library: filter chips, then this week's links, images and files in one gray group. */
export function PreviewLibraryScreen() {
  const { t } = useText();
  const colors = usePreviewColors();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const shown = PREVIEW_LIBRARY.filter(
    (item) =>
      filter === "all" ||
      (filter === "media" && item.kind === "image") ||
      (filter === "links" && item.kind === "link") ||
      (filter === "files" && item.kind === "file"),
  );
  const icon = (kind: (typeof PREVIEW_LIBRARY)[number]["kind"]) => {
    if (kind === "link") return <Globe size={20} color={colors.rowValue} strokeWidth={1.6} />;
    if (kind === "image") return <ImageIcon size={20} color={colors.rowValue} strokeWidth={1.6} />;
    return <FileText size={20} color={colors.rowValue} strokeWidth={1.6} />;
  };
  return (
    <PreviewPage title={t("mobile.workspace.preview.library")}>
      <PreviewChips
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: t("mobile.workspace.preview.filterAll") },
          { id: "media", label: t("mobile.workspace.preview.filterMedia") },
          { id: "links", label: t("mobile.workspace.preview.filterLinks") },
          { id: "files", label: t("mobile.workspace.preview.filterFiles") },
        ]}
      />
      <PreviewGap size={17} />
      <PreviewCaption>{t("mobile.workspace.preview.thisWeek")}</PreviewCaption>
      <PreviewGroup fill={colors.libraryGroup}>
        {shown.map((item) => (
          <View
            key={item.id}
            style={{ height: profile.libraryRowHeight, flexDirection: "row", alignItems: "center", paddingRight: 16 }}
          >
            <View style={{ width: profile.rowLabelInset, alignItems: "center" }}>{icon(item.kind)}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Typography numberOfLines={1} style={[type.rowLabel, { color: colors.title }]}>
                {item.title}
              </Typography>
              <Typography numberOfLines={1} style={[type.rowDetail, { color: colors.rowValue }]}>
                {item.kind === "image" ? t("mobile.workspace.preview.image", { age: item.detail }) : item.detail}
              </Typography>
            </View>
          </View>
        ))}
      </PreviewGroup>
    </PreviewPage>
  );
}
