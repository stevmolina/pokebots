import {
  AudioLines,
  Button,
  ChevronRight,
  CircleDot,
  DropdownMenu,
  Ellipsis,
  File,
  Image,
  MessageCirclePlus,
  MessageCircleQuestionMark,
  Plus,
  Puzzle,
  Sparkles,
  X,
} from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { createSignal, Show } from "solid-js";
import type { AgentProfile } from "../../data";
import { AgentNewChatDialog } from "./AgentNewChatDialog";

export interface ComposerAddMenuProps {
  onCreateArtifact?: (() => void) | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  attachDisabled?: boolean | undefined;
  /** Opens the file picker. Without it, the menu has no attach item. */
  onAttach?: (() => void) | undefined;
  /** Opens the photo library picker of the system. Without it, the menu has no Photos item. */
  onChoosePhotos?: (() => void) | undefined;
  /** Opens the skill picker of the editor, after the menu gave the focus back. Without it, no skill item. */
  onPickSkill?: (() => void) | undefined;
  /** Starts the recording of a task that the user shows in the browser. Without it, no teach item. */
  onTeach?: (() => void) | undefined;
  /** Without it, no side question item. */
  onSideQuestion?: (() => void) | undefined;
  /** Without it, no voice conversation item. */
  onVoice?: (() => void) | undefined;
  /**
   * The New chat action, which asks first. Without it, no New chat item. The context ring has it too,
   * but the ring shows only after the provider reports usage, so this item keeps New chat in reach (#8725).
   */
  newChat?:
    | {
        agent: Pick<AgentProfile, "name" | "avatarSeed" | "avatarHue" | "avatarUrl">;
        start: () => Promise<void>;
        /** A running compaction: the ring's New chat row is disabled for the same reason. */
        disabled?: boolean | undefined;
      }
    | undefined;
}

/**
 * The "+" menu of a message box. Three rows stay on top: the first three of Attach files, Photos, Use a
 * skill and Create an Artifact that the host gives. Teach a task, the side question, the voice
 * conversation and an Artifact that did not fit sit under More. New chat comes last, after a separator.
 */
