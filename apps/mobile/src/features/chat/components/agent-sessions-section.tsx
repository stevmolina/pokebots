import type { AgentTask } from "@openbot/contracts/ipc";
import { Typography } from "heroui-native";
import type { LucideIcon } from "lucide-react-native";
import BookOpen from "lucide-react-native/icons/book-open";
import Briefcase from "lucide-react-native/icons/briefcase";
import Bug from "lucide-react-native/icons/bug";
import CalendarDays from "lucide-react-native/icons/calendar-days";
import ChartLine from "lucide-react-native/icons/chart-line";
import Code from "lucide-react-native/icons/code";
import FileText from "lucide-react-native/icons/file-text";
import Globe from "lucide-react-native/icons/globe";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import List from "lucide-react-native/icons/list";
import LoaderCircle from "lucide-react-native/icons/loader-circle";
import Mail from "lucide-react-native/icons/mail";
import MessageCircle from "lucide-react-native/icons/message-circle";
import MessageSquareText from "lucide-react-native/icons/message-square-text";
import Palette from "lucide-react-native/icons/palette";
import Plus from "lucide-react-native/icons/plus";
import Rocket from "lucide-react-native/icons/rocket";
import Search from "lucide-react-native/icons/search";
import Users from "lucide-react-native/icons/users";
import { View } from "react-native";
import { MAIN_THREAD_ID } from "@/features/chat/components/chat-thread-menu";
import { useAgentThreadReads } from "@/features/chat/components/use-agent-thread-reads";
import { useOpenAgentTasks } from "@/features/chat/components/use-open-agent-tasks";
import { pickThreadTopicIcon, type ThreadTopicIconKind } from "@/features/chat/model/thread-topic-icon";
import { agentTaskStatus } from "@/features/servers/model/agent-task-text";
import { SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { RowIcon } from "@/features/settings/components/settings-row-icon";
import { formatUpdatedAt } from "@/shared/lib/format-updated-at";
import { useText } from "@/shared/lib/text";

/** The icon of each topic of an idle side thread, as the desktop thread tabs draw it. */
const TOPIC_ICONS: Record<ThreadTopicIconKind, LucideIcon> = {
  bug: Bug,
  chart: ChartLine,
  launch: Rocket,
  users: Users,
  search: Search,
  design: Palette,
  code: Code,
  mail: Mail,
  plan: CalendarDays,
  sales: Briefcase,
  web: Globe,
  book: BookOpen,
  idea: Lightbulb,
  document: FileText,
  default: MessageSquareText,
};

/** A working session shows a spinner icon; an idle one shows the icon of its topic. */
function sessionIcon(task: AgentTask): LucideIcon {
  if (task.state === "running") return LoaderCircle;
  return TOPIC_ICONS[pickThreadTopicIcon(task.title)];
}

/** One session row: the agent's own chat, or a side thread. */
interface SessionRow {
  id: string;
  title: string;
  task: AgentTask | null;
}

/**
 * The sessions of an agent, as the desktop Sessions card lists them: the main session first, then the
 * agent's own chat and the side threads that changed last. A dot in the agent's color marks unread
 * agent messages. "New session" starts one; "All sessions" opens the list with the archived ones.
 * `limit` cuts the list, as the agent's profile does; the sheet shows every open session.
 */
export function AgentSessionsSection({
  serverId,
  agentId,
  activeId,
  color,
  limit,
  title,
  onOpen,
  onNew,
  onAll,
}: {
  serverId: string;
  agentId: string;
  /** The main session: `MAIN_THREAD_ID` or a task id. */
  activeId: string;
  /** The agent's color, for the unread dot. */
  color: string;
  limit?: number;
  title?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onAll: () => void;
}) {
  const { t, format } = useText();
  const tasks = useOpenAgentTasks(serverId, agentId);
  const reads = useAgentThreadReads(serverId, agentId);
  const rows: SessionRow[] = [
    { id: MAIN_THREAD_ID, title: t("mobile.chat.threads.main"), task: null },
    ...[...tasks]
      // As on the desktop, working sessions first, then the newest.
      .sort(
        (left, right) =>
          Number(right.state === "running") - Number(left.state === "running") ||
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .map((task) => ({ id: task.id, title: task.title, task })),
  ];
  const main = rows.find((row) => row.id === activeId);
  const ordered = main ? [main, ...rows.filter((row) => row !== main)] : rows;
  const shown = limit === undefined ? ordered : ordered.slice(0, limit);
  return (
    <SettingsSection title={title}>
      {shown.map((row) => {
        const unread = row.task !== null && (reads.get(row.id)?.unreadCount ?? 0) > 0;
        return (
          <SettingsRow
            key={row.id}
            leading={
              unread ? (
                <View className="size-5 items-center justify-center">
                  <View className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                </View>
              ) : (
                <RowIcon icon={row.task ? sessionIcon(row.task) : MessageCircle} />
              )
            }
            supportingText={
              row.task ? `${agentTaskStatus(row.task, t)} · ${formatUpdatedAt(row.task.updatedAt, format)}` : undefined
            }
            checked={row.id === activeId}
            onPress={() => onOpen(row.id)}
          >
            <Typography.Paragraph numberOfLines={1} weight={row.id === activeId ? "semibold" : undefined}>
              {row.title}
            </Typography.Paragraph>
          </SettingsRow>
        );
      })}
      <SettingsRow leading={<RowIcon icon={Plus} tone="accent" />} disclosure={false} onPress={onNew}>
        <Typography.Paragraph className="text-accent-text">{t("mobile.chat.sessions.new")}</Typography.Paragraph>
      </SettingsRow>
      <SettingsRow
        leading={<RowIcon icon={List} />}
        value={limit !== undefined && ordered.length > limit ? format.number(ordered.length) : undefined}
        onPress={onAll}
      >
        <Typography.Paragraph>{t("mobile.chat.sessions.all")}</Typography.Paragraph>
      </SettingsRow>
    </SettingsSection>
  );
}
