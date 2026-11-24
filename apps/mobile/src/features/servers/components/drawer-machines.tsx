import { router } from "expo-router";
import { Typography } from "heroui-native";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { type ReactElement, useCallback, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { previewType } from "@/features/design-preview/model/preview-tokens";
import { useAllMachinesShown } from "@/features/servers/components/all-machines";
import { useAppDrawer } from "@/features/servers/components/app-drawer-shell";
import { ServerAvatar } from "@/features/servers/components/server-avatar";
import { AllMachinesMark } from "@/features/servers/components/server-mascot";
import { setAllMachines } from "@/features/servers/model/all-machines";
import {
  useMobileWorkspaceActions,
  useMobileWorkspaceSelector,
} from "@/features/workspace/context/mobile-workspace-context";
import { showsOnline } from "@/features/workspace/model/server-status";
import type { MobileServer } from "@/features/workspace/model/workspace-types";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { typeScale } from "@/shared/lib/type-scale";

/** The visible agents of each server. */
function useMachineCounts() {
  const agents = useMobileWorkspaceSelector((current) => current.agents);
  const hidden = useMobileWorkspaceSelector((current) => current.hiddenAgentIdsByServer);
  return useMemo(() => {
    const byServer = new Map<string, number>();
    for (const agent of agents) {
      if (hidden[agent.serverId]?.includes(agent.id)) continue;
      byServer.set(agent.serverId, (byServer.get(agent.serverId) ?? 0) + 1);
    }
    return byServer;
  }, [agents, hidden]);
}

interface MachineChoice {
  id: string;
  label: string;
  detail: string;
  online: boolean | null;
  active: boolean;
  mark: (size: number) => ReactElement;
  choose: () => void;
}

/** All machines (with two servers or more) and each server, with the open one marked. */
export function useMachineChoices(): { choices: MachineChoice[]; current: MachineChoice | undefined } {
  const { t } = useText();
  const servers = useMobileWorkspaceSelector((current) => current.servers);
  const activeServerId = useMobileWorkspaceSelector((current) => current.activeServer.id);
  const allShown = useAllMachinesShown();
  const counts = useMachineCounts();
  const { selectServer } = useMobileWorkspaceActions();
  const openServer = useCallback(
    (serverId: string) => {
      setAllMachines(false);
      if (serverId !== activeServerId) selectServer(serverId);
    },
    [selectServer, activeServerId],
  );
  const count = (n: number) => t("mobile.agent.machines.agentCount", { count: n });
  const state = (server: MobileServer) =>
    t(showsOnline(server) ? "mobile.agent.machines.online" : "mobile.agent.machines.offlineShort");
  const total = servers.reduce((sum, server) => sum + (counts.get(server.id) ?? 0), 0);
  const online = servers.filter((server) => showsOnline(server)).length;
  const choices: MachineChoice[] = [
    ...(servers.length > 1
      ? [
          {
            id: "all",
            label: t("mobile.agent.machines.all"),
            detail: `${t("mobile.agent.machines.onlineCount", { count: online, total: servers.length })} · ${count(total)}`,
            online: null,
            active: allShown,
            mark: (size: number) => <AllMachinesMark size={size} />,
            choose: () => setAllMachines(true),
          },
        ]
      : []),
    ...servers.map((server) => ({
      id: server.id,
      label: server.name,
      detail: `${state(server)} · ${count(counts.get(server.id) ?? 0)}`,
      online: showsOnline(server),
      active: !allShown && server.id === activeServerId,
      mark: (size: number) => <ServerAvatar server={server} size={size} showStatus={false} />,
      choose: () => openServer(server.id),
    })),
  ];
  return { choices, current: choices.find((choice) => choice.active) };
}

/** One machine row: the mark with an online dot, the name, the state and agent count, a check. */
export function MachineRow({
  choice,
  onChosen,
  size = 30,
}: {
  choice: MachineChoice;
  onChosen?: () => void;
  size?: number;
}) {
  const colors = usePreviewColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: choice.active }}
      accessibilityLabel={`${choice.label}, ${choice.detail}`}
      onPress={() => {
        void haptics.selection();
        choice.choose();
        onChosen?.();
      }}
      className={`flex-row items-center gap-3 rounded-2xl px-2.5 ${choice.active ? "bg-control" : ""}`}
      style={({ pressed }) => ({ minHeight: 52, opacity: pressed ? 0.58 : 1 })}
    >
      <View>
        {choice.mark(size)}
        {choice.online === null ? null : (
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: colors.pageBackground,
              backgroundColor: choice.online ? "#34c759" : colors.groupCaption,
            }}
          />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Typography.Paragraph className="font-medium" numberOfLines={1} style={typeScale.rowTitle}>
          {choice.label}
        </Typography.Paragraph>
        <Typography.Paragraph className="text-text-secondary" numberOfLines={1} style={typeScale.caption}>
          {choice.detail}
        </Typography.Paragraph>
      </View>
      {choice.active ? <Check size={18} color={colors.accent} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}

