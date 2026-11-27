import { machineLiveViewUrl } from "@pokebots/contracts/ipc";
import { Button, Typography } from "heroui-native";
import { useThemeColor } from "heroui-native/hooks";
import Monitor from "lucide-react-native/icons/monitor";
import { memo, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { useMobileWorkspace, useMobileWorkspaceActions } from "@/features/workspace/context/mobile-workspace-context";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

/**
 * The card of a cloud computer that an agent started, as on desktop. Open live view reads the link from
 * the host's owner or admin machine list at the press and opens it; the link is never kept in the chat,
 * in state or in the offline copy. A member, or a host without `agent-computer-v1`, gets no button.
 */
export const ChatComputerLiveViewCard = memo(function ChatComputerLiveViewCard({
  serverId,
  machineId,
}: {
  serverId: string;
  machineId: string;
}) {
  const { t } = useText();
  const [iconColor] = useThemeColor(["muted"]);
  const { canManageAgentComputer } = useMobileWorkspace();
  const { agentComputer: api } = useMobileWorkspaceActions();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const locked = useRef(false);
  const canOpen = canManageAgentComputer(serverId);

  async function open() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNote(null);
    void haptics.selection();
    try {
      const url = machineLiveViewUrl(await api.machines(serverId), machineId);
      if (!url) setNote(t("mobile.chat.computerLiveView.notFound"));
      else await Linking.openURL(url);
    } catch {
      setNote(t("mobile.chat.computerLiveView.failed"));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <View
      className="max-w-[92%] self-start gap-2 rounded-[20px] bg-control/60 px-4 py-3"
      style={{ borderCurve: "circular" }}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-control">
          <Monitor color={String(iconColor)} size={18} />
        </View>
        <View className="shrink grow gap-0.5">
          <Typography.Paragraph className="font-medium" numberOfLines={1}>
            {t("mobile.chat.computerLiveView.title")}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" className="text-text-secondary" numberOfLines={1}>
            {t("mobile.chat.computerLiveView.subtitle", { id: machineId })}
          </Typography.Paragraph>
        </View>
        {canOpen ? (
          <Button size="sm" variant="primary" isDisabled={busy} onPress={() => void open()}>
            <Button.Label>{t("mobile.chat.computerLiveView.open")}</Button.Label>
          </Button>
        ) : null}
      </View>
      {canOpen ? (
        note ? (
          <Typography.Paragraph type="body-xs" className="text-text-secondary">
            {note}
          </Typography.Paragraph>
        ) : null
      ) : (
        <Typography.Paragraph type="body-xs" className="text-text-secondary">
          {t("mobile.chat.computerLiveView.unavailable")}
        </Typography.Paragraph>
      )}
    </View>
  );
});