export function ComposerAddMenu(props: ComposerAddMenuProps) {
  const { t } = useText();
  const [confirmingNewChat, setConfirmingNewChat] = createSignal(false);
  let skillPickerChosen = false;
  // The browser opens a file picker only in an event of user activation. A mouse press is one, so the
  // picker opens on pointerdown, before the focus change closes the menu. A touch or pen press is not:
  // the activation comes with the release, so those open the picker on pointerup.
  const attach = () => {
    if (props.attachDisabled) return;
    props.onOpenChange(false);
    props.onAttach?.();
  };
  const attachFromPointer = (event: PointerEvent, phase: "down" | "up") => {
    if (event.button !== 0) return;
    if ((event.pointerType === "mouse") === (phase === "down")) attach();
  };
  const attachFromKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") attach();
  };
  // Files, Photos and Skill stay on top. Create an Artifact takes the third row when a host gives no Photos
  // item (the desktop), and goes under More when the host gives all three.
  const artifactOnTop = () => [props.onAttach, props.onChoosePhotos, props.onPickSkill].filter(Boolean).length < 3;
  const hasMore = () =>
    Boolean(props.onTeach || props.onSideQuestion || props.onVoice || (!artifactOnTop() && props.onCreateArtifact));
  return (
    <>
      <DropdownMenu.Root
        open={props.open}
        onOpenChange={(open) => {
          props.onOpenChange(open);
          const chosen = skillPickerChosen;
          skillPickerChosen = false;
          if (open || !chosen) return;
          // The menu gives the focus back to its trigger two frames after it closes; open the picker after that.
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => props.onPickSkill?.())));
        }}
        placement="top-start"
        gutter={8}
        modal={false}
      >
        <DropdownMenu.Trigger class="composer-button" aria-label={t("composer.add.label")} disabled={props.disabled}>
          <Plus aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content aria-label={t("composer.add.label")}>
            <Show when={props.onAttach}>
              <DropdownMenu.Item
                disabled={props.attachDisabled ?? false}
                onPointerDown={(event) => attachFromPointer(event, "down")}
                onPointerUp={(event) => attachFromPointer(event, "up")}
                onKeyDown={attachFromKey}
              >
                <File aria-hidden="true" />
                <span>{t("composer.add.files")}</span>
              </DropdownMenu.Item>
            </Show>
            <Show when={props.onChoosePhotos}>
              {(choose) => (
                <DropdownMenu.Item disabled={props.attachDisabled ?? false} onSelectAfterClose={() => choose()()}>
                  <Image aria-hidden="true" />
                  <span>{t("composer.add.photos")}</span>
                </DropdownMenu.Item>
              )}
            </Show>
            <Show when={props.onPickSkill}>
              <DropdownMenu.Item
                onPointerDown={(event) => {
                  if (event.button === 0) skillPickerChosen = true;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") skillPickerChosen = true;
                }}
              >
                <Puzzle aria-hidden="true" />
                <span>{t("composer.add.skill")}</span>
              </DropdownMenu.Item>
            </Show>
            <Show when={artifactOnTop() ? props.onCreateArtifact : undefined}>
              {(create) => (
                <DropdownMenu.Item onSelectAfterClose={() => create()()}>
                  <Sparkles aria-hidden="true" />
                  <span>{t("composer.add.artifact")}</span>
                </DropdownMenu.Item>
              )}
            </Show>
            <Show when={hasMore()}>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger>
                  <Ellipsis aria-hidden="true" />
                  <span>{t("app.rail.more")}</span>
                  <ChevronRight class="ui-menu-trailing" aria-hidden="true" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent class="ui-action-menu" aria-label={t("app.rail.more")}>
                    <Show when={artifactOnTop() ? undefined : props.onCreateArtifact}>
                      {(create) => (
                        <DropdownMenu.Item onSelectAfterClose={() => create()()}>
                          <Sparkles aria-hidden="true" />
                          <span>{t("composer.add.artifact")}</span>
                        </DropdownMenu.Item>
                      )}
                    </Show>
                    <Show when={props.onTeach}>
                      {(teach) => (
                        <DropdownMenu.Item onSelectAfterClose={() => teach()()}>
                          <CircleDot class="composer-add-record" aria-hidden="true" />
                          <span>{t("composer.add.teach")}</span>
                        </DropdownMenu.Item>
                      )}
                    </Show>
                    <Show when={props.onSideQuestion}>
                      {(open) => (
                        <DropdownMenu.Item
                          onSelectAfterClose={() => {
                            // The menu gives the focus back first. A side panel tab that gets it selects its
                            // pane, so open the side question after that.
                            requestAnimationFrame(() => open()());
                          }}
                        >
                          <MessageCircleQuestionMark aria-hidden="true" />
                          <span>{t("conversation.sidePanel.pane.question")}</span>
                        </DropdownMenu.Item>
                      )}
                    </Show>
                    <Show when={props.onVoice}>
                      {(open) => (
                        <DropdownMenu.Item
                          onSelectAfterClose={() => {
                            // As for the side question: open the pane after the menu gives the focus back.
                            requestAnimationFrame(() => open()());
                          }}
                        >
                          <AudioLines aria-hidden="true" />
                          <span>{t("conversation.sidePanel.pane.voice")}</span>
                        </DropdownMenu.Item>
                      )}
                    </Show>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            </Show>
            <Show when={props.newChat}>
              {(newChat) => (
                <>
                  <DropdownMenu.Separator />
                  {/* The menu gives the focus back to its trigger first; the dialog then gives it back there. */}
                  <DropdownMenu.Item
                    disabled={newChat().disabled ?? false}
                    onSelectAfterClose={() => setConfirmingNewChat(true)}
                  >
                    <MessageCirclePlus aria-hidden="true" />
                    <span>{t("composer.newChat.action")}</span>
                  </DropdownMenu.Item>
                </>
              )}
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Show when={props.newChat}>
        {(newChat) => (
          <AgentNewChatDialog
            agent={newChat().agent}
            open={confirmingNewChat()}
            onClose={() => setConfirmingNewChat(false)}
            start={() => newChat().start()}
          />
        )}
      </Show>
    </>
  );
}

/** The selected tool mode belongs to the next message. */
export function ComposerArtifactChip(props: { onRemove?: (() => void) | undefined }) {
  const { t } = useText();
  return (
    <div class="composer-artifact-chip">
      <Sparkles aria-hidden="true" />
      <span>{t("composer.artifact.selected")}</span>
      <Show when={props.onRemove}>
        {(remove) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("composer.artifact.remove")}
            onClick={() => remove()()}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </Show>
    </div>
  );
}
