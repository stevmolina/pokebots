import type { BrainRequest, BrainResponse } from "@pokebots/contracts/brain";
import { POKEBOTS_BRAIN_ID } from "@pokebots/contracts/team-protocol/pokebots-integrations-v1";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Typography } from "heroui-native";
import { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { SettingsContent, SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { useMobileWorkspace } from "@/features/workspace/context/mobile-workspace-context";
import { IntegrationProfiles } from "@/shared/components/integration-profiles";
import { SheetFormField } from "@/shared/components/sheet-form-field";
import { useText } from "@/shared/lib/text";

export function BrainScreen() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const { canUsePokebotsIntegrations } = useMobileWorkspace();
  const [native, onSelect] = useState(false);
  const builtIn = canUsePokebotsIntegrations(serverId);
  const profile = builtIn && native ? "native" : undefined;
  return (
    <BrainAccountScreen
      key={JSON.stringify([serverId, builtIn, profile])}
      serverId={serverId}
      builtIn={builtIn}
      native={profile === "native"}
      onSelect={onSelect}
    />
  );
}

function BrainAccountScreen({
  serverId,
  builtIn,
  native,
  onSelect,
}: {
  serverId: string;
  builtIn: boolean;
  native: boolean;
  onSelect: (native: boolean) => void;
}) {
  const workspace = useMobileWorkspace();
  const profile = native ? "native" : undefined;
  const { t, errorMessage } = useText();
  const [state, setState] = useState<{
    connection: string;
    brain: string;
    brains: NonNullable<BrainResponse["brains"]>;
    query: string;
    text: string;
    reason: string;
    path: string;
    data: BrainResponse;
    detail: BrainResponse | null;
    result: BrainResponse | null;
    busy: boolean;
    error: string;
  }>({
    connection: "",
    brain: "",
    brains: [],
    query: "",
    text: "",
    reason: "",
    path: "",
    data: {},
    detail: null,
    result: null,
    busy: false,
    error: "",
  });
  const generation = useRef(0);
  const supported = workspace.canUseBrain(serverId);
  const scope = { mcpServerId: state.connection, brain: state.brain };
  const connect = () => router.push({ pathname: "/server-settings/mcp-server", params: { serverId, preset: "brain" } });
  useFocusEffect(
    useCallback(() => {
      if (!supported) return;
      setState((previous) => ({
        ...previous,
        connection: "",
        brain: "",
        brains: [],
        data: {},
        detail: null,
        result: null,
        error: "",
        busy: false,
      }));
      let alive = true;
      const connectionId = async () => {
        if (builtIn) return POKEBOTS_BRAIN_ID;
        const rows = await workspace.listMcpServers(serverId);
        const row = rows.find((item) => {
          if (item.transport !== "http") return false;
          try {
            const url = new URL(item.url);
            return url.origin === "https://brain.mcpbox.dev" && url.pathname === "/mcp";
          } catch {
            return false;
          }
        });
        return row?.id;
      };
      void connectionId()
        .then((id) => {
          if (!id || !alive) return;
          return workspace.brainRequest({ operation: "brains", mcpServerId: id }, serverId, profile).then((data) => {
            if (alive)
              setState((previous) => ({
                ...previous,
                connection: id,
                brains: data.brains ?? [],
                brain: data.brains?.[0]?.id ?? "",
              }));
          });
        })
        .catch((error) => {
          if (alive) setState((previous) => ({ ...previous, error: errorMessage(error, t("mobile.brain.failed")) }));
        });
      return () => {
        alive = false;
        generation.current++;
      };
    }, [serverId, supported, builtIn, profile, workspace.listMcpServers, workspace.brainRequest, errorMessage, t]),
  );
  async function run(input: BrainRequest, target: "data" | "detail" | "result" = "data") {
    const current = ++generation.current;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const data = await workspace.brainRequest(input, serverId, profile);
      if (current === generation.current)
        setState((previous) => ({
          ...previous,
          // A next page of files joins the list; every other read replaces what was shown.
          ...(target === "data" && input.operation === "files" && input.cursor
            ? { data: { ...data, files: [...(previous.data.files ?? []), ...(data.files ?? [])] } }
            : { [target]: data }),
          ...(target === "detail" && data.claim ? { text: data.claim.text, reason: "" } : {}),
          ...(target === "result" ? { reason: "" } : {}),
        }));
    } catch (error) {
      if (current === generation.current)
        setState((previous) => ({ ...previous, error: errorMessage(error, t("mobile.brain.failed")) }));
    } finally {
      if (current === generation.current) setState((previous) => ({ ...previous, busy: false }));
    }
  }
  function open(url: string) {
    try {
      if (new URL(url).protocol === "https:") void Linking.openURL(url);
    } catch {
      /* Invalid source links stay inert. */
    }
  }
  async function upload() {
    const ticket = generation.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const file = new File(asset.uri);
      if (file.size > 512 * 1024) throw new Error(t("mobile.brain.fileLimit"));
      const content = await file.base64();
      if (ticket !== generation.current) return;
      await run({ operation: "addFile", ...scope, path: state.path || asset.name, content }, "result");
    } catch (error) {
      setState((previous) => ({ ...previous, error: errorMessage(error, t("mobile.brain.failed")) }));
    }
  }
  return (
    <SettingsContent>
      <Stack.Screen options={{ title: t("mobile.brain.title") }} />
      {builtIn ? <IntegrationProfiles native={native} onSelect={onSelect} /> : null}
      {!supported || !state.connection ? (
        builtIn ? null : (
          <SettingsSection>
            <SettingsRow onPress={connect}>
              <Typography>{t("mobile.brain.connect")}</Typography>
            </SettingsRow>
          </SettingsSection>
        )
      ) : (
        <>
          <SettingsSection>
            {state.brains.map((brain) => (
              <SettingsRow
                key={brain.id}
                onPress={() => {
                  generation.current++;
                  setState((previous) => ({
                    ...previous,
                    brain: brain.id,
                    data: {},
                    detail: null,
                    result: null,
                    busy: false,
                  }));
                }}
              >
                <Typography>{brain.id}</Typography>
              </SettingsRow>
            ))}
          </SettingsSection>
          <Typography>{state.brain}</Typography>
          <SheetFormField
            label={t("mobile.brain.query")}
            value={state.query}
            onChangeText={(query) => setState((previous) => ({ ...previous, query }))}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              isDisabled={state.busy || !state.query.trim()}
              onPress={() => void run({ operation: "search", ...scope, query: state.query })}
            >
              {t("mobile.brain.search")}
            </Button>
            <Button isDisabled={state.busy} onPress={() => void run({ operation: "overview", ...scope })}>
              {t("mobile.brain.pages")}
            </Button>
            <Button isDisabled={state.busy} onPress={() => void run({ operation: "files", ...scope })}>
              {t("mobile.brain.files")}
            </Button>
            <Button
              isDisabled={state.busy}
              onPress={() => void run({ operation: "sessions", ...scope, query: state.query })}
            >
              {t("mobile.brain.chats")}
            </Button>
          </View>
          {state.data.claims?.map((claim) => (
            <SettingsRow
              key={claim.id}
              onPress={() => void run({ operation: "explain", ...scope, claim_id: claim.id }, "detail")}
            >
              <View>
                <Typography>{claim.text}</Typography>
                <Typography>
                  {claim.page}:{claim.line} · {claim.authority ?? t("mobile.brain.durable")} ·{" "}
                  {claim.verified_at ?? t("mobile.brain.undated")}
                </Typography>
              </View>
            </SettingsRow>
          ))}
          {state.data.pages?.map((page) => (
            <SettingsRow
              key={page.path}
              onPress={() => void run({ operation: "page", ...scope, path: page.path }, "detail")}
            >
              <Typography>{page.path}</Typography>
            </SettingsRow>
          ))}
          {state.data.files?.map((file) => (
            <SettingsRow
              key={file.path}
              onPress={() => void run({ operation: "file", ...scope, path: file.path }, "detail")}
            >
              <Typography>{file.path}</Typography>
            </SettingsRow>
          ))}
          {state.data.next_cursor ? (
            <Button
              onPress={() => void run({ operation: "files", ...scope, cursor: state.data.next_cursor ?? undefined })}
            >
              {t("mobile.brain.more")}
            </Button>
          ) : null}
          {state.data.sessions?.map((session) => (
            <SettingsRow
              key={`${session.source}:${session.id}`}
              onPress={() =>
                void run({ operation: "session", ...scope, session: session.id, source: session.source }, "detail")
              }
            >
              <Typography>{session.title || session.id}</Typography>
            </SettingsRow>
          ))}
          {state.detail?.claim ? (
            <View className="gap-3">
              <Typography>{state.detail.claim.text}</Typography>
              <Typography>
                {state.detail.claim.page}:{state.detail.claim.line} ·{" "}
                {state.detail.claim.authority ?? t("mobile.brain.durable")} ·{" "}
                {state.detail.claim.verified_at ?? t("mobile.brain.undated")}
              </Typography>
              <Button
                onPress={() =>
                  void run({ operation: "page", ...scope, path: state.detail?.claim?.page ?? "" }, "detail")
                }
              >
                {t("mobile.brain.page")}
              </Button>
              <Button onPress={() => open(state.detail?.claim?.url ?? "")}>{t("mobile.brain.source")}</Button>
              {state.detail.sources?.map((source) => (
                <Typography key={source.path}>{source.path}</Typography>
              ))}
              {state.detail.replaces?.map((old) => (
                <Typography key={old.old_claim_id}>{old.text || old.old_claim_id}</Typography>
              ))}
              {state.detail.replaced_by?.map((claim) => (
                <Typography key={claim.id}>{claim.text}</Typography>
              ))}
            </View>
          ) : null}
          {state.detail?.text ? <Typography>{state.detail.text}</Typography> : null}
          {state.detail?.download_url ? (
            <Button onPress={() => open(state.detail?.download_url ?? "")}>{t("mobile.brain.download")}</Button>
          ) : null}
          {state.detail?.session?.turns?.map((turn) => (
            <Typography key={`${turn.role}:${turn.text}`}>
              {turn.role}
              {turn.text}
            </Typography>
          ))}
          {state.detail?.next_from_turn && state.detail.session ? (
            <Button
              onPress={() =>
                void run(
                  {
                    operation: "session",
                    ...scope,
                    session: state.detail?.session?.id ?? "",
                    source: state.detail?.session?.source,
                    from_turn: state.detail?.next_from_turn ?? undefined,
                  },
                  "detail",
                )
              }
            >
              {t("mobile.brain.more")}
            </Button>
          ) : null}
          <SheetFormField
            label={t("mobile.brain.path")}
            value={state.path}
            onChangeText={(path) => setState((previous) => ({ ...previous, path }))}
          />
          <Button isDisabled={state.busy} onPress={() => void upload()}>
            {t("mobile.brain.addFile")}
          </Button>
          <SheetFormField
            multiline
            label={t("mobile.brain.fact")}
            value={state.text}
            onChangeText={(text) => setState((previous) => ({ ...previous, text }))}
          />
          <Button
            isDisabled={state.busy || state.text.trim().length < 3}
            onPress={() =>
              void run(
                { operation: "remember", ...scope, text: state.text, ...(state.path ? { page: state.path } : {}) },
                "result",
              )
            }
          >
            {t("mobile.brain.remember")}
          </Button>
          {state.detail?.claim ? (
            <>
              <Button
                isDisabled={state.busy || state.text.trim().length < 3}
                onPress={() =>
                  void run(
                    { operation: "update", ...scope, claim_id: state.detail?.claim?.id ?? "", text: state.text },
                    "result",
                  )
                }
              >
                {t("mobile.brain.update")}
              </Button>
              <Typography>{t("mobile.brain.forgetHelp")}</Typography>
              <SheetFormField
                multiline
                label={t("mobile.brain.reason")}
                value={state.reason}
                onChangeText={(reason) => setState((previous) => ({ ...previous, reason }))}
              />
              <Button
                isDisabled={state.busy || state.reason.trim().length < 3}
                onPress={() =>
                  void run(
                    { operation: "forget", ...scope, claim_id: state.detail?.claim?.id ?? "", reason: state.reason },
                    "result",
                  )
                }
              >
                {t("mobile.brain.forget")}
              </Button>
            </>
          ) : null}
          {state.result ? (
            <Typography>
              {state.result.mode === "pull_request"
                ? t("mobile.brain.proposed")
                : state.result.mode === "commit"
                  ? t("mobile.brain.committed")
                  : t("mobile.brain.saved")}
            </Typography>
          ) : null}
          {state.result?.pull_request ? (
            <Button onPress={() => open(state.result?.pull_request?.url ?? "")}>{t("mobile.brain.openResult")}</Button>
          ) : null}
        </>
      )}
      {state.busy ? <Typography>{t("mobile.brain.loading")}</Typography> : null}
      {state.error ? <Typography>{state.error}</Typography> : null}
    </SettingsContent>
  );
}
