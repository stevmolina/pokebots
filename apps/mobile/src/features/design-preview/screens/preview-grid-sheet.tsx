import { useRouter } from "expo-router";
import { Typography } from "heroui-native";
import AppWindow from "lucide-react-native/icons/app-window";
import Bot from "lucide-react-native/icons/bot";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Puzzle from "lucide-react-native/icons/puzzle";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetScrollView } from "@/shared/components/sheet-scroll-view";
import { APP_FONT } from "@/shared/lib/app-font";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { PreviewChips } from "../components/preview-page";
import { PreviewCircleButton, PreviewGlass, usePreviewColors } from "../components/preview-parts";
import {
  PREVIEW_CATALOG,
  PREVIEW_CONNECTED_COUNT,
  type PreviewCatalogItem,
  type PreviewCatalogKind,
} from "../model/preview-data";
import { previewBatch4 as b4, previewSize as size, previewType as type } from "../model/preview-tokens";

type Filter = "all" | PreviewCatalogKind;

const KIND_ICON = { app: AppWindow, agent: Bot, skill: Puzzle } as const;

/**
 * The grid sheet of the preview, opened by the grid button: the reference's "connect apps" sheet with
 * the Pokebots marketplace kinds (apps, agents, skills). A close circle and the title on the left, the
 * connected count on the right, filter chips, "For you" rows with a reason line and a Connect pill,
 * and a search field at the bottom. Made-up data; Connect turns into Connected in place.
 */
export function PreviewGridSheet() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState<ReadonlySet<string>>(() => new Set());
  const q = query.trim().toLowerCase();
  const items = PREVIEW_CATALOG.filter(
    (item) => (filter === "all" || item.kind === filter) && (!q || item.name.toLowerCase().includes(q)),
  );
  const apps = items.filter((item) => item.kind === "app");
  const team = items.filter((item) => item.kind !== "app");
  const total = PREVIEW_CONNECTED_COUNT + connected.size;

  const row = (item: PreviewCatalogItem) => {
    const Icon = KIND_ICON[item.kind];
    const on = connected.has(item.id);
    return (
      <View
        key={item.id}
        style={{
          height: b4.gridRowHeight,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 27,
          paddingRight: 22,
        }}
      >
        <View
          style={{
            width: b4.gridIcon,
            height: b4.gridIcon,
            borderRadius: b4.gridIconRadius,
            borderCurve: "continuous",
            backgroundColor: item.tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} color="#ffffff" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, marginLeft: 15, marginRight: 12 }}>
          <Typography numberOfLines={1} style={[type.rowLabel, { color: colors.title }]}>
            {item.name}
          </Typography>
          <Typography numberOfLines={1} style={[type.rowDetail, { color: colors.rowValue }]}>
            {item.reason}
          </Typography>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("mobile.workspace.preview.connect")} ${item.name}`}
          onPress={() => {
            void haptics.selection();
            setConnected((current) => new Set(current).add(item.id));
          }}
          style={({ pressed }) => ({
            height: b4.gridConnectHeight,
            paddingHorizontal: b4.gridConnectPaddingX,
            borderRadius: b4.gridConnectHeight / 2,
            backgroundColor: colors.composerButton,
            justifyContent: "center",
            opacity: pressed || on ? 0.55 : 1,
          })}
        >
          {on ? (
            <Check size={18} color={colors.title} strokeWidth={2.2} />
          ) : (
            <Typography style={[type.chip, { color: colors.title }]}>
              {t("mobile.workspace.preview.connect")}
            </Typography>
          )}
        </Pressable>
      </View>
    );
  };

  const caption = (label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 23, marginTop: b4.gridCaptionTop }}>
      <Typography style={[type.pageTitle, { color: colors.title }]}>{label}</Typography>
      <ChevronRight size={18} color={colors.rowValue} strokeWidth={1.8} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* The sheet's own scroll view, as every sheet of the app; the title row is its sticky header. */}
      <SheetScrollView
        className="bg-transparent"
        scrollEdgeEffect={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        header={
          <View
            style={{
              paddingTop: b4.closeTop,
              paddingHorizontal: size.headerInset,
              height: b4.closeTop + size.headerButton,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.background,
            }}
          >
            <PreviewCircleButton label={t("mobile.workspace.preview.close")} onPress={() => router.back()}>
              <X size={22} color={colors.icon} strokeWidth={1.8} />
            </PreviewCircleButton>
            <Typography numberOfLines={1} style={[type.pageTitle, { flex: 1, marginLeft: 13, color: colors.title }]}>
              {t("mobile.workspace.preview.connectApps")}
            </Typography>
            <PreviewGlass height={size.headerButton} paddingHorizontal={b4.gridHeaderPillPaddingX}>
              <Typography style={[type.rowLabel, { color: colors.title }]}>
                {t("mobile.workspace.preview.connected", { total })}
              </Typography>
            </PreviewGlass>
          </View>
        }
      >
        <View
          style={{
            paddingTop: b4.gridChipsTop,
            paddingBottom: insets.bottom + size.bottomBarBottom + size.searchHeight + 24,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 6 }}>
            <PreviewChips<Filter>
              paddingX={b4.tightChipPaddingX}
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: t("mobile.workspace.preview.filterAll") },
                { id: "app", label: t("mobile.workspace.preview.filterApps") },
                { id: "agent", label: t("mobile.workspace.preview.filterAgents") },
                { id: "skill", label: t("mobile.workspace.preview.filterSkills") },
              ]}
            />
          </ScrollView>
          {apps.length > 0 ? (
            <>
              {caption(t("mobile.workspace.preview.forYou"))}
              <View style={{ marginTop: b4.gridFirstRowGap - 8 }}>{apps.map(row)}</View>
            </>
          ) : null}
          {team.length > 0 ? (
            <>
              {caption(t("mobile.workspace.preview.teamAgents"))}
              <View style={{ marginTop: b4.gridFirstRowGap - 8 }}>{team.map(row)}</View>
            </>
          ) : null}
        </View>
      </SheetScrollView>
      <KeyboardStickyView
        style={{ position: "absolute", left: 0, right: 0, bottom: size.bottomBarBottom }}
        offset={{ opened: size.bottomBarBottom - 8 }}
      >
        <View style={{ marginHorizontal: 20 }}>
          <PreviewGlass height={size.searchHeight}>
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
                placeholder={t("mobile.workspace.preview.searchApps")}
                placeholderTextColor={colors.placeholder}
                returnKeyType="search"
                style={[type.search, { flex: 1, fontFamily: APP_FONT, color: colors.title, paddingVertical: 0 }]}
              />
            </View>
          </PreviewGlass>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
