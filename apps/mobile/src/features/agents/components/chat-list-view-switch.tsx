import { Typography } from "heroui-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useUniwind } from "uniwind";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { previewSize } from "@/features/design-preview/model/preview-tokens";
import { type MobileChatListView, setChatListView, useChatListView } from "@/features/settings/model/chat-list-view";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

const VIEWS: readonly MobileChatListView[] = ["active", "folders"];
const TRACK_PADDING = 4;
const THUMB_HEIGHT = 36;
const MOVE = { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.System };

/**
 * "Active" | "Folders" over the chat list, as on the desktop and the web client: a rounded track with a
 * raised thumb. "Active" groups the chats by state; "Folders" shows every chat in its folder.
 */
export function ChatListViewSwitch() {
  const { t } = useText();
  const colors = usePreviewColors();
  const view = useChatListView((state) => state.view);
  const [width, setWidth] = useState(0);
  const half = Math.max(0, (width - TRACK_PADDING * 2) / 2);
  const offset = useSharedValue(0);
  const index = VIEWS.indexOf(view);
  useEffect(() => {
    offset.set(withTiming(index * half, MOVE));
  }, [index, half, offset]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const dark = useUniwind().theme === "dark";
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t("mobile.agent.list.view.label")}
      style={{ paddingHorizontal: previewSize.sectionInset - 4, paddingTop: 4, paddingBottom: 10 }}
    >
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{
          flexDirection: "row",
          borderRadius: 999,
          padding: TRACK_PADDING,
          backgroundColor: colors.softFill,
        }}
      >
        {half > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: TRACK_PADDING,
                left: TRACK_PADDING,
                width: half,
                height: THUMB_HEIGHT,
                borderRadius: 999,
                backgroundColor: dark ? colors.composerButton : colors.groupBackground,
                boxShadow: dark ? undefined : "0 1px 4px rgba(0, 0, 0, 0.12)",
              },
              thumbStyle,
            ]}
          />
        ) : null}
        {VIEWS.map((option) => {
          const selected = option === view;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                if (selected) return;
                void haptics.selection();
                setChatListView(option);
              }}
              style={{ flex: 1, height: THUMB_HEIGHT, alignItems: "center", justifyContent: "center" }}
            >
              <Typography
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  fontWeight: selected ? "600" : "500",
                  color: selected ? colors.title : colors.preview,
                }}
              >
                {t(option === "active" ? "mobile.agent.list.view.active" : "mobile.agent.list.view.folders")}
              </Typography>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