/** Option A: a Machines section at the top of the drawer. */
export function DrawerMachinesSection() {
  const { t } = useText();
  const colors = usePreviewColors();
  const { closeDrawer } = useAppDrawer();
  const { choices } = useMachineChoices();
  if (choices.length < 2) return null;
  return (
    <View className="pb-2">
      <Typography
        style={[previewType.groupCaption, { color: colors.groupCaption, paddingHorizontal: 10, paddingBottom: 4 }]}
      >
        {t("mobile.agent.machines.title")}
      </Typography>
      {choices.map((choice) => (
        <MachineRow key={choice.id} choice={choice} onChosen={closeDrawer} />
      ))}
    </View>
  );
}

/** Option B: the drawer header as a large pill with the open machine. */
export function DrawerMachinePill({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useText();
  const colors = usePreviewColors();
  const { current } = useMachineChoices();
  if (!current) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("mobile.agent.machines.switchHint")}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        void haptics.selection();
        onToggle();
      }}
      className="min-w-0 shrink flex-row items-center gap-2.5 rounded-full bg-control"
      style={({ pressed }) => ({ paddingLeft: 6, paddingRight: 14, height: 48, opacity: pressed ? 0.7 : 1 })}
    >
      {current.mark(36)}
      <View className="min-w-0 shrink">
        <Typography.Heading className="font-semibold shrink" numberOfLines={1} style={typeScale.rowTitle}>
          {current.label}
        </Typography.Heading>
        <Typography.Paragraph className="text-text-secondary" numberOfLines={1} style={typeScale.small}>
          {current.detail}
        </Typography.Paragraph>
      </View>
      <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
        <ChevronDown size={18} color={colors.rowValue} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/** Option B: the inline list under the pill. */
export function DrawerMachineList({ onChosen }: { onChosen: () => void }) {
  const { choices } = useMachineChoices();
  return (
    <View className="pb-2">
      {choices.map((choice) => (
        <MachineRow key={choice.id} choice={choice} onChosen={onChosen} />
      ))}
    </View>
  );
}

/** Option C: a compact switcher at the bottom of the drawer; it opens the machine sheet. */
export function DrawerMachineFooter({ onOpen }: { onOpen: () => void }) {
  const { t } = useText();
  const colors = usePreviewColors();
  const { current, choices } = useMachineChoices();
  if (!current || choices.length < 2) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("mobile.agent.machines.switch")}
      accessibilityValue={{ text: current.label }}
      onPress={() => {
        void haptics.selection();
        onOpen();
      }}
      className="mr-3 flex-row items-center gap-2.5 rounded-2xl bg-control px-2.5"
      style={({ pressed }) => ({ height: 48, opacity: pressed ? 0.7 : 1 })}
    >
      {current.mark(28)}
      <View className="min-w-0 flex-1">
        <Typography.Paragraph className="font-medium" numberOfLines={1} style={typeScale.preview}>
          {current.label}
        </Typography.Paragraph>
      </View>
      <ChevronsUpDown size={16} color={colors.rowValue} strokeWidth={2} />
    </Pressable>
  );
}

/** Option C: the small sheet with All machines and each server. */
export function MachinePickerSheet() {
  const { t } = useText();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const { choices } = useMachineChoices();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.sheetBackground }}
      alwaysBounceVertical={false}
      contentContainerStyle={{ padding: 12, paddingTop: 24, paddingBottom: insets.bottom + 16, gap: 2 }}
    >
      <Typography
        accessibilityRole="header"
        style={[
          previewType.rowTitle,
          { color: colors.title, textAlign: "center", fontWeight: "600", paddingBottom: 12 },
        ]}
      >
        {t("mobile.agent.machines.title")}
      </Typography>
      {choices.map((choice) => (
        <MachineRow key={choice.id} choice={choice} size={34} onChosen={() => router.back()} />
      ))}
    </ScrollView>
  );
}
