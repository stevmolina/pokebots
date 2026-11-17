import type { RoomMemory, RoomMessage, RoomSummary, RoomsRequest, RoomsResult } from "@openbot/contracts/rooms";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { Button, Typography } from "heroui-native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { useMobileWorkspace } from "@/features/workspace/context/mobile-workspace-context";
import { SheetFormField } from "@/shared/components/sheet-form-field";
import { useText } from "@/shared/lib/text";
import { useAppForeground } from "@/shared/lib/use-app-foreground";

export function RoomsScreen() {
  const { serverId = "" } = useLocalSearchParams<{ serverId: string }>();
  return <RoomsServerScreen key={serverId} serverId={serverId} />;
}

function RoomsServerScreen({ serverId }: { serverId: string }) {
  const { roomsRequest, canUseRooms, servers } = useMobileWorkspace();
  const { t, errorMessage } = useText();
  const focused = useIsFocused();
  const foreground = useAppForeground();
  const visible = focused && foreground;
  const [state, setState] = useState<{
    form: "create" | "join" | null;
    rooms: readonly RoomSummary[];
    room: RoomSummary | null;
    messages: readonly RoomMessage[];
    detail: RoomsResult;
    connected: boolean;
    loaded: boolean;
    busy: boolean;
    error: string;
    tab: "messages" | "memory" | "tasks";
    body: string;
    thread?: number;
    name: string;
    invite: string;
    memory: RoomMemory;
    task: string;
    reason: string;
  }>({
    form: null,
    rooms: [],
    room: null,
    messages: [],
    detail: { connected: false },
    connected: false,
    loaded: false,
    busy: false,
    error: "",
    tab: "messages",
    body: "",
    name: "",
    invite: "",
    memory: { version: 0, about: "", decided: "", open: "" },
    task: "",
    reason: "",
  });
  const server = servers.find((item) => item.id === serverId);
  const supported = canUseRooms(serverId) && (server?.role === "owner" || server?.role === "admin");
  const patch = useCallback((value: Partial<typeof state>) => setState((old) => ({ ...old, ...value })), []);
  async function load() {
    const result = await roomsRequest({ kind: "list" }, serverId);
    patch({ rooms: result.rooms ?? [], connected: result.connected, loaded: true });
  }
  async function act(run: () => Promise<void>) {
    if (state.busy) return;
    patch({ busy: true, error: "" });
    try {
      await run();
    } catch (error) {
      patch({ error: errorMessage(error, t("rooms.error")) });
    } finally {
      patch({ busy: false });
    }
  }
  async function open(room: RoomSummary) {
    const detail = await roomsRequest({ kind: "detail", roomId: room.id }, serverId);
    patch({
      room: detail.room ?? room,
      detail,
      connected: detail.connected,
      messages: [],
      thread: undefined,
      memory: detail.memory ?? { version: 0, about: "", decided: "", open: "" },
    });
  }
  async function mutate(input: RoomsRequest) {
    const result = await roomsRequest(input, serverId);
    patch({ connected: result.connected });
    if (state.room) {
      const detail = await roomsRequest({ kind: "detail", roomId: state.room.id }, serverId);
      patch({ detail, memory: detail.memory ?? state.memory, room: detail.room ?? state.room });
    }
  }
  useEffect(() => {
    let stopped = false;
    if (supported && visible)
      void roomsRequest({ kind: "list" }, serverId)
        .then((result) => {
          if (!stopped) patch({ rooms: result.rooms ?? [], connected: result.connected, loaded: true });
        })
        .catch((error) => {
          if (!stopped) patch({ error: errorMessage(error, t("rooms.error")) });
        });
    return () => {
      stopped = true;
    };
  }, [serverId, supported, visible, roomsRequest, patch, errorMessage, t]);
  useEffect(() => {
    let stopped = false;
    const roomId = state.room?.id;
    if (!roomId || !supported || !visible) return;
    const id = roomId;
    const thread = state.thread;
    async function listen() {
      try {
        const first = await roomsRequest(
          { kind: "read", roomId: id, since: 0, ...(thread === undefined ? {} : { thread }) },
          serverId,
        );
        if (stopped) return;
        let cursor = Math.max(0, ...(first.messages ?? []).map((message) => message.id));
        patch({ messages: first.messages ?? [] });
        while (!stopped) {
          const result = await roomsRequest({ kind: "wait", roomId: id, since: cursor }, serverId);
          if (stopped) return;
          if (!result.connected) {
            patch({ connected: false });
            return;
          }
          const messages = result.messages ?? [];
          cursor = Math.max(cursor, ...messages.map((message) => message.id));
          setState((old) => ({
            ...old,
            room: result.room ?? old.room,
            messages: [
              ...new Map(
                [
                  ...old.messages,
                  ...messages.filter(
                    (message) => thread === undefined || message.thread === thread || message.id === thread,
                  ),
                ].map((message) => [message.id, message]),
              ).values(),
            ].sort((a, b) => a.id - b.id),
          }));
        }
      } catch (error) {
        if (!stopped) patch({ error: errorMessage(error, t("rooms.error")) });
      }
    }
    void listen();
    return () => {
      stopped = true;
    };
  }, [serverId, supported, visible, state.room?.id, state.thread, roomsRequest, patch, errorMessage, t]);
  const button = (label: string, run: () => Promise<void> | void) => (
    <Button
      variant="ghost"
      isDisabled={state.busy}
      onPress={() =>
        void act(async () => {
          await run();
        })
      }
    >
      <Button.Label>{label}</Button.Label>
    </Button>
  );
  const field = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    maxLength: number,
    multiline = false,
  ) => (
    <SheetFormField
      label={label}
      value={value}
      onChangeText={onChangeText}
      maxLength={maxLength}
      multiline={multiline}
    />
  );
  const room = state.room;
  return (
    <>
      <Stack.Screen options={{ title: room?.name ?? t("rooms.title") }} />
      <FlatList
        data={room && state.tab === "messages" ? state.messages : []}
        keyExtractor={(message) => String(message.id)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 pb-10 gap-5"
        ListHeaderComponent={
          <View className="gap-4">
            <Typography.Paragraph className="text-muted">{t("rooms.hostAccount")}</Typography.Paragraph>
            {state.error ? <Typography.Paragraph accessibilityRole="alert">{state.error}</Typography.Paragraph> : null}
            {!supported ? (
              <Typography.Paragraph>{t("rooms.error")}</Typography.Paragraph>
            ) : !state.connected && state.loaded ? (
              <>
                {button(t("rooms.signIn"), () =>
                  router.push({ pathname: "/server-marketplace", params: { serverId } }),
                )}
                <Typography.Paragraph>{t("rooms.connect")}</Typography.Paragraph>
              </>
            ) : !room ? (
              <>
                {state.rooms.length === 0 ? <Typography.Paragraph>{t("rooms.empty")}</Typography.Paragraph> : null}
                {state.rooms.map((room) => (
                  <View key={room.id}>{button(`${room.name} ${room.unread || ""}`, () => open(room))}</View>
                ))}
                <View className="flex-row">
                  {button(t("rooms.create"), () => patch({ form: "create" }))}
                  {button(t("rooms.join"), () => patch({ form: "join" }))}
                </View>
                {state.form === "create" ? (
                  <>
                    {field(t("rooms.name"), state.name, (name) => patch({ name }), 100)}
                    {button(t("rooms.create"), async () => {
                      const result = await roomsRequest({ kind: "create", name: state.name, notice: "" }, serverId);
                      await load();
                      if (result.room) await open(result.room);
                    })}
                  </>
                ) : null}
                {state.form === "join" ? (
                  <>
                    {field(t("rooms.link"), state.invite, (invite) => patch({ invite }), 2048)}
                    {button(t("rooms.join"), async () => {
                      const result = await roomsRequest({ kind: "join", invite: state.invite }, serverId);
                      await load();
                      if (result.room) await open(result.room);
                    })}
                  </>
                ) : null}
                {state.form ? button(t("common.cancel"), () => patch({ form: null })) : null}
              </>
            ) : (
              <>
                {button(t("rooms.back"), () => {
                  patch({ room: null });
                  return load();
                })}
                <Typography.Paragraph>{room.notice}</Typography.Paragraph>
                {room.paused ? (
                  <>
                    <Typography.Paragraph>{t("rooms.paused")}</Typography.Paragraph>
                    {room.role === "owner"
                      ? button(t("rooms.resume"), () => mutate({ kind: "resume", roomId: room.id }))
                      : null}
                  </>
                ) : null}
                <View className="flex-row flex-wrap">
                  {(["messages", "memory", "tasks"] as const).map((tab) => (
                    <View key={tab}>
                      {button(
                        t(tab === "messages" ? "rooms.messages" : tab === "memory" ? "rooms.memory" : "rooms.tasks"),
                        () => patch({ tab }),
                      )}
                    </View>
                  ))}
                </View>
                {room.role === "owner"
                  ? button(t("rooms.invite"), async () => {
                      const result = await roomsRequest({ kind: "invite", roomId: room.id }, serverId);
                      if (result.invite) await Clipboard.setStringAsync(result.invite);
                    })
                  : null}
                {state.detail.agents?.map((agent) => (
                  <Typography.Paragraph key={agent.label}>
                    {agent.label}{" "}
                    {agent.status === "working"
                      ? t("rooms.working")
                      : agent.status === "needs_you"
                        ? t("rooms.needsYou")
                        : agent.status === "done"
                          ? t("rooms.done")
                          : ""}{" "}
                    {agent.status_note}
                  </Typography.Paragraph>
                ))}
                {state.thread !== undefined ? button(t("rooms.all"), () => patch({ thread: undefined })) : null}
                {state.tab === "memory" ? (
                  <>
                    {(["about", "decided", "open"] as const).map((part) => (
                      <View key={part}>
                        {field(
                          t(part === "about" ? "rooms.about" : part === "decided" ? "rooms.decided" : "rooms.open"),
                          state.memory[part],
                          (value) => patch({ memory: { ...state.memory, [part]: value } }),
                          1000,
                          true,
                        )}
                      </View>
                    ))}
                    {button(t("common.save"), () =>
                      mutate({ kind: "memory", roomId: room.id, ...state.memory, base_version: state.memory.version }),
                    )}
                  </>
                ) : null}
                {state.tab === "tasks" ? (
                  <>
                    {field(t("rooms.taskTitle"), state.task, (task) => patch({ task }), 200)}
                    {button(t("rooms.addTask"), () =>
                      mutate({ kind: "task-create", roomId: room.id, title: state.task }),
                    )}
                    {field(t("rooms.reason"), state.reason, (reason) => patch({ reason }), 500)}
                    {state.detail.tasks?.map((task) => (
                      <View key={task.id} className="gap-2">
                        <Typography.Paragraph>
                          {task.title} ·{" "}
                          {t(
                            task.status === "pending"
                              ? "rooms.pending"
                              : task.status === "in_progress"
                                ? "rooms.inProgress"
                                : task.status === "blocked"
                                  ? "rooms.blocked"
                                  : "rooms.done",
                          )}
                        </Typography.Paragraph>
                        <Typography.Paragraph>{task.claimed_by ?? task.blocked_reason}</Typography.Paragraph>
                        {(task.status === "in_progress"
                          ? task.mine
                            ? (["renew", "done", "block", "release"] as const)
                            : []
                          : task.status === "done"
                            ? []
                            : (["claim"] as const)
                        ).map((action) => (
                          <View key={action}>
                            {button(
                              t(
                                action === "claim"
                                  ? "rooms.claim"
                                  : action === "renew"
                                    ? "rooms.renew"
                                    : action === "done"
                                      ? "rooms.done"
                                      : action === "block"
                                        ? "rooms.block"
                                        : "rooms.release",
                              ),
                              () =>
                                mutate({
                                  kind: "task-action",
                                  roomId: room.id,
                                  taskId: task.id,
                                  action,
                                  reason: state.reason,
                                }),
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View className="gap-2">
            <Typography.Paragraph className="font-semibold">{item.author}</Typography.Paragraph>
            <Typography.Paragraph>{item.body}</Typography.Paragraph>
            {button(t("rooms.reply"), () => patch({ thread: item.thread ?? item.id }))}
          </View>
        )}
        ListFooterComponent={
          room && state.tab === "messages" ? (
            <View className="gap-3">
              {field(t("rooms.message"), state.body, (body) => patch({ body }), 10000, true)}
              {button(t("rooms.send"), async () => {
                await mutate({
                  kind: "send",
                  roomId: room.id,
                  body: state.body,
                  ...(state.thread === undefined ? {} : { thread: state.thread }),
                });
                patch({ body: "" });
              })}
            </View>
          ) : undefined
        }
      />
    </>
  );
}
