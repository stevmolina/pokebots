import { router } from "expo-router";
import { Typography } from "heroui-native";
import Check from "lucide-react-native/icons/check";
import { type ReactElement, useCallback, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentMachineRow } from "@/features/agents/components/agent-list-row";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { previewType } from "@/features/design-preview/model/preview-tokens";
import { ServerAvatar } from "@/features/servers/components/server-avatar";
import { AllMachinesMark } from "@/features/servers/components/server-mascot";
import { setAllMachines, useAllMachines } from "@/features/servers/model/all-machines";
import {
  type MobileAgent,
  useMobileWorkspaceActions,
  useMobileWorkspaceSelector,
} from "@/features/workspace/context/mobile-workspace-context";
import { showsOffline, showsOnline } from "@/features/workspace/model/server-status";
import type { MobileServer } from "@/features/workspace/model/workspace-types";
import type { LargeTitleScroll } from "@/shared/components/large-title";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

/** Whether home shows All machines now: the switch is on and the phone has two servers or more. */
export function useAllMachinesShown(): boolean {
  const on = useAllMachines((state) => state.on);
  const count = useMobileWorkspaceSelector((current) => current.servers.length);
  return on && count > 1;
}

/** Opens one server, and leaves All machines. */
function useOpenServer() {
  const { selectServer } = useMobileWorkspaceActions();
  const activeServerId = useMobileWorkspaceSelector((current) => current.activeServer.id);
  return useCallback(
    (serverId: string) => {
      setAllMachines(false);
      if (serverId !== activeServerId) selectServer(serverId);
    },
    [selectServer, activeServerId],
  );
}

/** The agents of every server in one list, newest activity first, without the hidden ones. */
function useAllMachineAgents(): MobileAgent[] {
  const agents = useMobileWorkspaceSelector((current) => current.agents);
  const servers = useMobileWorkspaceSelector((current) => current.servers);
  const hidden = useMobileWorkspaceSelector((current) => current.hiddenAgentIdsByServer);
  return useMemo(() => {
    const joined = new Set(servers.map((server) => server.id));
    const time = (agent: MobileAgent) => (agent.updatedAt ? Date.parse(agent.updatedAt) || 0 : 0);
    return agents
      .filter((agent) => {
        if (!joined.has(agent.serverId)) return false;
        // A server whose preferences are not read yet shows no rows, as its own home does.
        const ids = hidden[agent.serverId];
        return ids !== undefined && !ids.includes(agent.id);
      })
      .sort((a, b) => time(b) - time(a));
  }, [agents, servers, hidden]);
}

/**
 * Home in All machines: the agents of every server in one list, each row with the mark of its
 * server. A row opens that server's agent. Folders, channels and the add actions stay per server.
 */
export function AllMachinesList({
  header,
  contentTop,
  contentBottom,
  ownsInset,
  onScroll,
}: {
  header: ReactElement;
  contentTop: number;
  contentBottom: number;
  /** The list sets its own top inset (Android, the pane); else iOS insets it under the native bar. */
  ownsInset: boolean;
  onScroll: LargeTitleScroll["onScroll"];
}) {
  const { t } = useText();
  const colors = usePreviewColors();
  const agents = useAllMachineAgents();
  const servers = useMobileWorkspaceSelector((current) => current.servers);
  const byId = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const offline = servers.filter((server) => !showsOnline(server));
  const { selectServer } = useMobileWorkspaceActions();
  const activeServerId = useMobileWorkspaceSelector((current) => current.activeServer.id);
  const openAgent = useCallback(
    (agent: MobileAgent) => {
      if (agent.serverId !== activeServerId) selectServer(agent.serverId);
      router.push({ pathname: "/chat/[agentId]", params: { agentId: agent.id } });
    },
    [selectServer, activeServerId],
  );
  return (
    <Animated.FlatList
      data={agents}
      keyExtractor={(agent) => `${agent.serverId}:${agent.id}`}
      contentInsetAdjustmentBehavior={ownsInset ? "never" : "always"}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: contentTop, paddingBottom: contentBottom }}
      scrollEventThrottle={16}
      onScroll={onScroll}
      ListHeaderComponent={
        <View>
          {header}
          {offline.map((server) => (
            <Typography
              key={server.id}
              style={[previewType.groupCaption, { color: colors.groupCaption, paddingHorizontal: 20, paddingTop: 6 }]}
            >
              {t(showsOffline(server) ? "mobile.agent.machines.offline" : "mobile.agent.machines.reconnecting", {
                name: server.name,
              })}
            </Typography>
          ))}
        </View>
      }
      ListEmptyComponent={
        <Typography style={[previewType.help, { color: colors.groupCaption, padding: 20, textAlign: "center" }]}>
          {t("mobile.agent.machines.empty")}
        </Typography>
      }
      renderItem={({ item }) => {
        const server = byId.get(item.serverId);
        return (
          <AgentMachineRow
            agent={item}
            onOpen={openAgent}
            mark={server ? <ServerAvatar server={server} size={16} showStatus={false} /> : null}
          />
        );
      }}
    />
  );
}

