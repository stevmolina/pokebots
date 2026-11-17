import { useRouter } from "expo-router";
import { Typography } from "heroui-native";
import CircleX from "lucide-react-native/icons/circle-x";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColumnWidth } from "@/shared/components/adaptive-split";
import { APP_FONT } from "@/shared/lib/app-font";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { PreviewChips } from "../components/preview-page";
import { PreviewCircleButton, PreviewFace, PreviewGlass, usePreviewColors } from "../components/preview-parts";
import {
  PREVIEW_LOOSE_CHATS,
  PREVIEW_MAIN_AGENT,
  PREVIEW_SEARCH_MESSAGES,
  PREVIEW_SECTIONS,
  type PreviewAgent,
  previewAgent,
} from "../model/preview-data";
import { previewBatch4 as b4, previewSize as size, previewType as type } from "../model/preview-tokens";

type Filter = "all" | "messages" | "agents" | "channels";

type Result =
  | { kind: "agent"; id: string; agent: PreviewAgent }
  | { kind: "message"; id: string; agent: PreviewAgent; title: string; before: string; match: string; after: string }
  | { kind: "channel"; id: string; name: string; members: PreviewAgent[] };

const AGENTS: PreviewAgent[] = [
  PREVIEW_MAIN_AGENT,
  ...PREVIEW_LOOSE_CHATS.map((chat) => chat.agent),
  ...PREVIEW_SECTIONS.flatMap((section) => section.chats.map((chat) => chat.agent)),
];

const CHANNELS: Result[] = [
  {
    kind: "channel",
    id: "c-launch",
    name: "Launch team",
    members: [previewAgent("deck"), previewAgent("hiring"), previewAgent("standup")],
  },
  { kind: "channel", id: "c-trip", name: "Lima trip", members: [previewAgent("flights"), previewAgent("lima")] },
];

/**
 * Search of the preview, as the reference: filter chips on top, results with a gray type label, and
 * the field at the bottom with a close button. Made-up data; a result opens its preview chat.
 */
export function PreviewSearchScreen() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const width = useColumnWidth();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const agents: Result[] = AGENTS.filter((agent) => !q || agent.name.toLowerCase().includes(q)).map((agent) => ({
      kind: "agent",
      id: `a-${agent.id}`,
      agent,
    }));
    const messages: Result[] = q
      ? PREVIEW_SEARCH_MESSAGES.filter(
          (m) => m.match.toLowerCase().includes(q) || q.includes(m.match.slice(0, q.length)),
        ).map((m) => ({
          kind: "message",
          id: m.id,
          agent: previewAgent(m.agentId),
          title: m.title,
          before: m.before,
          match: m.match,
          after: m.after,
        }))
      : [];
    const channels = CHANNELS.filter((c) => c.kind === "channel" && (!q || c.name.toLowerCase().includes(q)));
    if (filter === "agents") return agents;
    if (filter === "messages") return messages;
    if (filter === "channels") return channels;
    return q ? [...agents, ...messages] : agents;
  }, [filter, query]);

  const fieldWidth = width - size.bottomBarInset * 2 - b4.searchCloseButton - size.bottomBarGap;
  const label = (kind: Result["kind"]) =>
    kind === "message"
      ? t("mobile.workspace.preview.typeMessage")
      : kind === "agent"
        ? t("mobile.workspace.preview.typeAgent")
        : t("mobile.workspace.preview.filterChannels");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + b4.searchChipsTop + b4.searchChipHeight + b4.searchFirstRowTop,
          paddingBottom: insets.bottom + size.bottomBarBottom + size.searchHeight + 24,
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void haptics.selection();
              const id = item.kind === "channel" ? item.members[0]?.id : item.agent.id;
              if (id) router.replace(`/design-preview/chat/${id}`);
            }}
            style={({ pressed }) => ({
              height: b4.searchRowHeight,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: size.rowAvatarInset,
              paddingRight: size.rowTrailingInset,
              backgroundColor: pressed ? colors.agentBubble : "transparent",
            })}
          >
            {item.kind === "channel" ? (
              <View style={{ width: b4.searchAvatar, height: b4.searchAvatar }}>
                {item.members.slice(0, 3).map((member, index) => (
                  <View
                    key={member.id}
                    style={{
                      position: "absolute",
                      left: (index % 2) * 18,
                      top: Math.floor(index / 2) * 18 + (index === 1 ? 6 : 0),
                    }}
                  >
                    <PreviewFace agent={member} size={26} />
                  </View>
                ))}
              </View>
            ) : (
              <PreviewFace agent={item.agent} size={b4.searchAvatar} />
            )}
            <View style={{ flex: 1, marginLeft: size.rowTextGap }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: size.rowTrailingGap }}>
                <Typography numberOfLines={1} style={[type.rowTitle, { flex: 1, color: colors.title }]}>
                  {item.kind === "message" ? item.title : item.kind === "agent" ? item.agent.name : item.name}
                </Typography>
                <Typography style={[type.rowTime, { color: colors.time }]}>{label(item.kind)}</Typography>
              </View>
              {item.kind === "message" ? (
                <Typography numberOfLines={1} style={[type.rowPreview, { color: colors.preview }]}>
                  {`…${item.before}`}
                  <Typography style={[type.rowPreview, { color: colors.title }]}>{item.match}</Typography>
                  {item.after}
                </Typography>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          position: "absolute",
          top: insets.top + b4.searchChipsTop,
          left: 0,
          right: 0,
          height: b4.searchChipHeight,
        }}
        contentContainerStyle={{ alignItems: "center" }}
      >
        <PreviewChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: t("mobile.workspace.preview.filterAll") },
            { id: "messages", label: t("mobile.workspace.preview.filterMessages") },
            { id: "agents", label: t("mobile.workspace.preview.filterAgents") },
            { id: "channels", label: t("mobile.workspace.preview.filterChannels") },
          ]}
        />
      </ScrollView>
      <KeyboardStickyView
        style={{ position: "absolute", left: 0, right: 0, bottom: size.bottomBarBottom }}
        offset={{ opened: size.bottomBarBottom - 8 }}
      >
        <View
          style={{
            marginHorizontal: size.bottomBarInset,
            flexDirection: "row",
            alignItems: "center",
            gap: size.bottomBarGap,
          }}
        >
          <PreviewGlass width={fieldWidth} height={size.searchHeight}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 15,
                paddingRight: 12,
                gap: 10,
              }}
            >
              <Search size={21} color={colors.icon} strokeWidth={2.5} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                placeholder={t("mobile.workspace.preview.search")}
                placeholderTextColor={colors.placeholder}
                returnKeyType="search"
                style={[type.search, { flex: 1, fontFamily: APP_FONT, color: colors.title, paddingVertical: 0 }]}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("mobile.workspace.preview.close")}
                  hitSlop={8}
                  onPress={() => setQuery("")}
                >
                  <CircleX
                    size={18}
                    color={colors.title}
                    fill={colors.title}
                    stroke={colors.background}
                    strokeWidth={2}
                  />
                </Pressable>
              ) : null}
            </View>
          </PreviewGlass>
          <PreviewCircleButton
            label={t("mobile.workspace.preview.closeSearch")}
            size={b4.searchCloseButton}
            onPress={() => router.back()}
          >
            <X size={22} color={colors.icon} strokeWidth={1.8} />
          </PreviewCircleButton>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