/** One tile of the Machines grid. */
function MachineTile({
  label,
  detail,
  mark,
  active,
  onPress,
}: {
  label: string;
  detail: string;
  mark: ReactElement;
  active: boolean;
  onPress: () => void;
}) {
  const colors = usePreviewColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${detail}`}
      onPress={() => {
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        flexBasis: "47%",
        flexGrow: 1,
        minHeight: 112,
        padding: 14,
        gap: 8,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: colors.groupBackground,
        borderWidth: active ? 2 : 0,
        borderColor: colors.accent,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        {mark}
        {active ? <Check size={18} color={colors.accent} /> : null}
      </View>
      <Typography numberOfLines={1} style={[previewType.rowTitle, { color: colors.title }]}>
        {label}
      </Typography>
      <Typography numberOfLines={1} style={[previewType.groupCaption, { color: colors.rowValue }]}>
        {detail}
      </Typography>
    </Pressable>
  );
}

/** The Machines grid: All machines and each server in two columns. A tile opens it on home. */
export function MachinesGridScreen() {
  const { t } = useText();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const servers = useMobileWorkspaceSelector((current) => current.servers);
  const agents = useMobileWorkspaceSelector((current) => current.agents);
  const hidden = useMobileWorkspaceSelector((current) => current.hiddenAgentIdsByServer);
  const activeServerId = useMobileWorkspaceSelector((current) => current.activeServer.id);
  const allShown = useAllMachinesShown();
  const openServer = useOpenServer();
  const counts = useMemo(() => {
    const byServer = new Map<string, number>();
    for (const agent of agents) {
      if (hidden[agent.serverId]?.includes(agent.id)) continue;
      byServer.set(agent.serverId, (byServer.get(agent.serverId) ?? 0) + 1);
    }
    return byServer;
  }, [agents, hidden]);
  const total = servers.reduce((sum, server) => sum + (counts.get(server.id) ?? 0), 0);
  const state = (server: MobileServer) =>
    t(
      showsOnline(server)
        ? "mobile.agent.machines.online"
        : showsOffline(server)
          ? "mobile.agent.machines.offlineShort"
          : "mobile.agent.machines.reconnectingShort",
    );
  const close = (then: () => void) => {
    then();
    router.back();
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.sheetBackground }}
      contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 16 }}
    >
      <Typography
        accessibilityRole="header"
        style={[previewType.pageTitle, { color: colors.title, textAlign: "center" }]}
      >
        {t("mobile.agent.machines.title")}
      </Typography>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {servers.length > 1 ? (
          <MachineTile
            label={t("mobile.agent.machines.all")}
            detail={t("mobile.agent.machines.agentCount", { count: total })}
            mark={<AllMachinesMark size={40} />}
            active={allShown}
            onPress={() => close(() => setAllMachines(true))}
          />
        ) : null}
        {servers.map((server) => (
          <MachineTile
            key={server.id}
            label={server.name}
            detail={`${state(server)} · ${t("mobile.agent.machines.agentCount", { count: counts.get(server.id) ?? 0 })}`}
            mark={<ServerAvatar server={server} size={40} />}
            active={!allShown && server.id === activeServerId}
            onPress={() => close(() => openServer(server.id))}
          />
        ))}
      </View>
    </ScrollView>
  );
}
